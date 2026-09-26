import { test, expect } from '@playwright/test';

test.describe('Annuaire → fiche élu', () => {
  test('depuis l’annuaire, on accède à une fiche avec ses sections principales', async ({
    page,
  }) => {
    await page.goto('/elus');

    const firstLink = page.locator('a[href^="/elus/"]').first();
    await expect(firstLink).toBeVisible();
    await firstLink.click();

    await expect(
      page.getByRole('heading', { name: 'Mandat en cours' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Tous les mandats' }),
    ).toBeVisible();
  });
});

test.describe('Fiche élu — Anne-Marie Nédélec (sénatrice, jeu de données fixe)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/elus/anne-marie-nedelec-1');
  });

  test('affiche un seul mandat sénateur en cours (pas de doublon)', async ({
    page,
  }) => {
    // Régression : deux mandats sénateur actifs apparaissaient pour la même
    // personne (dates de début divergentes entre les sources AN et Sénat).
    // Anne-Marie Nédélec a exactement 2 mandats en cours au total : sénateur
    // et conseillère départementale — un badge "En cours" par mandat.
    const tousMandats = page.locator('#tous-mandats');
    await expect(
      tousMandats.getByText('En cours', { exact: true }),
    ).toHaveCount(2);
  });

  test('affiche une date de dernière récupération pour chaque section sourcée', async ({
    page,
  }) => {
    const retrievalNotes = page.getByText(/dernière récupération le/);
    expect(await retrievalNotes.count()).toBeGreaterThan(5);

    await expect(
      page
        .locator('#electoral-municipal')
        .getByText(/dernière récupération le/),
    ).toBeVisible();
  });

  test('ouvre le détail d’un intérêt déclaré dans un tiroir', async ({
    page,
  }) => {
    const interestsSection = page.locator('#interets');
    await interestsSection.scrollIntoViewIfNeeded();

    const firstInterest = page.locator('[data-interest-detail]').first();
    await firstInterest.click();

    const drawer = page.getByRole('dialog', {
      name: /détail de l.intérêt déclaré/i,
    });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('Déclaré le :')).toBeVisible();
    await expect(drawer.getByText('Dernière mise à jour :')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });
});
