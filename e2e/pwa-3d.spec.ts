import { expect, test } from '@playwright/test';
import { createPatient, openApp } from './helpers';

test.describe('offline PWA', () => {
  test.use({ serviceWorkers: 'allow' });
  test('works offline after installation: reload, navigation, persistence, backup', async ({ page, context }) => {
    await openApp(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    const manifest = (await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json())) as { short_name: string };
    expect(manifest.short_name).toBe('BURN TOOL');
    await createPatient(page, { name: 'Offline Patient', weight: '70' });
    // Wait until the service worker controls the page so precached assets are served.
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('offline-indicator')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Offline Patient' })).toBeVisible();
    await page.getByRole('link', { name: 'Fluid Management' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Fluid management' })).toBeVisible();
    await page.getByRole('link', { name: '3D Body Mapping' }).click();
    await expect(page.getByRole('heading', { level: 1, name: '3D body mapping' })).toBeVisible();
    await page.goto('/settings?tab=backup');
    const download = page.waitForEvent('download');
    await page.getByTestId('export-backup').click();
    expect((await download).suggestedFilename()).toMatch(/burn-tool-backup-all/);
    await context.setOffline(false);
  });
});

test('3D viewer: realistic CC0 anatomical model loads, is attributed, and regions are selectable', async ({ page }) => {
  await openApp(page);
  await createPatient(page, { name: '3D Patient', age: '40' });
  await page.goto('/body-map');
  await page.getByTestId('start-mapping').click();
  const viewer = page.getByTestId('body-viewer-3d');
  await expect(viewer).toBeVisible();
  await expect(page.getByTestId('model-banner')).toContainText('MakeHuman');
  await expect(page.getByTestId('model-banner')).toContainText('not been clinically reviewed');
  await expect(page.getByTestId('dev-model-banner')).toHaveCount(0);
  const canvas = viewer.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(viewer).toHaveAttribute('data-model-ready', 'true', { timeout: 20_000 });
  await expect(viewer).toHaveAttribute('data-camera-settled', 'true');
  const box = (await canvas.boundingBox())!;
  // Centre of the anterior view = anterior trunk (abdomen).
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.42);
  await expect(page.getByTestId('region-editor')).toContainText('Trunk');
  await expect(page.getByTestId('region-editor')).toContainText('(anterior)');
  await viewer.getByRole('button', { name: 'Posterior', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-camera-view', 'posterior');
  await expect(viewer).toHaveAttribute('data-camera-settled', 'true', { timeout: 15_000 });
  const box2 = (await canvas.boundingBox())!; // clicking the button may have scrolled the page
  await page.mouse.click(box2.x + box2.width / 2, box2.y + box2.height * 0.42);
  await expect(page.getByTestId('region-editor')).toContainText('(posterior)');
  await viewer.getByRole('button', { name: 'Reset camera' }).click();
  await expect(viewer.getByRole('button', { name: 'Anterior', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('3D viewer falls back to the labelled development mannequin when no model manifest exists', async ({ page }) => {
  await page.route('**/models/manifest.json', (route) => route.fulfill({ status: 404, body: 'not found' }));
  await openApp(page);
  await createPatient(page, { name: 'Mannequin Patient', age: '40' });
  await page.goto('/body-map');
  await page.getByTestId('start-mapping').click();
  await expect(page.getByTestId('dev-model-banner')).toContainText('NOT anatomically accurate');
});

test('falls back to the 2D map when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = HTMLCanvasElement.prototype as unknown as { getContext: (type: string, ...args: unknown[]) => unknown };
    const orig = proto.getContext;
    proto.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (/webgl/.test(type)) return null;
      return orig.call(this, type, ...args);
    };
  });
  await openApp(page);
  await createPatient(page, { name: 'No WebGL', age: '40' });
  await page.goto('/body-map');
  await expect(page.getByTestId('webgl-unavailable')).toBeVisible();
  await page.getByTestId('start-mapping').click();
  await page.locator('path[data-segment="thigh-left:anterior"]').click();
  await expect(page.getByTestId('region-editor')).toContainText('Left thigh');
});
