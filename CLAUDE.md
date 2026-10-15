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
│   ├── shorts/    # Pipeline de shorts vidéo (sélection, script LLM, voix off enregistrée, rendu Remotion, puis publication)
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
yarn --cwd packages/ingest ingest:press:maires --type <type>   # limiter à un type de mandat (voir MANDATE_TYPE_LABELS dans packages/shared/src/mandate-labels.ts, sauf "president"), combinable avec --department
yarn --cwd packages/ingest ingest:press:conseillers-dep   # raccourci pour --type conseiller_departemental

# Candidatures sénatoriales 2026 (pré-scrutin, voir docs/DOMAINS.md)
yarn --cwd packages/ingest ingest:senat:candidacies

# Résultats sénatoriales 2026 (post-scrutin : résultats, nouvelles fiches, mandats — voir docs/DOMAINS.md)
yarn --cwd packages/ingest ingest:senat:resultats

# Ingestion conseillers départementaux (RNE, voir docs/DOMAINS.md)
yarn --cwd packages/ingest ingest:conseillers-dep

# Ingestion conseillers régionaux (RNE, voir docs/DOMAINS.md)
yarn --cwd packages/ingest ingest:conseillers-reg

# Ingestion conseillers d'arrondissement (RNE, Paris/Lyon/Marseille, voir docs/DOMAINS.md)
yarn --cwd packages/ingest ingest:conseillers-arr

# Ingestion membres des assemblées à statut particulier (RNE, Corse/Guyane/DOM-TOM/Métropole de Lyon, voir docs/DOMAINS.md)
yarn --cwd packages/ingest ingest:membres-assemblee

# Sélection des scrutins candidats à un short vidéo (voir docs/DOMAINS.md)
yarn --cwd packages/shorts select --dry-run   # classement seul, rien écrit ; --days, --max-shorts, --min-score
yarn --cwd packages/shorts script --dry-run   # script LLM des shorts candidate (ANTHROPIC_API_KEY requise) ; --id, --force, --model
yarn --cwd packages/shorts make <id>   # un short de bout en bout : script (si absent) → import de la voix → rendu ; s'arrête avec la fiche de lecture si des prises manquent ; --rescript, --reimport, --force, --silent, --draft, --dry-run
yarn --cwd packages/shorts voiceover sheet   # fiche de lecture des shorts draft sans voix (voix enregistrée par l'équipe, une prise par scène)
yarn --cwd packages/shorts voiceover import --id <uuid>   # recadre, normalise et horodate les prises recordings/scene-<id>.wav
yarn --cwd packages/shorts render --draft   # rendu Remotion (1080×1920) des shorts draft avec voix importée, dans packages/shorts/out/<id>/ ; --id, --force, --silent, --out, --dry-run
yarn --cwd packages/shorts preview   # Remotion Studio pour retoucher la composition (src/remotion/)
yarn --cwd packages/shorts review   # revue humaine : liste les draft ; review approve <id> / review reject <id> --note "…"
yarn --cwd packages/shorts youtube-auth   # une fois : autorisation OAuth YouTube, affiche YOUTUBE_REFRESH_TOKEN
yarn --cwd packages/shorts publish --dry-run   # met en ligne les shorts approved (YOUTUBE_*) ; --id, --max, --privacy

# Réconciliation candidats–élus (rattache les official_id manquants)
yarn --cwd packages/ingest reconcile

# Ingestion décorations (Légion d'honneur, ONM, Médaille militaire)
yarn --cwd packages/ingest ingest:decorations

# Dédoublonnage des commissions (fusionne « nom » et « nom (abrégé) »)
yarn --cwd packages/ingest dedupe:committees --dry-run

# Contrôles de cohérence métier (mandats qui se recoupent, parrainages sans mandat couvrant, etc.), lecture seule
yarn --cwd packages/ingest check:coherence
```

## Conventions de code

- Chaque fichier source porte un commentaire d'en-tête (rôle, source des données, appelants, pièges). Le maintenir à jour quand le fichier change.
- Ingest : `main-*.ts` (CLI) → `run-*.ts` (orchestration testable) → `sources/` (lecture) → `upsert/` (écriture idempotente). Détail dans `docs/ARCHITECTURE.md`, « Guide de lecture du code ».
- Les tests racine (`tests/`) lisent le code source de certaines pages et composants du site et vérifient des chaînes exactes : lancer `yarn vitest run` à la racine après tout renommage.
- Les anomalies connues sont listées dans `docs/KNOWN-ISSUES.md` ; retirer une entrée quand elle est corrigée.

## Documentation

La documentation se trouve dans `docs/` :

- `ARCHITECTURE.md` — architecture technique
- `DOMAINS.md` — domaines métier et sources de données
- `DATA-LICENSES.md` — licences des données utilisées
- `INGEST.md` — scripts d'ingestion et leurs options
- `INGESTION-SCHEDULE.md` — calendrier des DAGs Dagu d'ingestion
- `KNOWN-ISSUES.md` — anomalies et dettes connues
