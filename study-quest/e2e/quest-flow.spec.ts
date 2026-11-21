import { expect, test } from "@playwright/test";
import { createQuest, signUp } from "./helpers";

test("AI planner → quest → sequential unlocking → XP, streak, achievements and activity", async ({ page }) => {
  await signUp(page, "Mona");
  await page.goto("/planner");
  await expect(page.getByText("Sample planner")).toBeVisible();
  await page.fill("#topic", "I want to study the brachial plexus, including anatomy, branches, relations, and clinical applications.");
  await page.selectOption("#minutes", "45");
  await page.getByRole("button", { name: "Create study plan" }).click();
  // The preview shows the generated structure and can be edited before starting.
  const title = page.getByRole("textbox", { name: "Title", exact: true }).first();
  await expect(title).toHaveValue("Brachial plexus", { timeout: 45_000 });
  await expect(page.getByText(/3 stages · 7 levels · 20 missions/)).toBeVisible();
  await title.fill("Brachial plexus — exam prep");
  await page.getByRole("button", { name: "Start this quest" }).click();
  await page.waitForURL(/\/quests\/[A-Za-z0-9_-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Brachial plexus — exam prep");

  // Level 1 is available, level 2 is locked with an explanation.
  await expect(page.getByRole("button", { name: /Level 1: .* — Available/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Level 2: Anatomy — Locked/ }).first().click();
  await expect(page.getByText("Finish “Orientation: Brachial plexus” to unlock this level.")).toBeVisible();
  await expect(page.getByText("3 missions left there.")).toBeVisible();
  await page.keyboard.press("Escape");

  // Complete all of level 1 from the level sheet.
  await page.getByRole("button", { name: /Level 1: .* — Available/ }).first().click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Mark complete" }).first().click();
    await expect(page.getByRole("button", { name: "Mark complete" })).toHaveCount(2 - i, { timeout: 15_000 });
  }
  // Milestone moment for the completed level, then level 2 unlocks.
  await expect(page.getByRole("dialog").getByText(/Level complete: Orientation/)).toBeVisible();
  await expect(page.getByRole("dialog").getByText("New level unlocked: Anatomy")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Level 1: .* — Completed/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Level 2: Anatomy — Available/ }).first()).toBeVisible();
  await expect(page.getByText("3/20", { exact: true })).toBeVisible();

  // Dashboard reflects XP, streak, goals and activity immediately.
  await page.goto("/dashboard");
  await expect(page.getByText("Up next")).toBeVisible();
  await expect(page.getByText("Study Anatomy").first()).toBeVisible();
  const xpText = await page.locator("text=XP to level").first().textContent();
  expect(xpText).toBeTruthy();
  await expect(page.getByText("3 of 3")).toBeVisible();
  await expect(page.getByText("Daily goal reached. Well done.")).toBeVisible();
  await expect(page.getByText("Finished level Orientation: Brachial plexus")).toBeVisible();
  await expect(page.getByText("Unlocked Anatomy")).toBeVisible();

  // Achievements unlocked along the way.
  await page.goto("/achievements");
  await expect(page.getByText("4 of 16 unlocked")).toBeVisible();
  for (const name of ["Path Maker", "First Mission", "Level Up"]) {
    await expect(page.getByRole("listitem").filter({ hasText: name }).getByText(/^Unlocked/)).toBeVisible();
  }

  // Statistics shows real numbers and XP history.
  await page.goto("/statistics");
  await expect(page.getByText("Level bonus").first()).toBeVisible();
  await page.getByRole("button", { name: "Table view" }).click();
  await expect(page.getByRole("table")).toBeVisible();
});

test("a locked level can be unlocked early or the current one skipped, with confirmation", async ({ page }) => {
  await signUp(page, "Skipper");
  await createQuest(page);
  await page.getByRole("button", { name: /Level 3: Branches — Locked/ }).first().click();
  await page.getByRole("button", { name: "Unlock now" }).click();
  await expect(page.getByRole("dialog", { name: "Unlock this level early?" })).toBeVisible();
  await page.getByRole("dialog", { name: "Unlock this level early?" }).getByRole("button", { name: "Unlock now" }).click();
  await expect(page.getByText("Level unlocked")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Level 3: Branches — Available/ }).first()).toBeVisible();

  await page.getByRole("button", { name: /Level 1: .* — Available/ }).first().click();
  await page.getByRole("button", { name: "Skip this level" }).click();
  await page.getByRole("dialog", { name: "Skip this level?" }).getByRole("button", { name: "Skip this level" }).click();
  await expect(page.getByText("Level skipped — the next one is open.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Level 2: Anatomy — Available/ }).first()).toBeVisible();
});
