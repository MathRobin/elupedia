# Domaines métier

Cartographie des domaines couverts par Elupedia, avec les tables DB et sources associées.

## Élus et mandats

- **Tables** : `officials`, `mandates`
- **Sources** :
  - data.assemblee-nationale.fr (open data AN) — `assemblee-nationale.ts` → `upsert/officials.ts`
  - data.senat.fr (API JSON Sénat) — `senat.ts` → `upsert/senators.ts`
- **Description** : Identité des élus (nom, prénom, date de naissance, photo, slug permalink) et historique de leurs mandats (législature, circonscription, dates de début/fin). Couvre les députés, sénateurs et maires. Le slug (ex. `manuel-bompard`) est généré automatiquement à l'insertion et sert de permalink pour les URLs (`/elus/{slug}`). Les homonymes sont suffixés (`-1`, `-2`).
- **Types de mandats** : `depute`, `senateur`, `maire`
- **Champs commune (mandats maires)** :
  - `commune_code` (varchar 10) — code INSEE de la commune (ex. `75056` pour Paris, `75101` pour le 1er arrondissement)
  - `parent_commune_code` (varchar 10) — code INSEE de la ville de rattachement pour les arrondissements PLM (ex. `75056` pour un arrondissement de Paris), null sinon
- **Source maires** :
  - RNE (data.gouv.fr) — fichier CSV des maires (~34 800 entrées), séparateur `;`, UTF-8, CRLF, mise à jour trimestrielle
  - URL : `https://www.data.gouv.fr/api/1/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503`
  - Colonnes : Code département, Libellé département, Code collectivité statut particulier, Libellé collectivité statut particulier, Code commune (INSEE), Libellé commune, Nom, Prénom, Code sexe, Date naissance, Code CSP, Libellé CSP, Date début mandat, Date début fonction
  - Les maires d'arrondissement (Paris/Lyon/Marseille) ne sont PAS dans ce fichier — seuls les maires des villes entières y figurent (codes INSEE 75056, 69123, 13055)
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
- **Pages** : page d'accueil (grille des élus actifs avec badge député/sénateur genré, filtre département), fiche élu (identité, mandat, historique des mandats)

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

- **Tables** : `votes`, `ballots`
- **Sources** :
  - Assemblée nationale : `an-scrutins.ts` (ZIP/JSON, ~8 400 scrutins) → `upsert/an-votes.ts`
  - Sénat : `senat-scrutins.ts` → `upsert/senat-votes.ts` (API JSON, scrutins publics)
- **Description** : Scrutins publics et position de chaque élu (pour, contre, abstention, absent). Mapping FR→EN des positions.
- **Pages** : fiche élu (section historique des votes), page détail scrutin (liste des votes par élu)

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
- **Workflows** :
  - `.github/workflows/ingest-press.yml` (lundi 05:00 UTC) — presse parlementaires, délai 3s entre chaque élu
  - `.github/workflows/ingest-press-maires.yml` (06:00 et 18:00 UTC, 2x/jour) — 1500 élus vivants aléatoires par run, tous types de mandats
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
- **Workflow** : `.github/workflows/ingest-photos.yml` (dimanche 03:30 UTC)
- **Bucket** : `elus/pp/{officialId}.jpg`
- **Description** : Les photos des élus sont sauvegardées sur S3 pour éviter la dépendance aux URLs sources. Le site utilise `s3_photo_url` en priorité, avec fallback sur `photo_url`.

## Statut déclaration HATVP

- **Champ** : `officials.hatvp_status`
- **Source** : fiches nominatives HATVP (`hatvp.fr/fiche-nominative/?declarant=...`) — HTML scraping
- **Client** : `sources/hatvp-status.ts` → `upsert/hatvp-status.ts`
- **Cible** : députés, sénateurs, et maires de communes >20 000 habitants (obligation de déclaration loi 2013) n'ayant pas de déclaration publiée dans le XML HATVP
- **Description** : Détecte les déclarations déposées mais pas encore publiées (statut `pending`). Utilise les données de population INSEE pour identifier les communes >20k. Un bandeau amber est affiché sur la fiche élu avec lien vers la fiche HATVP.
- **Pages** : fiche élu (bandeau dans la section intérêts quand `hatvp_status = 'pending'`)
