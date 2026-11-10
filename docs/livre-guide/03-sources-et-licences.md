# Sources, licences et points juridiques

Page de crédits (à reprendre telle quelle en fin de livre) et liste des contrôles juridiques avant impression. Voir aussi `docs/DATA-LICENSES.md`.

## Page de crédits (brouillon)

Les données utilisées dans ce livre proviennent de sources publiques, réutilisées sous Licence Ouverte 2.0 (Etalab) sauf mention contraire :

- Assemblée nationale (data.assemblee-nationale.fr) : députés, mandats, scrutins, questions, collaborateurs.
- Sénat (data.senat.fr) : sénateurs, mandats, questions, collaborateurs, résultats des élections sénatoriales.
- Haute Autorité pour la transparence de la vie publique : déclarations d'intérêts et d'activités.
- Commission nationale des comptes de campagne et des financements politiques, via data.gouv.fr : comptes de campagne.
- Conseil constitutionnel, via data.gouv.fr : parrainages des élections présidentielles (domaine public).
- Ministère de l'Intérieur, via data.gouv.fr : résultats des élections législatives, municipales ; Répertoire national des élus.
- Parlement européen : eurodéputés.
- MaDada.fr : statistiques de demandes d'accès aux documents administratifs.

Chiffres calculés par Elupedia à partir de ces sources, au 9 novembre 2026.

## Points juridiques à traiter avant impression

| Sujet                             | Risque                                                                        | Traitement                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Personnes                         | Diffamation, atteinte à la vie privée                                         | Aucun nom dans les brouillons. Toute exception demande une relecture juridique.                       |
| Données personnelles (RGPD)       | Réidentification par recoupement (âge extrême, petite commune, fonction rare) | Agrégats seuls. Pas de min/max, pas de cas à effectif très faible.                                    |
| Comptes de campagne, déclarations | Présenter un constat administratif comme une faute                            | Texte neutre, cause réglementaire toujours rappelée. Code `DD` à vérifier.                            |
| Licence Ouverte 2.0               | Attribution manquante                                                         | Page de crédits ci-dessus.                                                                            |
| OpenStreetMap (ODbL)              | Mention et partage à l'identique si cartes produites                          | Mention « © OpenStreetMap » sur toute carte ; vérifier le partage à l'identique pour la base dérivée. |
| Wikimedia Commons                 | Licences par fichier (souvent CC BY-SA)                                       | Pas de photo d'élu dans la première version.                                                          |
| Presse                            | Pas de licence ouverte                                                        | Aucune donnée de presse dans le livre.                                                                |
| Marque et titre                   | Titre déjà pris, confusion avec une autre publication                         | Recherche d'antériorité sur le titre et la marque avant dépôt.                                        |
| ISBN, dépôt légal                 | Obligations de l'éditeur ou de l'imprimeur                                    | ISBN gratuit via l'agence française ; dépôt légal à la BnF.                                           |
| Impression à la demande           | Mentions légales (éditeur, imprimeur, date)                                   | À reprendre de la plateforme choisie.                                                                 |
