import { test, expect } from "@playwright/test";

test.describe("FlowGuard smoke", () => {
  test("home page loads projects UI", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Projects/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Marketing site|project/i)).toBeVisible();
  });
});
