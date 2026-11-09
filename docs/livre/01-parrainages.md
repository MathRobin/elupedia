# 1. Parrainages : les élus qui soutiennent les candidats

> Brouillon. Données au 9 novembre 2026. Source : Conseil constitutionnel (data.gouv.fr), Licence Ouverte 2.0.

Pour se présenter à l'élection présidentielle, il faut 500 parrainages d'élus, répartis dans au moins 30 départements ou collectivités, dont au plus un dixième d'un même département. Le Conseil constitutionnel publie la liste des parrains. Elle permet de savoir quel élu soutient quel candidat.

## Chiffres

| Fonction du parrain             | 2017            | 2022           |
| ------------------------------- | --------------- | -------------- |
| Maires                          | 10 310 (72,1 %) | 9 169 (68,5 %) |
| Conseillers départementaux      | 1 727 (12,1 %)  | 1 589 (11,9 %) |
| Conseillers régionaux           | 1 078 (7,5 %)   | 1 088 (8,1 %)  |
| Parlementaires                  | 726 (5,1 %)     | 892 (6,7 %)    |
| Élus des Français de l'étranger | 67 (0,5 %)      | 148 (1,1 %)    |
| Autres élus                     | 388 (2,7 %)     | 491 (3,7 %)    |
| Total en base                   | 14 296          | 13 377         |
| Total officiel (communiqué)     | 14 296          | 13 427         |

Les maires fournissent plus des deux tiers des parrainages. Il y a environ 35 000 communes en France : les maires parrains en représentent donc environ un quart. Le nombre de parrains a baissé entre 2017 et 2022 (moins de 1 000 parrainages), alors que la part des parlementaires (députés, sénateurs, eurodéputés) a progressé, de 5,1 % à 6,7 %.

## Angles possibles

- La géographie : une carte des départements par nombre de parrainages par habitant. Les cartes sont sous ODbL, mention « © OpenStreetMap » obligatoire.
- Le seuil des 500 : combien de candidats l'atteignent, et avec quelle marge.
- Les petites communes : la part des parrains dont la commune compte moins de 500 habitants (à calculer avec les données communales).
- Les doubles parrains : un élu ne peut parrainer qu'un candidat, mais plusieurs mandats d'une même personne se recoupent (à vérifier).

## Précautions

- Les noms de parrains sont publics (publication officielle). Dans le livre, on s'en tient aux agrégats : aucun maire cité nominativement, sauf contexte documentaire neutre.
- L'écart de total (13 377 en base contre 13 427 au total officiel) vient de 50 lignes d'élus homonymes écartées à l'ingestion, la source en contenant 13 427 ; à corriger dans l'ingestion et à indiquer en note de méthode tant que ce n'est pas fait.
- Les catégories sont un regroupement sur le libellé de fonction, le même que celui de la vidéo (`categoryOf` dans `sponsorships-2022.ts`). « Autres élus » inclut par exemple les conseillers de Paris et les présidents d'EPCI.

## À rédiger

- [x] Introduction (dans `packages/book/chapitres/`)
- [ ] Carte par département
- [ ] Encadré « 2017 contre 2022 »
- [ ] Note de méthode et d'écarts
