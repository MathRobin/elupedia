export interface GlossaryStat {
  label: string;
  value: string;
}

export interface GlossaryRow {
  label: string;
  detail?: string;
  value: string;
  pct?: number;
}

export interface GlossaryExample {
  title: string;
  subtitle: string;
  stats: GlossaryStat[];
  rows?: GlossaryRow[];
  note?: string;
  sourceName: string;
  sourceUrl: string;
}

export interface GlossarySection {
  heading: string;
  paragraphs: string[];
}

export interface GlossaryEntry {
  slug: string;
  term: string;
  category: string;
  shortDefinition: string;
  intro: string;
  sections: GlossarySection[];
  examples: [GlossaryExample, GlossaryExample];
  related?: string[];
}

export const glossaryEntries: GlossaryEntry[] = [
  {
    slug: 'panachage',
    term: 'Panachage',
    category: 'Municipales',
    shortDefinition:
      'Mode de scrutin des communes de moins de 1 000 habitants : les électeurs votent pour des candidats individuels, pas pour une liste bloquée.',
    intro:
      "Dans les communes de moins de 1 000 habitants, les élections municipales ne se déroulent pas selon un scrutin de liste comme dans les grandes villes. Elles utilisent un scrutin plurinominal majoritaire à deux tours avec panachage : chaque électeur peut voter pour des candidats pris individuellement, sur une ou plusieurs listes, jusqu'à concurrence du nombre de sièges à pourvoir au conseil municipal.",
    sections: [
      {
        heading: 'Comment ça marche',
        paragraphs: [
          "Un électeur peut cocher jusqu'à N noms (N étant le nombre de sièges du conseil municipal, généralement entre 7 et 15 pour les petites communes), en choisissant librement des candidats de différentes listes ou même en ajoutant des noms qui ne figuraient sur aucun bulletin (le panachage proprement dit).",
          "Chaque candidat reçoit donc un nombre de voix qui lui est propre, indépendant des autres candidats — y compris ceux de la même liste. Ce nombre n'a pas vocation à s'additionner à 100 % des suffrages exprimés : ce n'est pas un système où chaque électeur ne fait qu'un seul choix.",
          "Sont élus les candidats ayant obtenu le plus de voix, jusqu'à combler tous les sièges du conseil — et non les candidats d'une même « liste gagnante » comme dans un scrutin proportionnel.",
        ],
      },
      {
        heading: 'Pourquoi ça peut ressembler à une erreur',
        paragraphs: [
          "Voir dix ou vingt candidats afficher chacun un score compris entre 40 % et 60 % des exprimés peut surprendre si l'on s'attend à des pourcentages qui se répartissent 100 % entre tous les candidats, comme dans une élection à candidat unique. C'est pourtant parfaitement normal : dans une petite commune où une seule liste est en lice (ou deux listes très proches, votées « en bloc » par la majorité des électeurs), il est courant que la plupart des candidats affichent des scores proches et élevés.",
          "L'absence de champ « liste » associé aux candidats dans les données officielles (data.gouv.fr) est le signal fiable que le scrutin s'est déroulé en panachage plutôt qu'en liste bloquée.",
        ],
      },
    ],
    examples: [
      {
        title: 'Moissannes (Haute-Vienne)',
        subtitle: 'Municipales 2014 — Tour 1 · 23 mars 2014',
        stats: [
          { label: 'Inscrits', value: '305' },
          { label: 'Votants', value: '264' },
          { label: 'Exprimés', value: '256' },
        ],
        rows: [
          { label: 'Roland MALAGUISE', value: '147 voix', pct: 57.42 },
          { label: 'Jérôme LASSENE', value: '146 voix', pct: 57.03 },
          { label: 'Vincent MOURIER', value: '143 voix', pct: 55.86 },
          { label: 'Anthony SMITH', value: '136 voix', pct: 53.13 },
          { label: 'Jean-Michel VIZIERES', value: '93 voix', pct: 36.33 },
        ],
        note: "22 candidats au total, de 93 à 147 voix — les scores se chevauchent largement sans s'additionner à 100 %.",
        sourceName: 'Municipales 2014 · data.gouv.fr',
        sourceUrl:
          'https://www.data.gouv.fr/fr/datasets/elections-municipales-2014-1er-et-2e-tour/',
      },
      {
        title: 'Saussay (Seine-Maritime)',
        subtitle: 'Municipales 2020 — Tour 1 · 15 mars 2020',
        stats: [
          { label: 'Inscrits', value: '294' },
          { label: 'Votants', value: '186' },
          { label: 'Exprimés', value: '179' },
        ],
        rows: [
          { label: 'Sabrina VIGER', value: '175 voix', pct: 97.77 },
          { label: 'Olivier RAULIN', value: '173 voix', pct: 96.65 },
          { label: 'Hélène BOONE', value: '172 voix', pct: 96.09 },
          { label: 'Benoît REYDANT', value: '172 voix', pct: 96.09 },
          { label: 'Rémy BONAMY', value: '162 voix', pct: 90.5 },
        ],
        note: 'Ici, les 11 candidats forment une liste quasi consensuelle : tous dépassent 90 % des exprimés, un schéma fréquent quand une seule équipe se présente.',
        sourceName: 'Municipales 2020 · data.gouv.fr',
        sourceUrl:
          'https://www.data.gouv.fr/fr/datasets/elections-municipales-des-15-et-22-mars-2020-resultats-des-communes-de-moins-de-1-000-habitants-1er-tour/',
      },
    ],
    related: ['triangulaire-quadrangulaire', 'prime-majoritaire'],
  },
  {
    slug: 'senat-scrutin-mixte',
    term: 'Scrutin sénatorial mixte',
    category: 'Sénatoriales',
    shortDefinition:
      'Le mode de scrutin des sénatoriales change selon le nombre de sièges du département : majoritaire à deux tours dans les petits départements, proportionnel de liste dans les grands.',
    intro:
      "Contrairement aux autres élections nationales, les sénatoriales n'ont pas un mode de scrutin unique : il dépend du nombre de sénateurs à élire dans chaque département. Un département élisant 1 ou 2 sénateurs vote au scrutin majoritaire à deux tours, comme une élection législative classique. Un département élisant 3 sénateurs ou plus vote à la proportionnelle de liste, en un seul tour.",
    sections: [
      {
        heading: 'Deux logiques bien différentes',
        paragraphs: [
          "Au scrutin majoritaire (1 ou 2 sièges), chaque candidat se présente individuellement. Il est élu dès le premier tour s'il obtient la majorité absolue des suffrages exprimés et un nombre de voix au moins égal au quart des inscrits ; à défaut, un second tour a lieu où la majorité relative suffit.",
          "Au scrutin proportionnel (3 sièges ou plus), les candidats se présentent en listes complètes, en un seul tour. Les sièges sont répartis à la représentation proportionnelle (plus forte moyenne) entre les listes ayant obtenu au moins 5 % des exprimés. Tous les candidats d'une même liste — en tête comme en dernière position — reçoivent alors le même nombre de voix : celui de leur liste, pas un score individuel.",
        ],
      },
      {
        heading: 'Un corps électoral restreint',
        paragraphs: [
          "Autre singularité du Sénat : les sénateurs ne sont pas élus au suffrage universel direct, mais par un collège de « grands électeurs » (député·e·s, conseiller·ère·s régionaux et départementaux, délégués des conseils municipaux) — de quelques centaines à quelques milliers de personnes selon le département. Les chiffres d'inscrits et de votants sont donc sans rapport avec la population du département : rien d'anormal à voir un scrutin avec seulement 350 ou 1 000 votants pour élire le ou les sénateurs d'un territoire entier.",
        ],
      },
    ],
    examples: [
      {
        title: 'Lozère — scrutin majoritaire (1 siège)',
        subtitle: 'Sénatoriales 2023 — Tour 1 · 24 septembre 2023',
        stats: [
          { label: 'Grands électeurs', value: '358' },
          { label: 'Votants', value: '354' },
          { label: 'Exprimés', value: '348' },
        ],
        rows: [
          { label: 'Guylène PANTEL', value: '187 voix', pct: 53.74 },
          { label: 'Alain ASTRUC', value: '133 voix', pct: 38.22 },
          { label: 'Serge GAYSSOT', value: '22 voix', pct: 6.32 },
          { label: 'Michelle JACQUES', value: '6 voix', pct: 1.72 },
        ],
        note: 'Guylène Pantel dépasse la majorité absolue dès le premier tour et est élue directement — un scrutin candidat contre candidat, comme une législative.',
        sourceName: 'Sénatoriales 2023 · Sénat (senatoriales2023.senat.fr)',
        sourceUrl: 'https://www.senat.fr/',
      },
      {
        title: 'Manche — scrutin proportionnel (3 sièges)',
        subtitle: 'Sénatoriales 2023 — Tour unique · 24 septembre 2023',
        stats: [
          { label: 'Sièges à pourvoir', value: '3' },
          { label: 'Listes en présence', value: '8' },
          { label: 'Sièges à la liste 1', value: '2' },
        ],
        rows: [
          {
            label: 'Liste Union de la Droite',
            detail: '772 voix',
            value: '47,25 % — 2 élus',
          },
          {
            label: 'Liste Union de la Gauche',
            detail: '359 voix',
            value: '21,97 % — 1 élu',
          },
        ],
        note: "Sur la liste Union de la Droite, Philippe Bas ET Philippe Gosselin sont tous deux crédités des mêmes 772 voix : ce n'est pas une erreur de saisie, c'est le score de la liste entière.",
        sourceName: 'Sénatoriales 2023 · Sénat',
        sourceUrl: 'https://senatoriales2023.senat.fr/departement/50-manche',
      },
    ],
    related: ['prime-majoritaire'],
  },
  {
    slug: 'secteurs-plm',
    term: 'Secteurs électoraux (loi PLM)',
    category: 'Municipales',
    shortDefinition:
      'À Paris, Lyon et Marseille, les municipales se jouent par secteur regroupant plusieurs arrondissements, chacun avec ses propres inscrits, votants et résultats.',
    intro:
      "Depuis la loi du 31 décembre 1982 dite « loi PLM », Paris, Lyon et Marseille ne votent pas comme les autres communes de plus de 1 000 habitants. Chaque ville est découpée en secteurs regroupant un ou plusieurs arrondissements, et chaque secteur élit ses propres conseillers d'arrondissement lors d'un scrutin de liste à deux tours qui lui est propre — avec ses propres inscrits, votants et résultats, distincts du reste de la ville.",
    sections: [
      {
        heading: 'Un scrutin par secteur, pas par ville',
        paragraphs: [
          "À Paris, les 17 arrondissements sont regroupés en 17 secteurs électoraux distincts (le 1er secteur regroupe les 1er, 2e, 3e et 4e arrondissements). À Marseille, 8 secteurs regroupent les 16 arrondissements. À Lyon, chacun des 9 arrondissements forme son propre secteur. Chaque secteur a son propre corps électoral, son propre nombre d'inscrits/votants/exprimés, et élit à la fois des conseillers d'arrondissement et une partie des conseillers municipaux de la ville entière.",
          "Conséquence directe pour la lecture des données : un « maire » d'arrondissement ou de secteur (maire du 1er secteur de Paris, par exemple) n'est pas le maire de la ville entière, et ses chiffres électoraux (inscrits, votants, scores) ne portent que sur son secteur — pas sur l'ensemble de la commune.",
        ],
      },
      {
        heading: 'Une source de données à part',
        paragraphs: [
          "Le Répertoire National des Élus (RNE), qui répertorie les maires des ~34 800 communes françaises, ne recense que les maires des trois villes entières (Paris, Lyon, Marseille) — pas les maires d'arrondissement ou de secteur, qui relèvent d'un statut à part. Leurs résultats électoraux détaillés, en revanche, figurent bien dans les fichiers de résultats communaux de data.gouv.fr, secteur par secteur.",
        ],
      },
    ],
    examples: [
      {
        title: 'Paris — 1er secteur (1er, 2e, 3e, 4e arr.)',
        subtitle: 'Municipales 2020 — Tour 2 · 28 juin 2020',
        stats: [
          { label: 'Inscrits', value: '65 557' },
          { label: 'Votants', value: '26 495' },
          { label: 'Exprimés', value: '25 904' },
        ],
        rows: [
          {
            label: 'Liste Ariel WEIL',
            detail: 'liste menée par le maire sortant',
            value: '53,32 % — 12 sièges',
          },
        ],
        note: 'Ce secteur, qui pèse à peine plus que le 1/20e de la population parisienne, élit néanmoins son propre maire de secteur et une partie du conseil de Paris.',
        sourceName:
          "Municipales 2020 · Ministère de l'Intérieur (archives-resultats-elections.interieur.gouv.fr)",
        sourceUrl:
          'https://www.archives-resultats-elections.interieur.gouv.fr/resultats/municipales-2020/075/075056SR01.php',
      },
      {
        title: 'Marseille — secteur 4 (6e, 7e, 8e arr.)',
        subtitle: 'Municipales 2020 — Tour 2 · 28 juin 2020',
        stats: [
          { label: 'Inscrits', value: '80 199' },
          { label: 'Votants', value: '35 223' },
          { label: 'Exprimés', value: '34 647' },
        ],
        rows: [
          {
            label: 'Liste Bruno FORTIN',
            detail: 'liste arrivée en tête du secteur',
            value: '41,78 % — 22 sièges',
          },
        ],
        note: 'Sur les 8 secteurs marseillais, chacun a son propre calendrier de dépouillement et ses propres résultats — la « ville de Marseille » au sens électoral, ce sont 8 scrutins simultanés.',
        sourceName:
          "Municipales 2020 · Ministère de l'Intérieur (archives-resultats-elections.interieur.gouv.fr)",
        sourceUrl:
          'https://www.archives-resultats-elections.interieur.gouv.fr/resultats/municipales-2020/013/013055SR04.php',
      },
    ],
    related: ['commune-nouvelle'],
  },
  {
    slug: 'triangulaire-quadrangulaire',
    term: 'Triangulaire / quadrangulaire',
    category: 'Législatives',
    shortDefinition:
      'Un second tour avec plus de deux candidats ou listes en lice, quand plusieurs ont franchi le seuil de qualification — normal, pas un raté du dépouillement.',
    intro:
      "Aux élections législatives et aux municipales des communes de plus de 1 000 habitants, le second tour n'oppose pas systématiquement deux candidats ou deux listes. Dès lors que plus de deux d'entre eux franchissent le seuil légal de qualification, ils sont tous en lice au second tour : on parle de « triangulaire » à trois, de « quadrangulaire » à quatre, plus rarement au-delà.",
    sections: [
      {
        heading: 'Le seuil de qualification',
        paragraphs: [
          "Pour se maintenir au second tour d'une législative, un candidat doit avoir obtenu au premier tour un nombre de voix au moins égal à 12,5 % des électeurs inscrits (pas des seuls exprimés). Avec une abstention élevée, ce seuil peut représenter une part très importante des exprimés, ce qui limite le nombre de qualifiés ; à l'inverse, avec une forte participation et une offre politique éclatée, trois ou quatre candidats peuvent facilement le franchir.",
          "Le phénomène s'est nettement accru lors des législatives 2024, où la recomposition du paysage politique (Nouveau Front populaire, Ensemble, Rassemblement national, Les Républicains) a produit plusieurs centaines de triangulaires — du jamais vu depuis les débuts de la Ve République.",
        ],
      },
      {
        heading: 'Le cas du maintien symbolique',
        paragraphs: [
          "Il arrive qu'un candidat qualifié pour une triangulaire ou une quadrangulaire annonce publiquement son retrait et appelle à voter pour un autre, sans que son nom disparaisse du bulletin officiel (les délais légaux de retrait sont très courts). Il peut alors recueillir quelques dizaines de voix seulement au second tour, largement décorrélées de son score du premier tour — ce qui peut ressembler à une anomalie mais reflète simplement un retrait de dernière minute non reflété sur le bulletin.",
        ],
      },
    ],
    examples: [
      {
        title: "3e circonscription de l'Allier — Montluçon",
        subtitle: 'Législatives 2024 — Tour 2 · 7 juillet 2024',
        stats: [
          { label: 'Inscrits', value: '20 930' },
          { label: 'Votants', value: '13 579' },
          { label: 'Exprimés', value: '13 119' },
        ],
        rows: [
          {
            label: 'Jorys BOVET',
            detail: 'RN',
            value: '4 932 voix',
            pct: 37.59,
          },
          {
            label: 'Louise HERITIER',
            detail: 'Union de la Gauche',
            value: '4 410 voix',
            pct: 33.62,
          },
          {
            label: 'Romain LEFEBVRE',
            detail: 'LR',
            value: '3 777 voix',
            pct: 28.79,
          },
        ],
        note: 'Trois candidats en lice, aucun ne dépassant 38 % — une vraie triangulaire à trois camps distincts.',
        sourceName:
          "Législatives 2024 · Ministère de l'Intérieur (data.gouv.fr)",
        sourceUrl:
          'https://www.data.gouv.fr/fr/datasets/resultats-des-elections-legislatives-2024/',
      },
      {
        title: "14e circonscription du Rhône — Val d'Oingt",
        subtitle: 'Législatives 2024 — Tour 2 · 7 juillet 2024',
        stats: [
          { label: 'Inscrits', value: '3 326' },
          { label: 'Votants', value: '2 523' },
          { label: 'Exprimés', value: '2 445' },
        ],
        rows: [
          {
            label: 'Anne REYMBAUT',
            detail: 'Union de la Gauche',
            value: '877 voix',
            pct: 35.87,
          },
          {
            label: 'Jonathan GERY',
            detail: 'RN',
            value: '858 voix',
            pct: 35.09,
          },
          {
            label: 'Nathalie SERRE',
            detail: 'LR',
            value: '703 voix',
            pct: 28.75,
          },
          {
            label: 'Dominique DESPRAS',
            detail: 'Ensemble',
            value: '7 voix',
            pct: 0.29,
          },
        ],
        note: "Quadrangulaire : le 4e candidat qualifié ne recueille que 7 voix (0,29 %) au second tour, signe d'un maintien resté purement formel.",
        sourceName:
          "Législatives 2024 · Ministère de l'Intérieur (data.gouv.fr)",
        sourceUrl:
          'https://www.data.gouv.fr/fr/datasets/resultats-des-elections-legislatives-2024/',
      },
    ],
    related: ['fusion-de-listes', 'panachage'],
  },
  {
    slug: 'fusion-de-listes',
    term: 'Fusion de listes entre les deux tours',
    category: 'Municipales',
    shortDefinition:
      "Entre les deux tours d'une élection de liste, une liste peut disparaître pour fusionner avec une autre — ses candidats et une partie de ses voix rejoignent alors la liste fusionnée.",
    intro:
      "Aux municipales des communes de plus de 1 000 habitants comme aux régionales, une liste ayant obtenu entre 5 % et 10 % des exprimés au premier tour ne peut pas se maintenir seule au second tour, mais elle peut fusionner avec une liste ayant obtenu au moins 10 % (le seuil pour se maintenir de plein droit). Ses candidats intègrent alors la liste d'accueil pour le second tour, et la liste d'origine disparaît des bulletins.",
    sections: [
      {
        heading: 'Pourquoi les listes changent entre les deux tours',
        paragraphs: [
          "Une fusion se négocie dans les 3 jours suivant le premier tour, généralement pour additionner les voix de deux sensibilités proches face à une liste concurrente. Le nom de la liste change parfois (fusion des deux têtes de liste), et sa composition intègre des candidats des deux listes d'origine — ce qui peut dérouter si l'on compare directement les listes du tour 1 et du tour 2 sans connaître cet accord.",
          "Le score de la liste fusionnée au second tour n'est pas non plus une simple addition mécanique des scores du premier tour : une partie des électeurs de la liste absorbée peut s'abstenir, voter blanc ou se reporter sur une autre liste malgré l'accord officiel entre états-majors.",
        ],
      },
    ],
    examples: [
      {
        title: 'Nancy (Meurthe-et-Moselle)',
        subtitle: 'Municipales 2020 · 15 mars et 28 juin 2020',
        stats: [
          { label: 'Liste Klein (T1)', value: '37,88 %' },
          { label: 'Liste Watrin (T1)', value: '10,24 %' },
          { label: 'Liste fusionnée (T2)', value: '54,53 %' },
        ],
        rows: [
          {
            label: 'Liste Mathieu Klein',
            detail: 'fusion avec la liste EELV de Watrin · 54,53 % des voix',
            value: '43/55 sièges',
          },
        ],
        note: "La liste écologiste, arrivée 3e avec 10,24 % au premier tour, a fusionné avec la liste de tête (Klein, 37,88 %) : les deux scores ne s'additionnent pas exactement au second tour, mais la dynamique de la fusion porte la liste à la majorité absolue des sièges.",
        sourceName: "Municipales 2020 · Ministère de l'Intérieur",
        sourceUrl:
          'https://www.archives-resultats-elections.interieur.gouv.fr/resultats/municipales-2020/054/054395.php',
      },
      {
        title: 'Bourgogne-Franche-Comté',
        subtitle: 'Régionales 2021 · 20 et 27 juin 2021',
        stats: [
          { label: 'Liste Dufay (T1)', value: '26,52 %' },
          { label: 'Liste Modde (T1)', value: '10,34 %' },
          { label: 'Liste fusionnée (T2)', value: '42,2 %' },
        ],
        rows: [
          {
            label: 'Liste Marie-Guite Dufay',
            detail:
              'fusion avec la liste EELV de Stéphanie Modde · 42,2 % des voix',
            value: '57/100 sièges',
          },
        ],
        note: "Une fusion classique de listes de gauche et écologistes entre les deux tours d'une régionale, où la prime majoritaire (voir cette entrée du glossaire) transforme 42,2 % des voix en majorité absolue des sièges.",
        sourceName: 'Régionales 2021 · France Bleu',
        sourceUrl:
          'https://www.francebleu.fr/infos/politique/regionales-2021-marie-guite-dufay-reelue-a-la-tete-de-la-region-bourgogne-franche-comte-1624821600',
      },
    ],
    related: ['prime-majoritaire', 'triangulaire-quadrangulaire'],
  },
  {
    slug: 'prime-majoritaire',
    term: 'Prime majoritaire',
    category: 'Municipales',
    shortDefinition:
      'Dans les scrutins de liste (municipales de plus de 1000 hab., régionales), la liste arrivée en tête obtient automatiquement la moitié des sièges, quel que soit son score.',
    intro:
      "Aux municipales des communes de plus de 1 000 habitants et aux régionales, le mode de répartition des sièges n'est pas strictement proportionnel au nombre de voix. La liste arrivée en tête au second tour (ou au premier si elle obtient la majorité absolue) se voit attribuer automatiquement la moitié des sièges du conseil — la « prime majoritaire » — le reste étant réparti à la proportionnelle entre toutes les listes ayant obtenu au moins 5 % des exprimés, prime comprise.",
    sections: [
      {
        heading: 'Un mécanisme voulu pour donner une majorité stable',
        paragraphs: [
          'Ce système a été conçu pour éviter les conseils municipaux ou régionaux ingouvernables, émiettés entre de nombreuses petites listes sans majorité claire. En pratique, il peut transformer un score de 35 à 45 % des voix en 60 à 70 % des sièges : la liste gagnante repart avec la moitié du conseil rien que pour sa victoire, puis complète son score avec sa part proportionnelle.',
          'Ce décalage entre part des voix et part des sièges est parfaitement légal et documenté, mais peut sembler disproportionné à qui compare directement un pourcentage de voix à un nombre de sièges sans connaître la règle.',
        ],
      },
    ],
    examples: [
      {
        title: 'Lille (Nord)',
        subtitle: 'Municipales 2020 — Tour 2 · 28 juin 2020',
        stats: [
          { label: 'Score de la liste gagnante', value: '40,00 %' },
          { label: 'Sièges obtenus', value: '43' },
          { label: 'Sièges au conseil', value: '61' },
        ],
        rows: [
          {
            label: 'Liste Martine Aubry',
            detail: '40,00 % des voix',
            value: '43/61 sièges',
          },
        ],
        note: 'Avec seulement 40 % des suffrages exprimés, la liste arrivée en tête obtient plus des deux tiers des sièges du conseil municipal — la prime majoritaire (la moitié des sièges) plus sa part proportionnelle du reste.',
        sourceName: "Municipales 2020 · Ministère de l'Intérieur",
        sourceUrl:
          'https://www.archives-resultats-elections.interieur.gouv.fr/resultats/municipales-2020/059/059350.php',
      },
      {
        title: 'Nouvelle-Aquitaine',
        subtitle: 'Régionales 2021 — Tour 2 · 27 juin 2021',
        stats: [
          { label: 'Score de la liste gagnante', value: '39,51 %' },
          { label: 'Sièges obtenus', value: '101' },
          { label: 'Sièges au conseil', value: '183' },
        ],
        rows: [
          {
            label: 'Liste Alain Rousset',
            detail: '39,51 % des voix',
            value: '101/183 sièges',
          },
        ],
        note: 'Même mécanisme au niveau régional : un score inférieur à 40 % suffit à obtenir la majorité absolue des sièges du conseil régional grâce à la prime.',
        sourceName:
          'Régionales 2021 · Wikipédia (données de synthèse des résultats officiels)',
        sourceUrl:
          'https://fr.wikipedia.org/wiki/%C3%89lections_r%C3%A9gionales_de_2021_en_Nouvelle-Aquitaine',
      },
    ],
    related: ['fusion-de-listes', 'panachage'],
  },
  {
    slug: 'commune-nouvelle',
    term: 'Commune nouvelle et maire délégué',
    category: 'Communes',
    shortDefinition:
      "Une commune nouvelle naît de la fusion de plusieurs communes ; chaque ancienne commune devient une commune déléguée avec son propre maire délégué, sous l'autorité d'un maire unique.",
    intro:
      "Depuis la loi du 16 mars 2015, des communes voisines peuvent fusionner volontairement pour former une « commune nouvelle », dotée d'un conseil municipal et d'un maire uniques. Chaque ancienne commune conserve toutefois une existence symbolique sous la forme d'une « commune déléguée », avec son propre maire délégué — généralement désigné par le conseil municipal de la commune nouvelle parmi ses membres, et non élu séparément au suffrage universel.",
    sections: [
      {
        heading: 'Un maire, plusieurs maires délégués',
        paragraphs: [
          "Une commune nouvelle peut ainsi compter, à un instant donné, un maire pour l'ensemble du territoire fusionné et plusieurs maires délégués — un par ancienne commune — qui conservent des attributions limitées (état civil, cérémonies locales). Vu de l'extérieur, deux personnes différentes peuvent donc porter un titre de « maire » sur un même territoire élargi sans que ce soit une incohérence : l'un dirige la commune nouvelle, les autres leur ancienne commune respective.",
          'Le Répertoire National des Élus (RNE), qui alimente la plupart des bases de données sur les maires français, ne recense en principe que le maire de la commune nouvelle — pas les maires délégués, dont le statut et la source de désignation diffèrent.',
        ],
      },
    ],
    examples: [
      {
        title: 'Tourneville-sur-Mer (Manche)',
        subtitle:
          'Création au 1er janvier 2023 · arrêté préfectoral du 20 septembre 2022',
        stats: [
          { label: 'Communes fusionnées', value: '2' },
          { label: 'Population', value: '≈ 1 670 hab.' },
          { label: 'Maires délégués', value: '2' },
        ],
        rows: [
          {
            label: 'Maire délégué de Lingreville',
            value: 'Xavier de Woillemont',
          },
        ],
        note: "Fusion des anciennes communes d'Annoville et de Lingreville — chacune conserve son maire délégué au sein de la nouvelle commune.",
        sourceName: 'Commune de Tourneville-sur-Mer (site officiel)',
        sourceUrl: 'https://tournevillesurmer.fr/les-elus/',
      },
      {
        title: 'Culoz-Béon (Ain)',
        subtitle:
          'Création au 1er janvier 2023 · arrêté préfectoral du 12 décembre 2022',
        stats: [
          { label: 'Communes fusionnées', value: '2' },
          { label: 'Population', value: '≈ 3 447 hab.' },
          { label: 'Maires délégués', value: '2' },
        ],
        rows: [{ label: 'Maire délégué de Béon', value: 'Jean-Marc Dupont' }],
        note: 'Fusion des anciennes communes de Culoz et de Béon, actée lors du conseil municipal du 9 janvier 2023.',
        sourceName: 'Commune de Culoz-Béon (site officiel)',
        sourceUrl: 'https://www.culoz-beon.fr/',
      },
    ],
    related: ['secteurs-plm'],
  },
];

export function getGlossaryEntry(slug: string): GlossaryEntry | undefined {
  return glossaryEntries.find((e) => e.slug === slug);
}
