import { test, expect } from "@playwright/test";

test("prefix completion with Tab", async ({ page }) => {
  await page.goto("/");
  const editor = page.locator(".editor");
  await editor.click();
  await page.keyboard.type("he");
  await page.keyboard.press("Tab");
  await expect(editor).toContainText("he");
});
