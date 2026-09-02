# Scripts d'ingestion

Tous les scripts s'exécutent depuis la racine du monorepo avec `yarn --cwd packages/ingest <script>`.

La variable d'environnement `DATABASE_URL` doit être définie (fichier `.env` à la racine).

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

7 étapes : `deputes`, `collaborateurs`, `interests`, `addresses`, `activity`, `committees`, `votes`

Accepte `--only`, `--skip`, `--help`.

### `ingest:an:partial` — AN partielle (activité + HATVP)

```bash
yarn --cwd packages/ingest ingest:an:partial
```

Pas d'options. Exclut les députés décédés, mandats terminés, questions répondues > 3 mois, déclarations d'élus inactifs.

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

3 étapes : `maires`, `maires-addresses`, `maires-social-scrape`

Accepte `--only`, `--skip`, `--help`.

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

## Cron GitHub Actions

| Workflow                  | Cron                           | Script                |
| ------------------------- | ------------------------------ | --------------------- |
| `ingest-an.yml`           | 1er dimanche du mois 21:00 UTC | `ingest:an`           |
| `ingest-an-partial.yml`   | mardi/samedi 02:00 UTC         | `ingest:an:partial`   |
| `ingest-senat.yml`        | mardi/samedi 03:00 UTC         | `ingest:senat`        |
| `ingest-maires.yml`       | 1er du mois 04:00 UTC          | `ingest:maires`       |
| `ingest-social-links.yml` | quotidien 03:30 UTC            | `ingest:social-links` |
| `ingest-press.yml`        | lundi 05:00 UTC                | `ingest:press`        |

Les parrainages et signatures RIP sont des ingestions one-shot manuelles (pas de cron).

Chaque workflow supporte `workflow_dispatch` pour un déclenchement manuel depuis GitHub.
