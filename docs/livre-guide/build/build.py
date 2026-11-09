#!/usr/bin/env python3
"""Chaîne de mise en page du guide « Comprendre les élus ».

Rôle : lit les chapitres Markdown de `docs/livre-guide/` (ch00 à ch11), retire
les « Notes de vérification (hors livre) » de chacun, puis produit dans
`build/out/` :
  - guide.typ et guide.pdf (A5, via le binaire `typst`) ;
  - guide.epub (EPUB 3, assemblé avec la bibliothèque standard Python).

Sous-ensemble de Markdown géré : titres `#` à `###`, paragraphes, gras, italique
(`_x_` ou `*x*`), code en ligne, listes à puces ou numérotées, citations (les
encadrés `> **Libellé** — texte`), tableaux à barres verticales. Aucun autre
élément n'est reconnu : un cas inconnu s'affiche tel quel et doit être corrigé
dans le Markdown.

Appelant : à la main, `python3 docs/livre-guide/build/build.py [--no-pdf] [--no-epub]`.
Pièges : le PDF demande `typst` dans le PATH (entrée et sortie par flux standard, pour le paquet snap) ; les chapitres sont lus dans
l'ordre alphabétique des fichiers `ch*.md`. Les encadrés ne reposent jamais
sur la couleur seule (libellé en capitales et filet).
"""
import html
import re
import subprocess
import sys
import uuid
import zipfile
from pathlib import Path

ICI = Path(__file__).resolve().parent
DOSSIER = ICI.parent
SORTIE = ICI / "out"
TITRE = "Comprendre les élus"
SOUS_TITRE = "Guide pour lire, vérifier et suivre ceux qui nous représentent"
AUTEUR = "Elupedia"
DATE = "2026-11-09"
NOTES = "## Notes de vérification"


# --------------------------------------------------------------------------
# Lecture et découpage en blocs
# --------------------------------------------------------------------------

def lire_chapitre(chemin):
    texte = chemin.read_text(encoding="utf-8")
    return texte.split(NOTES)[0].rstrip() + "\n"


def analyser_inline(s):
    """Texte inline -> liste de noeuds ('t', texte) / ('b', noeuds) / ('i', noeuds) / ('c', code)."""
    noeuds = []
    i = 0
    tampon = ""

    def vider():
        nonlocal tampon
        if tampon:
            noeuds.append(("t", tampon))
            tampon = ""

    while i < len(s):
        if s[i] == "`":
            j = s.find("`", i + 1)
            if j > i:
                vider()
                noeuds.append(("c", s[i + 1:j]))
                i = j + 1
                continue
        if s.startswith("**", i):
            j = s.find("**", i + 2)
            if j > i + 2:
                vider()
                noeuds.append(("b", analyser_inline(s[i + 2:j])))
                i = j + 2
                continue
        if s[i] in "_*":
            m = s[i]
            avant = s[i - 1] if i > 0 else " "
            if not avant.isalnum():
                j = i + 1
                while True:
                    j = s.find(m, j)
                    if j < 0:
                        break
                    apres = s[j + 1] if j + 1 < len(s) else " "
                    if not apres.isalnum() and j > i + 1:
                        break
                    j += 1
                if j > 0 and j > i + 1:
                    vider()
                    noeuds.append(("i", analyser_inline(s[i + 1:j])))
                    i = j + 1
                    continue
        tampon += s[i]
        i += 1
    vider()
    return noeuds


def analyser_blocs(lignes):
    """Lignes -> blocs : ('h', niveau, noeuds) ('p', noeuds) ('l', ordonnee, [noeuds]) ('q', libelle, blocs) ('T', lignes)."""
    blocs = []
    i = 0
    n = len(lignes)
    while i < n:
        ligne = lignes[i]
        if not ligne.strip():
            i += 1
            continue
        m = re.match(r"^(#{1,3})\s+(.*)$", ligne)
        if m:
            blocs.append(("h", len(m.group(1)), analyser_inline(m.group(2).strip())))
            i += 1
            continue
        if ligne.startswith(">"):
            citation = []
            while i < n and lignes[i].startswith(">"):
                citation.append(re.sub(r"^>\s?", "", lignes[i]))
                i += 1
            libelle = None
            if citation:
                m = re.match(r"^\*\*(.+?)\*\*\s*—\s*(.*)$", citation[0])
                if m:
                    libelle = m.group(1)
                    citation[0] = m.group(2)
            blocs.append(("q", libelle, analyser_blocs(citation)))
            continue
        if ligne.startswith("|"):
            tableau = []
            while i < n and lignes[i].startswith("|"):
                tableau.append(lignes[i])
                i += 1
            blocs.append(("T", tableau))
            continue
        m = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", ligne)
        if m:
            ordonnee = m.group(2)[0].isdigit()
            items = []
            while i < n:
                m = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", lignes[i])
                if not m:
                    if lignes[i].startswith("  ") and lignes[i].strip() and items:
                        items[-1] += " " + lignes[i].strip()
                        i += 1
                        continue
                    break
                items.append(m.group(3))
                i += 1
            blocs.append(("l", ordonnee, [analyser_inline(x) for x in items]))
            continue
        paragraphe = [ligne.strip()]
        i += 1
        while i < n and lignes[i].strip() and not re.match(r"^(#{1,3}\s|>|\||\s*([-*]|\d+\.)\s)", lignes[i]):
            paragraphe.append(lignes[i].strip())
            i += 1
        blocs.append(("p", analyser_inline(" ".join(paragraphe))))
    return blocs


def cellules(ligne):
    morceaux = ligne.strip().strip("|").split("|")
    return [c.strip() for c in morceaux]


def lignes_tableau(tableau):
    """Retire la ligne de séparation `---`, renvoie [[cellules]]."""
    rangs = []
    for ligne in tableau:
        c = cellules(ligne)
        if all(re.fullmatch(r":?-{2,}:?", x) for x in c if x != "") and any(c):
            continue
        rangs.append(c)
    return rangs


# --------------------------------------------------------------------------
# Rendu Typst
# --------------------------------------------------------------------------

SPECIAUX = set("\\#$*_`@<>[]~")


def echapper_typ(s):
    s = "".join("\\" + c if c in SPECIAUX else c for c in s)
    return s.replace("//", "\\/\\/")


def inline_typ(noeuds):
    sortie = []
    for noeud in noeuds:
        genre = noeud[0]
        if genre == "t":
            sortie.append(echapper_typ(noeud[1]))
        elif genre == "b":
            sortie.append("#strong[" + inline_typ(noeud[1]) + "]")
        elif genre == "i":
            sortie.append("#emph[" + inline_typ(noeud[1]) + "]")
        else:
            sortie.append('#raw("' + noeud[1].replace("\\", "\\\\").replace('"', '\\"') + '")')
    texte = "".join(sortie)
    texte = re.sub(r"^([-+/=])", r"\\\1", texte)
    texte = re.sub(r"^(\d+)\.", r"\1\\.", texte)
    return texte


def blocs_typ(blocs, premier_chapitre=[True]):
    sortie = []
    for bloc in blocs:
        genre = bloc[0]
        if genre == "h":
            niveau, noeuds = bloc[1], bloc[2]
            sortie.append("=" * niveau + " " + inline_typ(noeuds))
        elif genre == "p":
            sortie.append(inline_typ(bloc[1]))
        elif genre == "l":
            marque = "+" if bloc[1] else "-"
            sortie.append("\n".join(marque + " " + inline_typ(x) for x in bloc[2]))
        elif genre == "q":
            corps = "\n\n".join(blocs_typ(bloc[2]))
            sortie.append('#encadre("' + (bloc[1] or "") + '")[\n' + corps + "\n]")
        elif genre == "T":
            rangs = lignes_tableau(bloc[1])
            if not rangs:
                continue
            colonnes = len(rangs[0])
            cases = []
            for k, rang in enumerate(rangs):
                for c in rang + [""] * (colonnes - len(rang)):
                    cellule = inline_typ(analyser_inline(c))
                    cases.append("[" + ("#strong[" + cellule + "]" if k == 0 and cellule else cellule) + "]")
            sortie.append("#tableau(" + str(colonnes) + ", (" + ", ".join(cases) + ",))")
    return sortie


MODELE_TYP = r'''#set document(title: "__TITRE__", author: "__AUTEUR__")
#set page(
  paper: "a5",
  margin: (inside: 21mm, outside: 16mm, top: 21mm, bottom: 23mm),
  numbering: "1",
  footer: context [
    #set text(size: 8pt)
    #align(center)[#counter(page).display()]
  ],
)
#set text(font: "Libertinus Serif", size: 11pt, lang: "fr", region: "fr")
#set par(justify: true, leading: 0.8em, spacing: 1.1em)
#set heading(numbering: none)
#show heading.where(level: 1): it => {
  pagebreak(weak: true)
  v(18mm)
  text(size: 19pt, weight: "bold", it.body)
  v(8mm)
}
#show heading.where(level: 2): it => {
  v(6mm, weak: true)
  text(size: 12.5pt, weight: "bold", it.body)
  v(2mm)
}
#show heading.where(level: 3): it => {
  v(3mm, weak: true)
  text(size: 10.5pt, weight: "bold", style: "italic", it.body)
  v(1mm)
}
#show raw: set text(font: "DejaVu Sans Mono", size: 8pt)

#let encadre(libelle, corps) = block(
  width: 100%,
  breakable: true,
  inset: (left: 9pt, right: 8pt, top: 7pt, bottom: 7pt),
  stroke: (left: 2.2pt + black),
  fill: luma(243),
)[
  #set text(size: 9pt)
  #set par(justify: false)
  #if libelle != "" [#text(size: 7.5pt, weight: "bold", tracking: 0.6pt)[#upper(libelle)] #v(2pt)]
  #corps
]

#let tableau(colonnes, cases) = {
  set text(size: 8pt)
  table(
    columns: (1fr,) * colonnes,
    inset: 4pt,
    stroke: 0.4pt + luma(120),
    ..cases,
  )
}

#page(numbering: none, footer: none)[
  #v(1fr)
  #align(center)[
    #text(size: 28pt, weight: "bold")[__TITRE__]
    #v(6mm)
    #text(size: 12pt, style: "italic")[__SOUS_TITRE__]
    #v(30mm)
    #text(size: 13pt, tracking: 1pt)[#upper[__AUTEUR__]]
  ]
  #v(1fr)
  #align(center)[#text(size: 8pt)[Données arrêtées au 9 novembre 2026]]
]

#page(numbering: none, footer: none)[
  #v(1fr)
  #text(size: 8.5pt)[
    Brouillon de travail. Texte non relu juridiquement. \
    © Elupedia. Mise en page : `build.py`.
  ]
]

#outline(title: [Sommaire], depth: 1)

'''


def rendu_typst(chapitres):
    corps = []
    for texte in chapitres:
        corps.extend(blocs_typ(analyser_blocs(texte.split("\n"))))
    modele = (MODELE_TYP
              .replace("__TITRE__", TITRE)
              .replace("__SOUS_TITRE__", SOUS_TITRE)
              .replace("__AUTEUR__", AUTEUR))
    return modele + "\n\n".join(corps) + "\n"


# --------------------------------------------------------------------------
# Rendu XHTML pour l'EPUB
# --------------------------------------------------------------------------

def inline_html(noeuds):
    sortie = []
    for noeud in noeuds:
        genre = noeud[0]
        if genre == "t":
            sortie.append(html.escape(noeud[1], quote=False))
        elif genre == "b":
            sortie.append("<strong>" + inline_html(noeud[1]) + "</strong>")
        elif genre == "i":
            sortie.append("<em>" + inline_html(noeud[1]) + "</em>")
        else:
            sortie.append("<code>" + html.escape(noeud[1], quote=False) + "</code>")
    return "".join(sortie)


def blocs_html(blocs):
    sortie = []
    for bloc in blocs:
        genre = bloc[0]
        if genre == "h":
            sortie.append("<h%d>%s</h%d>" % (bloc[1], inline_html(bloc[2]), bloc[1]))
        elif genre == "p":
            sortie.append("<p>" + inline_html(bloc[1]) + "</p>")
        elif genre == "l":
            balise = "ol" if bloc[1] else "ul"
            sortie.append("<%s>%s</%s>" % (balise, "".join("<li>" + inline_html(x) + "</li>" for x in bloc[2]), balise))
        elif genre == "q":
            etiquette = '<p class="etiquette">' + html.escape(bloc[1].upper(), quote=False) + "</p>" if bloc[1] else ""
            sortie.append('<div class="encadre">' + etiquette + "".join(blocs_html(bloc[2])) + "</div>")
        elif genre == "T":
            rangs = lignes_tableau(bloc[1])
            if not rangs:
                continue
            lignes = []
            for k, rang in enumerate(rangs):
                balise = "th" if k == 0 else "td"
                lignes.append("<tr>" + "".join("<%s>%s</%s>" % (balise, inline_html(analyser_inline(c)), balise) for c in rang) + "</tr>")
            sortie.append("<table>" + "".join(lignes) + "</table>")
    return sortie


CSS_EPUB = """body { font-family: serif; line-height: 1.45; margin: 5%; }
h1 { font-size: 1.7em; margin: 1.5em 0 0.8em; page-break-before: always; }
h2 { font-size: 1.25em; margin: 1.4em 0 0.4em; }
h3 { font-size: 1.05em; font-style: italic; }
.encadre { border-left: 0.25em solid #000; background: #f2f2f2; padding: 0.4em 0.8em; margin: 1em 0; font-size: 0.95em; }
.etiquette { font-weight: bold; letter-spacing: 0.06em; font-size: 0.8em; margin: 0 0 0.3em; }
table { border-collapse: collapse; width: 100%; font-size: 0.9em; margin: 0.8em 0; }
th, td { border: 1px solid #777; padding: 0.25em 0.4em; text-align: left; vertical-align: top; }
code { font-family: monospace; font-size: 0.9em; }
"""


def titre_chapitre(texte):
    for ligne in texte.split("\n"):
        if ligne.startswith("# "):
            return ligne[2:].strip()
    return "Sans titre"


def ecrire_epub(chemin, chapitres):
    identifiant = "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, "https://elupedia.fr/livre/comprendre-les-elus"))
    entete = '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="fr" lang="fr"><head><meta charset="utf-8"/><title>%s</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>'
    fichiers = []
    for k, texte in enumerate(chapitres):
        corps = "\n".join(blocs_html(analyser_blocs(texte.split("\n"))))
        nom = "ch%02d.xhtml" % k
        fichiers.append((nom, titre_chapitre(texte), entete % html.escape(titre_chapitre(texte)) + corps + "</body></html>"))
    nav = (entete % "Sommaire" + '<nav epub:type="toc" id="toc"><h1>Sommaire</h1><ol>'
           + "".join('<li><a href="%s">%s</a></li>' % (nom, html.escape(titre)) for nom, titre, _ in fichiers)
           + "</ol></nav></body></html>")
    manifeste = ('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
                 '<item id="css" href="style.css" media-type="text/css"/>'
                 + "".join('<item id="c%d" href="%s" media-type="application/xhtml+xml"/>' % (k, nom) for k, (nom, _, _) in enumerate(fichiers)))
    ordre = "".join('<itemref idref="c%d"/>' % k for k in range(len(fichiers)))
    opf = ('<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="fr">'
           '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
           '<dc:identifier id="id">%s</dc:identifier><dc:title>%s</dc:title><dc:language>fr</dc:language>'
           '<dc:creator>%s</dc:creator><dc:date>%s</dc:date>'
           '<meta property="dcterms:modified">%sT00:00:00Z</meta></metadata>'
           '<manifest>%s</manifest><spine>%s</spine></package>') % (identifiant, html.escape(TITRE), AUTEUR, DATE, DATE, manifeste, ordre)
    conteneur = ('<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
                 '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    with zipfile.ZipFile(chemin, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", conteneur, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/content.opf", opf, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/nav.xhtml", nav, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/style.css", CSS_EPUB, compress_type=zipfile.ZIP_DEFLATED)
        for nom, _, contenu in fichiers:
            z.writestr("OEBPS/" + nom, contenu, compress_type=zipfile.ZIP_DEFLATED)


# --------------------------------------------------------------------------

def main():
    options = set(sys.argv[1:])
    chemins = sorted(DOSSIER.glob("ch*.md"))
    if not chemins:
        sys.exit("Aucun chapitre trouvé dans " + str(DOSSIER))
    chapitres = [lire_chapitre(c) for c in chemins]
    SORTIE.mkdir(exist_ok=True)
    mots = sum(len(c.split()) for c in chapitres)
    print("%d fichiers, %d mots (notes de vérification exclues)" % (len(chemins), mots))
    source = SORTIE / "guide.typ"
    source.write_text(rendu_typst(chapitres), encoding="utf-8")
    if "--no-pdf" not in options:
        # Entrée et sortie passent par les flux standard : le paquet snap de typst
        # ne voit pas les fichiers hors du dossier personnel.
        resultat = subprocess.run(["typst", "compile", "-", "-"], input=source.read_bytes(), capture_output=True)
        if resultat.returncode != 0:
            print(resultat.stderr.decode("utf-8", "replace")[-3000:])
            sys.exit("Échec de typst")
        (SORTIE / "guide.pdf").write_bytes(resultat.stdout)
        print("PDF :", SORTIE / "guide.pdf")
    if "--no-epub" not in options:
        ecrire_epub(SORTIE / "guide.epub", chapitres)
        print("EPUB :", SORTIE / "guide.epub")


if __name__ == "__main__":
    main()
