# Bible éditoriale

Règles communes à tous les chapitres. Un chapitre qui ne les respecte pas est à réécrire.

## 1. Lecteur et ton

- Le lecteur est un adulte curieux, sans formation en droit ni en science politique. Il veut comprendre, pas se faire une opinion imposée.
- On s'adresse à lui par « vous ». Phrases courtes (20 mots en moyenne), voix active, mots courants.
- Chaque terme technique est défini à sa première apparition, en une phrase, puis repris dans le glossaire.
- Ton calme et factuel. Pas d'ironie, pas de formule dramatique, pas de morale. Pas d'adjectifs qui jugent (« scandaleux », « préoccupant », « exemplaire »).
- Neutralité politique stricte : on décrit des règles et des chiffres. Aucun jugement sur un parti, un groupe ou une politique. Les groupes et partis ne sont cités que comme données (par exemple la taille des groupes de l'Assemblée).
- Pas d'enthousiasme de commande ni de promotion. Elupedia est cité comme source et comme outil, sobrement, sans slogan.

## 2. Ce qu'on n'écrit pas

- **Aucun nom de personne** : ni élu, ni candidat, ni collaborateur, ni maire. On parle de « un député », « un maire », « le candidat arrivé en tête ». Seules exceptions : des personnages historiques décédés, quand c'est indispensable et sans lien avec les données (par exemple pour dater une loi). Pas de nom de commune quand il permet d'identifier une personne.
- **Aucun cas fictif** : pas de « imaginons Marie, maire de… ». Un exemple est un fait réel agrégé, un extrait de texte de loi, ou un mécanisme décrit. Si un exemple concret manque, on écrit un exemple chiffré réel ou on s'en passe.
- **Aucune donnée personnelle fine** : pas d'adresse, de coordonnées, de patrimoine individuel, de date de naissance d'une personne identifiable. On ne publie que des agrégats (comptes, médianes, parts, tranches).
- **Aucune accusation** : même sur des chiffres agrégés, on n'écrit pas qu'un comportement est fautif. Un compte rejeté, une déclaration absente ou un délai dépassé sont décrits comme des constats, avec leur cause réglementaire.
- Pas de prédiction, pas de commentaire d'actualité, pas de référence à une personne actuellement en poste (gouvernement, présidents d'assemblées).

## 3. Structure d'un chapitre

Environ 3 500 mots (13 à 15 pages), sauf mention contraire. Dans cet ordre :

1. **Titre** `# Chapitre N. Titre` et une **accroche** de deux à quatre phrases : la question que se pose le lecteur.
2. **Corps** en 4 à 6 sections `##`, chacune répondant à une sous-question. Alterner explication, exemple chiffré, encadré.
3. **Encadrés** (au moins deux par chapitre), en citations Markdown commençant par un libellé en gras :
   - `> **Chiffres** — …` : chiffres datés, avec leur source (par exemple « Source : Assemblée nationale, via Elupedia, au 9 novembre 2026 »).
   - `> **Ce que dit la loi** — …` : la règle, sans jargon, avec la référence du texte en toutes lettres.
   - `> **À retenir** — …` : trois puces au maximum, en fin de chapitre.
   - `> **Dans les données** — …` : comment l'information se retrouve dans les données publiques (pour le chapitre 9 surtout).
4. **Pour aller plus loin** : trois sources officielles au plus, sans lien raccourci (on écrit le nom du site et de la page).
5. **Notes de vérification (hors livre)** : voir ci-dessous.

## 4. Chiffres

- Tout chiffre du livre vient de `02-chiffres.md` (identifiant `Cxx`) ou d'une règle de droit que l'on peut vérifier. On n'invente aucun chiffre et on ne retouche pas un chiffre : on cite sa valeur et sa date.
- Un chiffre est toujours accompagné de sa date de photographie (« au 9 novembre 2026 ») et de sa source dans l'encadré ou la phrase.
- On écrit les nombres avec espace insécable pour les milliers (34 824) et la virgule pour les décimales (66,7 %). Pourcentages arrondis à une décimale, sauf mention contraire.
- Les chiffres vieillissent : on les place dans des encadrés `Chiffres` plutôt que dans le fil du texte, pour faciliter une mise à jour.
- Si un chiffre porte une réserve dans `02-chiffres.md`, la réserve est reprise dans le texte (« données partielles », « hors conseillers municipaux »).
- Les quantités annoncées dans le texte doivent se recouper : si un chapitre dit 34 824 maires et un autre « environ 35 000 », c'est la même donnée.

## 5. Notes de vérification (hors livre)

À la fin de chaque brouillon, une section `## Notes de vérification (hors livre)` contient :

- **Affirmations juridiques et institutionnelles** : chacune avec la référence présumée (loi, article de la Constitution, règlement d'une assemblée), signalée « à vérifier ». En cas de doute sur un seuil, une durée ou une date, on le dit au lieu de l'écrire comme un fait sûr.
- **Chiffres utilisés** : liste des identifiants `Cxx` repris.
- **Points sensibles** : tout passage où le risque est juridique (personnes identifiables, diffamation, données personnelles) ou éditorial (neutralité).
- **Manques** : ce qu'un bon chapitre aurait contenu et qu'on n'a pas pu écrire faute de donnée ou de vérification.

Cette section n'est jamais réécrite en texte du livre. Elle sera supprimée à l'impression.

## 6. Mise en forme Markdown

- Un seul `#` par fichier. Sections en `##`, sous-sections en `###` (peu).
- Listes courtes. Tableaux pour les comparaisons à plus de deux colonnes. Pas de HTML.
- Pas d'images à ce stade : proposer au plus une idée de figure par chapitre sous la forme `> **Figure à produire** — …` (type de graphique, données, source).
- Prettier formate les fichiers : ne pas se soucier de l'alignement des tableaux.
