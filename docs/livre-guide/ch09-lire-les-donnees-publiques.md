# Chapitre 9. Lire les données publiques : mode d'emploi et pièges

Vous lisez un chiffre sur les élus : une participation, un nombre de mandats, un délai. D'où vient-il ? Qui l'a calculé, et à quelle date ? Ce chapitre ne contient presque aucune règle de droit. C'est le chapitre de méthode : il vous donne cinq questions à poser à n'importe quel chiffre, les erreurs les plus fréquentes, et une fiche de lecture à garder.

## 1. D'où viennent les données sur les élus ?

On parle de **données ouvertes** (en anglais, _open data_) quand une administration publie ses données dans un format qu'un ordinateur sait lire, gratuitement, et autorise tout le monde à les réutiliser. Ce n'est pas un document de synthèse : ce sont des tableaux bruts, souvent de plusieurs milliers de lignes, que chacun peut recalculer.

Les chiffres de ce livre viennent de sept producteurs publics.

- **L'Assemblée nationale** publie les députés, leurs mandats, les scrutins publics, les questions écrites et orales, et les collaborateurs déclarés.
- **Le Sénat** publie des données comparables pour les sénateurs, ainsi que les résultats des élections sénatoriales.
- **Le Parlement européen** publie la liste de ses membres.
- **La Haute Autorité pour la transparence de la vie publique** (HATVP) publie les déclarations d'intérêts et d'activités de certains responsables publics.
- **La Commission nationale des comptes de campagne et des financements politiques** (CNCCFP) publie, via la plateforme data.gouv.fr, les décisions sur les comptes de campagne.
- **Le ministère de l'Intérieur** publie les résultats électoraux et le Répertoire national des élus (RNE), qui recense les élus locaux.
- **Le Conseil constitutionnel** publie la liste des parrainages des élections présidentielles.

Un huitième acteur, hors administration, apparaît au chapitre 6 : la plateforme citoyenne MaDada, qui compte des demandes d'accès à des documents administratifs. Ses statistiques ne représentent pas toute la population : elles décrivent ce que ses utilisateurs ont demandé.

Le plus souvent, ces données sont diffusées sous la **Licence Ouverte 2.0**, une licence conçue pour l'administration française. Elle vous autorise à copier, modifier, vendre et republier les données, y compris à des fins commerciales. En contrepartie, elle impose de **citer la source** et de **mentionner la date de la dernière mise à jour**. C'est la raison pour laquelle chaque chiffre de ce livre porte sa source et sa date. Une exception : les parrainages du Conseil constitutionnel relèvent du domaine public, sans obligation de citation, que nous respectons tout de même.

> **Ce que dit la loi** — Depuis la loi du 7 octobre 2016 pour une République numérique, les administrations doivent en principe mettre en ligne leurs documents administratifs sous forme électronique, et la réutilisation des informations publiques est en principe libre, sous réserve des données personnelles et de quelques autres exceptions. La Licence Ouverte 2.0 précise les conditions de cette réutilisation : indiquer la source et la date de mise à jour.

Une donnée ouverte n'est pas une donnée complète ni une donnée parfaite. Elle a été produite pour une raison administrative (organiser un scrutin, constater des comptes, tenir un répertoire) et non pour répondre à votre question. Il faut donc apprendre à la lire.

> **Dans les données** — Chaque jeu de données porte, sur la plateforme de son producteur, une page de description. Elle indique le producteur, la licence, la date de dernière mise à jour et, souvent, un dictionnaire des colonnes. C'est la première chose à lire, avant même le tableau.

## 2. Cinq questions à poser à tout chiffre

Un chiffre isolé n'a pas de sens. Il en acquiert un quand on sait de quand il date, de qui il parle, d'où il vient, ce qu'il mesure et par rapport à quoi. Cela donne cinq questions.

> **Figure à produire** — Schéma en cinq cases alignées (Date ? Périmètre ? Source ? Définition ? Dénominateur ?), chacune reliée à un exemple chiffré tiré de ce chapitre. Données : exemples cités dans les encadrés du chapitre. Source : Elupedia, au 9 novembre 2026.

### Question 1. À quelle date ?

Les données vivent. Un chiffre sur les élus est une photographie : il décrit un état à un jour donné, et ce jour change tout. Les chiffres de ce livre sont photographiés **au 9 novembre 2026**.

Prenons la participation, c'est-à-dire la part des inscrits qui ont voté. Au premier tour des élections législatives, elle était de 47,5 % en 2022 et de 66,7 % en 2024. Dire « la participation aux législatives est de 47,5 % » est exact pour 2022 et faux pour 2024. Sans la date, le chiffre ne dit rien.

> **Chiffres** — Participation au premier tour des élections législatives, métropole et outre-mer cumulées : 48,7 % en 2017, 47,5 % en 2022, 66,7 % en 2024. Aux municipales : 44,7 % en 2020, 57,1 % en 2026. Source : ministère de l'Intérieur, via data.gouv.fr et Elupedia, au 9 novembre 2026. Ces taux sont calculés en additionnant les résultats de chaque commune ; ils peuvent différer de quelques dixièmes de point des chiffres agrégés publiés par le ministère.

Il y a une seconde date, moins visible : celle de la dernière mise à jour des données. Une liste publiée un jour peut ne pas refléter une démission survenue la veille.

### Question 2. Sur quel périmètre ?

Le **périmètre**, c'est l'ensemble des personnes ou des faits que le chiffre compte. Deux chiffres qui paraissent contradictoires s'accordent souvent une fois le périmètre précisé.

Dans la base d'Elupedia, il y a 89 284 fiches d'élus. Il y a aussi 73 649 élus ayant au moins un mandat actif. Les deux chiffres sont exacts. Le premier compte tous les élus de la base, actuels et anciens. Le second ne garde que ceux qui exercent un mandat au 9 novembre 2026. La différence est constituée en grande partie d'anciens élus.

Le périmètre peut aussi exclure des catégories entières. La base ne contient **pas les conseillers municipaux** autres que les maires, soit plusieurs centaines de milliers d'élus. Une phrase comme « il y a 73 649 élus en France » serait donc fausse : il s'agit des élus que la base recense, hors conseillers municipaux. Tout chiffre de cumul des mandats en subit l'effet : un élu qui est aussi conseiller municipal n'est pas compté comme cumulant, donc le cumul est sous-estimé.

> **Chiffres** — Fiches d'élus dans la base d'Elupedia, actuels et anciens : 89 284. Élus ayant au moins un mandat actif : 73 649. Périmètre : députés, sénateurs, eurodéputés, maires, conseillers départementaux, régionaux, communautaires, d'arrondissement, membres des assemblées à statut particulier et conseillers des Français de l'étranger ; hors conseillers municipaux autres que les maires. Source : Assemblée nationale, Sénat, Parlement européen et ministère de l'Intérieur, via Elupedia, au 9 novembre 2026.

### Question 3. Quelle source ?

Un même fait peut être compté par deux organismes, chacun avec sa méthode. Il faut savoir lequel parle, et s'il parle de première main.

Un exemple : les parrainages de l'élection présidentielle de 2022. Le Conseil constitutionnel a publié 13 427 parrainages. La base d'Elupedia en compte 13 377, soit 50 de moins. L'écart est petit, mais il existe, et il ne s'explique pas par une erreur que l'on pourrait corriger à coup sûr : il peut venir d'une date de téléchargement, d'un fichier révisé, d'un traitement différent des cas particuliers. Quand deux chiffres divergent, le plus proche du producteur fait référence, et on le cite avec sa date. À défaut d'explication, on écrit « plus de 13 000 parrainages », qui reste vrai pour les deux.

> **Dans les données** — Les parrainages ne sont pas seulement ceux des personnes devenues candidates : le fichier contient aussi ceux de personnes qui n'ont pas atteint le seuil de présentations nécessaire. Le nombre total de lignes n'est donc pas le nombre de parrainages d'un candidat donné. Voir le chapitre 8.

Remonter à la source primaire signifie rechercher le producteur d'origine : l'Assemblée pour ses scrutins, le Conseil constitutionnel pour ses parrainages, la CNCCFP pour ses décisions. Un site qui republie un chiffre n'est pas une source, c'est un relais.

### Question 4. Quelle définition ?

Un même mot peut recouvrir plusieurs réalités. Avant de comparer deux chiffres, vérifiez qu'ils emploient le mot de la même façon.

**« Actif ».** Dans ce livre, un mandat est actif s'il n'a pas de date de fin ou si sa date de fin est dans le futur. Une autre définition, par exemple « a siégé au cours de l'année », donnerait un autre nombre.

**« Mandat » ou « élu ».** La base compte 62 127 mandats de conseiller communautaire pour 62 123 personnes : quatre personnes ont deux mandats de ce type. Selon que l'on compte les mandats ou les personnes, le chiffre change. Nous citons ici les personnes : 62 123.

**« Député ».** L'Assemblée nationale compte 577 sièges. Au 9 novembre 2026, la base recense 565 députés actifs. L'écart a plusieurs explications possibles : des sièges non pourvus, des données pas encore actualisées. On écrit donc « 565 députés recensés », jamais « les 577 députés ».

**« Groupe ».** Les députés se regroupent par affinités politiques en groupes parlementaires. Cette composition évolue : elle est un instantané. Pour l'Assemblée, Elupedia la restitue en tableau daté. Pour le Sénat, le groupe est absent de la base pour 332 des 350 sénateurs : aucun chiffre sur les groupes du Sénat n'est donc utilisable ici.

> **Chiffres** — Mandats de conseiller communautaire actifs : 62 127, portés par 62 123 personnes. Députés actifs recensés : 565, pour 577 sièges. Sénateurs actifs recensés : 350. Source : Assemblée nationale, Sénat et ministère de l'Intérieur, via Elupedia, au 9 novembre 2026. Le nombre de sièges du Sénat et celui des eurodéputés français sont à confronter à la loi avant tout emploi.

> **Dans les données** — Le mot « actif » n'existe pas tel quel dans les fichiers des producteurs. Il est construit à partir d'une date de début et d'une date de fin de mandat. Une date de fin absente signifie « mandat en cours » ; une date de fin qui n'a jamais été renseignée après un départ signifie « mandat encore compté », à tort. C'est une source connue d'écarts, comme celui entre 565 et 577.

### Question 5. Par rapport à quoi ? Le dénominateur

Un pourcentage est une fraction. Au-dessus, ce que l'on compte ; au-dessous, le **dénominateur**, c'est-à-dire l'ensemble auquel on rapporte. Un pourcentage change de sens quand on change le dénominateur.

Les comptes de campagne illustrent le point. La CNCCFP rend une décision sur chaque compte : approuvé (A), approuvé après réformation (AR), rejeté (R), non déposé (DD, d'après la traduction de la base), et d'autres codes composites. Pour les législatives de 2022, on recense 6 290 comptes, dont 3 389 approuvés, soit 53,9 %. Pour 2024, on en recense 4 010, dont 1 836 approuvés, soit 45,8 %. Ces pourcentages sont calculés sur les **comptes recensés**, tous codes confondus. Les parts A, AR, R et DD ne s'additionnent pas à 100 %, car les autres codes sont comptés dans le total sans être détaillés. Comparer 53,9 % et 45,8 % sans cette précision conduirait à lire une évolution de comportement, alors que la répartition des codes et le nombre de comptes recensés ont changé.

> **Chiffres** — Comptes de campagne recensés, législatives 2022 : 6 290, dont 3 389 approuvés (53,9 %), 823 approuvés après réformation (13,1 %), 192 rejetés (3,1 %). Législatives 2024 : 4 010, dont 1 836 approuvés (45,8 %), 1 020 approuvés après réformation (25,4 %), 85 rejetés (2,1 %). Pourcentages calculés sur les comptes recensés ; les autres codes composites ne sont pas détaillés. Source : CNCCFP, via data.gouv.fr et Elupedia, au 9 novembre 2026. Un compte rejeté, ou non déposé, est un constat administratif avec une cause réglementaire, détaillée au chapitre 7 ; il ne dit rien de la conduite d'une personne.

Le même piège guette les déclarations d'intérêts. La base compte 1 395 élus ayant au moins une ligne de déclaration d'intérêts. Il serait tentant d'en tirer « la part d'élus qui déclarent ». **Ce calcul est impossible ici**, pour deux raisons. Le numérateur est incomplet : la base ne contient que les déclarations de certaines catégories d'élus, alors que la HATVP en publie davantage. Le dénominateur est incertain : il faudrait connaître le nombre exact de personnes soumises à l'obligation, ce que ni la base ni cette page ne donnent. Quand le dénominateur manque, la bonne réponse est de ne pas donner de pourcentage.

> **Chiffres** — Élus ayant au moins une ligne de déclaration d'intérêts dans la base : 1 395. Source : HATVP, via Elupedia, au 9 novembre 2026. Ce nombre ne se rapporte à aucun total : la base ne contient que les déclarations des députés, sénateurs et maires soumis à l'obligation, et la HATVP en publie davantage.

## 3. Les pièges classiques

Les cinq questions détectent la plupart des erreurs. Reste une série de pièges plus techniques, que l'on rencontre dans presque toutes les bases de données publiques.

### Les homonymes et le rattachement par le nom

Pour relier deux fichiers, on cherche une clé commune. Entre un fichier de parrainages et un fichier d'élus, il n'existe pas toujours d'identifiant partagé : on rapproche alors les noms, les prénoms et les fonctions. Cette méthode se trompe de deux façons : elle relie deux personnes différentes qui portent le même nom, ou elle manque une personne dont le nom est écrit autrement (accents, tirets, prénom usuel).

Résultat : une part des lignes reste sans rattachement. Pour l'élection de 2017, 14 296 parrainages sont validés, dont 7 836 rattachés à un élu de la base, un peu plus d'un sur deux. Pour 2022, 13 377 parrainages, dont 11 816 rattachés, près de neuf sur dix. L'écart entre ces deux années tient aux données disponibles et à la qualité du rapprochement ; il ne dit rien de la population des parrains. Les parts par type d'élu du chapitre 8 portent donc sur les parrainages rattachés ou sur leur fonction déclarée, et on le précise à chaque fois.

> **Dans les données** — Le champ « fonction » d'un parrainage est celui que le parrain a déclaré, avec ses libellés bruts. Un libellé comme « maire délégué d'une commune associée ou déléguée » est distinct du libellé « maire » : deux lignes, deux catégories, alors qu'une personne peut relever des deux. Avant de regrouper des fonctions, lisez la liste des libellés.

### Les retards de publication

Une déclaration déposée n'est pas encore publiée : l'autorité vérifie, puis met en ligne. Dans la base, 189 élus ont une déclaration déposée mais pas encore publiée (statut « en attente »). Ils ne sont pas dans les comptes de lignes publiées. Une absence de ligne peut donc signifier « rien déclaré », « déclaré mais pas encore publié » ou « hors du périmètre de la base ». Ces trois cas ne se distinguent pas toujours à l'œil.

### Les données absentes

Une donnée peut être absente parce qu'elle n'existe pas, ou parce que le producteur ne l'a pas fournie. Dans le second cas, on ne peut rien conclure.

Deux exemples. Le sexe des candidats aux élections sénatoriales de 2026 n'est pas renseigné dans la base : aucune statistique de parité sénatoriale ne peut en être tirée. Et le groupe politique est absent de la base pour 332 des 350 sénateurs : on ne publie pas de composition du Sénat par groupe.

Règle de lecture : une case vide n'est pas un zéro. Si l'on remplaçait les cases vides par « non », on fabriquerait des chiffres.

### Le biais de survie

Le **biais de survie** apparaît quand on calcule une moyenne seulement sur les cas arrivés au bout d'un processus, et que les autres sont exclus sans le dire.

Les questions écrites en donnent un exemple. Une question écrite est une question qu'un parlementaire adresse par écrit au gouvernement, qui doit y répondre. Entre le 1er octobre 2024 et le 3 novembre 2026, 17 367 questions écrites ont été posées à l'Assemblée. Au moment de la lecture, 11 153 avaient reçu une réponse, soit 64,2 %. Parmi les questions répondues, le délai moyen est de 158 jours et le délai médian de 126 jours ; 1 988 réponses, soit 17,8 %, ont été données dans les 60 jours.

Ces délais ne portent que sur les questions **déjà répondues**. Les questions encore sans réponse en sont exclues, alors qu'elles ont, elles aussi, un délai en cours. Les délais réels sont donc plus longs que ceux calculés. Parmi les questions sans réponse figurent des questions très récentes, des questions retirées ou devenues caduques à la fin d'une législature : ce sont des situations différentes. Pour cette raison, on ne parle pas ici d'un « taux de réponse du gouvernement ».

> **Chiffres** — Questions écrites posées à l'Assemblée du 1er octobre 2024 au 3 novembre 2026 : 17 367, dont 11 153 répondues (64,2 %). Délai de réponse, sur les seules questions répondues : 158 jours en moyenne, 126 jours en médiane. Source : Assemblée nationale, via Elupedia, au 9 novembre 2026. Les délais sous-estiment le délai réel, car les questions encore sans réponse sont exclues du calcul.

### Une base incomplète : le cas des motions de censure

Un exemple honnête vaut mieux qu'un exemple flatteur. Entre le 8 octobre 2024 et le 25 février 2026, la base d'Elupedia enregistre 15 motions de censure : 8 déposées au titre de l'article 49, alinéa 2, de la Constitution, et 7 au titre de l'alinéa 3. Toutes sont marquées « rejetée ».

Or une motion déposée fin 2024 a été adoptée, et elle n'est pas dans la base. Nous l'avons constaté en recoupant avec les sources officielles. Les 15 motions de la base ne forment donc pas un total, et il serait faux d'écrire qu'aucune n'a été adoptée. Ce défaut ne se voit pas dans les données elles-mêmes : le tableau paraît cohérent. Il se découvre en rapprochant le tableau d'une source indépendante.

La leçon vaut pour toute base, y compris la nôtre : un jeu de données peut être propre, bien formaté, et pourtant incomplet. Pour les règles (majorité requise, effets d'une motion adoptée), ce livre renvoie à la Constitution et non à la base.

> **Dans les données** — Quand un chiffre porte sur un événement important et rare (une motion adoptée, une démission), comparez-le toujours à une liste de référence indépendante, comme le site de l'assemblée concernée. Les événements rares sont ceux dont l'absence passe inaperçue.

## 4. Les valeurs aberrantes et pourquoi on cite des médianes

Une **valeur aberrante** est une valeur très éloignée des autres : un montant mal saisi, une virgule déplacée, un compte exceptionnel. Une seule suffit à déformer une moyenne.

La **moyenne** s'obtient en additionnant toutes les valeurs et en divisant par leur nombre. La **médiane** est la valeur qui partage la série en deux moitiés : la moitié des valeurs est en dessous, l'autre au-dessus. La médiane ne bouge presque pas quand une valeur extrême apparaît ; la moyenne, si.

Les dépenses retenues dans les comptes de campagne en donnent une illustration. Pour les législatives de 2024, la médiane est de 5 126 euros et la moyenne de 9 279 euros. Pour les sénatoriales de 2023, la médiane est de 11 711 euros et la moyenne de 13 619 euros. Une moyenne supérieure à la médiane indique que quelques comptes dépensent nettement plus que la plupart.

Pour les législatives de 2022, le fichier contient une valeur manifestement erronée, sans commune mesure avec toutes les autres. Nous ne la reproduisons pas, et nous ne citons pas la moyenne de cette année-là, qu'elle fausse. Nous citons la médiane : 5 234 euros pour 5 161 comptes avec un montant.

Pour la même raison, les maxima et minima de personnes ne sont pas publiés : une valeur extrême désigne souvent une personne précise, et c'est une donnée personnelle que l'on peut éviter. Un agrégat comme la médiane ou une tranche d'âge est à la fois plus fiable et plus respectueux.

> **Chiffres** — Dépenses retenues, médiane : 5 234 euros aux législatives 2022 (5 161 comptes avec montant) ; 5 126 euros aux législatives 2024 (3 140 comptes) ; 11 711 euros aux sénatoriales 2023 (207 comptes). Moyennes : 9 279 euros (législatives 2024) et 13 619 euros (sénatoriales 2023). Source : CNCCFP, via data.gouv.fr et Elupedia, au 9 novembre 2026.

## 5. Comment vérifier soi-même

Vous n'avez pas besoin d'être statisticien pour contrôler un chiffre. Trois gestes suffisent.

**Retourner à la source officielle.** Cherchez le producteur nommé dans la source (Assemblée, Sénat, HATVP, CNCCFP, ministère de l'Intérieur, Conseil constitutionnel) et retrouvez la page d'origine. Sur le site d'un producteur, vous pouvez le plus souvent télécharger le fichier et compter vous-même, avec un tableur, ce qui est compté. Si le chiffre que l'on vous a donné ne s'y retrouve pas, ce n'est pas forcément une erreur : voyez d'abord la date et le périmètre.

**Comparer deux sources.** Deux producteurs différents qui donnent le même ordre de grandeur renforcent la confiance. Un écart appelle une explication : date, périmètre, définition, méthode. Le cas des parrainages 2022, avec 13 427 contre 13 377, montre qu'un petit écart peut rester inexpliqué : on le dit.

**Lire la définition publiée.** Les producteurs publient des notices : colonnes, codes, conventions de date, périodicité. Un code comme « DD » ou « AR » ne se devine pas : il se lit dans la notice. Si la notice manque, ou si vous n'êtes pas sûr du sens, abstenez-vous de conclure.

> **Ce que dit la loi** — Les décisions de la CNCCFP sur les comptes de campagne, les déclarations déposées auprès de la HATVP, les résultats électoraux et les parrainages présidentiels sont publiés en application de textes spécifiques. En principe, vous pouvez en demander communication si un document n'est pas en ligne. Les modalités sont fixées par le code des relations entre le public et l'administration, qui prévoit un droit d'accès aux documents administratifs. Le chapitre 10 détaille la démarche.

## 6. Comment Elupedia procède, et votre fiche de lecture

### La méthode d'Elupedia

Elupedia est une encyclopédie ouverte des élus français. Elle reprend des données publiques et les rassemble dans une base unique. Voici sa méthode, en cinq points.

- **Sources.** Uniquement des données publiques sous licence ouverte, listées en fin de livre. Pas de donnée de presse dans ce livre.
- **Mises à jour automatiques.** Des programmes d'ingestion lisent régulièrement les sources officielles et mettent la base à jour. Chaque programme peut être relancé sans créer de doublons.
- **Corrections manuelles.** Une interface d'administration permet de modérer : rattachements manquants, doublons de fiches, anomalies relevées par les contrôles de cohérence. Les contrôles recherchent, par exemple, des mandats qui se recoupent.
- **Mention de la date.** Chaque chiffre du livre est daté, et l'état de la base figé au 9 novembre 2026. Quand les données changent, le chiffre change, mais pas le livre : c'est la date qui permet de le savoir.
- **Signalement d'erreurs.** Une erreur repérée peut être signalée au projet, qui la corrige à la source de l'erreur (donnée, rattachement ou programme) et non seulement dans l'affichage.

Les limites sont dites : une base incomplète sur les motions de censure, des groupes du Sénat absents, un sexe des candidats absent, une définition de « actif » qui repose sur des dates de fin parfois non mises à jour. Les connaître fait partie de la méthode.

### Votre fiche de lecture

Cette fiche tient en huit lignes. Appliquez-la à n'importe quel chiffre sur les élus, y compris ceux de ce livre.

1. **Date.** À quel jour ce chiffre se rapporte-t-il ? Quand le fichier a-t-il été mis à jour ?
2. **Périmètre.** Qui est compté, et qui ne l'est pas ? Y a-t-il une catégorie absente ?
3. **Source.** Qui a produit le chiffre ? Est-ce le producteur d'origine ou un relais ?
4. **Définition.** Que signifient exactement les mots employés (actif, mandat, groupe, déposé) ?
5. **Dénominateur.** Par rapport à quoi le pourcentage est-il calculé ? Le total est-il connu ?
6. **Valeurs manquantes et retards.** Une case vide est-elle un zéro, un retard ou une absence de donnée ?
7. **Moyenne ou médiane.** Une valeur extrême peut-elle fausser le résultat ?
8. **Vérification.** Peut-on retrouver le chiffre à la source, ou le comparer à une autre ?

Si l'une de ces questions reste sans réponse, le chiffre n'est pas faux pour autant. Mais il ne doit pas être répété comme un fait établi.

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

### Affirmations juridiques et institutionnelles (à vérifier)

- Loi n° 2016-1321 du 7 octobre 2016 pour une République numérique : ouverture par défaut des données publiques et réutilisation libre sous réserve des données personnelles (code des relations entre le public et l'administration, livre III, notamment les articles L. 312-1-1 et L. 321-1). Formule « en principe » volontairement prudente. À vérifier.
- Licence Ouverte 2.0 : obligation de mentionner la source et la date de dernière mise à jour ; réutilisation commerciale permise. À vérifier le texte exact de la licence sur le site d'Etalab.
- Parrainages du Conseil constitutionnel en « domaine public » (reprise de `03-sources-et-licences.md`) : à vérifier, ainsi que l'absence de condition de citation.
- Définition de la HATVP comme publiant les déclarations « de certains responsables publics » : formule volontairement large. À vérifier (loi du 11 octobre 2013 relative à la transparence de la vie publique).
- Motions de censure : article 49, alinéas 2 et 3, de la Constitution, cités comme simples références de classement de la base. Aucune règle de majorité n'est énoncée dans ce chapitre. À vérifier si une phrase est ajoutée.
- Droit d'accès aux documents administratifs : code des relations entre le public et l'administration, livre III (accès aux documents administratifs) ; CADA. À vérifier les références avant renvoi au chapitre 10.
- Définition du RNE comme recensant « les élus locaux » : à vérifier (périmètre exact du répertoire).
- « Une question écrite … le gouvernement doit y répondre » : règlement de l'Assemblée nationale (délais de réponse à vérifier). Aucun délai n'est cité dans le texte.
- Mention « décision CNCCFP » avec codes A, AR, R, DD : sens exact de DD (et dispense de dépôt pour certains candidats) non établi. Le texte dit seulement « non déposé, d'après la traduction de la base » et un constat administratif. À vérifier avant toute explication.

### Chiffres utilisés

C01, C02, C03 (62 127 mandats / 62 123 personnes), C08 (565 pour 577 sièges), C11 (350), C43 à C48 (participations 2017, 2022, 2024, 2020, 2026), C74 à C77, C90, C96, C100, C101 (A, AR, R), C103 à C107, C110, C111, C73 (15 motions : 8 alinéa 2, 7 alinéa 3), plus les chiffres sans identifiant des réserves : 332 sénateurs sans groupe, 13 427 parrainages publiés par le Conseil constitutionnel en 2022 (réserve de G).

Chiffres dérivés : « un peu plus d'un sur deux » (7 836 sur 14 296) et « près de neuf sur dix » (11 816 sur 13 377). Calculs de l'auteur, non repris de `02-chiffres.md` : à confirmer ou supprimer.

### Points sensibles

- Motion de censure adoptée fin 2024 manquante dans la base : mention volontairement sans date précise, sans nom, sans commentaire politique. Éviter tout lien avec l'actualité.
- Comptes de campagne : « rejeté » et « non déposé » présentés comme constats administratifs. Le code DD n'est pas expliqué.
- Valeur aberrante de 2022 non chiffrée, maxima et minima non cités. Moyenne 2022 non citée.
- Les parrainages « rattachés » : l'explication de l'écart 2017 / 2022 (« données disponibles et qualité du rapprochement ») est une hypothèse. À confirmer auprès du code d'ingestion avant impression.
- Description de la méthode Elupedia : « mises à jour régulières », « corrections manuelles », « signalement d'erreurs » à confronter à `docs/INGEST.md`, `docs/INGESTION-SCHEDULE.md` et au site (existence d'un canal de signalement, périodicité réelle).
- Les 8 sous-parties ne citent aucun nom de personne ni de commune.

### Manques

- Pas de chiffre sur la fraîcheur des sources (dates de dernière mise à jour par producteur), qu'un bon chapitre donnerait.
- Pas d'exemple chiffré sur les licences d'une source tierce (MaDada) : les chiffres C120 et C121 sont à recouper et ne sont pas repris.
- Pas de précision sur l'écart des 50 parrainages 2022 (13 427 contre 13 377), non expliqué.
- Pas d'explication de l'écart sur les eurodéputés (82 dans la base contre 81 selon la loi) ni du nombre de sièges du Sénat, faute de vérification.
- Chiffres de participation (C43 à C48) à vérifier ligne par ligne avant impression, comme l'indique `02-chiffres.md`.
