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
- **Workflow** : `.github/workflows/ingest-press.yml` (lundi 05:00 UTC), délai 3s entre chaque élu, élus vivants uniquement
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
