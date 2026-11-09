import { expect, test } from '@playwright/test';
import { createPatient, openApp } from './helpers';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, touch: true },
  { name: 'tablet', width: 820, height: 1180, touch: true },
  { name: 'desktop', width: 1280, height: 800, touch: false },
];
const ROUTES = ['/', '/patients', '/patients/new', '/assessment', '/assessment/history', '/body-map', '/fluids', '/intake-output', '/intake-output/urine-output', '/monitoring', '/timeline', '/reports', '/settings', '/settings?tab=references', '/settings?tab=backup'];

for (const vp of VIEWPORTS) {
  test(`${vp.name}: no horizontal overflow on any route`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.name === 'mobile', serviceWorkers: 'block' });
    const page = await context.newPage();
    await openApp(page);
    const id = await createPatient(page, { name: 'Responsive Patient', age: '40', weight: '70' });
    for (const route of [...ROUTES, `/patients/${id}`]) {
      await page.goto(route);
      await expect(page.locator('h1').first()).toBeVisible();
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(1);
    }
    await context.close();
  });
}

test('mobile navigation drawer and bottom bar work', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  await openApp(page);
  await expect(page.getByRole('navigation', { name: 'Quick navigation' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Quick navigation' }).getByRole('link', { name: 'Patients' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Patients' })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Clinical Timeline' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Clinical timeline' })).toBeVisible();
  await context.close();
});

test('tablet sidebar is collapsible', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 1200 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  await openApp(page);
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByText('Fluid Management')).toBeVisible();
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await context.close();
});
