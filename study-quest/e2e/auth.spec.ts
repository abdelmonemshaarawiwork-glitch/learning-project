import { expect, test } from "@playwright/test";
import { PASSWORD, signUp, uniqueEmail } from "./helpers";

test("sign-up validates input, then creates an account and a private dashboard", async ({ page }) => {
  await page.goto("/signup");
  await page.click("button[type=submit]");
  await expect(page.getByText("Tell us what to call you.")).toBeVisible();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await page.fill("#name", "Layla");
  await page.fill("#email", "layla@example.com");
  await page.fill("#password", "short");
  await page.fill("#confirm", "different");
  await page.click("button[type=submit]");
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  await expect(page.getByText("Passwords don't match.")).toBeVisible();

  await signUp(page, "Layla Nour");
  await expect(page.getByText("Your journey starts with a topic")).toBeVisible();
  await expect(page.getByText("Level 1").first()).toBeVisible();
});

test("log out, wrong password, log back in; protected routes redirect to login", async ({ page }) => {
  const email = await signUp(page, "Yusuf");
  await page.getByRole("button", { name: "Yusuf" }).first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL("**/login");

  await page.goto("/statistics");
  await page.waitForURL(/\/login\?next=%2Fstatistics/);

  await page.fill("#email", email);
  await page.fill("#password", "wrong-password");
  await page.click("button[type=submit]");
  await expect(page.locator("p[role=alert]")).toContainText("don't match");

  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL("**/statistics");
  await expect(page.getByRole("heading", { name: "Statistics" })).toBeVisible();
});

test("session persists across reloads and new tabs", async ({ page, context }) => {
  await signUp(page, "Persist");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Persist");
  const second = await context.newPage();
  await second.goto("/quests");
  await expect(second.getByRole("heading", { name: "My Quests" })).toBeVisible();
});

test("duplicate email is refused and password reset confirms without leaking accounts", async ({ page }) => {
  const email = await signUp(page, "Dup");
  await page.getByRole("button", { name: "Dup" }).first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.goto("/signup");
  await page.fill("#name", "Dup Two");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.fill("#confirm", PASSWORD);
  await page.click("button[type=submit]");
  await expect(page.locator("p[role=alert]")).toContainText("already exists");

  await page.goto("/reset-password");
  await page.fill("#email", uniqueEmail("nobody"));
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("reset link is on its way");
});
