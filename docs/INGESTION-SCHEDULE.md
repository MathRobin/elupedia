# Calendrier d'ingestion (Dagu)

Chaque pipeline d'ingestion a son propre DAG dans `dagu-dags/ingest-*.yaml`,
avec son propre `schedule` cron. Dagu tourne en local via systemd, sur un dépôt
déjà cloné (pas de checkout distant).

## Principes

- **Une seule base Postgres (Neon), un seul compute** (2 CU max, auto-suspend 5 min) :
  deux ingestions lourdes qui tournent en même temps se marchent dessus (contention,
  ralentissement, risque de race condition sur `officials`/`mandates`). Les créneaux
  ci-dessous sont espacés pour qu'un job soit terminé avant que le suivant démarre,
  avec une marge.
- **Pas plus souvent que nécessaire** : la fréquence suit le rythme réel de mise à
  jour de la source (ex. RNE maires = trimestriel → `ingest:maires` tous les 5 jours
  est déjà large), pas un rythme arbitraire.
- **Exclus du cron** (one-shot ou maintenance manuelle, voir `docs/DOMAINS.md`) :
  `ingest:parrainages`, `ingest:rip` (élection présidentielle, figé après coup),
  `dedupe:committees` (outil de maintenance à lancer en `--dry-run` avant d'appliquer),
  `ingest:an:partial` (variante manuelle de `ingest:an`), l'étape `campaign-accounts`
  du pipeline générique (CNCCFP — publié une fois par cycle électoral, pas de rythme
  récurrent pertinent ; à relancer manuellement quand un nouveau cycle est publié).

## Créneau haute fréquence — toutes les 5h (00:00, 05:00, 10:00, 15:00, 20:00 UTC)

- `ingest:press:maires` — lot de 1500 élus (tous mandats) triés par date de dernière
  vérification presse croissante (voir `officials.press_checked_at`). Sur ~34 800
  maires, un cycle complet prend 24 runs → **~5 jours pour couvrir tout le monde**,
  ce qui correspond exactement au rythme demandé. Durée observée : jusqu'à ~75 min
  (1500 × délai de 3s entre chaque élu pour ne pas marteler le flux RSS).

## Créneau isolé — tous les 5 jours, 22:00 UTC

- `ingest:maires` (RNE + adresses DILA + photos Wikidata + résultats municipaux) —
  source RNE mise à jour trimestriellement : un cycle tous les 5 jours est déjà
  large. Placé à 22:00, à 2h de marge de la fenêtre `press:maires` la plus proche
  (20:00 et 00:00) pour ne jamais chevaucher.
- Cron `0 22 */5 * *` : le pas `*/5` sur le jour du mois recale à 1 en fin de mois
  (écart parfois un peu plus court autour du 31 → 1), acceptable pour ce cas d'usage.

## Créneau isolé — tous les 5 jours (décalé d'1 jour vs maires), 22:00 UTC

- `ingest:conseillers-dep` (RNE conseillers départementaux) — même source (RNE,
  trimestriel) et même raisonnement que `ingest:maires`, mais volume bien plus
  petit (~4 000 lignes contre ~34 800) : le job se termine en quelques minutes.
  Décalé d'une journée (`2/5` vs `*/5`) plutôt que d'une heure le même jour, pour
  éviter toute contention avec `ingest:maires` sur `officials`/`mandates` tout en
  gardant la même marge de 2h avec les tickets `press:maires` (20:00 et 00:00).
- Cron `0 22 2/5 * *`.

## Créneau isolé — tous les 5 jours (décalé de 2 jours vs maires), 22:00 UTC

- `ingest:conseillers-reg` (RNE conseillers régionaux) — même raisonnement que
  `ingest:conseillers-dep`, volume encore plus petit (~1 750 lignes). Décalé
  d'un jour de plus (`3/5`) pour rester isolé des deux autres jobs RNE sur
  `officials`/`mandates`.
- Cron `0 22 3/5 * *`.

## Créneau isolé — tous les 5 jours (décalé de 3 jours vs maires), 22:00 UTC

- `ingest:conseillers-arr` (RNE conseillers d'arrondissement) — même
  raisonnement, volume encore plus petit (~1 025 lignes, Paris/Lyon/Marseille
  uniquement). Décalé d'un jour de plus (`4/5`) pour rester isolé des trois
  autres jobs RNE sur `officials`/`mandates`.
- Cron `0 22 4/5 * *`.

## Créneau isolé — tous les 5 jours (décalé de 4 jours vs maires), 22:00 UTC

- `ingest:membres-assemblee` (RNE membres des assemblées à statut particulier)
  — même raisonnement, plus petit volume encore (~557 lignes, 10 collectivités
  d'outre-mer/Corse/Métropole de Lyon). Décalé d'un jour de plus (`5/5`) pour
  rester isolé des quatre autres jobs RNE sur `officials`/`mandates`.
- Cron `0 22 5/5 * *`.

## Créneau principal — un job lourd par jour, 01:30 UTC

Choisi à 1h30 après le tick `press:maires` de 00:00 (qui peut tourner jusqu'à ~75 min)
et 3h30 avant celui de 05:00 — large marge dans les deux sens.

| Jour     | Commande           | Pourquoi ce jour                                                                      |
| -------- | ------------------ | ------------------------------------------------------------------------------------- |
| Lundi    | `ingest:an`        | Votes/activité AN à jour en début de semaine                                          |
| Mardi    | `ingest:senat`     | Décalé d'un jour vs AN (tables `officials`/`mandates` partagées)                      |
| Mercredi | `ingest:europe`    | Volume plus petit (~700 votants/scrutin), milieu de semaine                           |
| Jeudi    | `reconcile`        | Rattache les officials/élections ajoutés par AN/Sénat/Europe plus tôt dans la semaine |
| Vendredi | `ingest:interests` | Déclarations HATVP, volume indépendant des mandats                                    |
| Samedi   | `ingest:press`     | Presse parlementaires (~1000 élus, passe complète hebdomadaire)                       |
| Dimanche | `ingest:photos`    | Sauvegarde S3 des photos, jour calme                                                  |

## Créneau secondaire — un job léger par jour, 03:30 UTC

Petits volumes, largement avant le tick `press:maires` de 05:00.

| Jour     | Commande                                                                |
| -------- | ----------------------------------------------------------------------- |
| Lundi    | `ingest:social-links`                                                   |
| Mardi    | `ingest:factchecks`                                                     |
| Mercredi | `ingest:madada`                                                         |
| Jeudi    | `ingest:wikipedia`                                                      |
| Vendredi | `ingest:decorations`                                                    |
| Samedi   | `ingest:hatvp-status`                                                   |
| Dimanche | `ingest --only geocode` (géocode les adresses ingérées dans la semaine) |

## Créneau mensuel — 1er du mois, 06:30 UTC

- `ingest --only maps` — génère et téléverse les cartes statiques de juridictions
  (S3). Les limites de communes/circonscriptions ne changent pratiquement jamais :
  un rythme mensuel est déjà large. Placé entre les tickets `press:maires` de
  05:00 et 10:00, large marge des deux côtés.

## Secrets requis

Chaque workflow attend `secrets.DATABASE_URL` (déjà configuré pour le déploiement
dans `ci.yml`). Les workflows touchant S3 (`ingest-photos.yml`, `ingest-maps.yml`)
attendent en plus `MAPS_S3_BUCKET`, `MAPS_S3_REGION`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY` (et `MAPS_BASE_URL` pour les cartes) — tous déjà présents
dans les secrets du dépôt.
