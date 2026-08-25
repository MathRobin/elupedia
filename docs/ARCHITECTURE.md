# Architecture

## Vue d'ensemble

Elupedia suit un pipeline linéaire : les données publiques sont collectées périodiquement, stockées en base, puis consommées au moment du build pour générer un site statique.

```mermaid
flowchart LR
    A["Sources ouvertes\n(AN, HATVP, data.gouv)"] -->|cron GitHub Actions| B["packages/ingest\n(Node.js)"]
    B -->|upsert| C["PostgreSQL\n(Neon)"]
    C -->|query au build| D["packages/site\n(Astro)"]
    D -->|build statique| E["Vercel\n(CDN)"]
```

## Étapes du pipeline

### 1. Ingestion (`packages/ingest`)

Scripts Node.js exécutés via des cron jobs GitHub Actions. Chaque script télécharge des archives ZIP ou des fichiers CSV depuis les portails open data et effectue un upsert en base.

- Exécution : deux cron GitHub Actions quotidiens séparés :
  - AN (`.github/workflows/ingest-an.yml`, 02:00 UTC) — députés, collaborateurs, intérêts HATVP, adresses, activité parlementaire, commissions
  - Sénat (`.github/workflows/ingest-senat.yml`, 02:30 UTC) — sénateurs, votes, affiliations, collaborateurs, adresses, historique électoral
- Déclenchement manuel : `workflow_dispatch` sur chaque workflow
- Stratégie : upsert (insert on conflict update) pour l'idempotence
- Résilience : retry avec backoff exponentiel (3 tentatives, délais 1s/2s/4s) via `utils/retry.ts`
- Orchestration : `run-an.ts` (6 étapes AN) et `run-senat.ts` (6 étapes Sénat), isole les erreurs par étape et affiche un résumé ; `run.ts` combine les deux pour un run complet
- Détection de changement : `utils/change-detector.ts` compare les compteurs created/updated, expose un indicateur `has_changes` en output GitHub Actions
- Points d'entrée : `main-an.ts` (`ingest:an`), `main-senat.ts` (`ingest:senat`), `main.ts` (`ingest`, combiné)

#### Clients de données

| Client                     | Fichier                           | Source                      | Format        | Statut   |
| -------------------------- | --------------------------------- | --------------------------- | ------------- | -------- |
| Députés (tous)             | `sources/assemblee-nationale.ts`  | data.assemblee-nationale.fr | ZIP/JSON      | ✅ actif |
| Collaborateurs AN          | `sources/an-collaborateurs.ts`    | data.assemblee-nationale.fr | CSV           | ✅ actif |
| Adresses/contacts AN       | `sources/an-adresses.ts`          | data.assemblee-nationale.fr | ZIP/JSON      | ✅ actif |
| Activité parlementaire     | `sources/an-activite.ts`          | data.assemblee-nationale.fr | ZIP/JSON      | ✅ actif |
| Commissions/délégations    | `sources/an-commissions.ts`       | data.assemblee-nationale.fr | ZIP/JSON      | ✅ actif |
| Intérêts (HATVP)           | `sources/hatvp.ts`                | hatvp.fr                    | XML streaming | ✅ actif |
| Sénateurs                  | `sources/senat.ts`                | data.senat.fr               | JSON API      | ✅ actif |
| Scrutins Sénat             | `sources/senat-scrutins.ts`       | data.senat.fr               | JSON API      | ✅ actif |
| Groupes Sénat              | `sources/senat-groupes.ts`        | data.senat.fr               | JSON API      | ✅ actif |
| Collaborateurs Sénat       | `sources/senat-collaborateurs.ts` | data.senat.fr               | JSON API      | ✅ actif |
| Adresses Sénat             | `sources/senat-adresses.ts`       | data.senat.fr               | JSON API      | ✅ actif |
| Historique électoral Sénat | `sources/senat-elections.ts`      | data.senat.fr               | JSON API      | ✅ actif |
| Résultats électoraux AN    | `sources/datagouv-elections.ts`   | data.gouv.fr                | —             | ⏸ prévu  |

#### Upsert / Diff

| Upsert                     | Fichier                             | Stratégie                              |
| -------------------------- | ----------------------------------- | -------------------------------------- |
| Officials + mandates (AN)  | `upsert/officials.ts`               | Upsert sur an_id                       |
| Sénateurs + mandats        | `upsert/senators.ts`                | Upsert sur an_id (source Sénat)        |
| Votes + ballots (AN)       | `upsert/votes.ts`                   | Upsert sur ballot_id + official        |
| Votes Sénat                | `upsert/senat-votes.ts`             | Upsert sur ballot_id + official        |
| Collaborateurs AN          | `upsert/staffers-diff.ts`           | Diff (set end_date si parti)           |
| Collaborateurs Sénat       | `upsert/senat-staffers-diff.ts`     | Diff (set end_date si parti)           |
| Affiliations AN            | `upsert/affiliations-diff.ts`       | Diff (set end_date si changé)          |
| Affiliations Sénat         | `upsert/senat-affiliations.ts`      | Upsert sur official + groupe           |
| Intérêts                   | `upsert/interests.ts`               | Upsert sur official + entity           |
| Adresses AN                | `upsert/addresses.ts`               | Upsert sur official + type             |
| Adresses Sénat             | `upsert/senat-addresses.ts`         | Upsert sur official + type             |
| Activité parlementaire     | `upsert/parliamentary-activity.ts`  | Upsert sur official + title + date     |
| Commissions                | `upsert/committees.ts`              | Upsert sur official + name + type      |
| Résultats électoraux AN    | `upsert/electoral-results.ts`       | Upsert sur official + election + round |
| Résultats électoraux Sénat | `upsert/senat-electoral-results.ts` | Upsert sur official + election + round |

### 2. Base de données (PostgreSQL / Neon)

Base PostgreSQL hébergée sur Neon (serverless). Le schéma est géré par Drizzle ORM et versionné via Drizzle Kit (migrations).

- Tables et colonnes en anglais, snake_case
- Schéma défini dans `packages/shared/src/schema/`
- Migrations dans `drizzle/`
- Client de connexion : `packages/shared/src/db.ts` (lit `DATABASE_URL`)

#### Tables (M0 — schéma)

| Table                    | Colonnes clés                                                                                                                                                      | FK vers            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `officials`              | id, first_name, last_name, an_id, birth_date, photo_url                                                                                                            | —                  |
| `mandates`               | type, district, department, start_date, end_date, political_group                                                                                                  | officials          |
| `ballots`                | an_id, title, date, type                                                                                                                                           | —                  |
| `votes`                  | position (for/against/abstain/absent)                                                                                                                              | ballots, officials |
| `staffers`               | first_name, last_name, start_date, end_date (index sur official_id)                                                                                                | officials          |
| `affiliations`           | party_or_group, start_date, end_date                                                                                                                               | officials          |
| `interests`              | type (professional_activity/consulting_activity/governing_body_membership/voluntary_activity/elected_function/financial_participation), entity_name, declared_date | officials          |
| `addresses`              | type (constituency/assembly), street, postal_code, city, phone, email                                                                                              | officials          |
| `external_links`         | platform, url                                                                                                                                                      | officials          |
| `press_mentions`         | title, source_name, source_url, published_date, summary                                                                                                            | officials          |
| `parliamentary_activity` | type, title, date, status                                                                                                                                          | officials          |
| `committees`             | name, type, start_date, end_date                                                                                                                                   | officials          |
| `electoral_results`      | election_type, election_date, round, score_percent, opponent_count                                                                                                 | officials          |

### 3. Build du site (`packages/site`)

Site Astro avec composants React et Tailwind CSS. Les données sont requêtées depuis la base **uniquement au moment du build** (pas de requêtes côté client, pas de SSR).

- Framework : Astro 7 (static output)
- Composants interactifs : React 19 (islands via `@astrojs/react`)
- Styling : Tailwind CSS 4 (via `@tailwindcss/vite`)
- Utilitaires date : date-fns (calcul d'âge sur la fiche élu)
- Layout de base : `src/layouts/BaseLayout.astro` (header, footer, meta description, titre dynamique)
- SEO : sitemap XML généré au build (`@astrojs/sitemap`), meta tags Open Graph (title, description, image, url, type, locale, site_name), URL canonique
- Site URL : `https://elupedia.fr`
- Consentement cookies : tarteaucitron.js vendorisé dans `public/tarteaucitron/`, conforme CNIL (highPrivacy, DenyAllCta, AcceptAllCta)
- Recherche : Pagefind (indexation au postbuild, recherche côté client sans backend)
- Composants React : `src/components/SearchBar.tsx` (barre de recherche Pagefind, ARIA combobox)
- Accessibilité : skip-to-content, focus-visible global, aria-label sur la navigation, contraste WCAG AA (minimum text-gray-500 pour le texte informatif)
- Pages :
  - `src/pages/index.astro` — page d'accueil (grille de cartes des élus avec photo, badge député/sénateur genré, nom, circonscription, groupe politique ; filtres par type de mandat et département)
  - `src/pages/elus/[slug].astro` — fiche détaillée d'un élu (identité avec âge calculé, mandat en cours, tous les mandats, coordonnées, affiliations, collaborateurs, activité parlementaire, commissions & groupes, historique électoral, intérêts déclarés groupés par catégorie, votes, presse, liens extérieurs, timeline unifiée, indicateur de dernière mise à jour)
  - `src/pages/scrutins/[id].astro` — détail d'un scrutin (titre, date, type, votes des élus triés par nom avec position)
  - `src/pages/a-propos.astro` — page À propos (présentation, feuille de route, piliers, indépendance, contribution)
  - `src/pages/donnees-personnelles.astro` — page droits RGPD (données publiées, base légale, droits, contact, CNIL, cookies)
  - `src/pages/mentions-legales.astro` — mentions légales (sources de données, licences, hébergeur, licence code AGPL-3.0)

### 4. Déploiement (Vercel)

Le site statique généré est déployé sur Vercel. Chaque push sur `main` déclenche un rebuild.

- Hébergement : Vercel (CDN mondial)
- Mode : statique uniquement (pas de fonctions serverless)
- Configuration : `vercel.json` (buildCommand, outputDirectory, installCommand)
- Domaine : `elupedia.fr` (DNS configuré vers Vercel)
- Variables d'environnement : `DATABASE_URL` configurée sur Vercel pour le build
- Analytics : Vercel Web Analytics (`@vercel/analytics`, cookieless, injecté dans le layout)
- Chaîne ingestion → rebuild : chaque workflow d'ingestion (AN, Sénat) expose `has_changes`, qui conditionne un rebuild Vercel via deploy hook

## Packages partagés (`packages/shared`)

Contient le client DB (Drizzle + Neon), le schéma complet, les types TypeScript et les helpers utilisés à la fois par `ingest` et `site`.

## Documentation et conformité

- **README.md** : présentation du projet, stack, sources de données, instructions de setup, contribution, badge CI
- **LICENSE** : texte complet AGPL-3.0
- **docs/DATA-LICENSES.md** : inventaire des sources de données et leurs licences de réutilisation
- **docs/ARCHITECTURE.md** : ce fichier
- **docs/DOMAINS.md** : domaines métier et sources associées

## CI / CD

- **GitHub Actions CI** (`.github/workflows/ci.yml`) : lint, format, typecheck et tests sur chaque PR et push sur `main`
- **GitHub Actions Ingestion AN** (`.github/workflows/ingest-an.yml`) : cron quotidien 02:00 UTC, pipeline AN (députés, collaborateurs, HATVP, adresses, activité, commissions)
- **GitHub Actions Ingestion Sénat** (`.github/workflows/ingest-senat.yml`) : cron quotidien 02:30 UTC, pipeline Sénat (sénateurs, votes, affiliations, collaborateurs, adresses, historique électoral)
- **Dependabot** (`.github/dependabot.yml`) : surveillance hebdomadaire des dépendances npm

## Tests

- **Framework** : Vitest (configuré à la racine et dans chaque package)
- **Commande** : `yarn test` lance les tests racine puis ceux de chaque workspace
- **Couverture M7** : structure monorepo, configs, schéma DB, migration, CI, clients API (ZIP/JSON et CSV), upsert/diff, retry, orchestration, cron workflow, change detection, layout, tarteaucitron, SEO, Vercel Web Analytics, page d'accueil, fiche élu avec 14 sections et âge calculé, page scrutin, page à propos, page RGPD, page mentions légales, Pagefind, barre de recherche, accessibilité, README, DATA-LICENSES
