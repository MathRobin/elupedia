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
│   └── site/      # Site public Astro/React
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

# Réconciliation candidats–élus (rattache les official_id manquants)
yarn --cwd packages/ingest reconcile
```

## Documentation

La documentation se trouve dans `docs/` :

- `ARCHITECTURE.md` — architecture technique
- `DOMAINS.md` — domaines métier et sources de données
- `DATA-LICENSES.md` — licences des données utilisées
