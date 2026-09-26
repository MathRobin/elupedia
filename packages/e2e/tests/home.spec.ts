import { test, expect } from '@playwright/test';

test.describe('Page d’accueil', () => {
  test('affiche le titre et le champ de recherche', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Elupedia/);
    await expect(
      page.getByRole('combobox', { name: /rechercher un élu/i }),
    ).toBeVisible();
  });

  test('la recherche filtre les élus et mène à leur fiche', async ({
    page,
  }) => {
    await page.goto('/');
    // HeroSearch est un composant React hydraté côté client (client:load) :
    // attendre la fin des requêtes réseau laisse le temps au bundle de
    // s'exécuter avant d'interagir, sinon la frappe arrive avant que React
    // n'ait attaché ses écouteurs et l'état de recherche ne se met pas à jour.
    await page.waitForLoadState('networkidle');

    const search = page.getByRole('combobox', { name: /rechercher un élu/i });
    // La recherche ne s'active qu'à partir de 2 caractères (cf.
    // HeroSearch.tsx) ; une paire de lettres courante suffit à faire
    // remonter des résultats quel que soit le contenu réel de la base.
    await search.fill('an');

    const listbox = page.getByRole('listbox', {
      name: /résultats de recherche/i,
    });
    await expect(listbox).toBeVisible();

    const firstOption = listbox.getByRole('option').first();
    const link = firstOption.getByRole('link');
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^\/elus\//);

    await link.click();
    await expect(page).toHaveURL(
      new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  });
});
