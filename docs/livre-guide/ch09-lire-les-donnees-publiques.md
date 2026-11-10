# Chapitre 9. Lire les données publiques : mode d'emploi et pièges

Vous lisez un chiffre sur les élus : une participation, un nombre de mandats, un délai. D'où vient-il ? Qui l'a calculé, et à quelle date ? Ce chapitre ne contient presque aucune règle de droit. C'est un chapitre de méthode : cinq questions à poser à n'importe quel chiffre, les erreurs les plus fréquentes, et une fiche de lecture à garder.

## 1. D'où viennent les données sur les élus ?

On parle de **données ouvertes** (en anglais, _open data_) quand une administration publie ses données dans un format qu'un ordinateur sait lire, gratuitement, avec le droit pour tous de les réutiliser. Ce sont des tableaux bruts, de plusieurs milliers de lignes, que chacun peut recalculer.

Les chiffres de ce livre viennent de sept producteurs publics.

- **L'Assemblée nationale** publie les députés, leurs mandats, les scrutins publics, les questions écrites et orales, et les collaborateurs déclarés.
- **Le Sénat** publie des données comparables pour les sénateurs, ainsi que les résultats des élections sénatoriales.
- **Le Parlement européen** publie la liste de ses membres.
- **La Haute Autorité pour la transparence de la vie publique** (HATVP) publie les déclarations d'intérêts et d'activités de certains responsables publics.
- **La Commission nationale des comptes de campagne et des financements politiques** (CNCCFP) publie, sur la plateforme data.gouv.fr, les décisions sur les comptes de campagne.
- **Le ministère de l'Intérieur** publie les résultats électoraux et le Répertoire national des élus (RNE), qui recense les élus locaux.
- **Le Conseil constitutionnel** publie la liste des parrainages des élections présidentielles.

Un huitième acteur, hors administration, apparaît au chapitre 6 : la plateforme citoyenne MaDada. Ses statistiques décrivent ce que ses utilisateurs ont demandé, pas toute la population.

Ces données sont le plus souvent diffusées sous la Licence Ouverte 2.0, conçue pour l'administration française. Elle autorise à copier, modifier et republier les données, y compris à des fins commerciales. En contrepartie, elle impose de citer la source et la date de la dernière mise à jour : chaque chiffre de ce livre porte donc sa source et sa date. Les parrainages du Conseil constitutionnel sont indiqués en domaine public, sans obligation de citation ; nous la respectons tout de même.

> **Ce que dit la loi** — Selon l'article L. 321-1 du code des relations entre le public et l'administration, dans sa rédaction issue de la loi du 7 octobre 2016 pour une République numérique, les informations publiques contenues dans des documents communiqués ou publiés par les administrations peuvent être utilisées par toute personne qui le souhaite, dans les limites fixées par le même titre du code (données personnelles, par exemple). La Licence Ouverte 2.0 fixe les conditions pratiques : indiquer la source et la date de mise à jour.

Une donnée ouverte n'est ni complète ni parfaite : elle a été produite pour une raison administrative (organiser un scrutin, constater des comptes) et non pour répondre à votre question.

## 2. Cinq questions à poser à tout chiffre

Un chiffre isolé n'a pas de sens. Il en prend un quand on sait de quand il date, de qui il parle, d'où il vient, ce qu'il mesure et par rapport à quoi.

### Question 1. À quelle date ?

Un chiffre sur les élus est une photographie : il décrit un état à un jour donné. Les chiffres de ce livre sont photographiés au 9 novembre 2026.

La participation, c'est-à-dire la part des inscrits qui ont voté, était de 47,5 % au premier tour des législatives de 2022 et de 66,7 % en 2024. « La participation aux législatives est de 47,5 % » est exact pour 2022 et faux pour 2024.

> **Chiffres** — Participation au premier tour des élections législatives, métropole et outre-mer cumulées : 48,7 % en 2017, 47,5 % en 2022, 66,7 % en 2024. Aux municipales : 44,7 % en 2020, 57,1 % en 2026. Source : ministère de l'Intérieur, via data.gouv.fr et Elupedia, au 9 novembre 2026. Ces taux additionnent les résultats de chaque commune ; ils peuvent différer de quelques dixièmes de point des chiffres agrégés publiés par le ministère.

### Question 2. Sur quel périmètre ?

Le **périmètre** est l'ensemble des personnes ou des faits que le chiffre compte. Deux chiffres qui semblent se contredire s'accordent souvent une fois le périmètre précisé.

La base compte 89 284 fiches d'élus, actuels et anciens, et 73 649 élus ayant au moins un mandat actif au 9 novembre 2026. Les deux chiffres sont exacts.

La base ne contient pas les conseillers municipaux autres que les maires, soit plusieurs centaines de milliers d'élus. « Il y a 73 649 élus en France » serait donc faux. Le cumul des mandats en est sous-estimé : un élu qui est aussi conseiller municipal n'est pas compté comme cumulant.

> **Chiffres** — Fiches d'élus dans la base d'Elupedia, actuels et anciens : 89 284. Élus ayant au moins un mandat actif : 73 649. Périmètre : députés, sénateurs, eurodéputés, maires, conseillers départementaux, régionaux, communautaires, d'arrondissement, membres des assemblées à statut particulier et conseillers des Français de l'étranger ; hors conseillers municipaux autres que les maires. Source : Assemblée nationale, Sénat, Parlement européen et ministère de l'Intérieur, via Elupedia, au 9 novembre 2026.

### Question 3. Quelle source ?

Un même fait peut être compté par deux organismes, chacun avec sa méthode. Il faut savoir lequel parle, et s'il parle de première main.

Exemple : les parrainages de l'élection présidentielle de 2022. Le Conseil constitutionnel a publié 13 427 parrainages ; la base d'Elupedia en compte 13 377, soit 50 de moins. Un contrôle du 9 novembre 2026 n'a trouvé aucun doublon dans ces lignes ; l'écart reste inexpliqué. Quand deux chiffres divergent, celui du producteur fait référence, avec sa date. À défaut d'explication, on écrit « plus de 13 000 parrainages », vrai pour les deux. Le fichier contient aussi les parrainages de personnes qui n'ont pas atteint le seuil de présentations : son nombre de lignes n'est pas celui d'un candidat (chapitre 8). Un site qui republie un chiffre ne fait que le relayer : remontez au producteur.

### Question 4. Quelle définition ?

Un même mot peut recouvrir plusieurs réalités. Avant de comparer deux chiffres, vérifiez qu'ils emploient le mot de la même façon.

**« Actif ».** Dans ce livre, un mandat est actif s'il n'a pas de date de fin ou si sa date de fin est dans le futur. Avec « a siégé au cours de l'année », le nombre serait autre.

**« Mandat » ou « élu ».** La base compte 62 127 mandats de conseiller communautaire pour 62 123 personnes : quatre personnes ont deux mandats de ce type. Nous citons les personnes : 62 123.

**« Député ».** L'Assemblée compte 577 sièges. Au 9 novembre 2026, la base recense 565 députés actifs, pour 565 circonscriptions distinctes. Il manque donc 12 circonscriptions dans les données : sièges vacants ou lacune d'ingestion, ce que nous n'avons pas tranché. On écrit « 565 députés recensés », jamais « les 577 députés ».

**« Groupe ».** La composition des groupes parlementaires évolue : c'est un instantané, restitué en tableau daté. Pour le Sénat, le groupe est absent de la base pour 332 des 350 sénateurs : aucun chiffre sur les groupes du Sénat n'est utilisable.

> **Chiffres** — Mandats de conseiller communautaire actifs : 62 127, portés par 62 123 personnes. Députés actifs recensés : 565, pour 577 sièges. Sénateurs actifs recensés : 350. Source : Assemblée nationale, Sénat et ministère de l'Intérieur, via Elupedia, au 9 novembre 2026. Le nombre de sièges du Sénat et celui des eurodéputés français sont à confronter à la loi avant tout emploi.

### Question 5. Par rapport à quoi ? Le dénominateur

Un pourcentage est une fraction : au-dessus ce que l'on compte, au-dessous le **dénominateur**, l'ensemble auquel on rapporte. Changez le dénominateur, le pourcentage change de sens.

Les comptes de campagne en donnent un exemple. La CNCCFP rend une décision sur chaque compte : approuvé (A), approuvé après réformation (AR), rejeté (R), non déposé (DD, d'après la traduction de la base), ou d'autres codes composites. Les pourcentages ci-dessous sont calculés sur les comptes recensés, tous codes confondus. A, AR, R et DD ne font pas 100 % : les autres codes sont dans le total sans être détaillés. Comparer 53,9 % (2022) et 45,8 % (2024) sans le préciser ferait lire une évolution de comportement, alors que le nombre de comptes et la répartition des codes ont changé.

> **Chiffres** — Comptes de campagne recensés, législatives 2022 : 6 290, dont 3 389 approuvés (53,9 %), 823 approuvés après réformation (13,1 %), 192 rejetés (3,1 %). Législatives 2024 : 4 010, dont 1 836 approuvés (45,8 %), 1 020 approuvés après réformation (25,4 %), 85 rejetés (2,1 %). Pourcentages calculés sur les comptes recensés ; les autres codes composites ne sont pas détaillés. Source : CNCCFP, via data.gouv.fr et Elupedia, au 9 novembre 2026. Un compte rejeté ou non déposé est un constat administratif avec une cause réglementaire, détaillée au chapitre 7 ; il ne dit rien de la conduite d'une personne.

Le même piège guette les déclarations d'intérêts. Calculer « la part d'élus qui déclarent » est impossible ici. Le numérateur est incomplet : la base ne contient que les déclarations des députés, sénateurs et maires soumis à l'obligation, alors que la HATVP en publie davantage. Le dénominateur est incertain : nous n'avons pas le nombre exact de personnes soumises à l'obligation. Sans dénominateur, on ne donne pas de pourcentage.

> **Chiffres** — Élus ayant au moins une ligne de déclaration d'intérêts dans la base : 1 395. Source : HATVP, via Elupedia, au 9 novembre 2026. Ce nombre ne se rapporte à aucun total.

## 3. Les pièges classiques

### Les homonymes et le rattachement par le nom

Entre un fichier de parrainages et un fichier d'élus, il n'existe pas toujours d'identifiant partagé : on rapproche les noms, les prénoms et les fonctions. Cette méthode relie parfois deux personnes différentes qui portent le même nom, ou manque une personne dont le nom est écrit autrement (accents, tirets, prénom usuel).

Une part des lignes reste donc sans rattachement. Pour 2017, 14 296 parrainages sont validés, dont 7 836 rattachés à un élu de la base, un peu plus d'un sur deux (54,8 %). Pour 2022, 13 377 parrainages, dont 11 816 rattachés, près de neuf sur dix (88,3 %). L'écart entre les deux années n'est pas expliqué dans la documentation du projet. Une hypothèse est qu'il tient aux données disponibles et à la qualité du rapprochement ; elle n'a pas été vérifiée. Les parts par type d'élu du chapitre 8 portent sur les parrainages rattachés ou sur la fonction déclarée par le parrain, avec ses libellés bruts.

### Les retards de publication

Une déclaration déposée n'est pas encore publiée : l'autorité vérifie, puis met en ligne. Dans la base, 189 élus ont une déclaration déposée mais pas encore publiée (statut « en attente »). Une absence de ligne peut donc signifier « rien déclaré », « déclaré mais pas encore publié » ou « hors du périmètre de la base », trois cas qui ne se distinguent pas toujours.

### Les données absentes

Une donnée peut être absente parce qu'elle n'existe pas, ou parce que le producteur ne l'a pas fournie : dans le second cas, on ne peut rien conclure. Le sexe des candidats aux sénatoriales de 2026 n'est pas renseigné dans la base : aucune statistique de parité sénatoriale n'en sort. Une case vide n'est pas un zéro : la remplacer par « non » fabriquerait des chiffres.

### Le biais de survie

Le **biais de survie** apparaît quand on calcule une moyenne seulement sur les cas arrivés au bout d'un processus, en excluant les autres sans le dire.

Les questions écrites en sont un exemple. Une question écrite est une question qu'un parlementaire adresse par écrit au gouvernement, qui y répond par écrit. Les délais de réponse de l'Assemblée (encadré ci-dessous) ne portent que sur les questions déjà répondues. Celles qui attendent encore en sont exclues, alors que leur délai court toujours : les délais réels sont plus longs. Parmi elles figurent des questions très récentes, retirées ou devenues caduques à la fin d'une législature. On ne parle donc pas de « taux de réponse du gouvernement ».

> **Chiffres** — Questions écrites posées à l'Assemblée du 1er octobre 2024 au 3 novembre 2026 : 17 367, dont 11 153 répondues (64,2 %). Délai de réponse, sur les seules questions répondues : 158 jours en moyenne, 126 jours en médiane ; 1 988 réponses (17,8 %) dans les 60 jours. Source : Assemblée nationale, via Elupedia, au 9 novembre 2026. Les délais sous-estiment le délai réel, car les questions sans réponse sont exclues du calcul.

### Une base incomplète : le cas des motions de censure

Notre propre base présente un défaut de ce genre. Entre le 8 octobre 2024 et le 25 février 2026, elle enregistre 15 motions de censure : 8 au titre de l'article 49, alinéa 2, de la Constitution, et 7 au titre de l'alinéa 3. Toutes sont marquées « rejetée ».

Or la motion du 4 décembre 2024 a été adoptée, et elle n'y figure pas. Le contrôle du 9 novembre 2026 montre que le défaut dépasse cette motion : la base ne compte que 22 scrutins en décembre 2024, contre 118 à 209 pour chacun des autres mois d'octobre 2024 à mars 2025. Tout le mois est incomplet. Les 15 motions ne forment donc pas un total, il serait faux d'écrire qu'aucune n'a été adoptée, et le total de 6 306 scrutins enregistrés du 8 octobre 2024 au 4 novembre 2026 est sous-évalué. Le tableau paraît cohérent : on découvre le défaut en le comparant à une source indépendante, ici le site de l'Assemblée. Un jeu de données peut être propre et pourtant incomplet. Pour les règles (majorité requise, effets d'une motion adoptée), ce livre renvoie à la Constitution et non à la base.

> **Chiffres** — Scrutins publics de l'Assemblée enregistrés dans la base du 8 octobre 2024 au 4 novembre 2026 : 6 306, dont 15 motions de censure. Décembre 2024 : 22 scrutins, contre 118 à 209 pour les autres mois d'octobre 2024 à mars 2025. Source : Assemblée nationale, via Elupedia, au 9 novembre 2026. Base incomplète pour décembre 2024 : ces totaux sont sous-évalués.

> **Dans les données** — Quand un chiffre porte sur un événement rare et important (une motion adoptée, une démission), comparez-le à une liste de référence indépendante. L'absence d'un événement rare passe inaperçue.

## 4. Les valeurs aberrantes et pourquoi on cite des médianes

Une **valeur aberrante** est très éloignée des autres : un montant mal saisi, une virgule déplacée, un compte exceptionnel. Une seule suffit à déformer une moyenne.

La moyenne s'obtient en additionnant toutes les valeurs et en divisant par leur nombre. La médiane partage la série en deux moitiés : la moitié des valeurs est en dessous, l'autre au-dessus. Elle bouge à peine quand une valeur extrême apparaît ; la moyenne, si.

Pour les dépenses retenues aux législatives de 2024, la médiane est de 5 126 euros et la moyenne de 9 279 euros. Une moyenne supérieure à la médiane indique que quelques comptes dépensent nettement plus que la plupart.

Pour les législatives de 2022, le fichier contient une valeur manifestement erronée, sans commune mesure avec les autres. Nous ne la reproduisons pas et ne citons pas la moyenne de cette année-là, qu'elle fausse : seulement la médiane.

Les maxima et minima de personnes ne sont pas publiés : une valeur extrême désigne souvent une personne précise.

> **Chiffres** — Dépenses retenues, médiane : 5 234 euros aux législatives 2022 (5 161 comptes avec montant) ; 5 126 euros aux législatives 2024 (3 140 comptes) ; 11 711 euros aux sénatoriales 2023 (207 comptes). Moyennes : 9 279 euros (législatives 2024) et 13 619 euros (sénatoriales 2023). Source : CNCCFP, via data.gouv.fr et Elupedia, au 9 novembre 2026.

## 5. Comment vérifier soi-même

Trois gestes suffisent pour contrôler un chiffre.

**Retourner à la source officielle.** Trouvez le producteur nommé dans la source (Assemblée, Sénat, HATVP, CNCCFP, ministère de l'Intérieur, Conseil constitutionnel) et sa page d'origine. Vous pouvez le plus souvent y télécharger le fichier et compter avec un tableur. Si le chiffre ne s'y retrouve pas, regardez d'abord la date et le périmètre.

**Comparer deux sources.** Deux producteurs qui donnent le même ordre de grandeur renforcent la confiance. Un écart appelle une explication : date, périmètre, définition, méthode. S'il reste inexpliqué, comme pour les parrainages 2022, on le dit.

**Lire la définition publiée.** Les producteurs publient des notices : colonnes, codes, conventions de date, périodicité. Un code comme « DD » ou « AR » ne se devine pas. Si la notice manque ou si le sens reste douteux, abstenez-vous de conclure.

> **Ce que dit la loi** — Si un document administratif n'est pas en ligne, vous pouvez en principe en demander communication : le livre III du code des relations entre le public et l'administration prévoit un droit d'accès aux documents administratifs. Le chapitre 10 détaille la démarche.

## 6. Comment Elupedia procède, et votre fiche de lecture

### La méthode d'Elupedia

Elupedia rassemble des données publiques dans une base unique (PostgreSQL). Ce livre n'utilise pas les données de presse que la base collecte aussi. Sa méthode, d'après la documentation du projet, tient en cinq points.

- **Sources ouvertes.** Chaque script d'ingestion lit une source ouverte (fichier, API ou page web) et écrit en base. Les écritures sont idempotentes : rejouer un script ne crée pas de doublon.
- **Calendrier.** Un programme planifié par source, lancé selon le rythme de mise à jour de celle-ci. Les parrainages et les signatures de référendum d'initiative partagée, figés après coup, sont ingérés à la main, une fois.
- **Identification des personnes.** Une personne est reconnue d'abord par l'identifiant de sa source, sinon par son prénom, son nom et sa date de naissance, comparés sans tenir compte de la casse, des accents ni des tirets. Les sources du RNE et les résultats électoraux n'ont que le nom et le prénom : les homonymes stricts restent un risque connu.
- **Contrôles et corrections manuelles.** Un outil rattache les candidats et les parrainages aux élus et marque ceux qu'il ne sait pas départager comme « ambigus » ; ils se règlent dans l'interface d'administration, qui permet aussi de fusionner des fiches en double. Un contrôle de cohérence en lecture seule recherche des anomalies, comme des mandats qui se recoupent.
- **Date.** Chaque chiffre du livre est daté et l'état de la base est figé au 9 novembre 2026. Quand les données changent, le chiffre change, pas le livre.

Ses limites sont connues : décembre 2024 incomplet, groupes du Sénat et sexe des candidats absents, « actif » dépendant de dates de fin parfois non mises à jour.

### Votre fiche de lecture

Appliquez cette fiche à n'importe quel chiffre sur les élus, y compris ceux de ce livre.

1. **Date.** À quel jour ce chiffre se rapporte-t-il ? Quand le fichier a-t-il été mis à jour ?
2. **Périmètre.** Qui est compté, et qui ne l'est pas ?
3. **Source.** Qui a produit le chiffre ? Le producteur d'origine ou un relais ?
4. **Définition.** Que signifient les mots employés (actif, mandat, groupe, déposé) ?
5. **Dénominateur.** Par rapport à quoi le pourcentage est-il calculé ? Le total est-il connu ?
6. **Valeurs manquantes et retards.** Une case vide est-elle un zéro, un retard ou une absence de donnée ?
7. **Moyenne ou médiane.** Une valeur extrême peut-elle fausser le résultat ?
8. **Vérification.** Peut-on retrouver le chiffre à la source, ou le comparer à une autre ?

Si une question reste sans réponse, le chiffre n'est pas faux pour autant, mais il ne doit pas être répété comme un fait établi.

> **À retenir**
>
> - Un chiffre sur les élus n'a de sens qu'avec sa date, son périmètre, sa source, sa définition et son dénominateur.
> - Une base peut être propre et pourtant incomplète : comparez les faits rares à une source indépendante, et préférez les médianes aux moyennes.
> - Une absence n'est pas un zéro : quand une donnée manque, on le dit au lieu de calculer.

## Pour aller plus loin

- data.gouv.fr, plateforme ouverte des données publiques françaises : pages « jeux de données » des producteurs cités (Assemblée nationale, Sénat, CNCCFP, ministère de l'Intérieur, Conseil constitutionnel).
- Haute Autorité pour la transparence de la vie publique, site hatvp.fr : rubrique consacrée aux données ouvertes (open data).
- Commission d'accès aux documents administratifs, site cada.fr : page sur le droit d'accès aux documents administratifs.

## Notes de vérification (hors livre)

### Affirmations juridiques et institutionnelles

| Affirmation                                                                                                                        | Verdict                                                                                                        | Source et date                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. L. 321-1 du CRPA : toute personne peut utiliser les informations publiques des documents communiqués ou publiés ; loi de 2016 | Corrigé (la mention d'une obligation de mise en ligne par défaut, L. 312-1-1, est retirée du texte)            | legifrance.gouv.fr/codes/article_lc/LEGIARTI000033219044, 2026-11-09                                                                                                  |
| Licence Ouverte 2.0 : citer la source et la date de dernière mise à jour                                                           | Confirmé                                                                                                       | data.gouv.fr/pages/legal/licences/etalab-2.0 et texte Etalab de la licence, 2026-11-09                                                                                |
| Licence Ouverte 2.0 : réutilisation commerciale permise                                                                            | Non vérifiable (non lu dans le texte lors de la recherche)                                                     | -                                                                                                                                                                     |
| Parrainages 2022 : 13 427 validés, licence « domaine public », liste du Conseil constitutionnel en open data                       | Confirmé (13 672 reçus, 13 427 validés, dernière publication le 7 mars 2022)                                   | presidentielle2022.conseil-constitutionnel.fr/les-parrainages/tous-les-parrainages-valides.html ; data.gouv.fr (jeu « Parrainages… présidentielle 2022 »), 2026-11-09 |
| Motion de censure du 4 décembre 2024 adoptée (art. 49, al. 3)                                                                      | Confirmé (331 voix pour 288 requises)                                                                          | assemblee-nationale.fr, actualité « Adoption d'une motion de censure : le PLFSS 2025 est rejeté… », 2026-11-09                                                        |
| HATVP publie les déclarations en open data, en application des lois du 11 octobre 2013                                             | Confirmé (formule « certains responsables publics » conservée)                                                 | hatvp.fr/open-data/, 2026-11-09                                                                                                                                       |
| RNE : répertoire du ministère de l'Intérieur, élus locaux, sous Licence Ouverte 2.0                                                | Confirmé (aussi députés et sénateurs)                                                                          | data.gouv.fr/datasets/repertoire-national-des-elus-1, 2026-11-09                                                                                                      |
| Droit d'accès aux documents administratifs : livre III du CRPA                                                                     | Confirmé (intitulé du livre III)                                                                               | legifrance.gouv.fr, Livre III du CRPA, 2026-11-09                                                                                                                     |
| Une question écrite : le gouvernement y répond par écrit                                                                           | Non vérifiable (règlement de l'Assemblée non consulté ; formule « doit y répondre » retirée, aucun délai cité) | -                                                                                                                                                                     |
| Sens du code DD et dispense de dépôt sous un seuil                                                                                 | Non vérifiable ; le texte dit seulement « d'après la traduction de la base »                                   | -                                                                                                                                                                     |

### Chiffres utilisés

C01, C02, C03, C08 (565 pour 577 sièges, 565 circonscriptions distinctes, 12 manquantes), C11 (350), C43, C44, C45, C47, C48, C72 (6 306), C73 (15 motions : 8 alinéa 2, 7 alinéa 3), C74 à C77, C90, C96 (189), C100, C101, C103 à C107, C110, C111, plus les chiffres sans identifiant de leurs réserves : 332 sénateurs sans groupe, 22 scrutins en décembre 2024 contre 118 à 209 les autres mois d'octobre 2024 à mars 2025, 13 427 parrainages publiés en 2022. Dérivés : 7 836 sur 14 296 = 54,8 % ; 11 816 sur 13 377 = 88,3 % (arithmétique contrôlée ; calculs de l'auteur, non repris de `02-chiffres.md`). Participation 2017 à 2026 : somme de lignes communales, à vérifier ligne par ligne (réserve de `02-chiffres.md`).

### Points sensibles

- Décembre 2024 : la base est incomplète pour tout le mois (22 scrutins), pas seulement pour une motion. Mention de la motion du 4 décembre 2024 sans nom ni commentaire politique.
- Écart de rattachement 2017 / 2022 : l'explication (données disponibles, qualité du rapprochement) est une hypothèse, signalée comme telle dans le texte ; aucune documentation du projet ne l'établit.
- Méthode d'Elupedia : décrite à partir de `docs/ARCHITECTURE.md`, `docs/INGEST.md` et `docs/INGESTION-SCHEDULE.md` seulement (idempotence, calendrier par source, parrainages ingérés à la main, identification des personnes, outil `reconcile` et statut « ambigus », fusion de fiches, `check:coherence` en lecture seule). L'ancienne mention d'un « canal de signalement d'erreurs » est retirée : ces documents n'en décrivent pas. L'interface d'administration (pages Rattachements, fusions) est citée d'après `docs/ARCHITECTURE.md` et `docs/INGEST.md`.
- Comptes de campagne : « rejeté » et « non déposé » présentés comme constats administratifs ; code DD non expliqué.
- Valeur aberrante 2022, maxima, minima et moyenne 2022 non cités. Aucun nom de personne ni de commune.

### Manques

- Pas de chiffre sur la fraîcheur des sources (date de dernière mise à jour par producteur).
- Écarts non expliqués : 50 parrainages 2022 (13 427 contre 13 377), 12 circonscriptions de députés, sièges du Sénat, eurodéputés (82 contre 81).
- C120 et C121 (MaDada) non repris.
