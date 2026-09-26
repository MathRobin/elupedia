# Tests end-to-end (Playwright)

## Tests fonctionnels

```bash
yarn test:e2e       # depuis la racine du repo — nécessite le site en dev sur :4321
yarn test:e2e:ui    # idem, avec l'UI interactive Playwright
```

## Régression visuelle (`tests/visual.spec.ts`)

Capture d'écran comparée à une baseline committée dans `tests/*-snapshots/`,
façon Percy/Chromatic : un écart de pixels au-delà du seuil (voir
`playwright.config.ts`) fait échouer le test, donc le check CI de la PR.

**Les baselines doivent être générées via l'image Docker officielle
Playwright**, pas avec le Chromium installé localement : le rendu des polices
diffère selon le système, ce qui produit des écarts de pixels sans rapport
avec une vraie régression si les baselines viennent d'ailleurs que du runner
CI (Ubuntu, image `mcr.microsoft.com/playwright`).

Le site doit tourner en dev sur `localhost:4321` (`yarn --cwd packages/site dev`)
avant de lancer la commande ci-dessous — le conteneur s'y connecte via
`--network host`.

```bash
# Depuis la racine du repo, site déjà lancé sur :4321
docker run --rm --network host \
  -v "$(pwd)":/work -w /work/packages/e2e \
  -e HOME=/tmp \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  npx playwright test visual --update-snapshots

# Les fichiers créés appartiennent à root (conteneur) : rendre la main
docker run --rm -v "$(pwd)":/work -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  chown -R "$(id -u)":"$(id -g)" packages/e2e/tests/visual.spec.ts-snapshots
```

Vérifier ensuite le diff (`git diff` sur les PNG n'est pas lisible — ouvrir
les images) avant de committer : une baseline mise à jour sans revue valide
n'importe quel changement visuel futur par erreur.

La version de l'image Docker (`v1.63.0-noble`) doit rester synchronisée avec
la version de `@playwright/test` dans `package.json` — sinon les navigateurs
utilisés en local et en CI peuvent diverger.

### Ajouter un nouveau test visuel

Masquer (`mask: [...]`) toute zone dont le contenu change au fil de
l'ingestion (dates, compteurs, flux de presse) : ce mécanisme vérifie la mise
en page et le style, pas le contenu — une page pleine de données qui changent
en permanence produirait des diffs en continu sans rapport avec une vraie
régression.
