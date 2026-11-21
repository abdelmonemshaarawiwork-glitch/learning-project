import { expect, test } from "@playwright/test";
import { createQuest, signUp } from "./helpers";

test("edit plan: rename, reorder, add mission, change estimate — completed progress is kept", async ({ page }) => {
  await signUp(page, "Editor");
  const questId = await createQuest(page);
  // Complete the first mission, then edit the plan.
  await page.getByRole("button", { name: /Level 1: .* — Available/ }).first().click();
  await page.getByRole("button", { name: "Mark complete" }).first().click();
  await expect(page.getByRole("button", { name: "Mark complete" })).toHaveCount(2);
  await page.keyboard.press("Escape");

  await page.goto(`/quests/${questId}/edit`);
  await expect(page.getByText("Done", { exact: true }).first()).toBeVisible();
  const stageTitle = page.getByRole("textbox", { name: "Stage 1 — Title" });
  await stageTitle.fill("Getting oriented");
  const missionTitles = page.getByRole("textbox", { name: "Mission — Title" });
  await missionTitles.nth(1).fill("Glossary of plexus terms");
  await page.getByRole("combobox", { name: "Minutes" }).nth(1).selectOption("30");
  // Move the renamed mission up above the completed one.
  await page.getByRole("button", { name: "More" }).nth(3).click();
  await page.getByRole("menuitem", { name: "Move up" }).click();
  await page.getByRole("button", { name: "Add mission" }).first().click();
  await missionTitles.nth(3).fill("Draw the plexus from memory");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(new RegExp(`/quests/${questId}$`));
  await expect(page.getByText("Plan updated")).toBeVisible();

  await expect(page.getByText("Getting oriented")).toBeVisible();
  await page.getByRole("button", { name: /Level 1: .* — In progress/ }).first().click();
  const sheet = page.getByRole("dialog");
  const items = sheet.getByRole("listitem").filter({ hasText: /min/ });
  await expect(items.nth(0)).toContainText("Glossary of plexus terms");
  await expect(items.nth(0)).toContainText("30 min");
  await expect(items.nth(1)).toContainText("Survey the big picture");
  await expect(items.nth(1).getByRole("button", { name: "Mark complete" })).toHaveCount(0); // still completed
  await expect(sheet.getByText("Draw the plexus from memory")).toBeVisible();
  await expect(sheet.getByText("1/4 missions")).toBeVisible();
});

test("pause, resume, archive, restore and delete a quest", async ({ page }) => {
  await signUp(page, "Manager");
  const questId = await createQuest(page);
  await page.getByRole("button", { name: "More" }).first().click();
  await page.getByRole("menuitem", { name: "Pause quest" }).click();
  await expect(page.getByText("This quest is paused.")).toBeVisible();
  await page.getByRole("button", { name: "Resume quest" }).click();
  await expect(page.getByText("This quest is paused.")).toHaveCount(0);

  await page.getByRole("button", { name: "More" }).first().click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page.getByText("This quest is archived.")).toBeVisible();
  await page.goto("/quests");
  await page.getByRole("tab", { name: /Archived/ }).click();
  await expect(page.getByRole("link", { name: "Brachial plexus" })).toBeVisible();
  await page.goto(`/quests/${questId}`);
  await page.getByRole("button", { name: "Restore from archive" }).click();
  await expect(page.getByText("This quest is archived.")).toHaveCount(0);

  await page.getByRole("button", { name: "More" }).first().click();
  await page.getByRole("menuitem", { name: "Delete quest" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this quest?" });
  await expect(dialog.getByRole("button", { name: "Delete" })).toBeDisabled();
  await dialog.getByRole("textbox").fill("Brachial plexus");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL("**/quests");
  await expect(page.getByText("No active quests. Plan one in a minute.")).toBeVisible();
});

test("create a quest manually and update its details", async ({ page }) => {
  await signUp(page, "Manual");
  await page.goto("/quests/new");
  await page.fill("#nq-title", "Organic chemistry: reactions");
  await page.getByRole("textbox", { name: "Mission — Title" }).first().fill("Learn SN1 vs SN2");
  await page.getByRole("button", { name: "Start this quest" }).click();
  await page.waitForURL(/\/quests\/[A-Za-z0-9_-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Organic chemistry: reactions");
  await expect(page.getByText("Created manually")).toBeVisible();
  await page.getByRole("button", { name: "More" }).first().click();
  await page.getByRole("menuitem", { name: "Edit details" }).click();
  await page.fill("#q-desc", "Mechanisms for the midterm.");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Mechanisms for the midterm.")).toBeVisible();
});
