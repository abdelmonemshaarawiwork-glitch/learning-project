import { expect, test } from '@playwright/test';
import { acknowledgeDisclaimer, createPatient, signIn, signUp, TEST_PASSWORD, uniqueEmail } from './helpers';

test('sign up, sign out, wrong password, sign in again', async ({ page }) => {
  await page.goto('/');
  const auth = page.getByTestId('auth-screen');
  await expect(auth).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();

  // Validation on sign-up
  await auth.getByRole('tab', { name: 'Create account' }).click();
  await page.locator('#auth-name').fill('Dr Auth');
  const email = uniqueEmail('auth');
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill('short');
  await page.locator('#auth-confirm').fill('short');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-error')).toContainText('at least 10 characters');

  await signUp(page, { name: 'Dr Auth', email });
  await acknowledgeDisclaimer(page);
  await expect(page.getByTestId('user-menu')).toContainText('Dr Auth');
  await createPatient(page, { name: 'Auth Patient', age: '40' });

  // Sign out from the account menu
  await page.getByTestId('user-menu').click();
  await expect(page.getByRole('menu', { name: 'Account' })).toContainText(email);
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(auth).toBeVisible();

  // Signing up again with the same email is refused
  await signUp(page, { email: email.toUpperCase() });
  await expect(page.getByTestId('auth-error')).toContainText('already exists');

  // Wrong password: generic message
  await signIn(page, email, 'Wrong password 1');
  await expect(page.getByTestId('auth-error')).toHaveText('Email or password is incorrect.');

  // Right password: back in, with the same data and no new first-use notice
  await signIn(page, email, TEST_PASSWORD);
  await expect(page.locator('#main')).toBeVisible();
  await page.goto('/patients');
  await expect(page.getByRole('link', { name: 'Auth Patient' }).first()).toBeVisible();
});

test('each account sees only its own patients', async ({ page }) => {
  await page.goto('/');
  const a = await signUp(page, { name: 'Dr A' });
  await acknowledgeDisclaimer(page);
  await createPatient(page, { name: 'Patient Of A', age: '30' });
  await page.getByTestId('user-menu').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();

  await signUp(page, { name: 'Dr B' });
  await acknowledgeDisclaimer(page);
  await page.goto('/patients');
  await expect(page.getByRole('heading', { level: 1, name: 'Patients' })).toBeVisible();
  await expect(page.getByText('Patient Of A')).toHaveCount(0);
  await page.getByTestId('user-menu').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();

  await signIn(page, a);
  await expect(page.locator('#main')).toBeVisible();
  await page.goto('/patients');
  await expect(page.getByRole('link', { name: 'Patient Of A' }).first()).toBeVisible();
});

test('session survives a reload; "keep me signed in" survives a new tab', async ({ page, context }) => {
  await page.goto('/');
  await signUp(page, { name: 'Dr Keep', keep: true });
  await acknowledgeDisclaimer(page);
  await page.reload();
  await expect(page.locator('#main')).toBeVisible();
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('#main')).toBeVisible();
  await expect(second.getByTestId('user-menu')).toContainText('Dr Keep');
});

test('account settings: change password and delete account', async ({ page }) => {
  await page.goto('/');
  const email = await signUp(page, { name: 'Dr Delete' });
  await acknowledgeDisclaimer(page);
  await page.goto('/settings?tab=account');
  await page.locator('#acc-current').fill(TEST_PASSWORD);
  await page.locator('#acc-new').fill('Another pass 99');
  await page.locator('#acc-confirm').fill('Another pass 99');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed.')).toBeVisible();

  await page.getByRole('button', { name: 'Delete account…' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.locator('#del-password').fill('Another pass 99');
  await dialog.locator('#del-typed').fill('DELETE');
  await dialog.getByRole('button', { name: 'Delete account' }).click();
  await expect(page.getByTestId('auth-screen')).toBeVisible();

  await signIn(page, email, 'Another pass 99');
  await expect(page.getByTestId('auth-error')).toHaveText('Email or password is incorrect.');
});

test('sign-in screen fits a phone screen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByTestId('auth-screen')).toBeVisible();
  await page.getByRole('tab', { name: 'Create account' }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await context.close();
});
