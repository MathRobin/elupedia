# 3. Collaborateurs : l'équipe d'un député

> Brouillon. Données au 9 novembre 2026. Source : Assemblée nationale (collaborateurs parlementaires), Licence Ouverte 2.0. Aucun collaborateur n'est nommé dans ce chapitre.

Chaque député dispose d'un crédit pour employer des collaborateurs. Il choisit librement combien en recruter, et à quel niveau de rémunération. Les listes sont publiques, mais les collaborateurs sont des personnes privées : ce chapitre reste en agrégats.

## Chiffres

- 565 députés en fonction ont un mandat renseigné dans notre base.
- 2 047 collaborateurs sont déclarés en poste.
- La moyenne est de 3,62 collaborateurs par député, le maximum de 8.
- Aucun député n'est sans collaborateur déclaré.
- Le crédit collaborateur est de 11 463 € bruts par mois (fiche de l'Assemblée nationale, janvier 2026).
- Un député peut employer au plus 5 collaborateurs, quel que soit leur temps de travail. Les données ouvertes en comptent parfois davantage (temps partiels, équipes en cours de changement) : c'est pourquoi le maximum observé est de 8.

## Par groupe politique

Collaborateurs en poste, rapportés aux députés en fonction de chaque groupe (les non-inscrits ne forment pas un groupe).

| Groupe                                                  | Députés | Collaborateurs | Par député |
| ------------------------------------------------------- | ------- | -------------- | ---------- |
| Rassemblement National (RN)                             | 121     | 432            | 3,6        |
| Ensemble pour la République (EPR)                       | 88      | 296            | 3,4        |
| La France insoumise – NFP (LFI-NFP)                     | 70      | 288            | 4,1        |
| Socialistes et apparentés (SOC)                         | 68      | 242            | 3,6        |
| Droite Républicaine (DR)                                | 44      | 174            | 4,0        |
| Les Démocrates (Dem)                                    | 37      | 136            | 3,7        |
| Écologiste et Social (EcoS)                             | 38      | 135            | 3,6        |
| Horizons & Indépendants (HOR)                           | 31      | 96             | 3,1        |
| Libertés, Indépendants, Outre-mer et Territoires (LIOT) | 23      | 84             | 3,7        |
| Gauche Démocrate et Républicaine (GDR)                  | 17      | 63             | 3,7        |
| À Droite ! (AD)                                         | 17      | 59             | 3,5        |
| Non-inscrits (NI)                                       | 11      | 42             | 3,8        |

Les écarts entre groupes sont faibles : de 3,1 (HOR) à 4,1 (LFI-NFP) collaborateurs par député.

## Angles possibles

- Par groupe politique : moyenne, minimum et maximum, avec le nombre de députés dans chaque groupe (les non-inscrits ne forment pas un groupe : à traiter à part).
- La distribution : combien de députés avec 1, 2, 3… 8 collaborateurs ? Un histogramme est plus clair qu'une moyenne.
- Le crédit et son usage : rapporter le nombre de collaborateurs au crédit mensuel de 11 463 €. Les constantes de `packages/shorts/src/topics/staffers.ts` viennent de la fiche de l'Assemblée et sont à revérifier à chaque revalorisation.

## Précautions

- Pas de noms, ni de liens familiaux (sujet sensible, et hors périmètre de la base).
- Le nombre de collaborateurs en poste varie vite : la date de gel est indiquée.
- Un faible nombre de collaborateurs ne dit rien de la qualité du travail : certains députés mutualisent ou emploient moins de personnes mieux payées. À préciser dans le texte.

## À rédiger

- [x] Introduction (dans `packages/book/chapitres/`)
- [x] Tableau par groupe
- [ ] Histogramme de la distribution
- [ ] Encadré « Crédit : combien et pour quoi »
