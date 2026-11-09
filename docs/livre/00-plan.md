# Livre Elupedia : plan de travail (brouillon)

Public : grand public. Format : autoédition en impression à la demande, environ 150 pages. Pas de date de sortie. Cartes : oui (mention © OpenStreetMap, partage à l'identique). Collaborateurs : jamais nommés, agrégats uniquement.

Données figées au 9 novembre 2026 (à rappeler en tête de livre).

## Structure (environ 150 pages)

| Partie                         | Pages | Contenu                                                                                |
| ------------------------------ | ----- | -------------------------------------------------------------------------------------- |
| Avant-propos, méthode, sources | 8     | Les données ouvertes, les limites du livre (pas de jugement de personnes), date de gel |
| 1. Parrainages                 | 20    | Les élus qui soutiennent les candidats : maires, présidentielles 2017 et 2022          |
| 2. Comptes de campagne         | 20    | Coût et remboursement d'une campagne législative (2022, 2024)                          |
| 3. Collaborateurs              | 14    | L'enveloppe des députés, par groupe, sans aucun nom                                    |
| 4. Questions écrites           | 16    | Auteurs, rythme et sujets des questions au gouvernement                                |
| 5. L'âge des députés           | 8     | Court : moyenne, médiane, extrêmes, par groupe                                         |
| 6. Les sénatoriales de 2026    | 14    | Scrutin, sièges, sortants, élus par nuance                                             |
| Annexe : annuaire              | 40    | Députés, sénateurs, eurodéputés (sans contacts, sans photos au départ)                 |
| Crédits et licences            | 4     | Attribution de chaque source (Licence Ouverte 2.0, ODbL)                               |

## État des brouillons

- `01-parrainages.md`, `02-comptes-de-campagne.md`, `03-collaborateurs.md`, `04-questions-ecrites.md`, `05-age-des-deputes.md`, `06-senatoriales-2026.md` : brouillons rédigés à partir de requêtes en lecture seule sur la base, au 9 novembre 2026.

## Points à vérifier avant publication

1. Total des parrainages 2022 : corrigé. La base contenait 13 377 lignes contre 13 427 au total officiel : `upsert/sponsorships.ts` écartait une ligne dont « NOM Prénom » existait déjà, alors que 79 noms apparaissent plusieurs fois dans le fichier pour des élus différents (162 lignes). Le dédoublonnage porte maintenant sur le nom, le mandat, la circonscription, le département et le candidat, et les 50 lignes manquantes ont été insérées (novembre 2026) : la base compte 13 427 lignes, comme la source. Le rattachement à une fiche des 104 lignes d'homonymes rattachées par le nom seul a été retiré (novembre 2026) ; les 168 lignes équivalentes de 2017 ont été détachées de la même façon, voir `docs/KNOWN-ISSUES.md`.
2. Comptes 2024 : dépenses retenues très inférieures à 2022. L'hypothèse de comptes non encore arrêtés par la CNCCFP n'est pas confirmée par nos données : chaque compte 2024 porte un code de décision, et les dépenses retenues ne sont absentes que pour les 813 comptes non déposés et 57 comptes de code AD. L'écart subsiste à code de décision égal (6 702 € contre 12 004 € en moyenne pour les comptes approuvés sans réformation). Cause à établir, à vérifier avant toute comparaison. Le nombre de rejets (85) correspond à un chiffre attribué au président de la CNCCFP (environ 3 200 dossiers traités, 85 rejets), relevé dans un extrait de recherche et non retrouvé dans le compte rendu de son audition du 14 mai 2025 : à vérifier.
3. Questions écrites : le statut de réponse est vide parce que l'ingestion ne l'alimente que pour les amendements (`sources/an-activite.ts`) ; à vérifier si le fichier de l'Assemblée le fournit. La part répondue (64 %) se déduit de la date de réponse. Confirmé : le délai de deux mois (article 135 du Règlement de l'Assemblée), et l'existence des questions « signalées » (réponse sous dix jours). Un chiffre cité par l'Assemblée (11,6 % de réponses dans les deux mois en avril 2025) va dans le sens de nos délais médians, sans avoir été recoupé : à vérifier.
4. Règle reprise dans l'introduction du chapitre 1 : la liste complète des parrains est publiée depuis la loi organique n° 2016-506 du 25 avril 2016 (auparavant, 500 noms tirés au sort). Confirmé.
5. Députés : 565 en fonction dans la base pour 577 sièges (565 circonscriptions distinctes, 12 manquent). Les totaux des chapitres collaborateurs, questions écrites et âge portent sur ces 565. À vérifier : sièges vacants ou mandats non ingérés.
6. Annuaire : pas de commissions (143 députés sur 565 renseignés) ; pas de décorations (aucun parlementaire en fonction n'en a de vérifiée depuis le rattachement par date de naissance) ; groupes des sénateurs à vérifier (voir `docs/KNOWN-ISSUES.md`). Pas de coordonnées, de photos ni de dates de naissance.
7. Relecture juridique (diffamation, RGPD) avant impression, même sans budget : au minimum une relecture par une personne du métier.

## Pipeline

Typst (JSON → PDF), gabarit par chapitre et gabarit d'annuaire. `packages/book` génère `out/data.json` depuis la base (`yarn --cwd packages/book data`) puis compile `typst/main.typ` (`yarn --cwd packages/book build`, binaire `typst` requis). Les catégories de parrains reprennent celles des shorts pour que le livre et la vidéo donnent les mêmes chiffres. Le gabarit affiche, pour chaque chapitre, l'introduction (`packages/book/chapitres/*.md`, texte brut, paragraphes séparés par une ligne vide) puis le texte du brouillon de `docs/livre/` converti en Typst (`src/markdown-typst.ts`, `src/chapters.ts`) : chiffres, tableaux écrits à la main dans le Markdown, et sections de travail en encadrés pointillés (`--sans-notes` les retire). Les tableaux de `data.json` ne servent plus qu'à l'annuaire.
