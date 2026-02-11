import { test, expect } from "@playwright/test";

test("composition update affects debug panel", async ({ page }) => {
  await page.goto("/");
  const editor = page.locator(".editor");
  await editor.click();
  await page.evaluate(() => {
    const el = document.querySelector(".editor") as HTMLElement;
    const ev = new CompositionEvent("compositionupdate", { data: "ㅎ" });
    el.dispatchEvent(ev);
  });
  await expect(page.getByTestId("debug-panel")).toContainText("preedit: ㅎ");
});
