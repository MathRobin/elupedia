# Domaines métier

Cartographie des domaines couverts par Elupedia, avec les tables DB et sources associées.

## Élus et mandats

- **Tables** : `officials`, `mandates`
- **Sources** :
  - data.assemblee-nationale.fr (open data AN) — `assemblee-nationale.ts` → `upsert/officials.ts`
  - data.senat.fr (API JSON Sénat) — `senat.ts` → `upsert/senators.ts`
- **Description** : Identité des élus (nom, prénom, date de naissance, photo, slug permalink) et historique de leurs mandats (législature, circonscription, dates de début/fin). Couvre les députés, sénateurs, maires et conseillers départementaux. Le slug (ex. `manuel-bompard`) est généré automatiquement à l'insertion et sert de permalink pour les URLs (`/elus/{slug}`). Les homonymes sont suffixés (`-1`, `-2`).
- **Types de mandats** : `depute`, `senateur`, `maire`, `eurodepute`, `conseiller_departemental`
- **Libellés** : centralisés dans `packages/shared/src/mandate-labels.ts` (`MANDATE_TYPE_LABELS` / `mandateTypeLabel()`), utilisés par le site (fiche élu, embed, oEmbed, image OG) pour éviter de dupliquer le mapping type → libellé.
- **Champs commune (mandats maires)** :
  - `commune_code` (varchar 10) — code INSEE de la commune (ex. `75056` pour Paris, `75101` pour le 1er arrondissement). Non renseigné pour `conseiller_departemental` (élu de canton, pas de commune).
  - `parent_commune_code` (varchar 10) — code INSEE de la ville de rattachement pour les arrondissements PLM (ex. `75056` pour un arrondissement de Paris), null sinon
- **Source maires** :
  - RNE (data.gouv.fr) — fichier CSV des maires (~34 800 entrées), séparateur `;`, UTF-8, CRLF, mise à jour trimestrielle
  - URL : `https://www.data.gouv.fr/api/1/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503`
  - Colonnes : Code département, Libellé département, Code collectivité statut particulier, Libellé collectivité statut particulier, Code commune (INSEE), Libellé commune, Nom, Prénom, Code sexe, Date naissance, Code CSP, Libellé CSP, Date début mandat, Date début fonction
  - Les maires d'arrondissement (Paris/Lyon/Marseille) ne sont PAS dans ce fichier — seuls les maires des villes entières y figurent (codes INSEE 75056, 69123, 13055)
- **Source conseillers départementaux** :
  - RNE (data.gouv.fr) — fichier CSV dédié (~4 000 entrées, un binôme de 2 élus par canton), séparateur `;`, UTF-8, CRLF, mise à jour trimestrielle
  - URL : `https://www.data.gouv.fr/api/1/datasets/r/601ef073-d986-4582-8e1a-ed14dc857fba`
  - Colonnes : Code département, Libellé département, Code canton, Libellé canton, Nom, Prénom, Code sexe, Date naissance, Code CSP, Libellé CSP, Date début mandat, Libellé de la fonction (vide, ou « Vice-président »/« Président du conseil départemental » — non persisté), Date début fonction
  - Client : `sources/rne-conseillers-dep.ts` → `upsert/conseillers-dep.ts`. Comme un canton élit 2 titulaires (contrairement à la mairie, poste unique), le matching/fermeture des mandats se fait par la paire (canton, official) plutôt que par canton seul.
- **Source photos maires** :
  - Wikidata (SPARQL) — requête sur les personnes ayant occupé un poste de maire (P39, sous-classes de Q382844) avec une photo (P18)
  - Endpoint : `https://query.wikidata.org/sparql`
  - Matching par nom normalisé + date de naissance contre la table `officials`
  - Ne remplace pas les photos existantes (AN, Sénat) — complète uniquement les maires sans photo
  - Client : `sources/wikidata-mayor-photos.ts` → `upsert/mayor-photos.ts`
  - Couverture : bonne pour les grandes villes, limitée pour les petites communes
- **Source contacts mairies** :
  - API Annuaire de l'administration (DILA) — endpoint ODSQL, ~35 800 mairies
  - URL : `https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records`
  - Filtre : `pivot like "mairie"` (le champ `pivot` contient `type_service_local: "mairie"` et `code_insee_commune`)
  - Champs utiles : `adresse` (JSON : numéro_voie, code_postal, nom_commune, longitude, latitude), `telephone`, `adresse_courriel`, `site_internet`, `code_insee_commune`
- **Pages** : page d'accueil (grille des élus actifs avec badge de mandat genré, filtre département et type de mandat), fiche élu (identité, mandat, historique des mandats)

## Activité parlementaire

- **Tables** : `parliamentary_activity`
- **Source** : data.assemblee-nationale.fr — ZIP questions écrites (~17 800 fichiers) + ZIP questions au gouvernement (~1 800 fichiers)
- **Clients** :
  - AN : `an-activite.ts` → `upsert/parliamentary-activity.ts` (ZIP/JSON, ~19 600 questions)
  - Sénat : `senat-activite.ts` → `upsert/senat-parliamentary-activity.ts` (dump SQL questions.zip, ~529 000 questions dont QE, QOSD, QOAD, QG, QC, QOAE). Parse le bloc `COPY tam_questions` + `COPY tam_reponses` du dump PostgreSQL de data.senat.fr.
- **Description** : Questions écrites (written_question) et questions au gouvernement / orales (oral_question). Amendements et rapports prévus ultérieurement.
- **Métadonnées capturées** (M13) :
  - `rubrique` (varchar 255) — thème de la question tel qu'indexé par l'AN (ex. « agriculture », « santé »). Champ `indexationAN.rubrique` du JSON source. 211 valeurs distinctes (17e législature). Valeur unique par question.
  - `tete_analyse` (varchar 512) — sous-catégorie d'analyse, souvent null. Champ `indexationAN.teteAnalyse`.
  - `question_number` (integer) — numéro officiel de la question. Champ `identifiant.numero`.
  - `source_url` (text) — lien vers la page officielle AN. Pattern : `assemblee-nationale.fr/dyn/{legislature}/questions/{uid}`.
- **Pages M4** : fiche élu (section activité parlementaire avec table triée par date)

## Votes et scrutins

- **Tables** : `votes`, `ballots`, `ballot_group_positions`
- **Sources** :
  - Assemblée nationale : `an-scrutins.ts` (ZIP/JSON, ~5 300 scrutins) → `upsert/an-votes.ts`
  - Sénat : `senat-scrutins.ts` → `upsert/senat-votes.ts` (API JSON, scrutins publics)
- **Description** : Scrutins publics et position de chaque élu (pour, contre, abstention, absent). Mapping FR→EN des positions. Numéro de siège (`numPlace`) extrait pour la visualisation hémicycle. Position majoritaire de chaque groupe politique (`positionMajoritaire`) et décompte détaillé des voix par groupe.
- **Pages** : fiche élu (section historique des votes), page détail scrutin (hémicycle interactif, panorama de vote par groupe, liste des votes par élu)

## Affiliations politiques

- **Tables** : `affiliations`
- **Sources** :
  - AN : `upsert/affiliations-diff.ts` (diff, le groupe politique courant est dans `mandates.political_group`)
  - Sénat : `senat-groupes.ts` → `upsert/senat-affiliations.ts` (API JSON)
- **Description** : Appartenance aux groupes parlementaires et partis politiques, avec historique des changements. Stratégie diff : ferme l'affiliation précédente (end_date) si le groupe change.
- **Pages** : fiche élu (section affiliations politiques)

## Collaborateurs

- **Tables** : `staffers`
- **Sources** :
  - AN : `an-collaborateurs.ts` (CSV) → `upsert/staffers-diff.ts`
  - Sénat : `senat-collaborateurs.ts` (API JSON) → `upsert/senat-staffers-diff.ts`
- **Description** : Collaborateurs parlementaires déclarés, avec suivi des arrivées et départs. Stratégie diff : set end_date sur les collaborateurs partis.
- **Pages** : fiche élu (section collaborateurs avec badges actif/inactif)

## Intérêts et patrimoine (HATVP)

- **Tables** : `interests`
- **Source** : HATVP (Haute Autorité pour la Transparence de la Vie Publique) — XML streaming (`declarations.xml`)
- **Client** : `hatvp.ts` (SAX streaming parser) → `upsert/interests.ts`
- **Orchestration** : `run-interests.ts` — étape d'ingestion transverse unique, indépendante de `run-an.ts` / `run-senat.ts` / `run-maires.ts`. Tourne sur l'ensemble des officials éligibles (députés, sénateurs, maires) en une seule passe.
- **Description** : Déclarations d'intérêts et d'activités des parlementaires. Catégories : activités professionnelles (`professional_activity`), activités de conseil (`consulting_activity`), organes dirigeants (`governing_body_membership`), activités bénévoles (`voluntary_activity`), fonctions électives annexes (`elected_function`), participations financières (`financial_participation`). Les mandats parlementaires (DEPUTE, SENATEUR, etc.) sont filtrés pour ne retenir que les fonctions annexes.
- **Pages** : fiche élu (section intérêts déclarés, groupés par catégorie avec labels colorés)

## Commissions

- **Tables** : `committees`
- **Source** : data.assemblee-nationale.fr (ZIP/JSON)
- **Client** : `an-commissions.ts` → `upsert/committees.ts`
- **Description** : Composition des commissions permanentes/spéciales, délégations, groupes d'études et d'amitié.
- **Pages** : fiche élu (section commissions & groupes)

## Mentions presse

- **Tables** : `press_mentions`
- **Source** : Google Actualités (flux RSS) — `google-news.ts` → `upsert/press-mentions.ts`
- **Commandes** (planifiées via Dagu, voir `docs/INGESTION-SCHEDULE.md`) :
  - `yarn --cwd packages/ingest ingest:press` — députés, sénateurs et eurodéputés avec mandat actif (~1000 élus), délai 3s entre chaque élu pour ne pas marteler le flux RSS. Hebdomadaire (`dagu-dags/ingest-press.yaml`)
  - `yarn --cwd packages/ingest ingest:press:maires [--limit <n>]` — lot de `n` élus (tous mandats confondus, 1500 par défaut), trié par `officials.press_checked_at` croissant (jamais vérifié en premier) plutôt qu'aléatoire, pour garantir un cycle complet sur les ~34 800 maires. Toutes les 5h (`dagu-dags/ingest-press-maires.yaml`) → couverture complète en ~5 jours avec la taille de lot par défaut
- **Description** : Articles de presse mentionnant un élu, collectés automatiquement via les flux RSS Google Actualités à partir du nom complet de l'élu. **Ce n'est pas une source officielle** : les résultats peuvent contenir du bruit (homonymes, mentions indirectes) et ne sont pas exhaustifs. Section proposée à titre informatif.
- **Déduplication** : sur `(official_id, source_url)`, insert uniquement (pas de mise à jour des articles existants)
- **Pages** : fiche élu (section presse en grille de cards)

## Adresses et contacts

- **Tables** : `addresses`, `external_links`
- **Sources** :
  - AN : `an-adresses.ts` (ZIP AMO10) → `upsert/addresses.ts`
  - Sénat : `senat-adresses.ts` (API JSON) → `upsert/senat-addresses.ts`
- **Description** : Adresses de permanence (constituency_office) et de l'assemblée (assembly_office), coordonnées (téléphone, email).
- **Pages** : fiche élu (section coordonnées, section liens extérieurs)

## Historique électoral

- **Tables** : `electoral_results`
- **Sources** :
  - AN : `datagouv-elections.ts` → `upsert/electoral-results.ts` (⏸ prévu, source à câbler)
  - Sénat : `senat-elections.ts` (API JSON) → `upsert/senat-electoral-results.ts`
- **Description** : Résultats des élections par circonscription : pourcentage, tour, nombre d'opposants.
- **Pages** : fiche élu (section historique électoral)

## Parrainages présidentiels et signataires RIP

- **Table** : `sponsorships`
- **Sources** :
  - Conseil constitutionnel via data.gouv.fr — CSV des parrainages validés pour chaque élection présidentielle
  - 2022 : `https://static.data.gouv.fr/resources/parrainages-des-candidats-a-lelection-presidentielle-francaise-de-2022/20220307-183308/parrainagestotal.csv` (13 427 parrainages, publication finale du 7 mars 2022, licence Domaine Public)
  - 2017 : `https://static.data.gouv.fr/resources/parrainages/20170320-103202/parrainagestotal.csv` (14 296 parrainages, publication finale du 18 mars 2017, licence Domaine Public)
- **Format CSV** : séparateur `;`, UTF-8, colonnes : `Civilité`, `Nom`, `Prénom`, `Mandat`, `Circonscription`, `Département`, `Candidat` (2022) ou `Candidat-e parrainé-e` (2017), `Date de publication`
- **Types de mandats dans les données** : Maire, Député(e), Sénateur/Sénatrice, Conseiller(ère) départemental(e), Conseiller(ère) régional(e), Conseiller(ère) de Paris, Membre d'assemblée d'outre-mer, Président(e) d'EPCI, Représentant(e) au Parlement européen, etc.
- **Schéma** : `official_id` (nullable — la majorité des parrains sont des maires/conseillers non encore ingérés), `type` (`parrainage_presidentiel` ou `rip_signature`), `election_year`, `candidate_name`, données brutes (`raw_elected_name`, `raw_function`, `raw_circumscription`, `raw_department`), `matched` (booléen)
- **Description** : Parrainages validés par le Conseil constitutionnel pour les candidatures à l'élection présidentielle. Données publiées deux fois par semaine pendant la période de recueil, puis figées. Ingestion one-shot (pas de cron). Le type `rip_signature` couvre les signataires des propositions de loi référendaires (art. 11 Constitution).
- **Sources RIP** :
  - ADP 2019 : `https://www.assemblee-nationale.fr/dyn/opendata/PIONANR5L15B1867.html` (~250 signataires, décision 2019-1 RIP)
  - Retraites 2023 (proposition n°959) : `https://www.assemblee-nationale.fr/dyn/opendata/PIONANR5L16B0959.html` (~600 signataires, décision 2023-4 RIP)
  - Retraites 2023 (proposition n°530 Sénat) : `https://www.senat.fr/leg/ppl22-530.html` (~600 signataires, décision 2023-5 RIP)
- **Format RIP** : HTML, noms dans une liste séparée par virgules (`Prénom NOM`), précédée de « présentée par Mesdames et Messieurs », terminée par « députés et sénateurs ». Certains noms ont des préfixes (Mme, M., MM.) à retirer.
- **Pages** : fiche élu (section « Parrainages et engagements », affichée uniquement si l'élu a des données)
- **Clients** :
  - Parrainages : `sources/parrainages.ts` (fetch + parse CSV) → `upsert/sponsorships.ts` (batch insert 500/batch, matching officials par nom normalisé)
  - RIP : `sources/rip-signatures.ts` (fetch HTML + extraction noms) → `upsert/sponsorships.ts` (`upsertRipSignatures`)
- **Points d'entrée** :
  - `main-parrainages.ts` — `yarn --cwd packages/ingest ingest:parrainages [année]`
  - `main-rip-signatures.ts` — `yarn --cwd packages/ingest ingest:rip`
- **Procédure pour une nouvelle élection présidentielle (ex. 2027)** :
  1. Vérifier la publication du jeu de données sur data.gouv.fr (Conseil constitutionnel). Le fichier est publié deux fois par semaine pendant la période de recueil (~6 semaines avant l'élection), puis figé.
  2. Identifier l'URL du CSV final et le nom de la colonne candidat (peut changer : `Candidat` en 2022, `Candidat-e parrainé-e` en 2017).
  3. Ajouter l'entrée dans `PARRAINAGES_ELECTIONS` de `sources/parrainages.ts` :
     ```ts
     { year: 2027, url: 'https://...', candidateColumn: '...' }
     ```
  4. Vérifier que le format CSV n'a pas changé (séparateur `;`, ordre des colonnes). Si le format diffère, adapter `fetchParrainages()`.
  5. Lancer l'ingestion : `yarn --cwd packages/ingest ingest:parrainages 2027`
  6. Vérifier les logs de matching (taux d'officials matchés) et les données en base.
  7. Rebuild le site pour que les fiches élus affichent les nouveaux parrainages.

## Résultats électoraux détaillés

- **Tables** : `municipal_elections`, `municipal_candidates`, `legislative_elections`, `legislative_candidates`, `senatorial_elections`, `senatorial_candidates`
- **Sources** :
  - Municipales : data.gouv.fr — CSV des résultats par commune et tour
  - Législatives : data.gouv.fr — CSV des résultats par circonscription et tour
  - Sénatoriales : data.gouv.fr — CSV des résultats par département et tour
- **Clients** : `sources/municipal-elections.ts`, `sources/legislative-elections.ts`, `sources/senatorial-elections.ts` (CSV streaming pour éviter les crashes mémoire sur les gros fichiers)
- **Description** : Résultats complets par tour (inscrits, abstentions, votants, blancs, nuls, exprimés) avec le détail par candidat/liste (voix, ratios, élu). Les candidats sont liés aux `officials` quand le matching est possible.
- **Pages** : fiche élu (sections résultats municipaux, législatifs, sénatoriaux avec drawer détaillé)

## Candidatures sénatoriales 2026 (pré-scrutin)

- **Tables** : `senatorial_elections`, `senatorial_candidates` (mêmes tables que les résultats rétrospectifs — voir "Résultats électoraux détaillés")
- **Source** : `senatoriales2026.senat.fr` (site officiel du Sénat), une page HTML par circonscription (63 départements + Français établis hors de France, code `ZZ`)
- **Client** : `sources/senat-candidacies-2026.ts` (scraping HTML via `cheerio`, roster de circonscriptions figé en constante) → `upsert/senat-candidacies.ts`
- **Commande** : `yarn --cwd packages/ingest ingest:senat:candidacies`
- **Description** : Avant le scrutin du 27 septembre 2026, seules les candidatures sont connues (pas de résultats). Les lignes créées ont donc `inscrits`/`abstentions`/`votants`/`blancs`/`nuls`/`exprimes`/`voix`/`elected` à `null`, `round = 1`, et ciblent la même clé unique (`electionYear`, `departementCode`, `round`) que l'ingestion rétrospective des résultats — celle-ci complètera automatiquement ces lignes une fois le scrutin passé. Champs propres aux candidatures : `sieges_a_pourvoir`, `electeurs_senatoriaux` (par élection), `liste` et `sortant` (par candidat, scrutin proportionnel uniquement pour `liste`). `nuance` porte ici le libellé complet attribué par les préfets (pas le code court à 3 lettres des ingestions rétrospectives) — colonne élargie en conséquence.
- **Pages** : page panorama `/elections/senatoriale/[year]-[round]` (répertoire alphabétique des candidats), hero d'accueil tant que l'élection 2026 est active

## Pages "Élections"

- **Route liste** : `/elections` (`pages/elections/index.astro` + `ElectionsList.tsx`) — liste toutes les élections référencées (municipales/législatives/sénatoriales), groupées par "événement" (type + année + tour), avec filtres sidebar (type, statut à venir/passée, année) et recherche texte ; sidebar repliée en tiroir plein écran sur mobile.
- **Route panorama** : `/elections/[type]/[id]` (`pages/elections/[type]/[id].astro` + `ElectionPanorama.tsx`) — répertoire alphabétique des candidats de l'élection, triés par nom de famille (ou nom de liste quand l'identité individuelle n'est pas fournie par la source, cas des communes en scrutin de liste). Un candidat sans `official_id` résolu est affiché non cliquable avec la mention "Pas de fiche disponible". Pour les municipales/législatives (dizaines de milliers de communes), une recherche par nom de commune (`?q=`) est requise avant d'afficher le panorama, pour éviter de charger l'intégralité de l'élection.

## Réconciliation candidats–élus

- **Script** : `packages/ingest/src/reconcile-elections.ts`
- **Commande** : `yarn --cwd packages/ingest reconcile`
- **Description** : Rattache les candidats des tables d'élections (municipales, législatives, sénatoriales) aux fiches `officials` via `official_id`. Le matching est fait par nom normalisé (NFD, minuscules, tirets/espaces unifiés). Indépendant de l'ingestion : à relancer après chaque ajout d'officiels ou d'élections pour combler les trous.
- **Quand l'exécuter** :
  - Après l'ingestion d'une nouvelle source d'officiels (AN, Sénat, maires)
  - Après l'ingestion de nouvelles élections
  - En maintenance périodique pour rattraper les cas manqués

## Comptes de campagne (CNCCFP)

- **Table** : `campaign_accounts`
- **Source** : CNCCFP via data.gouv.fr — CSV des comptes de campagne publiés au JO
- **Client** : `sources/cnccfp.ts` → `upsert/campaign-accounts.ts`
- **Élections couvertes** : législatives 2022 et 2024, sénatoriales 2023
- **Description** : Dépenses déclarées/retenues, recettes, dons, contributions personnelles, apports partis, remboursement, décision (Approuvé, Approuvé après réformation, Rejeté, Non déposé). Matching sur nom + département + nuance.
- **Pages** : fiche élu (section comptes de campagne avec badges de décision colorés)

## Photos (sauvegarde S3)

- **Champ** : `officials.s3_photo_url`
- **Source** : photos originales (AN, Sénat, Wikidata) téléchargées et uploadées sur S3
- **Client** : `upsert/upload-photos.ts`
- **Workflow** : `.github/workflows/ingest-photos.yml` (dimanche 01:30 UTC, voir `docs/INGESTION-SCHEDULE.md`)
- **Bucket** : `elus/pp/{officialId}.jpg`
- **Description** : Les photos des élus sont sauvegardées sur S3 pour éviter la dépendance aux URLs sources. Le site utilise `s3_photo_url` en priorité, avec fallback sur `photo_url`.

## Décorations

- **Table** : `decorations`
- **Source** : Archives de la Grande Chancellerie de la Légion d'honneur — API Arkotheque (`archives.legiondhonneur.fr`)
- **Client** : `sources/legion-honneur.ts` → `upsert/decorations.ts`
- **Commande** : `yarn --cwd packages/ingest ingest:decorations`
- **Description** : Décorations officielles (Légion d'honneur, Ordre national du Mérite, Médaille militaire) extraites de la base LUD (Liste Unique des Décorés, ~1.4M entrées). Pour chaque official en base, le script cherche par nom de famille dans l'API, puis filtre par prénom et récupère le détail de chaque fiche.
- **Champs** : nom, prénom, sexe, dates naissance/décès, lieu de naissance, ordre, grade, date décret, date JO, ministère, qualité
- **Matching** : par nom/prénom normalisé vers `officials.id`
- **API** : Arkotheque CMS (Symfony/Elasticsearch). Filtrage via query params `{moteur}--filtreGroupes[groupes][0][{field}][q][0]=VALUE`. Détail via `/_recherche-api/render-fiche/{moteur}/{fiche}/{restit}/detail/json`.

## Statut déclaration HATVP

- **Champ** : `officials.hatvp_status`
- **Source** : fiches nominatives HATVP (`hatvp.fr/fiche-nominative/?declarant=...`) — HTML scraping
- **Client** : `sources/hatvp-status.ts` → `upsert/hatvp-status.ts`
- **Cible** : députés, sénateurs, et maires de communes >20 000 habitants (obligation de déclaration loi 2013) n'ayant pas de déclaration publiée dans le XML HATVP
- **Description** : Détecte les déclarations déposées mais pas encore publiées (statut `pending`). Utilise les données de population INSEE pour identifier les communes >20k. Un bandeau amber est affiché sur la fiche élu avec lien vers la fiche HATVP.
- **Pages** : fiche élu (bandeau dans la section intérêts quand `hatvp_status = 'pending'`)

## Transparence communale (MaDada.fr)

- **Tables** : `commune_transparency`, `madada_requests`
- **Sources** :
  - madada.fr — API JSON Alaveteli (`/body/<url_name>.json`) pour les agrégats par commune
  - madada.fr — scraping des pages body HTML paginées + API JSON par demande (`/request/<slug>.json`) pour les demandes individuelles avec `created_at`
- **Clients** :
  - `sources/madada.ts` → `upsert/commune-transparency.ts` (agrégats)
  - `sources/madada-requests.ts` → `upsert/madada-requests.ts` (demandes individuelles)
- **Description** : Statistiques de transparence des mairies basées sur les demandes d'accès aux documents administratifs (CADA) via la plateforme MaDada.fr. La table `commune_transparency` stocke les compteurs agrégés par commune. La table `madada_requests` stocke chaque demande avec son `created_at`, permettant de filtrer par période de mandat du maire.
- **Matching** : Le nom de la commune est normalisé (minuscules, suppression des accents, remplacement espaces/tirets par underscores) pour construire le slug `mairie_<nom_normalisé>`. Fallback avec suffixe code commune si le premier essai échoue. Taux de matching ~94 %.
- **Ingestion** : `yarn --cwd packages/ingest ingest:madada` — étape 1 : itère les ~34 800 communes avec maires pour les agrégats (rate-limité 200 ms / 50 req). Étape 2 : pour chaque commune ayant des données MaDaDa, scrape les pages body HTML paginées pour lister les slugs de demandes, puis fetch le JSON de chaque demande pour récupérer `created_at` et `described_state`.
- **Pages** : fiche élu maire (section Transparence avec compteurs filtrés par période de mandat, barre de progression, lien vers MaDada, et drawer au clic listant les demandes individuelles avec statut et date)

## Vérification des faits (Google Fact Check API)

- **Table** : `fact_checks`
- **Source** : Google Fact Check Tools API (`factchecktools.googleapis.com/v1alpha1/claims:search`) — indexe les ClaimReview de vérificateurs (AFP, Le Monde, etc.)
- **Client** : `sources/google-factcheck.ts` → `upsert/fact-checks.ts`
- **Commande** : `yarn --cwd packages/ingest ingest:factchecks`
- **Prérequis** : `GOOGLE_FACTCHECK_API_KEY` dans `.env` (clé API Google Cloud, Fact Check Tools API activée)
- **Description** : Recherche par nom d'élu dans l'index Google Fact Check. Stocke les ClaimReview trouvés : affirmation vérifiée, URL de la vérification, nom du vérificateur, note, date de publication. Quota gratuit 10 000 req/jour, délai 200 ms entre requêtes.
- **Pages** : fiche élu (section « Vérification des faits » avec cards rose, affichée uniquement si des fact-checks existent)

## Fiche budgétaire communale (Bursae)

- **Table** : aucune — la fiche est récupérée à la volée via oEmbed, pas ingérée
- **Source** : Bursae — endpoint oEmbed `https://www.bursae.fr/api/oembed?url=<url>&format=json|xml` (l'apex `bursae.fr` redirige en 308 vers `www.bursae.fr`)
- **Client** : `packages/site/src/lib/bursae.ts` — `fetchBursaeEmbed(codeInsee)`
- **Description** : Bursae publie les finances des collectivités locales (population, budget de fonctionnement, fiscalité). L'endpoint renvoie un objet oEmbed 1.0 de type `rich` contenant une iframe 600×400 vers `https://bursae.fr/collectivite/{slug}`, avec `title`, `author_name`, `provider_name`, `provider_url`. Les champs `thumbnail_*` sont systématiquement `null`. CORS ouvert (`Access-Control-Allow-Origin: *`). Aucun paramètre de thème, de taille ni de sélection de sections n'est supporté : `maxwidth` et `maxheight` sont ignorés.
- **Auto-découverte** : les pages `/collectivite/{slug}` de Bursae exposent une balise `<link rel="alternate" type="application/json+oembed">`.
- **Codes de retour** : 400 si le paramètre `url` est absent, 501 si le format demandé n'est ni `json` ni `xml`, 404 si l'URL ne correspond pas au motif `/collectivite/{slug}` ou si la commune est introuvable.
- **Matching** : par **code INSEE**, via l'URL `https://bursae.fr/collectivite/insee/{code}`. C'est la seule clé non ambiguë : sur les 46 416 communes de notre base, 1 702 slugs de nom correspondent à plusieurs communes, soit 4 369 communes concernées (9,4 %) — `sainte-colombe` en désigne 11 côté Bursae. La résolution par code INSEE a été ajoutée côté Bursae à notre demande (MathRobin/bursae#115) ; un slug ambigu y renvoie désormais 409 plutôt qu'une commune arbitraire. La réponse porte un champ `code_insee` permettant de vérifier la collectivité obtenue.
- **Cache et robustesse** : cache mémoire de 24 h pour une fiche trouvée, 1 h pour une absence (la couverture de Bursae s'étend), timeout de 2 s. Toute erreur — Bursae injoignable, lent, commune non couverte, réponse inattendue — se traduit par `null` : la fiche élu se rend sans la section, jamais en erreur.
- **Pages** : fiche élu maire, section « Finances communales » (`#budget`), affichée uniquement si Bursae couvre la commune du mandat en cours. L'iframe est chargée en `loading="lazy"` et rendue par Bursae, qui suit le thème clair/sombre du visiteur.
- **Limite connue** : la réponse oEmbed ne porte pas l'exercice budgétaire présenté. Elupedia affiche donc une mention générique sur le décalage de 12 à 18 mois des comptes publics, et renvoie à la fiche Bursae pour l'exercice exact (MathRobin/bursae#118).

## Eurodéputés (Parlement européen) — M24T1

- **Source** : Parlement européen — API Open Data v2 (`https://data.europarl.europa.eu/api/v2`)
- **Format retenu** : **JSON-LD** (`format=application/ld+json`, paramètre de requête — le header `Accept` est ignoré par l'API)
- **Décision de format (investigation du 18/09/2026)** :
  - L'API expose la même donnée en RDF/XML (par défaut), Turtle et JSON-LD via le paramètre `format` — JSON-LD est une sérialisation fidèle du même graphe, sans perte de contenu ni de multilinguisme (les champs multilingues restent des dictionnaires par langue dans les trois formats).
  - CSV n'existe que pour les dumps de métadonnées du catalogue (sessions, réunions), pas pour le contenu métier (députés, votes, questions) — aplatirait les relations (listes de votants, mandats multiples) et perdrait le multilinguisme.
  - JSON-LD évite d'introduire une dépendance RDF/Turtle/SPARQL dans `packages/ingest` (stack Node/TypeScript pur), sans aucune perte de jeu de données ou de relation par rapport à Turtle/RDF-XML.
  - Pas d'endpoint SPARQL sur data.europarl.europa.eu (seul le portail générique data.europa.eu en propose un, limité aux métadonnées de catalogue DCAT-AP — inutile ici).
- **Endpoints utiles** :
  - `/meps/show-current` — députés en mandat (718 au total dont 81 français à la date de l'investigation)
  - `/meps?parliamentary-term={n}` — historique par législature (depuis 1979, législature 1 = 551 entrées)
  - `/meetings/{sitting-id}/vote-results` — votes en plénière, **nominatifs** pour les scrutins électroniques (`VOTE_ELECTRONIC_ROLLCALL` : `had_voter_for`/`had_voter_against`/`had_voter_abstention`) ; seuls les votes à main levée restent agrégés (limite du Parlement lui-même)
  - `/parliamentary-questions` — questions parlementaires (écrites, orales, interpellations via le champ `work_type`) ; métadonnées structurées uniquement, le texte de la question/réponse est en pièce jointe DOCX/PDF liée (`is_embodied_by`), pas en JSON structuré
- **Filtrage délégation française** : aucun filtre pays côté API — récupérer la liste complète et filtrer côté client sur `api:country-of-representation == "FR"` (volumétrie gérable en un seul appel)
- **Fréquence de mise à jour** : résultats de vote nominatif disponibles au plus tard le lendemain de la séance (observé empiriquement, pas de SLA documenté)
- **Rate limit** : 500 requêtes / 5 minutes par endpoint
- **Statut** : source à câbler (M24T3 à T7)
- **Schéma (M24T2)** :
  - `officials.europarl_id` (varchar 50, unique) — identifiant du député européen sur l'API Open Data, sert de clé de rattachement/déduplication (M24T3)
  - `mandates.type = 'eurodepute'` — pas d'enum Postgres sur `mandates.type` (varchar libre), cohérent avec `depute`/`senateur`/`maire`
  - `mandates.legislature` (integer, nullable) — numéro de législature européenne (mandats de 5 ans, ex. 10 pour 2024-2029), non renseigné pour AN/Sénat où les dates suffisent
  - `affiliations.kind` (varchar 50, défaut `'group'`) — distingue la nature de l'appartenance : `'group'` (comportement historique AN/Sénat, groupe parlementaire), `'national_party'` et `'european_group'` pour les eurodéputés, qui ont les deux simultanément sans que l'un écrase l'autre. Les diffs AN (`affiliations-diff.ts`) filtrent désormais sur `kind = 'group'` pour ne pas clôturer par erreur une ligne d'un autre type appartenant au même élu (cas d'un official cumulant mandat national et européen)
  - Cumul de mandats national + européen : un seul `official`, plusieurs lignes `mandates` (une par type), pas de champ dédié — la frise des mandats (M15T5) doit gérer le tri par dates comme pour tout autre changement de mandat
- **Ingestion (M24T3)** :
  - `sources/parlement-europeen.ts` → `upsert/meps.ts`, orchestré par `run-europe.ts` (`yarn --cwd packages/ingest ingest:europe`)
  - Scope actuel : législature en cours uniquement (10, 2024-2029) — 81 eurodéputés français. L'historique antérieur (depuis 1979) est laissé à une itération ultérieure : il suppose de résoudre le libellé de chaque organisation (parti/groupe) pour chaque législature, ce que l'API ne facilite pas
  - **Dédoublonnage** : rattachement par nom normalisé (sans accents/casse) **et** date de naissance exacte (`bday` de l'API). Le nom seul ne suffit jamais — sans date de naissance disponible côté API, un nouvel `official` est créé plutôt que risquer un mauvais rattachement. Mesuré sur les 81 eurodéputés français actuels (18/09/2026) : 73 sans aucune correspondance de nom (nouveaux `officials`), 8 avec correspondance de nom dont 6 confirmées par la date de naissance (rattachement fiable, ex. Nadine Morano, Thierry Mariani) et 2 sans date de naissance disponible côté API (nouvel `official` créé par prudence — connu, à réconcilier manuellement si besoin). 0 faux positif (nom identique, naissance différente), 0 cas ambigu (plusieurs `officials` avec le même nom normalisé)
  - Groupe politique européen : renseigné directement depuis la liste des eurodéputés actuels (`api:political-group`)
  - Parti national : résolu via l'organisation de type `NATIONAL_POLITICAL_GROUP` dans les appartenances du député, puis son libellé via `/corporate-bodies/{id}` (mise en cache : plusieurs élus partagent le même parti)
- **Votes en plénière (M24T4)** :
  - `sources/parlement-europeen-votes.ts` → `upsert/europe-votes.ts`, étape `eurodeputes-votes` de `run-europe.ts`
  - **Granularité confirmée par investigation** : seuls les scrutins par appel nominal (`decision_method = VOTE_ELECTRONIC_ROLLCALL`, endpoint `/meetings/{id}/decisions`) publient une position par député (`had_voter_for/against/abstention`, listes d'ids `person/{id}`). Les votes à main levée ne publient qu'un résultat agrégé — aucune position individuelle n'est disponible, ils sont ignorés. Mesuré sur un échantillon de 8 séances 2025 : ~50 % des scrutins sont à appel nominal (~24 décisions/séance en moyenne, ~1 250/an, ~625 exploitables)
  - Réutilise le schéma `ballots`/`votes` existant (AN/Sénat), `ballots.an_id` porte le préfixe `europarl-vote-{id}` (même convention que `senat-scrutin-{session}-{numéro}`), `ballots.type = 'europarl'`
  - Ne conserve que les positions des eurodéputés français (rattachement par `officials.europarl_id`) ; ignore les ~700 autres votants
  - **Limite assumée** : seules les positions `for`/`against`/`abstain` explicitement publiées sont enregistrées, pas de position `absent` calculée (calculer une absence fiable suppose de connaître précisément la fenêtre de mandat de chaque élu au moment du vote — laissé à une itération ultérieure si le besoin se confirme)
  - **Ingestion incrémentale** : une séance dont la date a plus de 2 jours est considérée définitive une fois traitée (les résultats d'un scrutin publié ne changent plus) et marquée via `data_provenance` (`source_table = 'europarl_sittings'`) — elle n'est plus rejouée aux exécutions suivantes. Une séance récente (< 2 jours) est toujours re-vérifiée
  - Scope : législature en cours uniquement (années 2024 à aujourd'hui), cohérent avec M24T3
