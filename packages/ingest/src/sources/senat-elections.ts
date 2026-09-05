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

export interface SenatorialCandidate {
  nom: string;
  prenom: string;
  sexe: string | null;
  nuance: string | null;
  voix: number;
  scorePercent: number;
  elected: boolean;
}

export interface SenatorialDepartementResult {
  electionYear: string;
  departementCode: string;
  departementName: string | null;
  scrutinType: 'majoritaire' | 'proportionnel';
  round: number;
  electionDate: string;
  inscrits: number;
  votants: number;
  abstentions: number;
  blancs: number;
  nuls: number;
  exprimes: number;
  candidates: SenatorialCandidate[];
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

function parseIntSafe(raw: unknown): number {
  if (typeof raw === 'number') return Math.round(raw);
  if (typeof raw === 'string') {
    const n = parseInt(raw.replace(/\s/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

interface CandidateResult {
  nom: string;
  prenom: string;
  sexe: string | null;
  nuance: string | null;
  voix: number;
  scorePercent: number;
  elected: boolean;
}

function parseCandidatesFromRow(
  row: Record<string, unknown>,
): CandidateResult[] {
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
    const sexe = row[`Sexe candidat ${i}`];
    const nuance = row[`Nuance candidat ${i}`] || row[`Nuance liste ${i}`];
    const voix = parseIntSafe(row[`Voix ${i}`]);
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
      sexe: typeof sexe === 'string' && sexe.trim() ? sexe.trim() : null,
      nuance:
        typeof nuance === 'string' && nuance.trim() ? nuance.trim() : null,
      voix,
      scorePercent: parsePercent(voixPct),
      elected: isElected,
    });
  }

  return candidates;
}

function parseGeneralFromRow(row: Record<string, unknown>) {
  return {
    departementCode: String(row['Code département'] ?? '').trim(),
    departementName:
      typeof row['Libellé département'] === 'string'
        ? row['Libellé département'].trim()
        : null,
    inscrits: parseIntSafe(row['Inscrits']),
    votants: parseIntSafe(row['Votants']),
    abstentions: parseIntSafe(row['Abstentions']),
    blancs: parseIntSafe(row['Blancs']),
    nuls: parseIntSafe(row['Nuls']),
    exprimes: parseIntSafe(row['Exprimés']),
  };
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
    const candidates = parseCandidatesFromRow(row);
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

function parseMajSheetFull(
  sheet: XLSX.WorkSheet,
  round: number,
  year: string,
  electionDate: string,
): SenatorialDepartementResult[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });

  const byDept = new Map<string, SenatorialDepartementResult>();

  for (const row of rows) {
    const general = parseGeneralFromRow(row);
    if (!general.departementCode) continue;

    const candidates = parseCandidatesFromRow(row);
    const existing = byDept.get(general.departementCode);

    if (existing) {
      existing.inscrits += general.inscrits;
      existing.votants += general.votants;
      existing.abstentions += general.abstentions;
      existing.blancs += general.blancs;
      existing.nuls += general.nuls;
      existing.exprimes += general.exprimes;
      for (const c of candidates) {
        const match = existing.candidates.find(
          (ec) => ec.nom === c.nom && ec.prenom === c.prenom,
        );
        if (match) {
          match.voix += c.voix;
        } else {
          existing.candidates.push(c);
        }
      }
    } else {
      byDept.set(general.departementCode, {
        electionYear: year,
        scrutinType: 'majoritaire',
        round,
        electionDate,
        ...general,
        candidates,
      });
    }
  }

  return [...byDept.values()];
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
    const candidates = parseCandidatesFromRow(row);
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

function parsePropSheetFull(
  sheet: XLSX.WorkSheet,
  year: string,
  electionDate: string,
): SenatorialDepartementResult[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });

  const byDept = new Map<string, SenatorialDepartementResult>();

  for (const row of rows) {
    const general = parseGeneralFromRow(row);
    if (!general.departementCode) continue;

    const candidates = parseCandidatesFromRow(row);
    const existing = byDept.get(general.departementCode);

    if (existing) {
      existing.inscrits += general.inscrits;
      existing.votants += general.votants;
      existing.abstentions += general.abstentions;
      existing.blancs += general.blancs;
      existing.nuls += general.nuls;
      existing.exprimes += general.exprimes;
      for (const c of candidates) {
        const match = existing.candidates.find(
          (ec) => ec.nom === c.nom && ec.prenom === c.prenom,
        );
        if (match) {
          match.voix += c.voix;
        } else {
          existing.candidates.push(c);
        }
      }
    } else {
      byDept.set(general.departementCode, {
        electionYear: year,
        scrutinType: 'proportionnel',
        round: 1,
        electionDate,
        ...general,
        candidates,
      });
    }
  }

  return [...byDept.values()];
}

async function fetchWorkbook(
  year: string,
  fetchFn: typeof fetch,
): Promise<XLSX.WorkBook> {
  const config = ELECTION_URLS[year];
  if (!config) {
    throw new Error(`No election data configured for year ${year}`);
  }

  const res = await fetchFn(config.url);
  if (!res.ok) {
    throw new Error(`Sénat elections ${year} error: ${res.status}`);
  }

  const buffer = await res.arrayBuffer();
  return XLSX.read(new Uint8Array(buffer), { type: 'array' });
}

export async function fetchSenatElections(
  year: string = '2023',
  fetchFn: typeof fetch = fetch,
): Promise<SenatElectionResult[]> {
  const config = ELECTION_URLS[year];
  if (!config) {
    throw new Error(`No election data configured for year ${year}`);
  }

  const workbook = await fetchWorkbook(year, fetchFn);
  const results: SenatElectionResult[] = [];

  const majT1 = workbook.Sheets['MAJ - T1'];
  if (majT1) results.push(...parseMajSheet(majT1, 1, config.date));

  const majT2 = workbook.Sheets['MAJ - T2'];
  if (majT2) results.push(...parseMajSheet(majT2, 2, config.date));

  const prop = workbook.Sheets['PROP'];
  if (prop) results.push(...parsePropSheet(prop, config.date));

  logger.info(
    `Sénat elections ${year}: ${results.length} elected with results`,
  );
  return results;
}

export async function fetchSenatorialElections(
  year: string = '2023',
  fetchFn: typeof fetch = fetch,
): Promise<SenatorialDepartementResult[]> {
  const config = ELECTION_URLS[year];
  if (!config) {
    throw new Error(`No election data configured for year ${year}`);
  }

  const workbook = await fetchWorkbook(year, fetchFn);
  const results: SenatorialDepartementResult[] = [];

  const majT1 = workbook.Sheets['MAJ - T1'];
  if (majT1) results.push(...parseMajSheetFull(majT1, 1, year, config.date));

  const majT2 = workbook.Sheets['MAJ - T2'];
  if (majT2) results.push(...parseMajSheetFull(majT2, 2, year, config.date));

  const prop = workbook.Sheets['PROP'];
  if (prop) results.push(...parsePropSheetFull(prop, year, config.date));

  logger.info(`Sénat elections ${year}: ${results.length} département results`);
  return results;
}
