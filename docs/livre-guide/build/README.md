# Mise en page du guide

`build.py` transforme les chapitres Markdown de `docs/livre-guide/` en PDF A5 (Typst) et en EPUB 3.

```bash
python3 docs/livre-guide/build/build.py            # PDF et EPUB dans docs/livre-guide/build/out/
python3 docs/livre-guide/build/build.py --no-pdf   # EPUB seul
python3 docs/livre-guide/build/build.py --no-epub  # PDF seul
```

Prérequis : Python 3 (bibliothèque standard seulement) et le binaire `typst` dans le PATH pour le PDF. Les sorties (`out/`) ne sont pas versionnées.

## Ce que fait le script

- Lit `ch00` à `ch11`, dans l'ordre alphabétique, et retire la section « Notes de vérification (hors livre) » de chaque fichier.
- Gère un sous-ensemble de Markdown : titres, paragraphes, gras, italique, code en ligne, listes, tableaux et encadrés (`> **Libellé** — texte`). Un élément inconnu s'affiche tel quel et doit être corrigé dans le Markdown.
- Les encadrés ne reposent pas sur la couleur seule : libellé en capitales et filet épais.
- Les notes `> **Figure à produire** — …` apparaissent dans le brouillon. À remplacer par les vraies figures avant impression.

## À régler avant impression

- Format de la page, marges et police : valeurs de travail, à ajuster avec l'imprimeur choisi (marge de reliure, fonds perdus, couverture).
- Pas de couverture, de quatrième de couverture ni de mentions légales (éditeur, imprimeur, ISBN, dépôt légal).
- Césure et veuves : à contrôler page par page dans le PDF.
- Les chapitres démarrent sur une nouvelle page ; pour l'impression, envisager un démarrage sur page impaire.
