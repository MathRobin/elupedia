# Calendrier d'ingestion (Dagu)

Chaque pipeline d'ingestion a son propre DAG dans `dagu-dags/ingest-*.yaml`,
avec son propre `schedule` cron. Dagu tourne en local via systemd, sur un dépôt
déjà cloné (pas de checkout distant).

## Brancher Dagu sur le dépôt (poste local)

Dagu tourne via `systemd` (`dagu.service`, `dagu start-all`, `DAGU_HOME=/var/lib/dagu`,
UI sur `http://127.0.0.1:8080`). Par défaut il ne sert que ses DAGs d'exemple : il faut
le pointer sur `dagu-dags/` et lui donner le répertoire de travail et les secrets.

```yaml
# /var/lib/dagu/config.yaml (à créer)
dags_dir: /usr/airporting/elupedia/dagu-dags
tz: UTC # fuseau par défaut des crons ; `ingest-votes` le surcharge (CRON_TZ)
auth:
  mode: none # UI servie sur 127.0.0.1 uniquement ; sinon créer un compte via /setup
```

```yaml
# /var/lib/dagu/base.yaml (hérité par tous les DAGs ; le fichier existe, tout y est commenté)
working_dir: /usr/airporting/elupedia # les étapes font `git pull` puis `yarn --cwd packages/ingest …`
dotenv: /usr/airporting/elupedia/.env # DATABASE_URL, MAPS_S3_*, AWS_*, clés API référencées par ${…}
catchup_window: '' # sinon tout cron manqué dans les 6 h est rejoué au redémarrage
```

Puis `sudo systemctl restart dagu`, et vérifier avec `DAGU_HOME=/var/lib/dagu dagu ls`
(les 25 DAGs doivent apparaître). Lancement manuel : `DAGU_HOME=/var/lib/dagu dagu start
ingest-photos` ; suivi : `dagu status ingest-photos`, `journalctl -u dagu -f`, logs par
étape dans `/var/lib/dagu/logs/dags/<nom>/`. Le checkout `/usr/airporting/elupedia` doit
rester sur `main` et propre (chaque DAG commence par la synchronisation avec `origin/main`).
Cette synchronisation est `git fetch --no-write-fetch-head origin main` puis
`git merge --ff-only origin/main`, protégée par `flock /tmp/elupedia-git-pull.lock`.
Elle n'écrit pas `.git/FETCH_HEAD` : `git pull` le lisait, et deux fetchs concurrents
(deux DAGs à la même minute, ex. `publish-shorts` et `ingest-press-maires` à 15:00, ou un
`git pull` manuel) échouaient avec « Impossible de rebaser sur de multiples
branches ». Un checkout local divergent fait échouer l'étape au lieu d'être réécrit.

Convention des fichiers : `name` est le slug du fichier (Dagu 2 n'accepte que
`[A-Za-z0-9._-]`), le libellé lisible est dans `description` (affiché par l'admin).

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
- **Rebuild du site en fin de DAG** : chaque `ingest-*.yaml` se termine par l'étape
  `rebuild-site` (`yarn --cwd packages/ingest rebuild:site --report …`), qui appelle le
  Deploy Hook Vercel `VERCEL_DEPLOY_HOOK_URL` si un rapport de run signale des
  changements, au plus une fois par 20 min. Le hook se crée dans le projet Vercel
  (Settings → Git → Deploy Hooks, branche `main`) ; sans la variable, l'étape log un
  avertissement et le site attend le prochain merge.

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

## Créneau mensuel dédié — le 12 du mois, 07:30 UTC

- `ingest:conseillers-epci` (RNE conseillers communautaires, ~62 100 lignes,
  ~1 250 EPCI) — même source RNE (trimestrielle) que les autres jobs RNE, donc un
  rythme mensuel est déjà large. Les cinq créneaux « tous les 5 jours à 22:00 »
  (`*/5`, `2/5`, `3/5`, `4/5`, `5/5`) couvrent déjà tous les jours du mois : un
  sixième à 22:00 chevaucherait forcément l'un d'eux sur `officials`/`mandates`.
  07:30 tombe après la fin du tick `press:maires` de 05:00 (~06:15 au plus tard)
  et du job secondaire de 03:30, avant celui de 10:00 ; les jobs lourds de 01:30
  sont longtemps terminés. Ce job écrit beaucoup plus de lignes que les autres
  jobs RNE hors maires (écritures groupées par lots de 500, point de reprise
  entre chaque lot).
- Cron `30 7 12 * *`.

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

## Créneau quotidien — votes AN + Sénat puis short du jour, 16:10 heure de Paris

- `ingest:an --only votes,ballot-proposers` puis `ingest:senat --only senat-votes`
  (DAG `ingest-votes.yaml`, les deux étapes en séquence) — les scrutins publics
  sont publiés par les deux assemblées dès le lendemain de la séance, et les
  passes complètes hebdomadaires (lundi/mardi 01:30) laissent jusqu'à 6 jours de
  retard, trop pour exploiter un vote récent (fiches à jour, génération de
  contenus). Ne touche que `ballots`/`votes`/`ballot_group_positions`, pas
  `officials` ni `mandates` : pas de contention avec les jobs RNE. Placé à
  16:10 heure de Paris : c'est le seul DAG dont le cron est écrit dans un fuseau
  local (`CRON_TZ=Europe/Paris`, préfixe honoré par Dagu et prioritaire sur le
  `tz: UTC` global), pour que l'horaire ne dérive pas d'une heure entre l'été et
  l'hiver — soit 15:10 UTC en hiver et 14:10 UTC en été.
- Enchaîne ensuite la génération du short du jour : `yarn --cwd packages/shorts
select` (sélection des scrutins candidats, quelques requêtes), `script`
  (script des candidats via l'API Claude, `ANTHROPIC_API_KEY`), `voiceover
generate` (voix off ElevenLabs des shorts draft sans voix, `ELEVENLABS_API_KEY`
  et `ELEVENLABS_VOICE_ID` ; sans ces variables l'étape échoue et le short attend
  une voix enregistrée, `voiceover sheet` / `voiceover import`) puis `render`
  (rendu Remotion : Chrome headless, quelques minutes par short, CPU seulement)
  des shorts dont la voix est en base. Voir `docs/DOMAINS.md`. Le short est
  ensuite relu dans l'admin, puis publié dans l'heure qui suit l'approbation
  (DAG horaire `publish-shorts`).
- En hiver, le créneau chevauche le tick `press:maires` de 15:00 UTC (fini vers
  16:15) : c'est la contrepartie assumée d'un horaire fixé en heure locale, le
  créneau 16:00–17:15 Paris étant occupé par ce tick. Le démarrage est décalé de
  10 min pour éviter deux `git pull` + `yarn install` simultanés, mais les deux
  jobs tournent ensuite en parallèle sur le même compute Neon. `press:maires` est
  limité par son délai de 3 s entre élus, donc sa charge base reste faible. En
  été (14:10 UTC), aucun recouvrement.
- Cron `CRON_TZ=Europe/Paris 10 16 * * *`.

## Créneau horaire — publication des shorts

- `yarn --cwd packages/shorts publish --max all` (DAG `publish-shorts.yaml`) —
  met en ligne sur YouTube tous les shorts au statut `approved` (revue humaine
  faite), les plus anciens d'abord : un short approuvé dans l'admin part dans
  l'heure. Ne lit que `video_shorts` : aucune contention avec les ingestions.
  Sans short approuvé, le job ne fait rien (quelques secondes, `git pull` et
  `yarn install --immutable` compris). Dagu n'empile pas deux exécutions du
  même DAG : une publication longue décale simplement le tick suivant.
- Cron `0 * * * *`.

## Créneau mensuel — 1er du mois, 06:30 UTC

- `ingest --only maps` — génère et téléverse les cartes statiques de juridictions
  (S3). Les limites de communes/circonscriptions ne changent pratiquement jamais :
  un rythme mensuel est déjà large. Placé entre les tickets `press:maires` de
  05:00 et 10:00, large marge des deux côtés.

## Secrets requis

Chaque DAG lit `DATABASE_URL` et `VERCEL_DEPLOY_HOOK_URL` (rebuild du site en fin
de DAG) dans le `.env` de la racine via `base.yaml` ; `ingest-votes` y lit aussi
`ANTHROPIC_API_KEY` et `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` (short du jour). Les workflows touchant S3 (`ingest-photos.yml`, `ingest-maps.yml`)
attendent en plus `MAPS_S3_BUCKET`, `MAPS_S3_REGION`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY` (et `MAPS_BASE_URL` pour les cartes) — tous déjà présents
dans les secrets du dépôt.
