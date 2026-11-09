import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { createPatient, openApp } from './helpers';

async function wipe(page: Page) {
  await page.goto('/settings?tab=data');
  await page.getByTestId('wipe-all').click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByLabel(/Type/).fill('DELETE ALL DATA');
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByText('All data deleted.')).toBeVisible();
  await openApp(page, '/patients');
  await expect(page.getByText('No patients yet')).toBeVisible();
}

test('backup → delete all → restore with preview and duplicate handling', async ({ page }) => {
  await openApp(page);
  await createPatient(page, { name: 'Backup Patient', age: '40', weight: '75' });
  await page.goto('/settings?tab=backup');
  const download = page.waitForEvent('download');
  await page.getByTestId('export-backup').click();
  const path = (await (await download).path())!;
  const json = JSON.parse(readFileSync(path, 'utf8'));
  expect(json.format).toBe('burn-tool-backup');
  expect(json.counts.patients).toBe(1);

  await wipe(page);

  await page.goto('/settings?tab=backup');
  await page.getByTestId('restore-file').setInputFiles(path);
  const preview = page.getByTestId('restore-preview');
  await expect(preview).toContainText('Checksum verified.');
  await expect(preview.getByRole('row', { name: /^Patients/ })).toContainText('1');
  await page.getByTestId('restore-import').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Import' }).click();
  await expect(page.getByTestId('restore-result')).toContainText('Import complete');
  await page.goto('/patients');
  await expect(page.getByRole('link', { name: 'Backup Patient' })).toBeVisible();

  // Importing again detects duplicates; "skip" keeps one copy.
  await page.goto('/settings?tab=backup');
  await page.getByTestId('restore-file').setInputFiles(path);
  await expect(page.getByTestId('restore-preview').getByRole('row', { name: /^Patients/ })).toHaveText(/Patients\s*1\s*1/);
  await page.getByTestId('restore-import').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Import' }).click();
  await page.goto('/patients');
  await expect(page.getByTestId('patient-count')).toContainText('1 of 1');
});

test('encrypted backup needs the password to restore', async ({ page }) => {
  await openApp(page);
  await createPatient(page, { name: 'Secret Patient' });
  await page.goto('/settings?tab=backup');
  await page.getByTestId('encrypt-backup').check();
  await page.getByLabel(/^Password/).fill('correct horse battery');
  await page.getByLabel('Confirm password').fill('correct horse battery');
  const download = page.waitForEvent('download');
  await page.getByTestId('export-backup').click();
  const path = (await (await download).path())!;
  const text = readFileSync(path, 'utf8');
  expect(text).not.toContain('Secret Patient');
  expect(JSON.parse(text).format).toBe('burn-tool-backup-encrypted');

  await page.getByTestId('restore-file').setInputFiles(path);
  await page.getByLabel('Backup password').fill('wrong password');
  await page.getByRole('button', { name: 'Decrypt' }).click();
  await expect(page.getByText(/password is incorrect/)).toBeVisible();
  await page.getByLabel('Backup password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Decrypt' }).click();
  await expect(page.getByTestId('restore-preview')).toContainText('Checksum verified.');
});
