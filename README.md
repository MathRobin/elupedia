# Elupedia

[![CI](https://github.com/MathRobin/elupedia/actions/workflows/ci.yml/badge.svg)](https://github.com/MathRobin/elupedia/actions/workflows/ci.yml)

Encyclopédie ouverte des élus français.

Elupedia collecte les données publiques des portails open data institutionnels (Assemblée nationale, HATVP, data.gouv.fr) et les présente dans un site statique accessible à tous.

## Stack

- **Site** : [Astro](https://astro.build) / React / Tailwind CSS
- **Base de données** : PostgreSQL sur [Neon](https://neon.tech), ORM [Drizzle](https://orm.drizzle.team)
- **Runtime** : Node.js, monorepo Yarn 4 workspaces
- **Langage** : TypeScript (strict)
- **CI** : GitHub Actions
- **Hébergement** : Vercel

## Sources de données

| Source | Données | Licence |
| --- | --- | --- |
| [data.assemblee-nationale.fr](https://data.assemblee-nationale.fr) | Députés, mandats, adresses, questions, collaborateurs | Licence Ouverte 2.0 |
| [HATVP](https://www.hatvp.fr/open-data/) | Déclarations d'intérêts *(prévue)* | Licence Ouverte 2.0 |
| [data.gouv.fr](https://www.data.gouv.fr) | Résultats électoraux *(prévue)* | Licence Ouverte 2.0 |

Détails dans [docs/DATA-LICENSES.md](docs/DATA-LICENSES.md).

## Installation

```bash
# Prérequis : Node.js 20+, Yarn 4
corepack enable
yarn install
```

Créer un fichier `.env` à la racine avec la variable `DATABASE_URL` pointant vers une base PostgreSQL (Neon ou locale).

```bash
# Appliquer les migrations
yarn db:migrate

# Lancer l'ingestion
yarn workspace @elupedia/ingest ingest

# Lancer le site en dev
yarn workspace @elupedia/site dev
```

## Commandes

```bash
yarn lint          # ESLint
yarn format        # Vérifier Prettier
yarn typecheck     # TypeScript
yarn test          # Vitest (racine + workspaces)
```

## Structure

```
elupedia/
├── packages/
│   ├── shared/    # Types, schéma DB, helpers
│   ├── ingest/    # Pipeline de collecte de données
│   └── site/      # Site public Astro
├── docs/          # Documentation
├── tests/         # Tests racine
└── drizzle/       # Migrations SQL
```

## Contribuer

Les contributions sont bienvenues. Ouvrir une issue pour discuter avant de soumettre une PR significative.

## Licence

[AGPL-3.0](LICENSE)
