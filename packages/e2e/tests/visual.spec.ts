import { test, expect } from '@playwright/test';

// Régression visuelle façon Percy/Chromatic : capture d'écran comparée à une
// baseline committée dans tests/*-snapshots/. Un écart de pixels au-delà du
// seuil (voir playwright.config.ts) fait échouer le test — et donc le check
// CI de la PR. Voir packages/e2e/README.md pour générer/mettre à jour les
// baselines dans le même environnement que la CI (sinon des différences de
// rendu de police entre systèmes produisent de faux positifs).
//
// Les zones dont le contenu change au fil de l'ingestion (dates de mise à
// jour, compteurs, flux de presse) sont masquées : ce test vérifie la mise en
// page et le style, pas le contenu.

test.describe('Régression visuelle', () => {
  test('page d’accueil', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('home.png', {
      fullPage: true,
      mask: [
        page.locator('main p').filter({ hasText: 'Élupedia consolide' }),
        page.locator('section').filter({ hasText: 'Élections sénatoriales' }),
      ],
    });
  });

  test('page à propos', async ({ page }) => {
    await page.goto('/a-propos');
    await expect(page).toHaveScreenshot('a-propos.png', { fullPage: true });
  });

  test('page données personnelles', async ({ page }) => {
    await page.goto('/donnees-personnelles');
    await expect(page).toHaveScreenshot('donnees-personnelles.png', {
      fullPage: true,
    });
  });

  test('bloc "Mandat en cours" d’une fiche élu', async ({ page }) => {
    await page.goto('/elus/francoise-rossignol');
    const mandat = page.locator('#mandat');
    await expect(mandat).toHaveScreenshot('elu-mandat-en-cours.png', {
      mask: [mandat.getByText(/dernière récupération le/)],
    });
  });

  test('tiroir de détail d’un intérêt déclaré', async ({ page }) => {
    await page.goto('/elus/anne-marie-nedelec-1');
    await page.locator('[data-interest-detail]').first().click();
    const drawer = page.getByRole('dialog', {
      name: /détail de l.intérêt déclaré/i,
    });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveScreenshot('interest-detail-drawer.png');
  });
});
