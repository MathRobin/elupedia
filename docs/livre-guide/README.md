# Livre « Comprendre les élus » (guide grand public)

Brouillons du guide pédagogique publié au nom d'Elupedia. Document de travail : rien ici n'est destiné au site.

## Décisions de cadrage (validées avec l'éditeur du projet)

- **Public** : grand public, sans prérequis. Pas de jargon non défini.
- **Longueur** : 150 pages (A5, environ 260 mots par page, soit 38 000 à 40 000 mots, encadrés compris).
- **Publication** : impression à la demande (autoédition) pour une première version, puis bascule vers un éditeur quand le texte est propre. Papier et ebook.
- **Signature** : Elupedia (marque), pas un auteur individuel.
- **Durée de vie** : « one shot ». On privilégie les mécanismes, qui vieillissent lentement. Les chiffres sont datés et isolés dans des encadrés.
- **Personnes** : aucun nom d'élu ou de candidat. Pas de cas fictif non plus : les illustrations sont des chiffres agrégés réels, des textes de loi et des mécanismes vérifiables. Une personne n'est nommée que si c'est juridiquement inattaquable et indispensable (décision au cas par cas, hors brouillons).
- **Date de photographie des données** : 9 novembre 2026.

## Fichiers

| Fichier                                                | Rôle                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [01-bible-editoriale.md](01-bible-editoriale.md)       | Ton, structure d'un chapitre, règles de non-nomination, règles sur les chiffres        |
| [02-chiffres.md](02-chiffres.md)                       | Chiffres calculés depuis la base, avec identifiant, source, requête et réserves        |
| [03-sources-et-licences.md](03-sources-et-licences.md) | Page de crédits et points juridiques à traiter avant impression                        |
| `ch00-avant-propos.md` à `ch10-agir.md`                | Brouillons des chapitres                                                               |
| `ch11-glossaire.md`                                    | Glossaire                                                                              |
| `build/`                                               | Mise en page : `build.py` produit un PDF A5 (Typst) et un EPUB, voir `build/README.md` |

## Plan

0. Avant-propos : comment lire ce livre
1. Qui sont les élus ?
2. Qui décide de quoi ?
3. Comment devient-on élu ?
4. Le travail d'un parlementaire
5. L'équipe autour de l'élu
6. Les déclarations de transparence
7. L'argent des campagnes
8. Présidentielle : les parrainages
9. Lire les données publiques : mode d'emploi et pièges
10. Agir : suivre, interpeller, se présenter
11. Glossaire

## Volume (9 novembre 2026, après relecture)

Environ 35 100 mots hors notes de vérification : avant-propos 650, chapitres 1 à 10 entre 2 500 et 3 650 mots, glossaire de 100 entrées. Le PDF de travail fait 138 pages A5 (corps 11 pt). Les chapitres 2, 4, 9 et 10 ont été ramenés à 3 300 à 3 500 mots.

## Relecture du 9 novembre 2026

Chaque chapitre a été vérifié sur des sources en ligne (hatvp.fr, service-public.fr, vie-publique.fr, rapports parlementaires, guides de la CNCCFP), corrigé, coupé, puis débarrassé des tics de rédaction automatique. Le détail de chaque verdict est dans le tableau « Notes de vérification » de chaque chapitre.

Corrections factuelles faites dans le texte, entre autres : seuil de pétition au CESE (150 000 signatures) ; pétition locale (un vingtième des électeurs hors communes) ; suppression du seuil de 1 000 habitants pour le mode de scrutin municipal (lois de 2025, à confirmer) ; interdiction d'employer des proches (ordonnance de 1958, pas la loi de 2017) ; point de départ du délai de décision de la CNCCFP ; article 49 de la Constitution ; référence erronée à l'article 3 de la Constitution retirée.

## Points ouverts

- **Légifrance, conseil-constitutionnel.fr et cnccfp.fr n'étaient pas lisibles par les outils** : une partie des verdicts repose sur des sources secondaires. Une vérification humaine sur Légifrance reste nécessaire, notamment pour les durées de mandat, les seuils des groupes parlementaires, la composition de la CMP et le code `DD` de la CNCCFP (sens et dispense de dépôt).
- **Anomalies de données constatées** (à ajouter à `docs/KNOWN-ISSUES.md` une fois la PR #355 fusionnée, qui modifie aussi ce fichier) : scrutins de l'Assemblée incomplets en décembre 2024 (22 enregistrés, dont aucune motion de censure, contre 118 à 209 les autres mois) ; 565 députés pour 577 circonscriptions (12 absentes) ; 350 sénateurs actifs dont 183 débutés en 2026 pour 178 sièges renouvelés ; 82 eurodéputés actifs pour 81 sièges ; 34 parlementaires avec un mandat de maire débuté en mars 2026 ; second tour des sénatoriales 2026 : 26 sièges annoncés pour 19 élus ; écart de 50 parrainages 2022 avec le chiffre publié.
- **Chiffres dérivés** calculés par les rédacteurs, à garder ou à ajouter à `02-chiffres.md` : parts de parrainages rattachés (54,8 % en 2017, 88,3 % en 2022), 960 parrainages d'« autres fonctions », écart de votants législatives 2024 moins 2022 (environ 9,7 millions).
- **RIP** : les totaux officiels de 2019 (248) et de 2023 (244) sont à recouper sur conseil-constitutionnel.fr.
- **Écarts à expliquer** : 565 ou 577 députés, 350 ou 348 sénateurs, 82 ou 81 eurodéputés.
- Les mentions « à vérifier » restent dans le texte à la demande du propriétaire.
- Adresse de contact d'Elupedia, mentions légales, couverture : à ajouter par l'éditeur.

## Statut des brouillons

Chaque chapitre se termine par une section **« Notes de vérification (hors livre) »** : affirmations juridiques ou institutionnelles à contrôler, chiffres utilisés (identifiants de `02-chiffres.md`), points sensibles. Cette section sera supprimée à l'impression. Aucun brouillon n'est relu juridiquement à ce stade.

## Suite

1. Relecture éditoriale des brouillons (ton, longueur, doublons entre chapitres).
2. Vérification des notes (en particulier tout ce qui touche à la loi et aux seuils).
3. Relecture juridique avant impression (personnes, données personnelles, licences).
4. Mise en page (chaîne de génération à choisir) et couverture.
5. ISBN, dépôt légal, impression à la demande.
