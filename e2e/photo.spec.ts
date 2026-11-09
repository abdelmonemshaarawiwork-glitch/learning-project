import { expect, test, type Locator, type Page } from '@playwright/test';
import { createPatient, openApp, verifyDataset } from './helpers';

/** Draws a closed freehand shape through the given normalised points on the tracing surface. */
async function trace(page: Page, surface: Locator, pts: [number, number][]) {
  const box = (await surface.boundingBox())!;
  const at = ([x, y]: [number, number]) => [box.x + x * box.width, box.y + y * box.height] as const;
  const [sx, sy] = at(pts[0]!);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (const p of [...pts.slice(1), pts[0]!]) {
    const [x, y] = at(p);
    await page.mouse.move(x, y, { steps: 12 });
  }
  await page.mouse.up();
}
const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

async function addPhoto(page: Page, view: string) {
  await page.getByTestId(`camera-input-${view}`).setInputFiles('public/icons/icon-512.png');
  await expect(page.getByTestId('photo-annotator')).toBeVisible();
}

test('photo-assisted estimate: trace front and side photos, pool views, apply to a Lund and Browder draft', async ({ page }) => {
  await openApp(page);
  await verifyDataset(page, 'lund-browder-1944');
  await createPatient(page, { name: 'Photo Patient', age: '40', weight: '70' });
  await page.goto('/assessment/photos');
  await expect(page.getByText('Clinician-traced planimetry — not automatic detection')).toBeVisible();

  // Capture requires consent confirmation.
  const slot = page.getByTestId('view-slot-anterior');
  await expect(slot.getByRole('button', { name: 'Take photo' })).toBeDisabled();
  await page.getByTestId('photo-consent').check();

  // Front view: forearm outline, half burned (deep partial).
  await addPhoto(page, 'anterior');
  const dialog = page.getByRole('dialog');
  const surface = dialog.getByTestId('annotation-surface');
  await dialog.getByLabel('Segment to outline').selectOption('forearm-left');
  await trace(page, surface, rect(0.2, 0.1, 0.8, 0.9));
  await dialog.getByTestId('burn-depth').selectOption('deep-partial');
  await trace(page, surface, rect(0.2, 0.1, 0.5, 0.9));
  await expect(dialog.getByTestId('photo-measurement')).toContainText(/DPT (49|50|51)/);
  await dialog.getByTestId('annotation-done').click();
  await expect(page.getByTestId('view-slot-anterior').getByTestId('view-status')).toContainText('1 outline(s), 1 burn(s)');

  // Lateral view: divider required; the anterior half is fully burned.
  await addPhoto(page, 'lateral');
  await dialog.getByLabel('Segment to outline').selectOption('forearm-left');
  await trace(page, surface, rect(0.2, 0.1, 0.8, 0.9));
  await expect(dialog.getByTestId('photo-measurement')).toContainText('draw the divider');
  await dialog.getByTestId('tool-divider').click();
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.02);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.98, { steps: 10 });
  await page.mouse.up();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5); // mark anterior side
  await dialog.getByTestId('burn-depth').selectOption('deep-partial');
  await trace(page, surface, rect(0.2, 0.1, 0.5, 0.9));
  await expect(dialog.getByTestId('photo-measurement')).toContainText(/anterior, (49|50|51)% of visible segment\): DPT (99|100)/);
  await dialog.getByTestId('annotation-done').click();

  // Pooled: (0.5·1 + 1·0.5) / (1 + 0.5) ≈ 66.7 % of the anterior forearm.
  const estimates = page.getByTestId('photo-estimates');
  const anteriorRow = estimates.getByRole('row', { name: /Left forearm \(anterior\)/ });
  await expect(anteriorRow.getByTestId('estimate-total')).toHaveText(/^(6[3-9]|70)(\.\d)?%$/);
  await expect(estimates.getByRole('row', { name: /Left forearm \(posterior\)/ })).toContainText('No direct posterior view');

  // Apply to a new Lund and Browder draft.
  await page.getByTestId('start-lb-draft').click();
  await page.getByTestId('apply-photo-estimates').click();
  await page.getByRole('alertdialog').getByRole('button', { name: /apply/ }).click();
  await expect(page).toHaveURL(/\/assessment\?patient=/);
  await expect(page.getByTestId('breakdown-table')).toContainText('Left forearm (anterior)');
  await expect(page.getByTestId('tbsa-total')).toHaveText('1%'); // 1.5 % × ~66.7 % ≈ 1.0 %
});
