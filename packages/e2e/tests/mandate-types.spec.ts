import { test, expect } from '@playwright/test';

// Trois fiches de bords politiques et types de mandat différents, pour
// couvrir les variations d'affichage entre mandat local (maire), mandat
// parlementaire national (député) et mandat européen (eurodéputé). Jeux de
// données stables (élus en poste, mandats anciens ou peu susceptibles de
// bouger d'ici la prochaine exécution des tests).

test.describe('Maire PS — Françoise Rossignol (Dainville)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/elus/francoise-rossignol');
  });

  test('affiche le mandat de maire en cours', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Mandat en cours' }),
    ).toBeVisible();
    const mandatSection = page.locator('#mandat');
    await expect(
      mandatSection.getByText('Maire', { exact: true }),
    ).toBeVisible();
    await expect(mandatSection.getByText('Dainville')).toBeVisible();
  });

  test('affiche les résultats municipaux et un signal d’étiquette politique via les parrainages', async ({
    page,
  }) => {
    await expect(
      page
        .locator('#electoral-municipal')
        .getByRole('heading', { name: /Résultats municipaux/ }),
    ).toBeVisible();

    // Les maires n'ont pas de "groupe politique" en base (contrairement aux
    // parlementaires) : le parrainage d'un candidat à la présidentielle est
    // le seul signal d'étiquette politique visible sur la fiche.
    const parrainages = page.locator('#parrainages');
    await expect(parrainages).toBeVisible();
    await expect(parrainages.getByText('HAMON Benoît')).toBeVisible();
  });

  test('n’affiche pas les sections propres aux parlementaires', async ({
    page,
  }) => {
    await expect(page.locator('#activite')).toHaveCount(0);
    await expect(page.locator('#votes')).toHaveCount(0);
    await expect(page.locator('#affiliations')).toHaveCount(0);
  });
});

test.describe('Député LFI — Antoine Léaument', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/elus/antoine-leaument-2');
  });

  test('affiche le mandat en cours avec le groupe politique', async ({
    page,
  }) => {
    const mandatSection = page.locator('#mandat');
    await expect(
      mandatSection.getByText('Député', { exact: true }),
    ).toBeVisible();
    await expect(
      mandatSection.getByText(
        'La France insoumise - Nouveau Front Populaire (LFI-NFP)',
      ),
    ).toBeVisible();
  });

  test('affiche les deux mandats successifs (élu en 2022, réélu en 2024)', async ({
    page,
  }) => {
    const tousMandats = page.locator('#tous-mandats');
    await expect(
      tousMandats.getByText('En cours', { exact: true }),
    ).toHaveCount(1);
    await expect(
      tousMandats.getByText("07/07/2024 → aujourd'hui"),
    ).toBeVisible();
    await expect(
      tousMandats.getByText(/19\/06\/2022.*09\/06\/2024/s),
    ).toBeVisible();
  });

  test('affiche les sections propres aux parlementaires nationaux', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: 'Activité parlementaire' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Historique des votes' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Commissions & groupes' }),
    ).toBeVisible();
  });
});

test.describe('Eurodéputée RN — France Jamet', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/elus/france-jamet');
  });

  test('affiche un seul mandat européen en cours', async ({ page }) => {
    const mandatSection = page.locator('#mandat');
    await expect(mandatSection.getByText('Député·e européen·ne')).toBeVisible();
    await expect(
      page.locator('#tous-mandats').getByText('En cours', { exact: true }),
    ).toHaveCount(1);
  });

  test('n’affiche pas les sections propres aux parlementaires nationaux (isParliamentary)', async ({
    page,
  }) => {
    await expect(page.locator('#activite')).toHaveCount(0);
    await expect(page.locator('#votes')).toHaveCount(0);
    await expect(page.locator('#affiliations')).toHaveCount(0);
    await expect(page.locator('#commissions')).toHaveCount(0);
  });
});
