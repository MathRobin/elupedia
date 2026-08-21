# Domaines métier

Cartographie des domaines couverts par Elupedia, avec les tables DB et sources associées.

## Élus et mandats

- **Tables** : `officials`, `mandates`
- **Source** : NosDéputés.fr, data.assemblee-nationale.fr, data.senat.fr
- **Description** : Identité des élus (nom, prénom, date de naissance, photo) et historique de leurs mandats (législature, circonscription, dates de début/fin).

## Activité parlementaire

- **Tables** : `parliamentary_activity`
- **Source** : NosDéputés.fr, data.assemblee-nationale.fr
- **Description** : Indicateurs d'activité : questions écrites/orales, propositions de loi, rapports, interventions en séance.

## Votes et scrutins

- **Tables** : `votes`, `ballots`
- **Source** : data.assemblee-nationale.fr
- **Description** : Scrutins publics et position de chaque élu (pour, contre, abstention, absent).

## Affiliations politiques

- **Tables** : `affiliations`
- **Source** : data.assemblee-nationale.fr, NosDéputés.fr
- **Description** : Appartenance aux groupes parlementaires et partis politiques, avec historique des changements.

## Collaborateurs

- **Tables** : `staffers`
- **Source** : data.assemblee-nationale.fr (open data)
- **Description** : Collaborateurs parlementaires déclarés, avec suivi des arrivées et départs.

## Intérêts et patrimoine (HATVP)

- **Tables** : `interests`
- **Source** : HATVP (Haute Autorité pour la Transparence de la Vie Publique)
- **Description** : Déclarations d'intérêts et d'activités des élus soumis à obligation déclarative.

## Commissions

- **Tables** : `committees`
- **Source** : data.assemblee-nationale.fr, data.senat.fr
- **Description** : Composition des commissions permanentes et spéciales, rôle de chaque élu (membre, président, rapporteur).

## Mentions presse

- **Tables** : `press_mentions`
- **Source** : Agrégation de sources presse (articles sourcés)
- **Description** : Mentions d'élus dans la presse, avec lien vers l'article source, date et contexte.

## Adresses et contacts

- **Tables** : `addresses`, `external_links`
- **Source** : data.assemblee-nationale.fr, data.senat.fr
- **Description** : Adresses de permanence, coordonnées, sites web et réseaux sociaux des élus.

## Historique électoral

- **Tables** : `electoral_results`
- **Source** : data.gouv.fr (résultats électoraux)
- **Description** : Résultats des élections par circonscription : nombre de voix, pourcentage, tour, élu/non élu.
