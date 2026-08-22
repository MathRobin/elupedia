# Domaines métier

Cartographie des domaines couverts par Elupedia, avec les tables DB et sources associées.

## Élus et mandats

- **Tables** : `officials`, `mandates`
- **Source** : NosDéputés.fr, data.assemblee-nationale.fr, data.senat.fr
- **Client M1** : `nosdeputes.ts` (députés Gironde) → `upsert/officials.ts`
- **Description** : Identité des élus (nom, prénom, date de naissance, photo) et historique de leurs mandats (législature, circonscription, dates de début/fin).
- **Pages M4** : page d'accueil (grille des élus actifs), fiche élu (identité, mandat, prédécesseur/successeur)

## Activité parlementaire

- **Tables** : `parliamentary_activity`
- **Source** : NosDéputés.fr, data.assemblee-nationale.fr
- **Client M1** : `an-activite.ts` → `upsert/parliamentary-activity.ts`
- **Description** : Indicateurs d'activité : questions écrites/orales, amendements (avec sort : adopted/rejected/withdrawn), rapports.
- **Pages M4** : fiche élu (section activité parlementaire avec table triée par date)

## Votes et scrutins

- **Tables** : `votes`, `ballots`
- **Source** : NosDéputés.fr
- **Client M1** : `nosdeputes-votes.ts` → `upsert/votes.ts`
- **Description** : Scrutins publics et position de chaque élu (pour, contre, abstention, absent). Mapping FR→EN des positions.
- **Pages M4** : fiche élu (section historique des votes), page détail scrutin (liste des votes par élu)

## Affiliations politiques

- **Tables** : `affiliations`
- **Source** : data.assemblee-nationale.fr, NosDéputés.fr
- **Client M1** : `nosdeputes-affiliations.ts` → `upsert/affiliations-diff.ts`
- **Description** : Appartenance aux groupes parlementaires et partis politiques, avec historique des changements. Stratégie diff : ferme l'affiliation précédente (end_date) si le groupe change.
- **Pages M4** : fiche élu (section affiliations politiques), timeline unifiée

## Collaborateurs

- **Tables** : `staffers`
- **Source** : data.assemblee-nationale.fr (open data)
- **Client M1** : `an-collaborateurs.ts` → `upsert/staffers-diff.ts`
- **Description** : Collaborateurs parlementaires déclarés, avec suivi des arrivées et départs. Stratégie diff : set end_date sur les collaborateurs partis.
- **Pages M4** : fiche élu (section collaborateurs avec badges actif/inactif), timeline unifiée

## Intérêts et patrimoine (HATVP)

- **Tables** : `interests`
- **Source** : HATVP (Haute Autorité pour la Transparence de la Vie Publique)
- **Client M1** : `hatvp.ts` → `upsert/interests.ts`
- **Description** : Déclarations d'intérêts et d'activités des élus soumis à obligation déclarative. Types : company_share, nonprofit_role.
- **Pages M4** : fiche élu (section intérêts déclarés)

## Commissions

- **Tables** : `committees`
- **Source** : data.assemblee-nationale.fr, data.senat.fr
- **Client M1** : `an-commissions.ts` → `upsert/committees.ts`
- **Description** : Composition des commissions permanentes/spéciales, délégations, groupes d'études et d'amitié.
- **Pages M4** : fiche élu (section commissions & groupes)

## Mentions presse

- **Tables** : `press_mentions`
- **Source** : Agrégation de sources presse (articles sourcés)
- **Description** : Mentions d'élus dans la presse, avec lien vers l'article source, date et contexte.
- **Pages M4** : fiche élu (section presse), timeline unifiée

## Adresses et contacts

- **Tables** : `addresses`, `external_links`
- **Source** : data.assemblee-nationale.fr, data.senat.fr
- **Client M1** : `an-adresses.ts` → `upsert/addresses.ts`
- **Description** : Adresses de permanence et de l'Assemblée, coordonnées (téléphone, email).
- **Pages M4** : fiche élu (section coordonnées, section liens extérieurs)

## Historique électoral

- **Tables** : `electoral_results`
- **Source** : data.gouv.fr (résultats électoraux)
- **Client M1** : `datagouv-elections.ts` → `upsert/electoral-results.ts`
- **Description** : Résultats des élections par circonscription : pourcentage, tour, nombre d'opposants.
- **Pages M4** : fiche élu (section historique électoral)
