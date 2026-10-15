/**
 * Parrainages (« signatures ») des candidats à l'élection présidentielle,
 * publiés par le Conseil constitutionnel via data.gouv.fr.
 *
 * Source : un CSV par scrutin (PARRAINAGES_ELECTIONS), séparateur « ; »,
 * valeurs parfois entre guillemets, une ligne par parrainage. Colonnes dans
 * l'ordre : civilité, nom, prénom, mandat, circonscription (commune ou
 * territoire), département, candidat parrainé, date de publication
 * (JJ/MM/AAAA). L'en-tête de la colonne candidat change selon l'année
 * (`candidateColumn`), mais la position des colonnes est stable : le parsing
 * est positionnel.
 *
 * Extrait : une `ParrainageRow` par ligne complète, date au format ISO.
 *
 * Pièges : les guillemets ne sont retirés qu'en début/fin de champ ; un
 * champ contenant « ; » décalerait les colonnes. Une date illisible est
 * conservée telle quelle.
 *
 * Appelé par main-parrainages.ts via upsert/sponsorships.ts.
 */
import { logger } from '../logger.js';

export interface ParrainageElection {
  year: number;
  url: string;
  /** Intitulé de la colonne « candidat » dans l'en-tête de ce millésime. */
  candidateColumn: string;
}

export const PARRAINAGES_ELECTIONS: ParrainageElection[] = [
  {
    year: 2022,
    url: 'https://static.data.gouv.fr/resources/parrainages-des-candidats-a-lelection-presidentielle-francaise-de-2022/20220307-183308/parrainagestotal.csv',
    candidateColumn: 'Candidat',
  },
  {
    year: 2017,
    url: 'https://static.data.gouv.fr/resources/parrainages/20170320-103202/parrainagestotal.csv',
    candidateColumn: 'Candidat-e parrainé-e',
  },
];

export interface ParrainageRow {
  civilite: string;
  nom: string;
  prenom: string;
  mandat: string;
  circonscription: string;
  departement: string;
  candidat: string;
  datePublication: string;
}

const CSV_SEPARATOR = ';';

// Positions des colonnes dans le CSV.
const COL_CIVILITE = 0;
const COL_NOM = 1;
const COL_PRENOM = 2;
const COL_MANDAT = 3;
const COL_CIRCONSCRIPTION = 4;
const COL_DEPARTEMENT = 5;
const COL_CANDIDAT = 6;
const COL_DATE_PUBLICATION = 7;
const MIN_COLUMNS = 8;

/** « JJ/MM/AAAA » → AAAA-MM-JJ ; null si autre format. */
function parseDateFr(raw: string): string | null {
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function stripQuotes(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  return value;
}

/**
 * Télécharge et parse le CSV d'un scrutin. Lève si le téléchargement échoue
 * ou si le fichier n'a pas au moins une ligne après l'en-tête.
 */
export async function fetchParrainages(
  election: ParrainageElection,
  fetchFn: typeof fetch = fetch,
): Promise<ParrainageRow[]> {
  logger.info(`[Parrainages] Fetching ${election.year} from ${election.url}`);
  const response = await fetchFn(election.url);
  if (!response.ok) {
    throw new Error(
      `Parrainages fetch error: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  const lines = text.split(/\r?\n/);

  if (lines.length < 2) {
    throw new Error('Parrainages CSV: too few lines');
  }

  const rows: ParrainageRow[] = [];

  // La première ligne est l'en-tête.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const columns = line.split(CSV_SEPARATOR).map(stripQuotes);
    if (columns.length < MIN_COLUMNS) continue;

    rows.push({
      civilite: columns[COL_CIVILITE],
      nom: columns[COL_NOM],
      prenom: columns[COL_PRENOM],
      mandat: columns[COL_MANDAT],
      circonscription: columns[COL_CIRCONSCRIPTION],
      departement: columns[COL_DEPARTEMENT],
      candidat: columns[COL_CANDIDAT],
      datePublication:
        parseDateFr(columns[COL_DATE_PUBLICATION]) ??
        columns[COL_DATE_PUBLICATION],
    });
  }

  logger.info(`[Parrainages] Parsed ${rows.length} rows for ${election.year}`);
  return rows;
}
