# Livre Elupedia — plan de travail (brouillon)

Public : grand public. Format : autoédition en impression à la demande, environ 150 pages. Pas de date de sortie. Cartes : oui (mention © OpenStreetMap, partage à l'identique). Collaborateurs : jamais nommés, agrégats uniquement.

Données figées au **9 novembre 2026** (à rappeler en tête de livre).

## Structure (environ 150 pages)

| Partie                         | Pages | Contenu                                                                                |
| ------------------------------ | ----- | -------------------------------------------------------------------------------------- |
| Avant-propos, méthode, sources | 8     | Les données ouvertes, les limites du livre (pas de jugement de personnes), date de gel |
| 1. Parrainages                 | 20    | Les élus qui soutiennent les candidats : maires, présidentielles 2017 et 2022          |
| 2. Comptes de campagne         | 20    | Coût et remboursement d'une campagne législative (2022, 2024)                          |
| 3. Collaborateurs              | 14    | L'enveloppe des députés, par groupe, sans aucun nom                                    |
| 3. Questions écrites           | 16    | Auteurs, rythme et sujets des questions au gouvernement                                |
| 5. L'âge des députés           | 8     | Court : moyenne, médiane, extrêmes, par groupe                                         |
| 6. Chapitre à choisir          | 14    | Décorations, déclarations HATVP, sénatoriales 2026…                                    |
| Annexe : annuaire              | 40    | Députés, sénateurs, eurodéputés (sans contacts, sans photos au départ)                 |
| Crédits et licences            | 4     | Attribution de chaque source (Licence Ouverte 2.0, ODbL)                               |

## État des brouillons

- `01-parrainages.md`, `02-comptes-de-campagne.md`, `03-collaborateurs.md`, `04-questions-ecrites.md`, `05-age-des-deputes.md` : brouillons rédigés à partir de requêtes en lecture seule sur la base, au 9 novembre 2026.

## Points à vérifier avant publication

1. Le total 2022 en base (13 377) diffère du total officiel (13 427) : à expliquer ou à citer le total officiel.
2. Comptes 2024 : dépenses retenues très inférieures à 2022. Il faut vérifier la part de comptes non encore arrêtés par la CNCCFP avant toute comparaison.
3. Questions écrites : le statut de réponse est vide dans les données, la part répondue se déduit de la date de réponse ; à confirmer.
4. Annuaire : ni décorations (rattachement par nom, risque d'homonymes) ni commissions (143 députés sur 565 renseignés) ; groupes des sénateurs à vérifier (voir `docs/KNOWN-ISSUES.md`). Pas de coordonnées, de photos ni de dates de naissance.
5. Relecture juridique (diffamation, RGPD) avant impression, même sans budget : au minimum une relecture par une personne du métier.

## Pipeline

Typst (JSON → PDF), gabarit par chapitre et gabarit d'annuaire. `packages/book` génère `out/data.json` depuis la base (`yarn --cwd packages/book data`) puis compile `typst/main.typ` (`yarn --cwd packages/book build`, binaire `typst` requis). Les catégories de parrains reprennent celles des shorts pour que le livre et la vidéo donnent les mêmes chiffres. Le gabarit affiche l'introduction de chaque chapitre (`packages/book/chapitres/*.md`, texte brut, paragraphes séparés par une ligne vide) puis son tableau. L'annexe d'annuaire (997 parlementaires en fonction : nom, groupe, territoire) occupe environ 22 pages à ce format. Les brouillons et notes de travail restent dans `docs/livre/`.
