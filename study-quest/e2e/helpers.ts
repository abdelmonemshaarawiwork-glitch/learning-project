import { expect, type Page } from "@playwright/test";

export const PASSWORD = "studyquest-e2e";

export function uniqueEmail(prefix = "e2e") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
}

/** Create a fresh account through the UI and land on the dashboard. */
export async function signUp(page: Page, name = "Test Learner", email = uniqueEmail()) {
  await page.goto("/signup");
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.fill("#confirm", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name.split(" ")[0]);
  return email;
}

export const BRACHIAL =
  "I want to study the brachial plexus, including anatomy, branches, relations, and clinical applications.";

/** Generate a plan with the sample planner and start it; returns the quest id. */
export async function createQuest(page: Page, topic = BRACHIAL) {
  await page.goto("/planner");
  await page.fill("#topic", topic);
  await page.getByRole("button", { name: "Create study plan" }).click();
  await page.getByRole("button", { name: "Start this quest" }).click({ timeout: 45_000 });
  await page.waitForURL(/\/quests\/[A-Za-z0-9_-]+$/);
  return page.url().split("/").pop()!;
}

export async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}
