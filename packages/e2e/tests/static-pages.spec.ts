import { test, expect } from '@playwright/test';

for (const path of ['/a-propos', '/donnees-personnelles']) {
  test(`${path} se charge avec un contenu visible`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator('main')).not.toBeEmpty();
  });
}
