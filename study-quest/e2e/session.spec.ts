import { expect, test } from "@playwright/test";
import { createQuest, signUp } from "./helpers";

test("focus mode: timer, pause/resume, notes autosave, restore after reload, complete and continue", async ({ page }) => {
  await signUp(page, "Focus");
  const questId = await createQuest(page);
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Start mission" }).click();
  await page.waitForURL(new RegExp(`/study/${questId}/`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Survey the big picture of Brachial plexus");
  await expect(page.getByText("Describe what Brachial plexus covers and why it matters")).toBeVisible();

  await page.getByRole("tab", { name: "Stopwatch" }).click();
  await page.getByRole("button", { name: "Start session" }).click();
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "Pause" }).click();
  const shown = await page.getByRole("timer").textContent();
  expect(shown).toMatch(/^00:0[2-3]$/);
  await page.waitForTimeout(1500);
  await expect(page.getByRole("timer")).toHaveText(shown!); // paused time does not advance

  await page.fill("#mission-notes", "C5–T1 roots; upper trunk = C5–C6.");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Reload: the paused session and the notes are restored.
  await page.reload();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText(shown!);
  await expect(page.locator("#mission-notes")).toHaveValue("C5–T1 roots; upper trunk = C5–C6.");

  await page.getByRole("button", { name: "Resume" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Finish & complete mission" }).click();
  await expect(page.getByText("Sessions shorter than 30 seconds aren't recorded.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mission completed" })).toBeVisible();
  await expect(page.getByText("Mission complete · +20 XP")).toBeVisible();
  await page.getByRole("button", { name: "Next mission" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Build a key-terms glossary");
});

test("a tracked session of at least 30 seconds is recorded in totals", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "Tracker");
  await createQuest(page);
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Start mission" }).click();
  await page.getByRole("button", { name: "Start session" }).click();
  await page.waitForTimeout(31_500);
  await page.getByRole("button", { name: "Finish session" }).click();
  await expect(page.getByText(/Session saved · /)).toBeVisible();
  await page.goto("/statistics");
  await expect(page.getByText("Study time", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1 min").first()).toBeVisible();
});
