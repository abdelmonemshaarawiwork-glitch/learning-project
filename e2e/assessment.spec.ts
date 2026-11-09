import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { addRegion, createPatient, openApp, verifyDataset } from './helpers';

test('Lund and Browder assessment: blocked until verified, superficial excluded, indeterminate flagged, saved, PDF, history', async ({ page }) => {
  await openApp(page);
  await createPatient(page, { name: 'Adult LB', age: '40', weight: '70' });

  await page.goto('/assessment');
  await page.getByTestId('start-assessment').click();
  await page.getByTestId('step-next').click(); // date & time
  await expect(page.getByTestId('dataset-not-configured')).toBeVisible();
  await expect(page.getByTestId('step-next')).toBeDisabled();

  // Verify the dataset; the draft survives navigation (stored in IndexedDB).
  await verifyDataset(page, 'lund-browder-1944');
  await page.goto('/assessment');
  await expect(page.getByText('Verified reference dataset')).toBeVisible();
  await expect(page.getByLabel('Age column')).toHaveValue('adult');
  await page.getByTestId('step-next').click();

  await addRegion(page, 'Trunk', 'anterior', 'Deep partial thickness', '50');
  await expect(page.getByTestId('live-tbsa')).toContainText('6.5%');
  await addRegion(page, 'Left thigh', 'anterior', 'Superficial', '100');
  await expect(page.getByTestId('live-tbsa')).toContainText('6.5%');
  await addRegion(page, 'Head', 'posterior', 'Indeterminate', '100');
  await expect(page.getByTestId('live-tbsa')).toContainText('+3.5% IND');

  // Invalid input is rejected
  await addRegion(page, 'Neck', 'anterior', 'Full thickness', '150');
  await expect(page.getByTestId('region-editor').getByRole('alert')).toContainText('cannot exceed 100%');
  await page.getByTestId('region-editor').getByLabel('Percentage of region involved').fill('100');

  await page.getByTestId('step-next').click(); // review
  await expect(page.getByTestId('tbsa-total')).toHaveText('7.5%');
  await expect(page.getByTestId('tbsa-indeterminate')).toHaveText('3.5%');
  await expect(page.getByTestId('tbsa-issues')).toContainText('indeterminate depth');
  await expect(page.getByTestId('tbsa-issues')).toContainText('superficial burn recorded and excluded');
  await expect(page.getByTestId('breakdown-table')).toContainText('Left thigh (anterior)');

  await page.getByTestId('step-next').click();
  await page.getByTestId('save-assessment').click();
  await expect(page.getByTestId('assessment-saved')).toContainText('TBSA 7.5%');

  const download = page.waitForEvent('download');
  await page.getByTestId('download-assessment-pdf').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^burnmatrix-assessment-BT-.*\.pdf$/);
  const pdf = readFileSync((await file.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(5000);

  // Repeat assessment from the saved one, then compare
  await page.getByRole('button', { name: 'View assessment' }).click();
  await page.getByRole('button', { name: 'New from this' }).click();
  await page.getByTestId('step-next').click();
  await page.getByTestId('step-next').click();
  await addRegion(page, 'Trunk', 'posterior', 'Full thickness', '100');
  await page.getByTestId('step-next').click();
  await expect(page.getByTestId('tbsa-total')).toHaveText('20.5%');
  await expect(page.getByTestId('previous-comparison')).toContainText('+13%');
  await page.getByTestId('step-next').click();
  await page.getByTestId('save-assessment').click();
  await expect(page.getByTestId('assessment-saved')).toBeVisible();

  await page.goto('/assessment/history');
  await expect(page.getByTestId('comparison-summary')).toContainText('+13%');
  await expect(page.getByText('Initial', { exact: true })).toBeVisible();
  await expect(page.getByText('Repeat', { exact: true })).toBeVisible();
});

test('Rule of Nines in a child requires acknowledging the limitation', async ({ page }) => {
  await openApp(page);
  await verifyDataset(page, 'rule-of-nines-adult');
  await createPatient(page, { name: 'Child RoN', age: '6', weight: '20' });
  await page.goto('/assessment');
  await page.getByTestId('start-assessment').click();
  await page.getByTestId('step-next').click();
  await page.getByRole('radio', { name: /Rule of Nines/ }).click();
  await expect(page.getByText(/documented for ages 16\+ years; this patient is 6 years/)).toBeVisible();
  await page.getByTestId('step-next').click();
  await addRegion(page, 'Left upper limb', 'anterior', 'Superficial partial thickness', '100');
  await page.getByTestId('step-next').click();
  await expect(page.getByTestId('tbsa-total')).toHaveText('4.5%');
  await expect(page.getByTestId('step-next')).toBeDisabled();
  await page.getByLabel(/I acknowledge these limitations/).check();
  await page.getByTestId('step-next').click();
  await page.getByTestId('save-assessment').click();
  await expect(page.getByTestId('assessment-saved')).toBeVisible();
});

test('Palm method uses a clinician-entered palm value', async ({ page }) => {
  await openApp(page);
  await createPatient(page, { name: 'Palm Patient', age: '35', weight: '60' });
  await page.goto('/assessment');
  await page.getByTestId('start-assessment').click();
  await page.getByTestId('step-next').click();
  await page.getByRole('radio', { name: /Palm method/ }).click();
  await expect(page.getByTestId('step-next')).toBeDisabled();
  await page.getByLabel(/%TBSA of ONE palm-equivalent/).fill('0.8');
  await page.getByTestId('step-next').click();
  await page.getByLabel(/New estimate/).selectOption('deep-partial');
  await page.getByRole('button', { name: 'Add palm estimate' }).click();
  await page.getByLabel('Number of palm-equivalents').fill('3');
  await expect(page.getByTestId('live-tbsa')).toContainText('2.4%');
  await page.getByTestId('step-next').click();
  await expect(page.getByText(/is a clinician-entered assumption without a selected verified reference/)).toBeVisible();
});
