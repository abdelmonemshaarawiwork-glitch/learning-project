import { expect, type Page } from '@playwright/test';

export const TEST_PASSWORD = 'Testpass 2026';

export const uniqueEmail = (tag = 'e2e') => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;

/** Fills and submits the "Create account" form (the auth screen must be visible). */
export async function signUp(page: Page, { name = 'Dr E2E', email = uniqueEmail(), password = TEST_PASSWORD, keep = false } = {}) {
  const auth = page.getByTestId('auth-screen');
  await auth.getByRole('tab', { name: 'Create account' }).click();
  await page.locator('#auth-name').fill(name);
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(password);
  await page.locator('#auth-confirm').fill(password);
  if (keep) await auth.getByRole('checkbox', { name: /Keep me signed in/ }).check();
  await page.getByTestId('auth-submit').click();
  return email;
}

/** Fills and submits the "Sign in" form (the auth screen must be visible). */
export async function signIn(page: Page, email: string, password = TEST_PASSWORD) {
  const auth = page.getByTestId('auth-screen');
  await auth.getByRole('tab', { name: 'Sign in' }).click();
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(password);
  await page.getByTestId('auth-submit').click();
}

/** Acknowledges the first-use notice of a new account, if shown, and waits for the app shell. */
export async function acknowledgeDisclaimer(page: Page) {
  const gate = page.getByRole('dialog', { name: /Welcome to BurnMatrix/ });
  const shell = page.locator('#main');
  await expect(gate.or(shell).first()).toBeVisible({ timeout: 15_000 });
  if (await gate.isVisible()) {
    await gate.getByRole('checkbox').check();
    await gate.getByRole('button', { name: /I understand/ }).click();
  }
  await expect(shell).toBeVisible();
}

/** Opens the app; when signed out, creates a fresh account (each test gets its own empty data). */
export async function openApp(page: Page, path = '/') {
  await page.goto(path);
  const auth = page.getByTestId('auth-screen');
  const gate = page.getByRole('dialog', { name: /Welcome to BurnMatrix/ });
  const shell = page.locator('#main');
  await expect(auth.or(gate).or(shell).first()).toBeVisible({ timeout: 15_000 });
  if (await auth.isVisible()) await signUp(page);
  await expect(gate.or(shell).first()).toBeVisible({ timeout: 15_000 });
  if (await gate.isVisible()) {
    await gate.getByRole('checkbox').check();
    await gate.getByRole('button', { name: /I understand/ }).click();
  }
  await expect(shell).toBeVisible();
}

export async function verifyDataset(page: Page, key: string) {
  await page.goto('/settings?tab=references');
  await page.getByTestId(`dataset-${key}`).click();
  await page.getByTestId('verify-dataset').click();
  await fillVerification(page);
  await expect(page.getByText('Integrity check passed')).toBeVisible();
}

export async function verifyProtocol(page: Page, key: string) {
  await page.goto('/settings?tab=protocols');
  await page.getByTestId(`protocol-${key}`).click();
  await page.getByTestId('verify-protocol').click();
  await fillVerification(page);
  await expect(page.getByText('Verified; integrity check passed.')).toBeVisible();
}

async function fillVerification(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Verified by (name)').fill('Dr E2E Tester');
  await dialog.getByLabel('Role / qualification').fill('Test consultant');
  await dialog.getByTestId('verify-attest').check();
  await dialog.getByTestId('verify-confirm').click();
  await expect(dialog).toBeHidden();
}

export interface PatientData {
  name: string;
  age?: string;
  dob?: string;
  weight?: string;
  admission?: string;
  injury?: string;
  diagnosis?: string;
}

export async function createPatient(page: Page, p: PatientData): Promise<string> {
  await page.goto('/patients/new');
  await page.getByLabel(/Patient name or anonymised identifier/).fill(p.name);
  if (p.dob) await page.getByLabel('Date of birth').fill(p.dob);
  if (p.age) await page.getByLabel('Age (years)').fill(p.age);
  if (p.weight) await page.getByLabel(/^Weight/).fill(p.weight);
  if (p.admission) await page.getByLabel(/Admission date and time/).fill(p.admission);
  if (p.injury) await page.getByLabel(/Injury date and time/).fill(p.injury);
  if (p.diagnosis) await page.getByLabel('Admission diagnosis').fill(p.diagnosis);
  await page.getByRole('button', { name: 'Create patient' }).click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: p.name })).toBeVisible();
  return page.url().split('/').pop()!;
}

/** Adds a regional entry via the accessible region list. */
export async function addRegion(page: Page, label: string, surface: 'anterior' | 'posterior', depth: string, involvement: string) {
  await page.getByRole('button', { name: `Select ${label} ${surface}` }).click();
  const editor = page.getByTestId('region-editor');
  await expect(editor).toContainText(label);
  await editor.getByRole('button', { name: `Add ${depth}`, exact: true }).click();
  const inputs = editor.getByLabel('Percentage of region involved');
  await inputs.last().fill(involvement);
}

/** Local datetime-local string N hours from now. */
export function localInput(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
