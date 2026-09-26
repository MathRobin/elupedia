# Elupedia

Encyclopédie ouverte des élus français.

## Stack

- **Site** : Astro / React / Tailwind CSS
- **Base de données** : PostgreSQL hébergé sur Neon, ORM Drizzle
- **Runtime** : Node.js, monorepo Yarn 4 workspaces
- **Langage** : TypeScript (strict)
- **CI** : GitHub Actions

## Structure du monorepo

```
elupedia/
├── packages/
│   ├── shared/    # Types, helpers et schéma DB partagés
│   ├── ingest/    # Scripts de collecte de données (APIs ouvertes)
│   ├── site/      # Site public Astro/React
│   └── e2e/       # Tests end-to-end (Playwright)
├── docs/          # Documentation projet
└── tests/         # Tests racine (structure, intégration)
```

## Conventions base de données

- Noms de tables et colonnes **en anglais**, snake_case
- Clés primaires : `id` (UUID ou serial selon le contexte)
- Timestamps : `created_at`, `updated_at`
- Les migrations sont gérées par Drizzle Kit

## Commandes

```bash
yarn install          # Installer les dépendances
yarn lint             # ESLint sur tout le repo
yarn lint:fix         # ESLint avec auto-fix
yarn format           # Vérifier le formatage Prettier
yarn format:fix       # Appliquer le formatage Prettier
yarn typecheck        # Vérification TypeScript (tsc --build)
yarn test             # Lancer les tests (Vitest)
yarn test:e2e         # Tests end-to-end (Playwright, navigateur réel) — nécessite le site en dev sur :4321
yarn test:e2e:ui      # Idem, avec l'UI interactive Playwright
yarn workspace @elupedia/e2e exec playwright install chromium   # à faire une fois après yarn install (navigateur non téléchargé par défaut)

# Ingestion presse (Google Actualités) — deux périmètres distincts, voir docs/DOMAINS.md
yarn --cwd packages/ingest ingest:press          # parlementaires (députés, sénateurs, eurodéputés)
yarn --cwd packages/ingest ingest:press:maires   # 1500 élus (tous mandats), --limit <n> pour changer la taille du lot
yarn --cwd packages/ingest ingest:press:maires --department 94   # limiter à un département (code INSEE, ex. 94, 33, 2A)
yarn --cwd packages/ingest ingest:press:maires --type <type>   # limiter à un type de mandat (maire, conseiller_departemental, depute, senateur, eurodepute), combinable avec --department
yarn --cwd packages/ingest ingest:press:conseillers-dep   # raccourci pour --type conseiller_departemental

# Candidatures sénatoriales 2026 (pré-scrutin, voir docs/DOMAINS.md)
yarn --cwd packages/ingest ingest:senat:candidacies

# Ingestion conseillers départementaux (RNE, voir docs/DOMAINS.md)
yarn --cwd packages/ingest ingest:conseillers-dep

# Ingestion conseillers régionaux (RNE, voir docs/DOMAINS.md)
yarn --cwd packages/ingest ingest:conseillers-reg

# Ingestion conseillers d'arrondissement (RNE, Paris/Lyon/Marseille, voir docs/DOMAINS.md)
yarn --cwd packages/ingest ingest:conseillers-arr

# Ingestion membres des assemblées à statut particulier (RNE, Corse/Guyane/DOM-TOM/Métropole de Lyon, voir docs/DOMAINS.md)
yarn --cwd packages/ingest ingest:membres-assemblee

# Réconciliation candidats–élus (rattache les official_id manquants)
yarn --cwd packages/ingest reconcile

# Ingestion décorations (Légion d'honneur, ONM, Médaille militaire)
yarn --cwd packages/ingest ingest:decorations

# Dédoublonnage des commissions (fusionne « nom » et « nom (abrégé) »)
yarn --cwd packages/ingest dedupe:committees --dry-run
```

## Documentation

La documentation se trouve dans `docs/` :

- `ARCHITECTURE.md` — architecture technique
- `DOMAINS.md` — domaines métier et sources de données
- `DATA-LICENSES.md` — licences des données utilisées
- `INGESTION-SCHEDULE.md` — calendrier des DAGs Dagu d'ingestion
