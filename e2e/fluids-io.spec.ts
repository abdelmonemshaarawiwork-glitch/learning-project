import { expect, test } from '@playwright/test';
import { createPatient, localInput, openApp, verifyProtocol } from './helpers';

test('fluid estimate requires a verified protocol and calculates Parkland correctly', async ({ page }) => {
  await openApp(page);
  await createPatient(page, { name: 'Fluid Patient', age: '40', weight: '70', injury: localInput(-2), admission: localInput(-1) });
  await page.goto('/fluids');
  await expect(page.getByTestId('protocol-not-configured')).toBeVisible();
  await expect(page.getByTestId('fluid-result')).toHaveCount(0);

  await verifyProtocol(page, 'parkland');
  await page.goto('/fluids');
  await page.getByLabel('TBSA (%)').fill('30');
  await expect(page.getByTestId('fluid-formula')).toContainText('4 mL × 70 kg × 30 %TBSA = 8,400 mL over 24 h');
  await expect(page.getByTestId('time-since-injury')).toContainText('2 h');
  await expect(page.getByTestId('time-since-resus')).toHaveText('Not entered');

  await page.getByLabel('Resuscitation started').fill(localInput(-1));
  await expect(page.getByTestId('time-since-resus')).toContainText('1 h');
  await expect(page.getByTestId('fluid-result')).toContainText('after injury');

  await page.getByLabel('Amount (mL)').fill('1000');
  await page.getByLabel('Time', { exact: true }).fill(localInput(-0.5));
  await page.getByTestId('add-administered').click();
  await expect(page.getByTestId('fluid-result')).toContainText('1,000 mL');
  await expect(page.getByTestId('fluid-result')).toContainText('7,400 mL');

  await page.getByTestId('save-fluid-calc').click();
  await expect(page.getByText('Calculation snapshot saved.')).toBeVisible();

  await page.getByLabel(/^Weight/).fill('0');
  await expect(page.getByTestId('fluid-errors')).toContainText('Weight must be a number greater than 0 kg.');
  await page.getByLabel(/^Weight/).fill('70');
  await page.getByLabel('TBSA (%)').fill('120');
  await expect(page.getByTestId('fluid-errors')).toContainText('TBSA must be greater than 0% and at most 100%.');
});

test('intake/output totals and net balance never mix patients', async ({ page }) => {
  await openApp(page);
  const a = await createPatient(page, { name: 'IO Alpha', weight: '70' });
  const b = await createPatient(page, { name: 'IO Bravo', weight: '80' });

  const add = async (button: 'add-intake' | 'add-output', amount: string, category?: string) => {
    await page.getByTestId(button).click();
    const dialog = page.getByRole('dialog');
    if (category) await dialog.getByLabel('Category').selectOption(category);
    await dialog.getByLabel('Amount (mL)').fill(amount);
    await dialog.getByLabel('Date and time').fill(localInput(-1));
    await dialog.getByTestId('save-record').click();
    await expect(dialog).toBeHidden();
  };

  await page.goto(`/intake-output?patient=${a}`);
  await add('add-intake', '500');
  await add('add-intake', '250', 'oral');
  await add('add-output', '120');
  await expect(page.getByTestId('total-intake')).toHaveText('750 mL');
  await expect(page.getByTestId('total-output')).toHaveText('120 mL');
  await expect(page.getByTestId('net-balance')).toHaveText('+630 mL');

  await page.goto(`/intake-output?patient=${b}`);
  await add('add-intake', '999');
  await expect(page.getByTestId('total-intake')).toHaveText('999 mL');
  await expect(page.getByTestId('total-output')).toHaveText('0 mL');

  // Edit and delete with confirmation
  await page.getByRole('button', { name: 'Edit record' }).first().click();
  await page.getByRole('dialog').getByLabel('Amount (mL)').fill('900');
  await page.getByRole('dialog').getByTestId('save-record').click();
  await expect(page.getByTestId('total-intake')).toHaveText('900 mL');
  await page.getByRole('button', { name: 'Delete record' }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete record' }).click();
  await expect(page.getByTestId('total-intake')).toHaveText('0 mL');

  // Interval filter
  await page.goto(`/intake-output?patient=${a}`);
  await page.getByLabel('Interval').selectOption('custom');
  await page.getByLabel('From').fill(localInput(-0.5));
  await expect(page.getByTestId('total-intake')).toHaveText('0 mL');
  await page.getByLabel('Interval').selectOption('all');
  await expect(page.getByTestId('total-intake')).toHaveText('750 mL');
  await page.getByRole('tab', { name: 'Hourly' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('630');
});

test('urine output calculator validates input and does not label without verified targets', async ({ page }) => {
  await openApp(page);
  await createPatient(page, { name: 'Urine Patient', age: '50', weight: '70' });
  await page.goto('/intake-output/urine-output');
  await page.getByLabel('Urine volume (mL)').fill('140');
  await page.getByLabel('Measurement start').fill(localInput(-4));
  await page.getByLabel('Measurement end').fill(localInput(0));
  await expect(page.getByTestId('uo-rate')).toHaveText('0.5 mL/kg/h');
  await expect(page.getByTestId('uo-classification')).toContainText('No verified urine-output target');
  await page.getByTestId('uo-save').click();
  await expect(page.getByText('Saved as a urine-output observation.')).toBeVisible();

  await page.getByLabel('Measurement end').fill(localInput(-5));
  await expect(page.getByTestId('uo-errors')).toContainText('Measurement end must be after the start.');
  await page.getByLabel('Measurement end').fill(localInput(0));
  await page.getByLabel(/Patient weight/).fill('0');
  await expect(page.getByTestId('uo-errors')).toContainText('Weight must be greater than 0 kg.');
});
