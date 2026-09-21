# Migration GitHub Actions → Dagu

Génération automatique des DAGs Dagu équivalents aux workflows `schedule:` de
`.github/workflows/`. Les 17 workflows GitHub Actions d'ingestion convertis ont
ensuite été supprimés — seul `ci.yml` (non planifié, hors périmètre) reste
dans `.github/workflows/`. L'ingestion planifiée tourne désormais uniquement
via Dagu (`dagu-dags/`).

## Workflows convertis (17)

| Workflow source           | Cron           | Fichier Dagu                                                             |
| ------------------------- | -------------- | ------------------------------------------------------------------------ |
| `ingest-an.yml`           | `30 1 * * 1`   | [dagu-dags/ingest-an.yaml](dagu-dags/ingest-an.yaml)                     |
| `ingest-senat.yml`        | `30 1 * * 2`   | [dagu-dags/ingest-senat.yaml](dagu-dags/ingest-senat.yaml)               |
| `ingest-europe.yml`       | `30 1 * * 3`   | [dagu-dags/ingest-europe.yaml](dagu-dags/ingest-europe.yaml)             |
| `ingest-reconcile.yml`    | `30 1 * * 4`   | [dagu-dags/ingest-reconcile.yaml](dagu-dags/ingest-reconcile.yaml)       |
| `ingest-interests.yml`    | `30 1 * * 5`   | [dagu-dags/ingest-interests.yaml](dagu-dags/ingest-interests.yaml)       |
| `ingest-press.yml`        | `30 1 * * 6`   | [dagu-dags/ingest-press.yaml](dagu-dags/ingest-press.yaml)               |
| `ingest-photos.yml`       | `30 1 * * 0`   | [dagu-dags/ingest-photos.yaml](dagu-dags/ingest-photos.yaml)             |
| `ingest-social-links.yml` | `30 3 * * 1`   | [dagu-dags/ingest-social-links.yaml](dagu-dags/ingest-social-links.yaml) |
| `ingest-factchecks.yml`   | `30 3 * * 2`   | [dagu-dags/ingest-factchecks.yaml](dagu-dags/ingest-factchecks.yaml)     |
| `ingest-madada.yml`       | `30 3 * * 3`   | [dagu-dags/ingest-madada.yaml](dagu-dags/ingest-madada.yaml)             |
| `ingest-wikipedia.yml`    | `30 3 * * 4`   | [dagu-dags/ingest-wikipedia.yaml](dagu-dags/ingest-wikipedia.yaml)       |
| `ingest-decorations.yml`  | `30 3 * * 5`   | [dagu-dags/ingest-decorations.yaml](dagu-dags/ingest-decorations.yaml)   |
| `ingest-hatvp-status.yml` | `30 3 * * 6`   | [dagu-dags/ingest-hatvp-status.yaml](dagu-dags/ingest-hatvp-status.yaml) |
| `ingest-geocode.yml`      | `30 3 * * 0`   | [dagu-dags/ingest-geocode.yaml](dagu-dags/ingest-geocode.yaml)           |
| `ingest-press-maires.yml` | `0 */5 * * *`  | [dagu-dags/ingest-press-maires.yaml](dagu-dags/ingest-press-maires.yaml) |
| `ingest-maires.yml`       | `0 22 */5 * *` | [dagu-dags/ingest-maires.yaml](dagu-dags/ingest-maires.yaml)             |
| `ingest-maps.yml`         | `30 6 1 * *`   | [dagu-dags/ingest-maps.yaml](dagu-dags/ingest-maps.yaml)                 |

Tous les crons sont repris tels quels (interprétation UTC dans GitHub Actions).
**À vérifier avant activation** : que le service Dagu/systemd tourne bien avec
`TZ=UTC`, sinon les horaires réels seront décalés par rapport au calendrier
documenté dans [docs/INGESTION-SCHEDULE.md](docs/INGESTION-SCHEDULE.md).

Chaque fichier généré suit la structure : `git pull` → `corepack enable` →
`yarn install --immutable` → la commande d'ingestion, chaînés via `depends:`.

## Workflow ignoré (1)

| Workflow | Déclencheurs           | Raison                                                                                                                                                                                          |
| -------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml` | `push`, `pull_request` | Pas de `schedule:` — ce n'est pas un job planifié mais un pipeline CI déclenché par événement Git. Candidat pour un git hook local plutôt qu'un DAG Dagu (à traiter séparément, comme demandé). |

## Secrets GitHub Actions à reconfigurer manuellement

Ces secrets sont référencés dans les workflows convertis (`secrets.XXX` →
`${XXX}` dans les fichiers Dagu). Ils ne sont **pas** migrés automatiquement —
à définir dans un fichier `.env` local lu par Dagu (ou exporté dans
l'environnement du service systemd) :

- `DATABASE_URL` (utilisé par tous les workflows convertis)
- `AWS_ACCESS_KEY_ID` (ingest-maps)
- `AWS_SECRET_ACCESS_KEY` (ingest-maps)
- `MAPS_S3_BUCKET` (ingest-maps)
- `MAPS_S3_REGION` (ingest-maps)
- `MAPS_BASE_URL` (ingest-maps)

## Ce qui n'a pas pu être converti automatiquement

- **`actions/setup-node@v4`** : omis dans les 17 fichiers générés. Aucun
  équivalent shell direct — cette action installe et configure une version
  précise de Node.js avec cache Yarn. À remplacer manuellement selon
  l'environnement Dagu cible : soit une version de Node.js est déjà installée
  et gérée par le système (nvm, asdf, mise...), soit il faut ajouter une étape
  `command:` explicite (ex. `nvm use 26` ou équivalent) avant `yarn install`.
- **Dépendances inter-jobs (`needs`)** : aucun des 17 workflows convertis n'a
  plus d'un job, donc non applicable ici — mais si un futur workflow GitHub
  Actions à convertir a plusieurs jobs liés par `needs`, la conversion actuelle
  ne les traduit pas automatiquement en `depends:` Dagu inter-jobs (seul le
  premier job serait pris en compte).
- **Matrix builds, runners spécifiques, actions tierces (`upload-artifact`,
  etc.)** : aucun cas de ce type dans les 17 workflows d'ingestion — tous
  suivent le même squelette simple (checkout, setup-node, install, run). Rien
  à signaler sur ce point pour cette conversion.

## Fichiers temporaires

Le script de conversion (`_convert-to-dagu.mjs`) et son résumé JSON
(`_dagu-conversion-summary.json`) étaient des artefacts de travail — supprimés
après génération de ce rapport.
