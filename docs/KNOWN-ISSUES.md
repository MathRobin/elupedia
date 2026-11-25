# Anomalies et dettes connues

Points relevés à la lecture du code lors de la passe de lisibilité d'octobre 2026. Aucun n'a été corrigé à cette occasion : chaque ligne est une piste à vérifier, pas un diagnostic confirmé. Retirer une entrée quand elle est traitée.

## Migrations Drizzle : vérifications restantes

Le registre de la base de production (`drizzle.__drizzle_migrations`) est réconcilié avec le journal : 45 lignes, de `0000` à `0044`. Le contrôle `scripts/check-migrations.mjs` tourne avant `db:migrate` dans `vercel.json`. Restent à vérifier :

- Le build Vercel n'a pas encore été observé depuis cette réconciliation : dans les logs du prochain déploiement, `db:check` puis `db:migrate` doivent passer sans rejouer de migration.
- `0019_early_crusher_hogan` : le hash du fichier diffère de celui du registre, car le fichier a été modifié par le commit `fcb32dc` après application. Sans effet sur le migrator ; toléré par `LEGACY_HASH_MISMATCH`.
- `0010` et `0011` : leur `when` est inférieur à celui de `0009`. Toléré par `LEGACY_NON_MONOTONIC`.

Retirer cette section quand le build est vérifié.

## `merge:duplicate-officials` ne fusionne plus la population qu'il décrit

L'en-tête de `packages/ingest/src/merge-duplicate-officials.ts` décrit des
doublons entre l'open data Sénat et le jeu AMO30 de l'AN, et une règle de
conservation fondée là-dessus : matricule Sénat, sinon identifiant AN.

Le dry-run du 20/11/2026 annonce 12 paires, 989 lignes déplacées et 636
supprimées, mais **une seule des fiches à supprimer a un identifiant source**
(Brice Hortefeux, `europarl_id`, fusionnée le 20/11/2026 avec `--slug`). Les
onze autres sont pour l'essentiel d'anciens ministres (Dati, Schiappa,
Vallaud-Belkacem, Cosse, Penchard), vraisemblablement une fiche de mandat
gouvernemental face à une fiche de mandat local — pas le cas de figure pour
lequel la règle a été écrite.

En conséquence, l'étape `merge-duplicate-officials` du DAG `ingest-senat` tourne
sans `--apply` : elle recense les paires dans les logs du mardi, et la fusion
reste manuelle, paire par paire (`--slug <slug>`). À trancher avant de
l'automatiser : d'où viennent ces doublons, et la règle de conservation est-elle
la bonne pour eux.

## Variables optionnelles absentes du `.env` de la machine d'ingestion

Quatre variables présentes dans `.env.example` manquent au `.env` de la machine
d'ingestion : `ELEVENLABS_MODEL_ID`, `ELEVENLABS_SPEED`, `SHORTS_OUTPUT_DIR` et
`VERCEL_DEPLOY_HOOK_URL`. Les trois premières ont une valeur par défaut
utilisable, et `envValue` (`packages/shared/src/env-value.ts`) garantit désormais
qu'on y retombe. `VERCEL_DEPLOY_HOOK_URL` n'a pas de défaut : tant qu'elle
manque, aucune ingestion ne déclenche la reconstruction du site, qui attend le
prochain merge. Le hook se crée dans le projet Vercel (Settings → Git → Deploy
Hooks, branche `main`).

## Rapprochement d'élus (homonymes)

- Le rapprochement AN ↔ Sénat (nom + prénom + date de naissance) n'est tenté qu'à la création d'une fiche : les doublons créés avant son existence ne se résorbent pas seuls. Outil de rattrapage : `yarn --cwd packages/ingest merge:duplicate-officials` (48 paires en octobre 2026, 11 au 20/11/2026 après fusions).
- Les fichiers RNE se contredisent parfois sur la date de naissance d'une même personne (année erronée dans un fichier) : l'ingestion recréait alors un doublon à chaque passe. La table `official_aliases` (clé nom + prénom + date → fiche cible, alimentée par les fusions de l'admin et à la main depuis la fiche élu) est désormais consultée par les upserts RNE ; les upserts AN/Sénat, parrainages et candidats ne la consultent pas encore.

- Plusieurs modules rattachent une personne par nom + prénom seulement, sans date de naissance : `upsert/municipal-elections.ts`, `senat-candidacies.ts`, `senatorial-elections.ts`, `senat-resultats-2026.ts`, `senat-mandats-2026.ts`, `sponsorships.ts`, `declaration-snapshots.ts`, `interests.ts`, `legislative-elections.ts`, `reconcile-elections.ts`. En cas d'homonymie stricte, le dernier élu chargé écrase le précédent dans l'index, silencieusement.
- Parrainages 2017 et 2022 : les lignes dont le « NOM Prénom » apparaît plusieurs fois dans la même élection (élus homonymes : 168 en 2017, 104 en 2022) ont été détachées de leur fiche `officials` en novembre 2026 ; l'ingestion ne les rattache plus. Les autres lignes restent rattachées par le nom seul, avec le risque d'homonymie décrit plus haut.
- `upsert/senat-electoral-results.ts` compare NOM|PRÉNOM en majuscules sans retirer les accents, contrairement aux autres modules (« Nédélec » ≠ « NEDELEC ») : source probable de lignes `skipped`.
- `schema/senatorial-elections.ts` : clé unique `(election_id, nom, prenom)`, deux homonymes dans un même scrutin s'écraseraient.
- `normalize()` est dupliquée à l'identique dans `main-decorations.ts`, `upsert/decorations.ts` et `reconcile-elections.ts`.

## Annuaire du livre (`packages/book`)

- Appartenances de groupe des sénateurs (`affiliations`, `kind = 'group'`, `end_date is null`) : plusieurs lignes restent ouvertes pour une même personne (anciens députés devenus sénateurs, groupes renommés). L'annuaire retient la plus récente par date de début, ce qui écarte les groupes de l'Assemblée mais laisse deux libellés pour le centre (« Union Centriste » et « Union Centriste et Indépendants », 29 et 34 sénateurs) et 3 sénateurs sans groupe. À vérifier avant impression.
- Une fiche d'élu en fonction a un nom de famille tout en majuscules : « HERVE » pour un sénateur, probablement « Hervé ». L'annuaire le met en casse de titre mais ne peut pas restaurer l'accent : à corriger dans la base. (La fiche « HORTEFEUX » a disparu avec la fusion du 20/11/2026, qui a gardé la graphie de l'AN.)
- Commissions permanentes de l'Assemblée : seuls 143 des 565 députés en fonction en ont une en cours dans `committees` ; les sénateurs ont des doublons (« commission des affaires étrangères » deux fois). L'annuaire du livre n'en reprend donc pas.
- Décorations : seules 173 fiches sont rattachées (date de naissance identique), toutes à d'anciens élus ; aucun parlementaire en fonction n'a de décoration vérifiée, donc l'annuaire n'en affiche pas. Environ 6 700 anciens rattachements non confirmables (fiche décorée sans date de naissance publique) ont été détachés, dont 336 à qualité politique (maire, député, sénateur…) à examiner à la main ; la sauvegarde des rattachements détachés est dans le dossier de notes de la session du 9 novembre 2026.

## Admin (Next 16)

- `packages/admin` doit tourner avec webpack (`--webpack` dans les scripts `dev`/`build`, via `scripts/next.mjs` qui charge aussi le `.env` de la racine) : Turbopack, bundler par défaut de Next 16, ne réécrit pas les imports `./x.js` des paquets partagés vers `.ts` (« Can't resolve './db.js' »). Passer sur Turbopack supposerait de changer la convention d'imports de `@elupedia/shared` et `@elupedia/shorts`, ou une configuration Turbopack équivalente à `extensionAlias` quand elle existera.
- Le fichier `middleware.ts` est devenu `proxy.ts` (convention Next 16, codemod officiel) ; même logique de protection des routes.
- Les corrections manuelles de fiches (`/elus/[id]`) ne sont pas protégées contre l'ingestion : une passe AN/Sénat/décorations peut réécrire `birth_date`, `photo_url`, `death_date`, et le rapprochement de mandats rouvrir un mandat clos à la main. Seule la trace `data_provenance` (« Admin Elupedia ») permet de le voir. Un verrou par champ (« valeur fixée à la main ») reste à concevoir.
- Le tableau de bord des ingestions (`/ingestions`) n'interroge pas Dagu (API authentifiée, DAG du dépôt non déployés dans `/var/lib/dagu/dags` sur la machine locale) : il lit les YAML et les rapports JSON locaux. Le bouton « Lancer » met un run en file mais n'en suit pas l'avancement (UI Dagu).
- Les jobs lancés depuis l'admin (`shorts-jobs.ts`) tournent sur la machine qui héberge l'admin et supposent le dépôt complet, Yarn et les clés dans le `.env` de la racine ; un redémarrage de l'admin ne tue pas le job mais perd son suivi si `current.json` n'a pas été finalisé.

## Short du jour

- Le commentaire posté sous un short publié n'est pas épinglé : `commentThreads.insert` existe, mais l'API YouTube Data v3 n'expose aucun épinglage (pas de champ sur `comments`, pas de méthode dédiée — vérifié le 24/11/2026). Un commentaire non épinglé descend dès qu'un spectateur en laisse un autre, ce qui réduit l'intérêt de la recopie. Contournement : épingler à la main dans YouTube Studio après publication. À revoir si l'API l'ouvre.
- Le barème plafonne les scrutins ordinaires vers 35–48 points : la participation réelle (30–45 % de l'assemblée) ne rapporte que 6 à 9 points sur 20, et l'objet « amendement » vaut 0. Seuls « l'ensemble du texte », les motions, les scrutins solennels et les critères spécifiques de `scoreBonuses` atteignent 50 sans aide.
- Un short rejeté est passé en ligne : `11d9f41b-50a2-4138-bf89-e15eac863935` (« Présidentielle 2022 : qui a signé les 500 parrainages ? », short « thème ») a été rejeté en revue le 24/11/2026, puis publié le même jour à 20:00 sous `ug6eWx5zEOs`. Sa note de revue avait été effacée et son statut remis à `approved` ; `publish.ts` a donc fait son travail. Ni `review` ni l'admin n'enregistrent qui approuve ni quand, donc l'origine du changement n'est pas reconstituable. Le cas ne peut plus se reproduire pour un thème (plus rien n'en produit), mais rien n'empêche le même retournement sur un short de scrutin. Remède : journaliser les changements de statut (auteur, ancien statut, date) avant de toucher au reste.
- Un vote très serré est noté deux fois : l'écart en ratio (jusqu'à +20, saturé à 150 votants) et le bonus d'écart absolu (+15 à deux voix près) se cumulent, donc un scrutin à une voix près prend jusqu'à 35 points sur ces deux seuls critères (constaté le 23/11/2026 : amendement n° 163 du 17/11 à 49 points, dont 35 d'écart). Voulu — un vote à une voix est le fait le plus parlant qui soit — mais à revoir si les shorts d'amendement serré prennent trop de place : il suffirait de réserver le bonus aux scrutins de moins de 150 votants exprimés, là où le ratio sature.

## Site : listes d'élus embarquées

- L'accueil (`HeroSearch`) et `/elus` embarquent la liste complète des élus, une ligne par mandat actif (accueil) ou par couple (élu, type de mandat) (annuaire). L'ingestion des conseillers communautaires (`ingest:conseillers-epci`, ticket #289) y ajoutera ~62 000 lignes dont ~30 000 personnes déjà listées comme maires, qui apparaîtront deux fois : poids des pages et doublons de recherche à arbitrer avant la première exécution (exclure ce type de la recherche, une carte par élu…). `OfficialsList` n'a pas de filtre dédié.

## Compteurs et retours trompeurs

- `upsert/madada-requests.ts` : avec `ON CONFLICT DO UPDATE … RETURNING`, Postgres renvoie toujours la ligne ; `updated` vaut donc toujours 0.
- `upsert/sponsorships.ts` : la clé `updated` du retour contient en fait les lignes ignorées.
- `upsert/press-mentions.ts` : `updated` n'est jamais incrémenté (insert-only).
- `upsert/campaign-accounts.ts` : `skipped` est une constante à 0.
- `upsert/commune-transparency.ts` : `created` est un total upserté (créés + mis à jour).

## Logique d'ingestion

- `run.ts` teste `enabled('photos')` et `enabled('hatvp-status')` alors que ces noms ne sont pas dans `STEP_NAMES` : `--only photos` lève « Étape inconnue » et tout `--skip x` les exclut.
- `main-parrainages.ts` : `parseInt` d'un argument non numérique donne `NaN`, et toutes les élections sont ingérées au lieu d'une erreur.
- `main-photos.ts` : `main()` sans `.catch`, une exception sort en unhandled rejection.
- `run-factchecks.ts` : clé API absente → log puis exit 0, un run planifié « réussit » sans rien faire.
- `run-press.ts` ne met jamais à jour `officials.press_checked_at` (contrairement à `run-press-maires.ts`) : les deux scripts peuvent traiter deux fois les mêmes élus.
- `upsert/mayor-social-scrape.ts` : pas de filtre sur le type `maire` actif (anciens maires inclus dans la sélection).
- `upsert/mayors.ts` : le mandat du prédécesseur est clos avant de vérifier que le successeur a une date de début ; si la ligne RNE n'en a pas, la commune se retrouve sans maire actif.
- `upsert/affiliations-diff.ts` : `start_date`/`end_date` sont la date du run, pas celle du changement de groupe ; un député présent deux fois dans la source créerait deux affiliations.
- `upsert/senat-affiliations.ts` : la recherche d'existant ne filtre pas sur `kind`.
- `upsert/senat-votes.ts` : un sénateur présent deux fois dans un scrutin source ne garde que la première position, sans log.
- `upsert/europe-questions.ts` : clé de dédoublonnage `(official, title, date)`, l'identifiant europarl n'est pas stocké.
- `upsert/upload-photos.ts` : une photo source qui change n'est jamais rafraîchie (HEAD S3 → skip).
- `upsert/votes.ts` (`upsertVotes`) n'a plus d'appelant hors tests (`run-an.ts` utilise `an-votes.ts`) : à supprimer.
- `upsert/provenance.ts` (`writeProvenanceBatch`) lit `sourceTable` sur le premier item du lot.
- `filters/partial.ts` : `getActiveOfficialNames`, `filterDeclarationsForPartial`, `logHatvpFilterStats` n'ont aucun appelant hors tests.
- `utils/change-detector.ts` redéfinit localement un sous-ensemble de `StepResult`.
- `schema/mandates.ts` : `parent_commune_code` n'est écrit par aucune ingestion mais lu par `api/commune/[code].ts`.
- `db.ts` : driver `neon-http`, pas de transaction interactive ; les upserts multi-tables ne sont pas atomiques.
- `seed.ts` non idempotent (`an_id` unique) ; ses groupes politiques ne correspondent à aucune clé de `POLITICAL_GROUP_COLORS`.
- `department-codes.ts` : Saint-Pierre-et-Miquelon (975), Métropole de Lyon et Corse absents, alors que `DOMAINS.md` renvoie à `DEPARTMENT_CODES` pour ces collectivités.

## Contenu de la base (constaté le 9 novembre 2026)

Relevé lors de la vérification des chiffres du guide (`docs/livre-guide/02-chiffres.md`). Comme plus haut : des pistes, pas des diagnostics.

- `ballots` : les scrutins publics de l'Assemblée sont incomplets en décembre 2024 (22 enregistrés, contre 118 à 209 les autres mois d'octobre 2024 à mars 2025). La motion de censure du 4 décembre 2024, adoptée, est absente : toutes les motions de la base sont marquées `rejected`. Cause non cherchée.
- `mandates` (type `depute`) : 565 mandats actifs pour 565 circonscriptions distinctes, contre 577 sièges. Les 12 manquantes sont des sièges vacants ou une lacune d'ingestion.
- `mandates` (type `senateur`) : 350 mandats actifs pour 350 personnes, dont 183 débutés en 2026 pour 178 sièges renouvelés. Si le plafond légal est de 348, deux mandats sont périmés. `political_group` est vide pour 332 des 350 sénateurs.
- `europarl_attendance` (source) : Valérie Hayer (`europarl_id` 135511) n'a **aucune** signature au registre de présence du Parlement européen sur toute la législature 10, alors qu'elle a voté par appel nominal 98 des 116 jours de scrutin ; elle n'y figure ni comme présente ni comme excusée — vérifié sur l'API et sur le PDF officiel de l'annexe. Les autres eurodéputés sont entre 0 et 3 jours. Ces jours sont traités comme des anomalies de source, jamais comme des absences (cf. `docs/DOMAINS.md`). Cause non cherchée côté Parlement européen.
- `mandates` : 34 parlementaires (11 députés, 23 sénateurs) ont un mandat de maire actif débuté entre le 15 et le 30 mars 2026, aucun maire délégué. Le cumul est interdit depuis 2017 : sans doute des mandats acquis aux municipales dont la date de fin n'est pas saisie.
- `senatorial_elections` (2026) : le second tour annonce 26 sièges pour 14 départements, mais la base ne compte que 19 élus au second tour (159 au premier, 178 au total).
- `parliamentary_activity` : `status` est vide pour les 17 367 questions écrites de l'Assemblée ; la réponse se déduit de `response_date`.

## Sources

- `sources/madada.ts` : la classe de caractères `['']` contient deux apostrophes ASCII identiques, l'apostrophe typographique U+2019 n'est pas convertie ; la branche 301/302 est morte avec `fetch` (redirect: follow).
- `sources/legion-honneur.ts` : après épuisement des tentatives 5xx, lève `Error('unreachable')`.
- `sources/cnccfp.ts` : les montants « retenus » ne testent que l'intitulé sans accent.
- `sources/datagouv-elections.ts` : URL `https://www.data.gouv.fr/api/elections/resultats/json` qui ne ressemble à aucun endpoint réel (placeholder ?).
- `sources/assemblee-nationale.ts` : `groupe_sigle` (groupe actuel) est recopié sur tous les mandats historiques. Même défaut côté `sources/senat.ts` pour la circonscription.
- `sources/senat.ts` : mandat synthétique daté 2023-10-01 pour tout sénateur ACTIF sans ligne ELUSEN (heuristique).
- `sources/hatvp.ts` et `sources/google-news.ts` : une date absente ou illisible devient la date du jour.
- `sources/senat-elections.ts` : `elu.toLowerCase().includes('lu')` compterait « Non élu » comme élu.
- `sources/senat-activite.ts` : le ZIP est écrit sur disque mais l'extraction lit le buffer mémoire ; `minreplib` (ministère de réponse) est parsé puis perdu.
- `sources/senat-candidacies-2026.ts` (`splitNomPrenom`) : inversion possible si le premier mot est en capitales.
- `sources/rne-*.ts` : tout code sexe ≠ « F » devient « M », y compris vide.
- `sources/personal-website-scraper.ts` (`checkRobotsTxt`) : plusieurs `User-agent` consécutifs dans un bloc, seul le dernier est retenu.
- `sources/dila-mairies.ts` : `DEPT_PREFIXES` omet 975, 977/978, 986-988.
- `sources/parrainages.ts` : `candidateColumn` exporté mais jamais utilisé.
- `sources/wikidata-mayor-photos.ts` requête `ps:P39 wd:Q382617` sans sous-classes alors que `DOMAINS.md` parle de « sous-classes de Q382844 » : l'un des deux est faux.
- `ActivityItem` vit dans `sources/an-activite.ts` alors qu'il est partagé AN/Sénat/PE (place logique : `schemas.ts`).
- `sources/senat.ts` et `sources/senat-adresses.ts` exportent chacun un `GENERAL_URL` identique.

## Annuaires de groupes parlementaires (M25)

- UDR : 0 rapprochement sur 18 entrées (constat du 12/11/2026). Aucune fiche active n'a le libellé `UDR (UDR)` dans `affiliations`. À vérifier côté affiliations AN (`GP_FALLBACK` contient `PO847173`), puis relancer `debug:group-directories:match`.
- LFI-NFP, EcoS, GDR et les non-inscrits sont absents de la config : leur page de groupe n'a pas été relevée avec la même structure.
- Rapprochement : un élu absent de la base (ex. Mme Isabelle Delyon, RN) reste `unresolved`, rien n'est créé pour lui.
- Plateformes : le scraper dit `x`, la base `twitter` (mappé à l'écriture). `bluesky` et `mastodon` ne figurent pas dans `platformEnum` (`schema/external-links.ts`) ; à ajouter si le site doit les afficher.
- Le groupe « Rassemblement National et Apparentés (RN) » (libellé Sénat) partage le sigle RN avec le groupe AN : le sigle seul ne distingue pas les deux chambres.
- Tests d'intégration sur base de test non réalisés : le repo n'a pas de base de test configurée, `DATABASE_URL` pointe sur la base de production. Les tests de l'écriture utilisent un store en mémoire.
- Le ticket #279 demandait un workflow GitHub Actions : l'ingestion tourne sous Dagu, l'étape est donc un DAG Dagu. Son déclenchement réel n'a pas été vérifié.

## Admin

- `app/moderation/page.tsx` : le lien vers la fiche publique est construit en `prénom-nom` minuscules et non depuis `officials.slug` ; cassé pour les accents, les noms composés et les slugs suffixés (`-1`).
- `components/RequireRole.tsx` compare strictement le rôle (`userRole !== role`) : un admin ne passe pas une garde `role="moderator"` (aucune page ne le demande aujourd'hui).
- `lib/auth.ts` : le rôle est figé dans le JWT à la connexion ; un changement via `/users` ne prend effet qu'à la reconnexion de l'intéressé.
- `app/elus/doublons` : le tiroir ne compare que les deux premières fiches d'un groupe et la fusion ne traite que la première « autre » fiche ; les compteurs `sponsorships` et `official_aliases` sont calculés mais pas affichés ; `getDuplicateDetails` fait 16 requêtes par fiche.
- `app/users` : suppression de compte sans confirmation.
- Autorisation en deux couches : `proxy.ts` ne fait que rediriger les anonymes vers `/login` ; les rôles ne sont vérifiés que par chaque action serveur et par `RequireRole` côté affichage (la sidebar ne filtre pas, `/elus/doublons` n'a pas de garde d'affichage).

## Site

- `components/OfficialsList.tsx` : les filtres par type de mandat sont codés en dur (10 cases) ; les types gouvernementaux (`premier_ministre`, `ministre`, `secretaire_etat`) ne sont pas filtrables et passent toujours le filtre.

- `api/commune/[code].ts` : la doc annonce 400 pour un code INSEE invalide (c'est une redirection 302) et un CORS ouvert (aucun en-tête `Access-Control-*` n'est posé) ; `selectDistinctOn([officials.id])` sans `orderBy`, le mandat renvoyé pour un cumulant est non déterministe.
- `api/og/official/[slug].png.ts` : initiales `undefined` si le prénom est vide.
- `api/og/scrutin/[id].png.ts` et `components/BallotsList.tsx` : « Adopté » = `pour > contre` sur les votes stockés, pas un résultat officiel ; une égalité est « Rejeté ».
- `pages/docs/oembed.astro` : le corps de réponse d'exemple est en dur (« Manuel Bompard ») alors que le slug est dynamique.
- `pages/sitemap-elus.xml.ts` : pas de découpage, limite du protocole 50 000 URLs.
- `pages/elus/[slug]/index.astro` : requête `communeElectionRows` redondante ; type `Interest` référencé sans import (invisible pour tsc) ; `sectionDates.votes` calculé après `slice(0, 20)` ; alt/crédit de l'icône GPS incohérents.
- `pages/scrutins/[id].astro` et `upsert/votes.ts` : législature « 17 » en dur dans l'URL AN.
- `pages/elections/[type]/[id].astro` : pour les sénatoriales, candidats filtrés par année seule (`2026-2` = `2026-1`).
- `pages/index.astro` : « 27 septembre » en dur alors que la date est lue en base.
- `layouts/BaseLayout.astro` : import `ColorSchemeScript` de Mantine inutilisé dans le layout public (vérifier `tests/admin-mantine.test.js` avant retrait).
- `components/BallotsList.tsx` lit l'URL dès le `useState` initial (risque de mismatch d'hydratation), contrairement à `OfficialsList`.
- `components/TimelineDrawer.tsx` : deux événements ponctuels le même jour, seul le dernier est affiché.
- `components/HemicycleChart.tsx` : votants sans siège connu non dessinés si plus de sièges libres.
- `components/JurisdictionMap.tsx` / `FranceDepartmentMap.tsx` : métropole uniquement, pas de message pour l'outre-mer.
- `lib/static-map.ts` : vestige sans appelant (doublon de `packages/ingest/src/services/static-map.ts`).
- `lib/election-types.ts` : `PanoramaCandidate` mélange champs français (`nom`, `prenom`, `liste`, `sortant`) et anglais.
