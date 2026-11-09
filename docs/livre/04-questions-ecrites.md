# 4. Questions écrites : interroger le gouvernement

> Brouillon. Données au 9 novembre 2026, Assemblée nationale (17e législature, depuis octobre 2024), Licence Ouverte 2.0. Les données du Sénat remontent à 1978 mais ne servent pas de base de comparaison ici.

Un député peut poser une question écrite à un ministre. Le ministre dispose de deux mois pour répondre, et la réponse est publiée au Journal officiel. Elle ne demande ni séance ni vote, ce qui en fait un outil simple pour porter un sujet local ou technique.

## Chiffres

- 17 367 questions écrites déposées entre le 1er octobre 2024 et le 3 novembre 2026.
- 604 députés ont posé au moins une question. Le maximum est de 106 questions pour un seul député ; la médiane est de 21 et la moyenne de 28,8.
- 4 députés ont posé 100 questions ou plus, soit 416 questions au total (2,4 % du total).
- 11 153 questions (64 %) ont reçu une réponse. Le délai moyen entre la question et la réponse est de 158 jours, la médiane de 126 jours.

### Par groupe politique

Questions rattachées aux députés actuellement en fonction (16 200 des 17 367 ; les autres viennent de députés dont le mandat a pris fin).

| Groupe                                                  | Députés | Questions | Par député |
| ------------------------------------------------------- | ------- | --------- | ---------- |
| Rassemblement National (RN)                             | 121     | 3 968     | 32,8       |
| Socialistes et apparentés (SOC)                         | 68      | 2 205     | 32,4       |
| La France insoumise – NFP (LFI-NFP)                     | 70      | 2 185     | 31,2       |
| Ensemble pour la République (EPR)                       | 88      | 1 622     | 18,4       |
| Droite Républicaine (DR)                                | 44      | 1 492     | 33,9       |
| Les Démocrates (Dem)                                    | 37      | 828       | 22,4       |
| Libertés, Indépendants, Outre-mer et Territoires (LIOT) | 23      | 814       | 35,4       |
| Écologiste et Social (EcoS)                             | 38      | 775       | 20,4       |
| Horizons & Indépendants (HOR)                           | 31      | 720       | 23,2       |
| À Droite ! (AD)                                         | 17      | 680       | 40,0       |
| Gauche Démocrate et Républicaine (GDR)                  | 17      | 509       | 29,9       |
| Non-inscrits (NI)                                       | 11      | 402       | 36,5       |

Les groupes les plus nombreux ne sont pas ceux qui posent le plus de questions par député. Quatre groupes (EPR, EcoS, Dem, HOR) sont sous la moyenne générale de 28,7 questions par député, et 15 députés d'EPR n'ont posé aucune question.

### Les sujets

Dix rubriques de l'indexation de l'Assemblée regroupent les questions les plus fréquentes : agriculture (609), santé (583), professions de santé (568), personnes handicapées (561), outre-mer (486), sécurité des biens et des personnes (443), enseignement (405), énergie et carburants (396), assurance maladie maternité (368) et animaux (348). Ces rubriques se recoupent en partie (santé, professions de santé et assurance maladie, par exemple).

## Angles possibles

- Les territoires : la carte des questions par département d'élection, rapportée au nombre de députés.
- Les réponses : délai selon le ministère, part des questions sans réponse, questions « signalées » (réponse promise sous dix jours, procédure à vérifier).
- L'écart entre groupes : la moyenne par député masque de fortes différences à l'intérieur de chaque groupe (écart entre le premier et le dernier quartile).

## Précautions

- Le nombre de questions ne dit rien de la qualité du travail d'un député : à écrire dans le texte, sans classement nominatif.
- Aucun député n'est cité nominativement pour son nombre de questions, ni en tête ni en queue du classement.
- Le statut de la réponse est vide dans nos données, l'ingestion ne l'alimentant pas pour les questions (à vérifier dans le fichier de l'Assemblée) : la part répondue se déduit de la présence d'une date de réponse. Le délai de deux mois est rarement respecté d'après des statistiques citées par l'Assemblée (à vérifier). Les questions récentes n'ont pas encore de réponse, donc le délai moyen sous-estime le délai réel.
- Le rattachement au groupe se fait sur le mandat en cours : les députés qui ont changé de groupe sont comptés dans leur groupe actuel.

## À rédiger

- [x] Introduction (dans `packages/book/chapitres/`)
- [ ] Tableau par groupe, avec les non-inscrits à part
- [ ] Carte des questions par département
- [ ] Encadré sur les délais de réponse par ministère
