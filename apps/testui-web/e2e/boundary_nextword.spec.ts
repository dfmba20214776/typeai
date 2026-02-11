import { test, expect } from "@playwright/test";

test("boundary next word with Tab", async ({ page }) => {
  await page.goto("/");
  const editor = page.locator(".editor");
  await editor.click();
  await page.keyboard.type("ø¿¥√¿∫ ");
  await page.keyboard.press("Tab");
  await expect(editor).toContainText("ø¿¥√¿∫");
});
