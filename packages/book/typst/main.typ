// Gabarit du livre Elupedia (brouillon).
// Lit `chapitres/*.md` (introductions) et `out/data.json` (généré par `yarn --cwd packages/book data`) et affiche
// une introduction puis un tableau par chapitre. Les notes de travail et
// brouillons restent dans `docs/livre/`.

#let data = json("../out/data.json")

#set document(title: "Elupedia")
#set page(paper: "a5", margin: (x: 15mm, y: 18mm), numbering: "1")
#set text(lang: "fr", size: 10pt)
#set heading(numbering: "1.")
#show heading: set block(below: 0.9em)
#set par(justify: true)
#show heading.where(level: 1): it => {
  pagebreak(weak: true)
  it
}

// Introduction d'un chapitre : fichier texte (paragraphes séparés par une ligne vide) dans chapitres/.
#let intro(fichier) = for p in read("../chapitres/" + fichier).trim().split("\n\n") {
  p
  parbreak()
}

#let apres-intro = v(0.5em)

#let source(body) = text(size: 8pt, style: "italic")[#body]

#let tableau(t) = block(breakable: false, table(
  columns: t.headers.len(),
  align: (left, ..range(t.headers.len() - 1).map(_ => right)),
  stroke: 0.4pt,
  table.header(..t.headers.map(h => strong(h))),
  ..t.rows.flatten(),
))

#align(center + horizon)[
  #text(size: 24pt, weight: "bold")[Elupedia]
  #v(1em)
  Données au #data.asOf
]
#pagebreak()

= Parrainages
#intro("01-parrainages.md")
#apres-intro
#tableau(data.tables.parrainages)
#source[Source : Conseil constitutionnel (data.gouv.fr). Données arrêtées au #data.asOf.]

= Comptes de campagne
#intro("02-comptes-de-campagne.md")
#apres-intro
#tableau(data.tables.comptes)
#source[Source : CNCCFP (data.gouv.fr). Données arrêtées au #data.asOf.]

= Collaborateurs
#intro("03-collaborateurs.md")
#apres-intro
#tableau(data.tables.collaborateurs)
#source[Source : Assemblée nationale, collaborateurs parlementaires. Données arrêtées au #data.asOf.]

= Questions écrites
#intro("04-questions-ecrites.md")
#apres-intro
#tableau(data.tables.questions)
#source[Source : Assemblée nationale, questions écrites (17e législature). Données arrêtées au #data.asOf.]

= L'âge des députés
#intro("05-age-des-deputes.md")
#apres-intro
#tableau(data.tables.age)
#source[Source : Assemblée nationale. Âge calculé au #data.asOf.]

= Crédits et licences
Données : Assemblée nationale, Sénat, HATVP, CNCCFP, Conseil constitutionnel (Licence Ouverte 2.0). Cartes : © les contributeurs d'OpenStreetMap (ODbL).
