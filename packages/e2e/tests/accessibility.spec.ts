import { test, expect } from '@playwright/test';

test.describe('Accessibilité de base', () => {
  test('la page a lang="fr" et un lien d’évitement fonctionnel', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

    const skipLink = page.getByRole('link', {
      name: 'Aller au contenu principal',
    });
    await expect(skipLink).toHaveAttribute('href', '#main-content');
    await expect(page.locator('#main-content')).toBeAttached();
  });

  test('la navigation principale est annoncée', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('navigation', { name: 'Navigation principale' }),
    ).toBeVisible();
  });
});
