import * as XLSX from 'xlsx';
import { logger } from '../logger.js';

const ELECTION_URLS: Record<string, { url: string; date: string }> = {
  '2023': {
    url: 'https://www.data.gouv.fr/api/1/datasets/r/26158ed7-7637-4707-bb37-2d3155fad10a',
    date: '2023-09-24',
  },
};

export { ELECTION_URLS };

export interface SenatElectionResult {
  nom: string;
  prenom: string;
  electionDate: string;
  round: number;
  scorePercent: number;
  opponentCount: number;
}

interface CandidateResult {
  nom: string;
  prenom: string;
  scorePercent: number;
  elected: boolean;
}

function parsePercent(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(',', '.').replace('%', '').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function parseMajSheet(
  sheet: XLSX.WorkSheet,
  round: number,
  electionDate: string,
): SenatElectionResult[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });
  const results: SenatElectionResult[] = [];

  for (const row of rows) {
    const candidates: CandidateResult[] = [];

    for (let i = 1; i <= 20; i++) {
      const nom = row[`Nom candidat ${i}`];
      if (!nom || typeof nom !== 'string' || nom.trim() === '') break;

      const prenom = (row[`Prénom candidat ${i}`] ?? '') as string;
      const voixPct = row[`% Voix/exprimés ${i}`];
      const elu = row[`Elu ${i}`];

      candidates.push({
        nom: nom.trim(),
        prenom: prenom.trim(),
        scorePercent: parsePercent(voixPct),
        elected: typeof elu === 'string' && elu.toLowerCase().includes('lu'),
      });
    }

    const opponentCount = candidates.length - 1;

    for (const c of candidates) {
      if (c.elected) {
        results.push({
          nom: c.nom,
          prenom: c.prenom,
          electionDate,
          round,
          scorePercent: c.scorePercent,
          opponentCount: Math.max(opponentCount, 0),
        });
      }
    }
  }

  return results;
}

function parsePropSheet(
  sheet: XLSX.WorkSheet,
  electionDate: string,
): SenatElectionResult[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });
  const results: SenatElectionResult[] = [];

  for (const row of rows) {
    const candidates: CandidateResult[] = [];

    for (let i = 1; i <= 20; i++) {
      const nom = row[`Nom candidat ${i}`];
      if (!nom || typeof nom !== 'string' || nom.trim() === '') {
        const listName = row[`Libellé de liste ${i}`];
        if (!listName || typeof listName !== 'string' || listName.trim() === '')
          break;
        continue;
      }

      const prenom = (row[`Prénom candidat ${i}`] ?? '') as string;
      const voixPct = row[`% Voix/exprimés ${i}`];
      const elu = row[`Elu ${i}`];
      const sieges = row[`Sièges ${i}`];

      const isElected =
        (typeof elu === 'string' && elu.toLowerCase().includes('lu')) ||
        (typeof sieges === 'number' && sieges > 0) ||
        (typeof sieges === 'string' && parseInt(sieges, 10) > 0);

      candidates.push({
        nom: nom.trim(),
        prenom: prenom.trim(),
        scorePercent: parsePercent(voixPct),
        elected: isElected,
      });
    }

    const opponentCount = candidates.length - 1;

    for (const c of candidates) {
      if (c.elected) {
        results.push({
          nom: c.nom,
          prenom: c.prenom,
          electionDate,
          round: 1,
          scorePercent: c.scorePercent,
          opponentCount: Math.max(opponentCount, 0),
        });
      }
    }
  }

  return results;
}

export async function fetchSenatElections(
  year: string = '2023',
  fetchFn: typeof fetch = fetch,
): Promise<SenatElectionResult[]> {
  const config = ELECTION_URLS[year];
  if (!config) {
    throw new Error(`No election data configured for year ${year}`);
  }

  const res = await fetchFn(config.url);
  if (!res.ok) {
    throw new Error(`Sénat elections ${year} error: ${res.status}`);
  }

  const buffer = await res.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });

  const results: SenatElectionResult[] = [];

  const majT1 = workbook.Sheets['MAJ - T1'];
  if (majT1) {
    results.push(...parseMajSheet(majT1, 1, config.date));
  }

  const majT2 = workbook.Sheets['MAJ - T2'];
  if (majT2) {
    results.push(...parseMajSheet(majT2, 2, config.date));
  }

  const prop = workbook.Sheets['PROP'];
  if (prop) {
    results.push(...parsePropSheet(prop, config.date));
  }

  logger.info(
    `Sénat elections ${year}: ${results.length} elected with results`,
  );
  return results;
}
