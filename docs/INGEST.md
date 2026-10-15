# Scripts d'ingestion

Tous les scripts s'exécutent depuis la racine du monorepo avec `yarn --cwd packages/ingest <script>`.

La variable d'environnement `DATABASE_URL` doit être définie (fichier `.env` à la racine).

## Organisation du code

Chaque script suit la même convention (détail dans `docs/ARCHITECTURE.md`, « Guide de lecture du code ») :

- `src/main-<domaine>.ts` : point d'entrée CLI (arguments, connexion DB, rapport, code de sortie) ;
- `src/run-<domaine>.ts` : orchestration testable des étapes `runStep({ fetch, upsert })` ;
- `src/sources/` : lecture des sources ouvertes, sans écriture en base ;
- `src/upsert/` : écriture en base, idempotente, avec la clé de rapprochement documentée en en-tête.

Pour comprendre un script : lire l'en-tête du `main-*`, puis le `run-*` qui liste les étapes, puis les `sources/` et `upsert/` de chaque étape.

## Commandes

### `ingest` — Ingestion complète (AN + Sénat + Maires)

```bash
yarn --cwd packages/ingest ingest
yarn --cwd packages/ingest ingest --only deputes,activity
yarn --cwd packages/ingest ingest --skip interests,addresses
yarn --cwd packages/ingest ingest --help
```

Options :

- `--only <étapes>` — n'exécuter que ces étapes (séparées par des virgules)
- `--skip <étapes>` — ignorer ces étapes
- `--help` — afficher les étapes disponibles

Les deux options sont mutuellement exclusives.

### `ingest:an` — Assemblée nationale (complète)

```bash
yarn --cwd packages/ingest ingest:an
yarn --cwd packages/ingest ingest:an --only deputes
yarn --cwd packages/ingest ingest:an --only deputes,collaborateurs,activity
```

8 étapes (`AN_STEP_NAMES` dans `src/cli.ts`) : `deputes`, `affiliations`, `collaborateurs`, `addresses`, `activity`, `committees`, `votes`, `elections`

Accepte `--only`, `--skip`, `--help`.

### `ingest:an:partial` — AN partielle (activité)

```bash
yarn --cwd packages/ingest ingest:an:partial
```

Pas d'options. Exclut les députés décédés, mandats terminés, questions répondues > 3 mois.

### `ingest:senat` — Sénat

```bash
yarn --cwd packages/ingest ingest:senat
yarn --cwd packages/ingest ingest:senat --only senateurs,senat-votes
```

9 étapes : `senateurs`, `senat-votes`, `senat-affiliations`, `senat-collaborateurs`, `senat-adresses`, `senat-elections`, `senat-commissions`, `senat-activite`, `senat-social-links`

Accepte `--only`, `--skip`, `--help`.

### `ingest:maires` — Maires

```bash
yarn --cwd packages/ingest ingest:maires
yarn --cwd packages/ingest ingest:maires --only maires
```

5 étapes (`MAIRES_STEP_NAMES` dans `src/cli.ts`) : `maires`, `maires-addresses`, `maires-photos`, `maires-elections`, `maires-social-scrape`

Accepte `--only`, `--skip`, `--help`.

### `ingest:interests` — Intérêts HATVP (transverse)

```bash
yarn --cwd packages/ingest ingest:interests
```

Pas d'options. Ingestion transverse des déclarations d'intérêts HATVP pour tous les types de mandat (députés, sénateurs, maires) en une seule passe.

### `ingest:social-links` — Réseaux sociaux

```bash
yarn --cwd packages/ingest ingest:social-links
```

Pas d'options. Crawl des pages AN (réseaux sociaux + sites personnels) + scraping de 50 sites perso/jour.

### `ingest:press` — Mentions presse

```bash
yarn --cwd packages/ingest ingest:press
```

Pas d'options. Google News RSS, élus vivants uniquement, délai 3s entre chaque élu.

### `ingest:parrainages` — Parrainages présidentiels

```bash
yarn --cwd packages/ingest ingest:parrainages          # toutes les élections (2017 + 2022)
yarn --cwd packages/ingest ingest:parrainages 2022      # une seule année
```

Argument optionnel : année d'élection. Sans argument, ingère toutes les élections configurées dans `PARRAINAGES_ELECTIONS`.

### `ingest:rip` — Signatures RIP

```bash
yarn --cwd packages/ingest ingest:rip
```

Pas d'options. Ingère les 3 propositions RIP configurées (ADP 2019, retraites 2023 ×2).

### `ingest:europe` — Parlement européen

```bash
yarn --cwd packages/ingest ingest:europe
```

Eurodéputés français, votes nominatifs et questions écrites (API open data du Parlement européen). Curseur de pagination des questions stocké dans `data_provenance`.

### `ingest:conseillers-dep`, `ingest:conseillers-reg`, `ingest:conseillers-arr`, `ingest:conseillers-fde`, `ingest:membres-assemblee`, `ingest:membres-afe` — RNE

```bash
yarn --cwd packages/ingest ingest:conseillers-dep
yarn --cwd packages/ingest ingest:membres-afe
```

Une étape chacun : lecture du Répertoire national des élus (data.gouv.fr) et historisation des mandats (règles dans `docs/ARCHITECTURE.md`).

### `ingest:senat:candidacies`, `ingest:senat:resultats` — Sénatoriales 2026

```bash
yarn --cwd packages/ingest ingest:senat:candidacies   # pré-scrutin : candidatures
yarn --cwd packages/ingest ingest:senat:resultats     # post-scrutin : résultats, nouvelles fiches, mandats
```

Chaîne : candidatures (tour 1) → résultats (tour 2 + élus) → ouverture des mandats au 1er octobre et clôture des sortants → `ingest:senat` complète ensuite matricule et date de naissance.

### `ingest:press:maires`, `ingest:press:conseillers-dep` — Presse, tous mandats

```bash
yarn --cwd packages/ingest ingest:press:maires --limit 1500
yarn --cwd packages/ingest ingest:press:maires --department 94
yarn --cwd packages/ingest ingest:press:maires --type conseiller_departemental
```

Malgré son nom, couvre tous les types de mandat (1500 élus vivants aléatoires par défaut, les moins récemment vérifiés d'abord via `officials.press_checked_at`).

### `ingest:photos`, `ingest:hatvp-status`, `ingest:decorations`, `ingest:factchecks`, `ingest:madada`, `ingest:wikipedia`

```bash
yarn --cwd packages/ingest ingest:photos        # sauvegarde S3 des photos officielles
yarn --cwd packages/ingest ingest:hatvp-status  # statut de publication des déclarations HATVP (scraping)
yarn --cwd packages/ingest ingest:decorations   # Légion d'honneur, ONM, Médaille militaire (base Léonore)
yarn --cwd packages/ingest ingest:factchecks    # Google Fact Check API (clé GOOGLE_FACTCHECK_API_KEY requise)
yarn --cwd packages/ingest ingest:madada        # demandes CADA par commune via MaDaDa.fr (cache madada-cache.json)
yarn --cwd packages/ingest ingest:wikipedia     # lien Wikipédia via Wikidata
```

### Outils de maintenance

```bash
yarn --cwd packages/ingest reconcile                     # rattache les candidats aux élus (official_id manquants)
yarn --cwd packages/ingest dedupe:committees --dry-run   # fusionne « nom » et « nom (abrégé) »
yarn --cwd packages/ingest check:coherence               # contrôles métier, lecture seule
yarn --cwd packages/ingest merge:duplicate-officials     # dry-run : fiches AN/Sénat en doublon (même nom + naissance)
yarn --cwd packages/ingest merge:duplicate-officials --apply   # fusionne : garde la fiche Sénat, supprime la fiche AN
```

`merge:duplicate-officials` corrige un héritage : avant le rapprochement nom + prénom + date de naissance entre sources, un sénateur décrit à la fois par l'open data Sénat et par le jeu AMO30 de l'AN recevait deux fiches. La fiche Sénat est conservée ; elle reçoit l'`an_id`, les champs qu'elle n'avait pas et toutes les lignes dépendantes de la fiche AN, sauf celles qu'elle possède déjà (même clé naturelle par table, voir `NATURAL_KEYS` dans `src/merge-duplicate-officials.ts`). Le slug de la fiche AN disparaît.

## Planification

L'ingestion est planifiée par des DAGs Dagu (`dagu-dags/`), voir `docs/INGESTION-SCHEDULE.md`. Il n'y a plus de cron GitHub Actions d'ingestion.

Les parrainages et signatures RIP sont des ingestions one-shot manuelles.
