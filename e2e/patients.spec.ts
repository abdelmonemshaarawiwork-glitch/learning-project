import { expect, test } from '@playwright/test';
import { createPatient, openApp } from './helpers';

test('create, search, filter, edit, persist and delete a patient', async ({ page }) => {
  await openApp(page);
  await createPatient(page, { name: 'Alice Example', age: '42', weight: '68', diagnosis: 'Flame burn to trunk' });
  await createPatient(page, { name: 'Bob Sample', age: '30', weight: '80', diagnosis: 'Scald' });

  // Search and filter
  await page.goto('/patients');
  await expect(page.getByTestId('patient-count')).toContainText('2 of 2');
  await page.getByLabel('Search patients').fill('alice');
  await expect(page.getByTestId('patient-count')).toContainText('1 of 2');
  await expect(page.getByRole('link', { name: 'Alice Example' })).toBeVisible();
  await page.getByLabel('Search patients').fill('');
  await page.getByLabel('Filter by status').selectOption('discharged');
  await expect(page.getByText('No matching patients')).toBeVisible();
  await page.getByLabel('Filter by status').selectOption('');
  await page.getByLabel('Sort patients').selectOption('name');
  await expect(page.locator('tbody tr').first()).toContainText('Alice Example');

  // Edit
  await page.getByRole('link', { name: 'Alice Example' }).click();
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel(/^Weight/).fill('70.5');
  await page.getByLabel('Status').selectOption('discharged');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('70.5 kg').first()).toBeVisible();

  // Persistence after reload
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Alice Example' })).toBeVisible();
  await expect(page.getByText('70.5 kg').first()).toBeVisible();

  // Delete requires typing the patient code
  const code = (await page.locator('header ~ main span.font-mono').first().textContent())!.trim();
  await page.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('permanently deletes the patient');
  await expect(dialog.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();
  await dialog.getByLabel(/Type/).fill(code);
  await dialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page).toHaveURL(/\/patients$/);
  await expect(page.getByTestId('patient-count')).toContainText('1 of 1');
});

test('validates the patient form and warns about duplicates', async ({ page }) => {
  await openApp(page, '/patients/new');
  await page.getByRole('button', { name: 'Create patient' }).click();
  await expect(page.getByText('Enter a name or an anonymised identifier.')).toBeVisible();
  await page.getByLabel(/Patient name or anonymised identifier/).fill('Dup Person');
  await page.getByLabel(/^Weight/).fill('-4');
  await page.getByRole('button', { name: 'Create patient' }).click();
  await expect(page.getByText('Weight must be greater than 0.')).toBeVisible();
  await page.getByLabel(/^Weight/).fill('60');
  await page.getByRole('button', { name: 'Create patient' }).click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/);

  await page.goto('/patients/new');
  await page.getByLabel(/Patient name or anonymised identifier/).fill('dup  person');
  await page.getByRole('button', { name: 'Create patient' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Possible duplicate patient' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/patients\/new$/);
});
