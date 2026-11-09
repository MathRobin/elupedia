# Chiffres du livre

Chiffres calculés dans la base Elupedia (PostgreSQL, Neon), **lue en lecture seule le 9 novembre 2026**. Un chapitre ne cite que des chiffres de ce fichier. Chaque chiffre a un identifiant, une source et, si besoin, une réserve à reprendre dans le texte.

Notation : « actif » = mandat sans date de fin ou avec une date de fin dans le futur. Les noms de tables sont ceux du schéma Drizzle (`packages/shared/src/schema/`).

## Périmètre de la base (à rappeler dans l'avant-propos)

- La base couvre : députés, sénateurs, eurodéputés, maires, conseillers départementaux, régionaux, communautaires, d'arrondissement, membres des assemblées à statut particulier, conseillers des Français de l'étranger.
- **Elle ne contient pas les conseillers municipaux** (hors maires), soit plusieurs centaines de milliers d'élus. Toute phrase du type « tous les élus de France » est donc fausse.
- Sources : Assemblée nationale, Sénat, Parlement européen, Répertoire national des élus (ministère de l'Intérieur), HATVP, CNCCFP, Conseil constitutionnel, ministère de l'Intérieur (résultats électoraux). Licences : voir `03-sources-et-licences.md`.

## A. Les élus et leurs mandats

| ID  | Chiffre                                                             | Valeur            | Source / requête                                                                                      |
| --- | ------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| C01 | Fiches d'élus en base (actuels et anciens)                          | 89 284            | `select count(*) from officials`                                                                      |
| C02 | Élus ayant au moins un mandat actif                                 | 73 649            | `select count(distinct official_id) from mandates where actif`                                        |
| C03 | Conseillers communautaires actifs                                   | 62 123            | mandats `conseiller_communautaire` (62 127 mandats)                                                   |
| C04 | Maires actifs                                                       | 34 824            | mandats `maire`                                                                                       |
| C05 | Conseillers départementaux actifs                                   | 4 010             | mandats `conseiller_departemental`                                                                    |
| C06 | Conseillers régionaux actifs                                        | 1 741             | mandats `conseiller_regional`                                                                         |
| C07 | Conseillers d'arrondissement actifs                                 | 1 025             | mandats `conseiller_arrondissement`                                                                   |
| C08 | Députés actifs                                                      | 565               | mandats `depute` (l'Assemblée compte 577 sièges : écart = sièges non pourvus ou données à rafraîchir) |
| C09 | Membres d'assemblées à statut particulier actifs                    | 532               | mandats `membre_assemblee_statut_particulier`                                                         |
| C10 | Conseillers des Français de l'étranger actifs                       | 441               | mandats `conseiller_francais_etranger`                                                                |
| C11 | Sénateurs actifs                                                    | 350               | mandats `senateur`                                                                                    |
| C12 | Membres de l'Assemblée des Français de l'étranger actifs            | 89                | mandats `membre_afe`                                                                                  |
| C13 | Eurodéputés français actifs                                         | 82                | mandats `eurodepute`                                                                                  |
| C14 | Élus ayant au moins 2 mandats actifs                                | 30 492            | `group by official_id having count(*) >= 2`                                                           |
| C15 | Élus ayant au moins 3 mandats actifs                                | 1 624             | idem avec `>= 3`                                                                                      |
| C16 | Maires ayant aussi un mandat actif de conseiller communautaire      | 28 655            | jointure `mandates` sur `official_id`                                                                 |
| C17 | Tous les mandats de maire actifs ont débuté depuis le 1er mars 2026 | 34 824 sur 34 824 | `start_date >= '2026-03-01'` (municipales des 15 et 22 mars 2026)                                     |
| C18 | Conseillers départementaux dont le mandat actuel a débuté en 2021   | 3 695 sur 4 010   | `extract(year from start_date) = 2021`                                                                |
| C19 | Conseillers régionaux dont le mandat actuel a débuté en 2021        | 1 623 sur 1 741   | idem                                                                                                  |
| C20 | Sénateurs dont le mandat actif a débuté en 2023 / en 2026           | 158 / 183         | renouvellement par séries ; le reste (9) : remplacements 2024-2025                                    |

Réserves :

- C03 : la base compte 62 127 mandats pour 62 123 personnes (quatre personnes ont deux mandats communautaires). On cite le nombre de personnes (62 123).
- C08 : ne pas dire « les 577 députés ». Dire « 565 députés recensés ». Contrôle du 9 novembre 2026 : 565 mandats actifs pour 565 personnes et 565 circonscriptions distinctes, sans doublon. Il manque donc 12 circonscriptions dans les données (sièges vacants ou lacune d'ingestion : à trancher).
- C11 : 350 mandats actifs pour 350 personnes distinctes, aucune date de fin future (183 mandats débutés en 2026, 158 en 2023). Si le plafond légal est de 348 sièges, deux mandats sont périmés dans les données : à confirmer avec le Sénat.
- C13 : 82 mandats pour 82 personnes, aucun doublon : l'écart avec les 81 sièges français est à expliquer (remplacement non clos ?).
- C14, C16 : un conseiller municipal simple n'est pas dans la base, donc le cumul est sous-estimé pour les élus qui ont aussi un mandat de conseiller municipal.

### Cumul des mandats parlementaires (agrégats, mandats actifs au 9/11/2026)

| ID  | Chiffre                                                     | Valeur | Part           |
| --- | ----------------------------------------------------------- | ------ | -------------- |
| C21 | Députés ayant aussi un mandat de conseiller communautaire   | 128    | 22,7 % des 565 |
| C22 | Députés ayant aussi un mandat de conseiller régional        | 68     | 12,0 %         |
| C23 | Députés ayant aussi un mandat de conseiller départemental   | 46     | 8,1 %          |
| C24 | Sénateurs ayant aussi un mandat de conseiller départemental | 86     | 24,6 % des 350 |
| C25 | Sénateurs ayant aussi un mandat de conseiller communautaire | 82     | 23,4 %         |
| C26 | Sénateurs ayant aussi un mandat de conseiller régional      | 42     | 12,0 %         |

Réserve : les lignes ne s'additionnent pas (un élu peut cumuler plusieurs mandats). **Ne pas utiliser** les cas « député/sénateur et maire » (11 et 23 dans la base, soit 34 personnes). Contrôle du 9 novembre 2026 : ces 34 mandats de maire ont tous débuté entre le 15 et le 30 mars 2026 (municipales) et aucun n'est un maire délégué. La loi interdit ce cumul depuis 2017 : ce sont sans doute des mandats acquis aux municipales, en attente du choix de l'élu, dont la date de fin n'est pas saisie. À vérifier avant toute mention.

### Âges (mandats actifs, calculés à la date de lecture)

| ID  | Chiffre                            | Valeur                    |
| --- | ---------------------------------- | ------------------------- |
| C27 | Âge moyen des députés / âge médian | 52,0 ans / 53 ans         |
| C28 | Âge moyen des sénateurs            | 59,7 ans                  |
| C29 | Âge moyen des maires               | 59,7 ans                  |
| C30 | Députés de moins de 40 ans         | 113 sur 565 (20,0 %)      |
| C31 | Députés de 70 ans et plus          | 38 sur 565 (6,7 %)        |
| C32 | Maires de moins de 40 ans          | 1 514 sur 34 824 (4,3 %)  |
| C33 | Maires de 70 ans et plus           | 6 666 sur 34 824 (19,1 %) |

Réserve : **ne pas publier l'âge minimum ou maximum** des maires (la valeur extrême permet d'identifier une personne). Les âges moyens sont arrondis à une décimale.

### Durée des mandats de député déjà terminés

| ID  | Chiffre                                     | Valeur                  |
| --- | ------------------------------------------- | ----------------------- |
| C34 | Durée moyenne d'un mandat de député terminé | 4,1 ans (3 273 mandats) |

Réserve : la moyenne inclut les mandats interrompus (démissions, remplacements, décès) ; elle est inférieure aux 5 ans d'une législature complète. À présenter comme « durée effective moyenne ».

## B. Les élections

### Participation au premier tour (inscrits, votants, métropole et outre-mer cumulés)

| ID  | Scrutin           | Inscrits   | Votants    | Participation |
| --- | ----------------- | ---------- | ---------- | ------------- |
| C40 | Législatives 2002 | 40 225 555 | 25 957 294 | 64,5 %        |
| C41 | Législatives 2007 | 43 565 747 | 26 340 210 | 60,5 %        |
| C42 | Législatives 2012 | 46 082 403 | 26 369 194 | 57,2 %        |
| C43 | Législatives 2017 | 47 570 988 | 23 167 508 | 48,7 %        |
| C44 | Législatives 2022 | 48 953 748 | 23 256 207 | 47,5 %        |
| C45 | Législatives 2024 | 49 332 709 | 32 908 657 | 66,7 %        |
| C46 | Municipales 2014  | 45 773 155 | 29 089 089 | 63,6 %        |
| C47 | Municipales 2020  | 46 437 411 | 20 740 205 | 44,7 %        |
| C48 | Municipales 2026  | 48 690 084 | 27 812 209 | 57,1 %        |

Source : ministère de l'Intérieur via data.gouv.fr, tables `legislative_elections` et `municipal_elections` (somme des communes, premier tour). Réserve : somme de lignes communales ; l'écart avec les chiffres officiels agrégés doit rester inférieur à quelques dixièmes de point. À vérifier ligne par ligne avant impression.

### Sénatoriales

| ID  | Chiffre                                                                                         | Valeur                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C50 | Sénatoriales 2026 : départements au premier tour / sièges à pourvoir                            | 64 / 178                                                                                                                                                                                                                       |
| C51 | Sénatoriales 2026 : « grands électeurs » inscrits au premier tour                               | 92 257                                                                                                                                                                                                                         |
| C52 | Sénatoriales 2026 : départements ayant eu un second tour                                        | 14 (11 365 électeurs). La base indique 26 sièges pour ce second tour mais 19 élus seulement au second tour (159 au premier, 178 au total) : **ne pas citer le nombre de sièges du second tour**, à recouper avec data.senat.fr |
| C53 | Sénatoriales 2026 : candidats enregistrés                                                       | 1 762 (environ 9,9 par siège)                                                                                                                                                                                                  |
| C54 | Sénatoriales 2026 : sénateurs sortants candidats / réélus                                       | 134 / 100                                                                                                                                                                                                                      |
| C55 | Sénatoriales 2023, premier tour : électeurs sénatoriaux votants / inscrits dans 45 départements | 76 678 / 77 808 (98,5 %)                                                                                                                                                                                                       |

Réserve : les résultats 2026 sont ceux ingérés après scrutin (`senatorial_candidates.elected`). À recouper avec data.senat.fr avant impression. Le sexe des candidats n'est pas renseigné pour 2026 : pas de statistique de parité sénatoriale.

## C. Le travail parlementaire

### Composition de l'Assemblée nationale (565 députés recensés, 9/11/2026)

| ID  | Groupe (sigle)                                          | Députés |
| --- | ------------------------------------------------------- | ------- |
| C60 | Rassemblement National (RN)                             | 121     |
| C61 | Ensemble pour la République (EPR)                       | 88      |
| C62 | La France insoumise - Nouveau Front Populaire (LFI-NFP) | 70      |
| C63 | Socialistes et apparentés (SOC)                         | 68      |
| C64 | Droite Républicaine (DR)                                | 44      |
| C65 | Écologiste et Social (EcoS)                             | 38      |
| C66 | Les Démocrates (Dem)                                    | 37      |
| C67 | Horizons & Indépendants (HOR)                           | 31      |
| C68 | Libertés, Indépendants, Outre-mer et Territoires (LIOT) | 23      |
| C69 | À Droite ! (AD)                                         | 17      |
| C70 | Gauche Démocrate et Républicaine (GDR)                  | 17      |
| C71 | Non inscrit (NI)                                        | 11      |

Réserves : composition du moment, à ne citer qu'en tableau daté, avec la mention « photographie ». Pas de commentaire sur les rapports de force. Les groupes du Sénat ne sont pas utilisables : le groupe est absent de la base pour 332 des 350 sénateurs.

### Scrutins et motions de censure

| ID  | Chiffre                                                                                   | Valeur                                                               |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| C72 | Scrutins publics de l'Assemblée enregistrés entre le 8 octobre 2024 et le 4 novembre 2026 | 6 306 (6 246 ordinaires, 45 solennels, 15 motions de censure)        |
| C73 | Motions de censure enregistrées entre le 8 octobre 2024 et le 25 février 2026             | 15 (8 au titre de l'article 49, alinéa 2 ; 7 au titre de l'alinéa 3) |

Réserve importante : **la base est incomplète pour décembre 2024.** Elle ne compte que 22 scrutins ce mois-là, contre 118 à 209 pour les autres mois (octobre 2024 à mars 2025). Elle ne contient pas la motion du 4 décembre 2024, qui a été adoptée. Le total C72 (6 306) est donc sous-évalué. Toutes les motions de la base sont marquées « rejetées ». **Interdit d'écrire « aucune motion n'a été adoptée »** ou de s'appuyer sur ces 15 comme sur un total. Pour la règle (majorité requise, effet), citer la Constitution, pas la base.

### Questions écrites

| ID  | Chiffre                                                                                                                                                                                                                             | Valeur                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| C74 | Questions écrites posées à l'Assemblée du 1er octobre 2024 au 3 novembre 2026                                                                                                                                                       | 17 367                      |
| C75 | … dont ayant reçu une réponse (à la date de lecture)                                                                                                                                                                                | 11 153 (64,2 %)             |
| C76 | Délai de réponse, questions répondues : moyen / médian                                                                                                                                                                              | 158 jours / 126 jours       |
| C77 | Réponses données dans les 60 jours                                                                                                                                                                                                  | 1 988 (17,8 % des réponses) |
| C78 | Questions écrites par député ayant posé au moins une question : moyenne / médiane                                                                                                                                                   | 28,8 / 21                   |
| C79 | Thèmes les plus fréquents (rubriques) : agriculture 609 ; santé 583 ; professions de santé 568 ; personnes handicapées 561 ; outre-mer 486 ; sécurité des biens et des personnes 443 ; enseignement 405 ; énergie et carburants 396 | —                           |
| C80 | Questions écrites au Sénat depuis le 14 février 1978 / questions orales au Sénat                                                                                                                                                    | 268 237 / 25 763            |
| C81 | Questions orales à l'Assemblée du 3 octobre 2024 au 15 octobre 2026                                                                                                                                                                 | 907                         |

Réserves : les délais (C76, C77) ne portent que sur les questions **déjà répondues** : ils sous-estiment le délai réel, puisque les questions encore sans réponse en sont exclues. Parmi les questions sans réponse figurent des questions récentes, retirées ou devenues caduques (fin de législature). Ne pas parler de « taux de réponse du gouvernement » sans cette précaution.

## D. L'équipe de l'élu

| ID  | Chiffre                                                                         | Valeur |
| --- | ------------------------------------------------------------------------------- | ------ |
| C85 | Collaborateurs parlementaires déclarés actifs (Assemblée et Sénat)              | 2 938  |
| C86 | Collaborateurs déclarés depuis l'ouverture des données, actifs et anciens       | 3 170  |
| C87 | Parlementaires ayant au moins un collaborateur déclaré                          | 916    |
| C88 | Collaborateurs actifs par parlementaire (ceux qui en ont au moins un) : moyenne | 3,2    |

Réserves : ne pas publier le nombre maximum par parlementaire (cas individuels). Les données déclaratives distinguent mal les collaborateurs rémunérés à plein temps et les autres ; ne pas parler de « budget » ni de « masse salariale ».

## E. Transparence

| ID  | Chiffre                                                                         | Valeur         |
| --- | ------------------------------------------------------------------------------- | -------------- |
| C90 | Élus ayant au moins une ligne de déclaration d'intérêts dans la base            | 1 395          |
| C91 | Lignes « organes dirigeants » / élus concernés                                  | 17 640 / 1 147 |
| C92 | Lignes « fonctions électives annexes » / élus concernés                         | 6 477 / 1 188  |
| C93 | Lignes « participations financières » / élus concernés                          | 3 114 / 580    |
| C94 | Lignes « activités professionnelles » / élus concernés                          | 2 708 / 930    |
| C95 | Lignes « activités de conseil » / élus concernés                                | 238 / 102      |
| C96 | Élus dont la déclaration est déposée mais pas encore publiée (statut `pending`) | 189            |

Réserves : la base ne contient que les déclarations des députés, sénateurs et maires soumis à l'obligation (la HATVP en publie davantage). **Ne pas calculer de « part d'élus qui déclarent »**. Le patrimoine n'est pas extrait des déclarations (pas de montant individuel) : on ne publie aucun chiffre de patrimoine. Les montants annuels des activités ne sont pas présentés (net et brut mélangés).

## F. L'argent des campagnes (CNCCFP)

| ID   | Élection          | Comptes recensés | A : approuvé   | AR : approuvé après réformation | R : rejeté  | DD : non déposé |
| ---- | ----------------- | ---------------- | -------------- | ------------------------------- | ----------- | --------------- |
| C100 | Législatives 2022 | 6 290            | 3 389 (53,9 %) | 823 (13,1 %)                    | 192 (3,1 %) | 993 (15,8 %)    |
| C101 | Législatives 2024 | 4 010            | 1 836 (45,8 %) | 1 020 (25,4 %)                  | 85 (2,1 %)  | 813 (20,3 %)    |
| C102 | Sénatoriales 2023 | 227              | 139 (61,2 %)   | 62 (27,3 %)                     | 1 (0,4 %)   | 19 (8,4 %)      |

| ID   | Chiffre                                                                     | Valeur   |
| ---- | --------------------------------------------------------------------------- | -------- |
| C103 | Dépenses retenues, législatives 2022 : médiane (5 161 comptes avec montant) | 5 234 €  |
| C104 | Dépenses retenues, législatives 2024 : médiane (3 140 comptes)              | 5 126 €  |
| C105 | Dépenses retenues, sénatoriales 2023 : médiane (207 comptes)                | 11 711 € |
| C106 | Dépenses retenues, législatives 2024 : moyenne                              | 9 279 €  |
| C107 | Dépenses retenues, sénatoriales 2023 : moyenne                              | 13 619 € |

Réserves :

- Les pourcentages sont calculés sur les comptes recensés (la somme A + AR + R + DD est inférieure au total : le reste correspond à d'autres codes de la CNCCFP, composites, non détaillés dans la base : ARM, AD, HD, ARR, ARRR, ARRRM, AM, ARRM).
- **DD** est traduit « non déposé » dans la base. La signification exacte du code, et le fait qu'un candidat sous le seuil de 1 % des suffrages sans don n'a pas à déposer de compte, sont **à vérifier** avant d'écrire quoi que ce soit sur le non-dépôt. Ne jamais l'écrire comme une faute.
- Ne pas citer les valeurs maximales (une valeur aberrante de près de 10 millions d'euros apparaît en 2022 : donnée probablement erronée).
- La moyenne 2022 n'est pas citée (influencée par cette valeur) ; on cite les médianes.

## G. Parrainages présidentiels

| ID   | Chiffre                                                                                                                                       | Valeur                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| C110 | Parrainages validés, élection 2017 / dont rattachés à un élu de la base                                                                       | 14 296 / 7 836                                              |
| C111 | Parrainages validés, élection 2022 / dont rattachés à un élu de la base                                                                       | 13 377 / 11 816                                             |
| C112 | Parrainages 2022 donnés par un maire (fonction brute « Maire »)                                                                               | 8 677 (64,9 %)                                              |
| C113 | Parrainages 2022 par conseiller départemental (hommes et femmes)                                                                              | 1 589 (11,9 %)                                              |
| C114 | Parrainages 2022 par conseiller régional                                                                                                      | 1 088 (8,1 %)                                               |
| C115 | Parrainages 2022 par « maire délégué d'une commune associée ou déléguée »                                                                     | 342 (2,6 %)                                                 |
| C116 | Parrainages 2022 par député (hommes et femmes)                                                                                                | 530 (4,0 %)                                                 |
| C117 | Parrainages 2022 par sénateur                                                                                                                 | 191 (1,4 %)                                                 |
| C118 | Parrainages 2022 : plus grand nombre reçu par une même personne / deuxième                                                                    | 2 625 / 2 092 (sans nom : « le candidat le plus parrainé ») |
| C119 | Soutiens de parlementaires à une proposition de loi référendaire (RIP) : 2019 (aéroports de Paris) / 2023 (âge légal de départ à la retraite) | 248 / 244                                                   |

Réserves : contrôle du 9 novembre 2026 : aucun doublon dans les 13 377 lignes de 2022, l'écart de 50 avec le chiffre publié reste inexpliqué. Les lignes « RIP » ne portent que sur des parlementaires ; les totaux officiels sont à recouper (C119). La base contient aussi les parrainages de personnes qui n'ont pas atteint le seuil de 500 présentations et n'ont donc pas été candidates. Le Conseil constitutionnel a publié 13 427 parrainages en 2022 ; la base en compte 13 377 (écart de 50 : à expliquer ou à citer comme « plus de 13 000 »). Aucun nom de candidat dans le livre : on parle de « candidat » ou « candidate » sans le nommer.

## H. Transparence communale (MaDada)

| ID   | Chiffre                                                                                                                   | Valeur                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| C120 | Demandes d'accès à des documents administratifs adressées à des mairies via MaDada, du 2 novembre 2019 au 8 novembre 2026 | 38 210                     |
| C121 | Communes ayant reçu au moins une demande via MaDada                                                                       | 32 832 sur 34 824 (94,3 %) |

Réserve : MaDada n'est pas un échantillon représentatif : c'est une plateforme citoyenne. Dire « demandes passant par MaDada ». Le total de communes avec au moins une demande est surprenant (94 %) : **à recouper** (le jeu de données inclut peut-être des communes avec des demandes agrégées). À ne pas publier tel quel avant contrôle.

## Chiffres officiels hors base (à reprendre uniquement s'ils sont vérifiés)

Ces valeurs viennent de la loi et sont à contrôler à la source avant impression ; elles ne sont pas dans la base :

- Durée des mandats : maire 6 ans ; député 5 ans ; sénateur 6 ans ; eurodéputé 5 ans ; conseiller départemental et régional 6 ans.
- 577 députés. Sénat : le nombre de sièges légal est à confirmer (la base compte 350 mandats actifs : écart à expliquer, remplacements ou doublons). 81 eurodéputés français depuis 2024 (la base en compte 82 actifs : à expliquer).
- Parrainages : 500 présentations, venant d'au moins 30 départements ou collectivités d'outre-mer, avec au plus un dixième d'un même département.

## Requêtes de référence

Les requêtes utilisées sont simples (agrégats sur `mandates`, `officials`, `staffers`, `sponsorships`, `campaign_accounts`, `parliamentary_activity`, `ballots`, `interests`, `legislative_elections`, `municipal_elections`, `senatorial_elections`). Pour tout recalcul au moment de la mise à jour : utiliser le même filtre « mandat actif » (`end_date is null or end_date > now()`) et une lecture seule.
