// Gabarit du livre Elupedia (brouillon).
// Lit `out/data.json` (généré par `yarn --cwd packages/book data`) et affiche
// un tableau par chapitre. Le texte des chapitres est dans `docs/livre/*.md`
// et n'est pas encore intégré ici.

#let data = json("../out/data.json")

#set document(title: "Elupedia")
#set page(paper: "a5", margin: (x: 15mm, y: 18mm), numbering: "1")
#set text(lang: "fr", size: 10pt)
#set heading(numbering: "1.")
#show heading.where(level: 1): it => {
  pagebreak(weak: true)
  it
}

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
#tableau(data.tables.parrainages)
#source[Source : Conseil constitutionnel (data.gouv.fr). Données arrêtées au #data.asOf.]

= Comptes de campagne
#tableau(data.tables.comptes)
#source[Source : CNCCFP (data.gouv.fr). Données arrêtées au #data.asOf.]

= Collaborateurs
#tableau(data.tables.collaborateurs)
#source[Source : Assemblée nationale, collaborateurs parlementaires. Données arrêtées au #data.asOf.]

= Questions écrites
#tableau(data.tables.questions)
#source[Source : Assemblée nationale, questions écrites (17e législature). Données arrêtées au #data.asOf.]

= L'âge des députés
#tableau(data.tables.age)
#source[Source : Assemblée nationale. Âge calculé au #data.asOf.]

= Crédits et licences
Données : Assemblée nationale, Sénat, HATVP, CNCCFP, Conseil constitutionnel (Licence Ouverte 2.0). Cartes : © les contributeurs d'OpenStreetMap (ODbL).
