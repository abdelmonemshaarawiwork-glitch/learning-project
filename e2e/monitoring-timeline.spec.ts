import { expect, test } from '@playwright/test';
import { createPatient, openApp } from './helpers';

test('observation outside a configured threshold shows the threshold used', async ({ page }) => {
  await openApp(page);
  await page.goto('/settings?tab=thresholds');
  await page.getByLabel(/^High/).fill('120');
  await page.getByLabel('Source / rationale').fill('Local ICU policy v1');
  await page.getByTestId('add-threshold').click();
  await expect(page.getByText('User-configured threshold: high > 120 bpm')).toBeVisible();
  await createPatient(page, { name: 'Obs Patient', weight: '70' });
  await page.goto('/monitoring');
  await page.getByTestId('add-observation').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Value/).fill('130');
  await expect(dialog).toContainText('above the configured upper threshold of 120 bpm');
  await dialog.getByTestId('save-observation').click();
  await expect(page.getByTestId('threshold-warning')).toContainText('User-configured threshold: high > 120 bpm');

  // Blood pressure with two values
  await page.getByTestId('add-observation').click();
  await dialog.getByLabel('Parameter').selectOption('blood-pressure');
  await dialog.getByLabel('Systolic (mmHg)').fill('110');
  await dialog.getByLabel('Diastolic (mmHg)').fill('70');
  await dialog.getByTestId('save-observation').click();
  await expect(page.getByTestId('obs-row')).toHaveCount(2);
  await expect(page.getByText('110/70 mmHg')).toBeVisible();

  await page.getByRole('tab', { name: 'Trends' }).click();
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
});

test('timeline: automatic admission event, add, filter, edit and delete', async ({ page }) => {
  await openApp(page);
  await createPatient(page, { name: 'Timeline Patient' });
  await page.goto('/timeline');
  await expect(page.getByTestId('timeline-event')).toHaveCount(1);
  await expect(page.getByTestId('timeline-list')).toContainText('Admission');

  await page.getByTestId('add-event').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Event type').selectOption('surgery');
  await dialog.getByLabel('Description').fill('Tangential excision and grafting');
  await dialog.getByTestId('save-event').click();
  await expect(page.getByTestId('timeline-event')).toHaveCount(2);

  await page.getByLabel('Event type').selectOption('surgery');
  await expect(page.getByTestId('timeline-event')).toHaveCount(1);
  await page.getByRole('button', { name: 'Edit event' }).click();
  await dialog.getByLabel('Description').fill('Excision and split-skin grafting');
  await dialog.getByTestId('save-event').click();
  await expect(page.getByTestId('timeline-list')).toContainText('split-skin');

  await page.getByRole('button', { name: 'Delete event' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete event' }).click();
  await expect(page.getByText('No events match the filters')).toBeVisible();
});

test('reports: complete patient report downloads as PDF', async ({ page }) => {
  await openApp(page);
  await createPatient(page, { name: 'Report Patient', age: '33', weight: '72' });
  await page.goto('/reports');
  const download = page.waitForEvent('download');
  await page.getByTestId('download-report').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^burnmatrix-complete-BT-.*\.pdf$/);
});
