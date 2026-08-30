# Domaines métier

Cartographie des domaines couverts par Elupedia, avec les tables DB et sources associées.

## Élus et mandats

- **Tables** : `officials`, `mandates`
- **Sources** :
  - data.assemblee-nationale.fr (open data AN) — `assemblee-nationale.ts` → `upsert/officials.ts`
  - data.senat.fr (API JSON Sénat) — `senat.ts` → `upsert/senators.ts`
- **Description** : Identité des élus (nom, prénom, date de naissance, photo, slug permalink) et historique de leurs mandats (législature, circonscription, dates de début/fin). Couvre les députés et sénateurs. Le slug (ex. `manuel-bompard`) est généré automatiquement à l'insertion et sert de permalink pour les URLs (`/elus/{slug}`). Les homonymes sont suffixés (`-1`, `-2`).
- **Pages** : page d'accueil (grille des élus actifs avec badge député/sénateur genré, filtre département), fiche élu (identité, mandat, historique des mandats)

## Activité parlementaire

- **Tables** : `parliamentary_activity`
- **Source** : data.assemblee-nationale.fr — ZIP questions écrites (~17 800 fichiers) + ZIP questions au gouvernement (~1 800 fichiers)
- **Client M1** : `an-activite.ts` → `upsert/parliamentary-activity.ts`
- **Description** : Questions écrites (written_question) et questions au gouvernement (oral_question). Amendements et rapports prévus ultérieurement (volumes trop importants pour l'instant).
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
- **Pages** : fiche élu (section affiliations politiques), timeline unifiée

## Collaborateurs

- **Tables** : `staffers`
- **Sources** :
  - AN : `an-collaborateurs.ts` (CSV) → `upsert/staffers-diff.ts`
  - Sénat : `senat-collaborateurs.ts` (API JSON) → `upsert/senat-staffers-diff.ts`
- **Description** : Collaborateurs parlementaires déclarés, avec suivi des arrivées et départs. Stratégie diff : set end_date sur les collaborateurs partis.
- **Pages** : fiche élu (section collaborateurs avec badges actif/inactif), timeline unifiée

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
- **Pages** : fiche élu (section presse en grille de cards), timeline unifiée

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
