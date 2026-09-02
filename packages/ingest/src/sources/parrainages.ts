import { logger } from '../logger.js';

export interface ParrainageElection {
  year: number;
  url: string;
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

function parseDateFr(raw: string): string | null {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function stripQuotes(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

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

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(';').map(stripQuotes);
    if (cols.length < 8) continue;

    rows.push({
      civilite: cols[0],
      nom: cols[1],
      prenom: cols[2],
      mandat: cols[3],
      circonscription: cols[4],
      departement: cols[5],
      candidat: cols[6],
      datePublication: parseDateFr(cols[7]) ?? cols[7],
    });
  }

  logger.info(`[Parrainages] Parsed ${rows.length} rows for ${election.year}`);
  return rows;
}
