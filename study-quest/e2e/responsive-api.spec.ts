import { expect, test } from "@playwright/test";
import { createQuest, noHorizontalOverflow, signUp } from "./helpers";

const ROUTES = ["/dashboard", "/quests", "/planner", "/achievements", "/statistics", "/settings"];

for (const vp of [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1280, height: 860 },
]) {
  test(`no horizontal overflow and the right navigation on ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await signUp(page, "Responsive");
    const questId = await createQuest(page);
    for (const r of [...ROUTES, `/quests/${questId}`, `/quests/${questId}/edit`]) {
      await page.goto(r);
      await page.locator("main h1").first().waitFor();
      await page.waitForTimeout(400);
      expect(await noHorizontalOverflow(page), `${r} @ ${vp.width}`).toBe(true);
    }
    const tabBar = page.locator("nav.fixed.bottom-0");
    if (vp.width < 1024) await expect(tabBar).toBeVisible();
    else await expect(tabBar).toBeHidden();
  });
}

test("the API rejects unauthenticated and forged requests", async ({ request }) => {
  const anon = await request.post("/api/missions/complete", { data: { questId: "x", missionId: "y" } });
  expect(anon.status()).toBe(401);
  const forged = await request.post("/api/missions/complete", {
    data: { questId: "x", missionId: "y" },
    headers: { Authorization: "Bearer not-a-real-token" },
  });
  expect(forged.status()).toBe(401);
  const planner = await request.post("/api/planner/generate", { data: { topic: "anything" } });
  expect(planner.status()).toBe(401);
});

test("one user cannot act on another user's quest", async ({ page, browser }) => {
  await signUp(page, "Owner");
  const questId = await createQuest(page);
  const ctx = await browser.newContext();
  const intruder = await ctx.newPage();
  await signUp(intruder, "Intruder");
  // Use the intruder's own ID token against the owner's quest id.
  const res = await intruder.evaluate(async (qid) => {
    const token = await new Promise<string>((resolve) => {
      const open = indexedDB.open("firebaseLocalStorageDb");
      open.onsuccess = () => {
        const tx = open.result.transaction("firebaseLocalStorage", "readonly");
        const all = tx.objectStore("firebaseLocalStorage").getAll();
        all.onsuccess = () => {
          const entry = all.result.find((r: { value?: { stsTokenManager?: unknown } }) => r.value?.stsTokenManager);
          resolve(entry.value.stsTokenManager.accessToken);
        };
      };
    });
    const r = await fetch(`/api/quests/${qid}/status`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause" }),
    });
    return r.status;
  }, questId);
  expect(res).toBe(404);
  await ctx.close();
});
