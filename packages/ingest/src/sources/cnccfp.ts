/**
 * Comptes de campagne des candidats (CNCCFP, via data.gouv.fr).
 *
 * Source : un CSV par élection (voir CNCCFP_ELECTIONS), encodé en latin1,
 * séparateur « ; ». Le fichier commence par quelques lignes de préambule :
 * l'en-tête réel est la première ligne commençant par `candidat;`.
 *
 * Extrait : une `CnccfpRow` par candidat ayant une décision de la
 * Commission, avec les montants déclarés / retenus (dépenses, recettes, dons,
 * apport personnel, concours des partis) et le remboursement forfaitaire.
 *
 * Pièges :
 * - Les intitulés de colonnes varient d'une édition à l'autre (avec ou sans
 *   accents) : findHeader essaie plusieurs variantes.
 * - Les montants utilisent l'espace comme séparateur de milliers et la
 *   virgule décimale ; ils sont arrondis à l'euro.
 * - Le nom est au format « M. NOM Prénom » : parseCandidateName sépare les
 *   mots entièrement en majuscules (nom) du reste (prénom).
 *
 * Appelé par run.ts via upsert/campaign-accounts.ts.
 */
import { logger } from '../logger.js';

export interface CnccfpElection {
  id: string;
  type: 'legislatives' | 'senatoriales';
  date: string;
  url: string;
}

export const CNCCFP_ELECTIONS: CnccfpElection[] = [
  {
    id: 'legislatives_2024',
    type: 'legislatives',
    date: '2024-07-07',
    url: 'https://www.data.gouv.fr/api/1/datasets/r/3463dd11-0b7d-44f3-8b5e-25b33c5e9138',
  },
  {
    id: 'legislatives_2022',
    type: 'legislatives',
    date: '2022-06-19',
    url: 'https://www.data.gouv.fr/api/1/datasets/r/5fa22e75-3a77-4bdc-a6e4-83e3b87b9c35',
  },
  {
    id: 'senatoriales_2023',
    type: 'senatoriales',
    date: '2023-09-24',
    url: 'https://www.data.gouv.fr/api/1/datasets/r/4287f1ef-e746-47f7-9a82-d87f7e6597b2',
  },
];

export interface CnccfpRow {
  cnccfpId: string;
  candidateName: string;
  lastName: string;
  firstName: string;
  constituency: string;
  department: string;
  departmentCode: string;
  politicalLabel: string | null;
  expensesDeclared: number | null;
  expensesRetained: number | null;
  revenueDeclared: number | null;
  revenueRetained: number | null;
  donationsDeclared: number | null;
  donationsRetained: number | null;
  personalContributionDeclared: number | null;
  personalContributionRetained: number | null;
  partyContributionsDeclared: number | null;
  partyContributionsRetained: number | null;
  reimbursement: number | null;
  decision: string;
}

/** Préfixe de la ligne d'en-tête dans le CSV. */
const HEADER_LINE_PREFIX = 'candidat;';
const CSV_SEPARATOR = ';';

/** Montant « 12 345,67 » → 12346 ; null si vide, « - » ou non numérique. */
function parseAmount(raw: string | undefined): number | null {
  if (!raw || raw === '-' || raw.trim() === '') return null;
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  const amount = Number(cleaned);
  return Number.isNaN(amount) ? null : Math.round(amount);
}

/**
 * Sépare « M. BRETON Xavier » en nom (mots tout en majuscules) et prénom.
 * Sans mot en majuscules, le premier mot est pris comme nom.
 */
export function parseCandidateName(raw: string): {
  lastName: string;
  firstName: string;
} {
  const withoutTitle = raw.replace(/^(?:M\.|Mme|Mlle)\s+/i, '');
  const words = withoutTitle.split(/\s+/);
  const upperWords: string[] = [];
  const otherWords: string[] = [];
  for (const word of words) {
    // `length > 1` évite de prendre une initiale (« J. ») pour un nom.
    if (word === word.toUpperCase() && word.length > 1) {
      upperWords.push(word);
    } else {
      otherWords.push(word);
    }
  }
  if (upperWords.length === 0) {
    return { lastName: words[0] ?? '', firstName: words.slice(1).join(' ') };
  }
  return {
    lastName: upperWords.join(' '),
    firstName: otherWords.join(' '),
  };
}

function parseCsvRow(
  headers: string[],
  values: string[],
): Record<string, string> {
  const row: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    row[headers[i]] = values[i] ?? '';
  }
  return row;
}

/** Première colonne existante parmi plusieurs intitulés possibles. */
function findHeader(
  row: Record<string, string>,
  ...candidates: string[]
): string | undefined {
  for (const candidate of candidates) {
    if (row[candidate] !== undefined) return row[candidate];
  }
  return undefined;
}

/**
 * Télécharge et parse le CSV d'une élection. Lève si le téléchargement
 * échoue ou si la ligne d'en-tête est introuvable.
 */
export async function fetchCnccfpAccounts(
  election: CnccfpElection,
  fetchFn: typeof fetch = fetch,
): Promise<CnccfpRow[]> {
  logger.info(`[CNCCFP] Fetching ${election.id} from ${election.url}`);
  const response = await fetchFn(election.url);
  if (!response.ok) {
    throw new Error(
      `CNCCFP fetch error: ${response.status} ${response.statusText}`,
    );
  }

  const buffer = await response.arrayBuffer();
  const text = new TextDecoder('latin1').decode(buffer);
  const lines = text.split(/\r?\n/);

  const headerIndex = lines.findIndex((line) =>
    line.startsWith(HEADER_LINE_PREFIX),
  );
  if (headerIndex === -1) {
    throw new Error('CNCCFP CSV: header line not found');
  }

  const headers = lines[headerIndex].split(CSV_SEPARATOR);
  const rows: CnccfpRow[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    // Lignes vides ou de totaux (première colonne vide) ignorées.
    if (!line || line.startsWith(CSV_SEPARATOR)) continue;

    const values = line.split(CSV_SEPARATOR);
    const row = parseCsvRow(headers, values);

    const cnccfpId = row['candidat'];
    if (!cnccfpId) continue;

    const decision = row['decision']?.trim();
    if (!decision) continue;

    const name = row['nom'] ?? '';
    const parsedName = parseCandidateName(name);

    rows.push({
      cnccfpId,
      candidateName: name,
      lastName: parsedName.lastName,
      firstName: parsedName.firstName,
      constituency: row['circonscription'] ?? '',
      department: findHeader(row, 'département', 'departement') ?? '',
      departmentCode:
        findHeader(row, 'code département', 'code departement') ?? '',
      politicalLabel: row['nuance'] || null,
      expensesDeclared: parseAmount(
        findHeader(
          row,
          'dépenses totales déclarées',
          'depenses totales declarees',
        ),
      ),
      expensesRetained: parseAmount(
        findHeader(row, 'depenses totales retenues'),
      ),
      revenueDeclared: parseAmount(
        findHeader(
          row,
          'recettes totales déclarées',
          'recettes totales declarees',
        ),
      ),
      revenueRetained: parseAmount(
        findHeader(row, 'recettes totales retenues'),
      ),
      donationsDeclared: parseAmount(
        findHeader(row, 'dons déclarés', 'dons declares'),
      ),
      donationsRetained: parseAmount(findHeader(row, 'dons retenus')),
      personalContributionDeclared: parseAmount(
        findHeader(row, 'apport personnel déclaré', 'apport personnel declare'),
      ),
      personalContributionRetained: parseAmount(
        findHeader(row, 'apport personnel retenu'),
      ),
      partyContributionsDeclared: parseAmount(
        findHeader(row, 'concours déclarés', 'concours declares'),
      ),
      partyContributionsRetained: parseAmount(
        findHeader(row, 'concours retenus'),
      ),
      // RFE = remboursement forfaitaire de l'État.
      reimbursement: parseAmount(row['RFE']),
      decision,
    });
  }

  logger.info(`[CNCCFP] Parsed ${rows.length} rows for ${election.id}`);
  return rows;
}
