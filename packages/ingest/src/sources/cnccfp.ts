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

function parseAmount(raw: string | undefined): number | null {
  if (!raw || raw === '-' || raw.trim() === '') return null;
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : Math.round(n);
}

export function parseCandidateName(raw: string): {
  lastName: string;
  firstName: string;
} {
  const withoutTitle = raw.replace(/^(?:M\.|Mme|Mlle)\s+/i, '');
  const parts = withoutTitle.split(/\s+/);
  const upperParts: string[] = [];
  const rest: string[] = [];
  for (const p of parts) {
    if (p === p.toUpperCase() && p.length > 1) {
      upperParts.push(p);
    } else {
      rest.push(p);
    }
  }
  if (upperParts.length === 0) {
    return { lastName: parts[0] ?? '', firstName: parts.slice(1).join(' ') };
  }
  return {
    lastName: upperParts.join(' '),
    firstName: rest.join(' '),
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

function findHeader(
  row: Record<string, string>,
  ...candidates: string[]
): string | undefined {
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c];
  }
  return undefined;
}

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

  const headerIdx = lines.findIndex((l) => l.startsWith('candidat;'));
  if (headerIdx === -1) {
    throw new Error('CNCCFP CSV: header line not found');
  }

  const headers = lines[headerIdx].split(';');
  const rows: CnccfpRow[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith(';')) continue;

    const values = line.split(';');
    const r = parseCsvRow(headers, values);

    const cnccfpId = r['candidat'];
    if (!cnccfpId) continue;

    const decision = r['decision']?.trim();
    if (!decision) continue;

    const name = r['nom'] ?? '';
    const parsed = parseCandidateName(name);

    rows.push({
      cnccfpId,
      candidateName: name,
      lastName: parsed.lastName,
      firstName: parsed.firstName,
      constituency: r['circonscription'] ?? '',
      department: findHeader(r, 'département', 'departement') ?? '',
      departmentCode:
        findHeader(r, 'code département', 'code departement') ?? '',
      politicalLabel: r['nuance'] || null,
      expensesDeclared: parseAmount(
        findHeader(
          r,
          'dépenses totales déclarées',
          'depenses totales declarees',
        ),
      ),
      expensesRetained: parseAmount(findHeader(r, 'depenses totales retenues')),
      revenueDeclared: parseAmount(
        findHeader(
          r,
          'recettes totales déclarées',
          'recettes totales declarees',
        ),
      ),
      revenueRetained: parseAmount(findHeader(r, 'recettes totales retenues')),
      donationsDeclared: parseAmount(
        findHeader(r, 'dons déclarés', 'dons declares'),
      ),
      donationsRetained: parseAmount(findHeader(r, 'dons retenus')),
      personalContributionDeclared: parseAmount(
        findHeader(r, 'apport personnel déclaré', 'apport personnel declare'),
      ),
      personalContributionRetained: parseAmount(
        findHeader(r, 'apport personnel retenu'),
      ),
      partyContributionsDeclared: parseAmount(
        findHeader(r, 'concours déclarés', 'concours declares'),
      ),
      partyContributionsRetained: parseAmount(
        findHeader(r, 'concours retenus'),
      ),
      reimbursement: parseAmount(r['RFE']),
      decision,
    });
  }

  logger.info(`[CNCCFP] Parsed ${rows.length} rows for ${election.id}`);
  return rows;
}
