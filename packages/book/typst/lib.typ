// Fonctions Typst partagées entre `main.typ` et les chapitres générés (`out/chapitres/*.typ`).
// Un `#include` n'hérite pas des définitions de `main.typ` : les chapitres importent ce fichier.

// Encadré (citation Markdown) : fond gris et barre à gauche, jamais la couleur seule.
#let encadre(body) = block(
  width: 100%, inset: 8pt, radius: 2pt, fill: luma(238),
  stroke: (left: 2.5pt + luma(60)),
)[#set text(size: 9pt); #set par(justify: false); #body]

// Section de travail du brouillon (angles, précautions, à rédiger) : à retirer avant impression (`--sans-notes`).
#let note-travail(titre, body) = block(
  width: 100%, inset: 8pt, above: 1em, stroke: (dash: "dashed", paint: luma(90), thickness: 0.6pt),
)[#set text(size: 9pt); #set par(justify: false); *Note de travail : #titre* \ #body]
