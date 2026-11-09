// Gabarit du livre Elupedia (brouillon).
// Lit `out/data.json` (généré par `yarn --cwd packages/book data`) et affiche
// un tableau par chapitre. Le texte des chapitres est dans `docs/livre/*.md`
// et n'est pas encore intégré ici.

#let data = json("../out/data.json")

#set document(title: "Elupedia")
#set page(paper: "a5", margin: (x: 15mm, y: 18mm), numbering: "1")
#set text(lang: "fr", size: 10pt)
#set heading(numbering: "1.")

#let tableau(t) = table(
  columns: t.headers.len(),
  align: (left, ..range(t.headers.len() - 1).map(_ => right)),
  stroke: 0.4pt,
  table.header(..t.headers.map(h => strong(h))),
  ..t.rows.flatten(),
)

#align(center + horizon)[
  #text(size: 24pt, weight: "bold")[Elupedia]
  #v(1em)
  Données au #data.asOf
]
#pagebreak()

= Parrainages
#tableau(data.tables.parrainages)

= Comptes de campagne
#tableau(data.tables.comptes)

= Collaborateurs
#tableau(data.tables.collaborateurs)

= Questions écrites
#tableau(data.tables.questions)

= L'âge des députés
#tableau(data.tables.age)

#pagebreak()
= Crédits et licences
Données : Assemblée nationale, Sénat, HATVP, CNCCFP, Conseil constitutionnel (Licence Ouverte 2.0). Cartes : © les contributeurs d'OpenStreetMap (ODbL).
