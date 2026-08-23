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

- Exécution : cron GitHub Actions quotidien (`.github/workflows/ingest.yml`, 02:00 UTC)
- Déclenchement manuel : `workflow_dispatch`
- Stratégie : upsert (insert on conflict update) pour l'idempotence
- Résilience : retry avec backoff exponentiel (3 tentatives, délais 1s/2s/4s) via `utils/retry.ts`
- Orchestration : `run.ts` exécute 4 étapes actives séquentiellement (3 désactivées en attente de sources), isole les erreurs par étape et affiche un résumé
- Détection de changement : `utils/change-detector.ts` compare les compteurs created/updated, expose un indicateur `has_changes` en output GitHub Actions et écrit `ingest-report.json`
- Point d'entrée : `src/main.ts` → script `yarn workspace @elupedia/ingest ingest`

#### Clients de données (M1)

| Client                  | Fichier                          | Source                      | Format   | Statut      |
| ----------------------- | -------------------------------- | --------------------------- | -------- | ----------- |
| Députés (tous)          | `sources/assemblee-nationale.ts` | data.assemblee-nationale.fr | ZIP/JSON | ✅ actif    |
| Collaborateurs          | `sources/an-collaborateurs.ts`   | data.assemblee-nationale.fr | CSV      | ✅ actif    |
| Adresses/contacts       | `sources/an-adresses.ts`         | data.assemblee-nationale.fr | ZIP/JSON | ✅ actif    |
| Activité parlementaire  | `sources/an-activite.ts`         | data.assemblee-nationale.fr | ZIP/JSON | ✅ actif    |
| Commissions/délégations | `sources/an-commissions.ts`      | data.assemblee-nationale.fr | —        | ⏸ désactivé |
| Intérêts (HATVP)        | `sources/hatvp.ts`               | hatvp.fr                    | —        | ⏸ désactivé |
| Résultats électoraux    | `sources/datagouv-elections.ts`  | data.gouv.fr                | —        | ⏸ désactivé |

#### Upsert / Diff (M1)

| Upsert                 | Fichier                            | Stratégie                                              |
| ---------------------- | ---------------------------------- | ------------------------------------------------------ |
| Officials + mandates   | `upsert/officials.ts`              | Upsert sur an_id                                       |
| Votes + ballots        | `upsert/votes.ts`                  | Upsert sur ballot_id + official (pas de source active) |
| Collaborateurs         | `upsert/staffers-diff.ts`          | Diff (set end_date si parti)                           |
| Affiliations           | `upsert/affiliations-diff.ts`      | Diff (set end_date si changé) (pas de source active)   |
| Intérêts               | `upsert/interests.ts`              | Upsert sur official + entity                           |
| Adresses               | `upsert/addresses.ts`              | Upsert sur official + type                             |
| Activité parlementaire | `upsert/parliamentary-activity.ts` | Upsert sur official + title + date                     |
| Commissions            | `upsert/committees.ts`             | Upsert sur official + name + type                      |
| Résultats électoraux   | `upsert/electoral-results.ts`      | Upsert sur official + election + round                 |

### 2. Base de données (PostgreSQL / Neon)

Base PostgreSQL hébergée sur Neon (serverless). Le schéma est géré par Drizzle ORM et versionné via Drizzle Kit (migrations).

- Tables et colonnes en anglais, snake_case
- Schéma défini dans `packages/shared/src/schema/`
- Migrations dans `drizzle/`
- Client de connexion : `packages/shared/src/db.ts` (lit `DATABASE_URL`)

#### Tables (M0 — schéma)

| Table                    | Colonnes clés                                                         | FK vers            |
| ------------------------ | --------------------------------------------------------------------- | ------------------ |
| `officials`              | id, first_name, last_name, an_id, birth_date, photo_url               | —                  |
| `mandates`               | type, district, department, start_date, end_date, political_group     | officials          |
| `ballots`                | an_id, title, date, type                                              | —                  |
| `votes`                  | position (for/against/abstain/absent)                                 | ballots, officials |
| `staffers`               | first_name, last_name, start_date, end_date (index sur official_id)   | officials          |
| `affiliations`           | party_or_group, start_date, end_date                                  | officials          |
| `interests`              | type (company_share/nonprofit_role), entity_name, declared_date       | officials          |
| `addresses`              | type (constituency/assembly), street, postal_code, city, phone, email | officials          |
| `external_links`         | platform, url                                                         | officials          |
| `press_mentions`         | title, source_name, source_url, published_date, summary               | officials          |
| `parliamentary_activity` | type, title, date, status                                             | officials          |
| `committees`             | name, type, start_date, end_date                                      | officials          |
| `electoral_results`      | election_type, election_date, round, score_percent, opponent_count    | officials          |

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
  - `src/pages/index.astro` — page d'accueil (grille de cartes des élus avec photo, nom, circonscription, groupe politique)
  - `src/pages/elus/[slug].astro` — fiche détaillée d'un élu (identité avec âge calculé, mandat avec prédécesseur/successeur, coordonnées, affiliations, collaborateurs, activité parlementaire, commissions & groupes, historique électoral, intérêts déclarés, votes, presse, liens extérieurs, timeline unifiée, indicateur de dernière mise à jour)
  - `src/pages/scrutins/[id].astro` — détail d'un scrutin (titre, date, type, votes des élus triés par nom avec position)
  - `src/pages/a-propos.astro` — page À propos (présentation, feuille de route, piliers, indépendance, contribution)
  - `src/pages/donnees-personnelles.astro` — page droits RGPD (données publiées, base légale, droits, contact, CNIL, cookies)

### 4. Déploiement (Vercel)

Le site statique généré est déployé sur Vercel. Chaque push sur `main` déclenche un rebuild.

- Hébergement : Vercel (CDN mondial)
- Mode : statique uniquement (pas de fonctions serverless)

## Packages partagés (`packages/shared`)

Contient le client DB (Drizzle + Neon), le schéma complet (13 tables), les types TypeScript et les helpers utilisés à la fois par `ingest` et `site`.

## CI / CD

- **GitHub Actions CI** (`.github/workflows/ci.yml`) : lint, format, typecheck et tests sur chaque PR et push sur `main`
- **GitHub Actions Ingestion** (`.github/workflows/ingest.yml`) : cron quotidien 02:00 UTC, lance le pipeline d'ingestion complet, expose `has_changes` pour conditionner un rebuild du site
- **Dependabot** (`.github/dependabot.yml`) : surveillance hebdomadaire des dépendances npm

## Tests

- **Framework** : Vitest (configuré à la racine et dans chaque package)
- **Commande** : `yarn test` lance les tests racine puis ceux de chaque workspace
- **Couverture M5** : structure monorepo, configs, schéma DB, migration, CI, clients API, upsert/diff, retry, orchestration, cron workflow, change detection, layout, tarteaucitron, SEO, page d'accueil, fiche élu avec 14 sections, page scrutin, page à propos, page RGPD, Pagefind, barre de recherche, accessibilité
