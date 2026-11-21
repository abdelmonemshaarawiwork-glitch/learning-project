import { expect, test } from "@playwright/test";
import { PASSWORD, signUp } from "./helpers";

test("Arabic (RTL) and dark mode follow the account to a new device", async ({ page, browser }) => {
  const email = await signUp(page, "Salma");
  await page.goto("/settings");
  await page.getByRole("tab", { name: "العربية" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { name: "الإعدادات" })).toBeVisible();
  await page.getByRole("tab", { name: "داكن" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByText("تم حفظ الإعدادات").first()).toBeVisible();

  // A brand-new browser context = another device.
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto("/login");
  await p2.fill("#email", email);
  await p2.fill("#password", PASSWORD);
  await p2.click("button[type=submit]");
  await p2.waitForURL("**/dashboard");
  await expect(p2.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(p2.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(p2.getByRole("link", { name: "الرئيسية" }).first()).toBeVisible();
  await other.close();
});

test("study goals and reminders are saved", async ({ page }) => {
  await signUp(page, "Goals");
  await page.goto("/settings");
  await page.fill("#s-gm", "5");
  await page.locator("#s-gm").blur();
  await expect(page.getByText("Settings saved").first()).toBeVisible();
  await page.getByRole("switch", { name: "Streak reminder" }).click();
  await expect(page.getByRole("switch", { name: "Streak reminder" })).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(page.locator("#s-gm")).toHaveValue("5");
  await expect(page.getByRole("switch", { name: "Streak reminder" })).toHaveAttribute("aria-checked", "false");
  await page.goto("/dashboard");
  await expect(page.getByText("0 of 5")).toBeVisible();
});

test("export data and reset progress", async ({ page }) => {
  await signUp(page, "Data");
  await page.goto("/settings");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export my data" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^study-quest-export-.*\.json$/);
  await page.getByRole("button", { name: "Reset study progress" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("RESET");
  await dialog.getByRole("button", { name: "Reset study progress" }).click();
  await expect(page.getByText("Study progress reset")).toBeVisible();
});

test("delete account removes access", async ({ page }) => {
  const email = await signUp(page, "Leaving");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#del-pw").fill(PASSWORD);
  await dialog.getByRole("textbox", { name: "Type DELETE to confirm" }).fill("DELETE");
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await expect(page.locator("p[role=alert]")).toBeVisible();
});
