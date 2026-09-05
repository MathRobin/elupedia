import { logger } from '../logger.js';

const CANDIDATES_URL =
  'https://data-pipeline-open.s3.sbg.io.cloud.ovh.net/elections/candidats_results.csv';
const GENERAL_URL =
  'https://data-pipeline-open.s3.sbg.io.cloud.ovh.net/elections/general_results.csv';

const ELECTION_DATES: Record<string, string> = {
  '2002_legi_t1': '2002-06-09',
  '2002_legi_t2': '2002-06-16',
  '2007_legi_t1': '2007-06-10',
  '2007_legi_t2': '2007-06-17',
  '2012_legi_t1': '2012-06-10',
  '2012_legi_t2': '2012-06-17',
  '2017_legi_t1': '2017-06-11',
  '2017_legi_t2': '2017-06-18',
  '2022_legi_t1': '2022-06-12',
  '2022_legi_t2': '2022-06-19',
  '2024_legi_t1': '2024-06-30',
  '2024_legi_t2': '2024-07-07',
};

export type LegislativeCandidate = {
  panneau: number;
  nom: string;
  prenom: string;
  sexe: string | null;
  nuance: string | null;
  voix: number;
  ratioInscrits: number;
  ratioExprimes: number;
};

export type LegislativeGeneralResult = {
  electionId: string;
  departementCode: string;
  communeCode: string;
  communeName: string | null;
  round: number;
  electionDate: string;
  inscrits: number;
  abstentions: number;
  votants: number;
  blancs: number;
  nuls: number;
  exprimes: number;
  candidates: LegislativeCandidate[];
};

async function streamCsv(
  url: string,
  filter: string,
  onLine: (fields: string[]) => void,
): Promise<void> {
  const res = await fetch(url, {
    headers: { 'Accept-Encoding': 'gzip, deflate' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const text = await res.text();
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes(filter)) continue;
    onLine(line.split(';'));
  }
}

export async function fetchLegislativeElections(): Promise<
  LegislativeGeneralResult[]
> {
  logger.info('  Fetching general results...');

  const generalByKey = new Map<
    string,
    {
      electionId: string;
      departementCode: string;
      communeCode: string;
      communeName: string | null;
      round: number;
      electionDate: string;
      inscrits: number;
      abstentions: number;
      votants: number;
      blancs: number;
      nuls: number;
      exprimes: number;
    }
  >();

  await streamCsv(GENERAL_URL, '_legi_', (f) => {
    const electionId = f[0];
    const departementCode = f[2];
    const communeCode = f[6];
    const key = `${electionId}|${communeCode}`;
    const round = electionId.endsWith('_t2') ? 2 : 1;
    const electionDate = ELECTION_DATES[electionId];
    if (!electionDate) return;

    const existing = generalByKey.get(key);
    if (existing) {
      existing.inscrits += parseInt(f[11]) || 0;
      existing.abstentions += parseInt(f[12]) || 0;
      existing.votants += parseInt(f[13]) || 0;
      existing.blancs += parseInt(f[14]) || 0;
      existing.nuls += parseInt(f[15]) || 0;
      existing.exprimes += parseInt(f[16]) || 0;
    } else {
      generalByKey.set(key, {
        electionId,
        departementCode,
        communeCode,
        communeName: f[7] || null,
        round,
        electionDate,
        inscrits: parseInt(f[11]) || 0,
        abstentions: parseInt(f[12]) || 0,
        votants: parseInt(f[13]) || 0,
        blancs: parseInt(f[14]) || 0,
        nuls: parseInt(f[15]) || 0,
        exprimes: parseInt(f[16]) || 0,
      });
    }
  });

  logger.info(`  ${generalByKey.size} commune/tour combinations loaded`);
  logger.info('  Fetching candidate results...');

  const candidatesByKey = new Map<string, Map<number, LegislativeCandidate>>();

  await streamCsv(CANDIDATES_URL, '_legi_', (f) => {
    const electionId = f[0];
    const communeCode = f[3];
    const key = `${electionId}|${communeCode}`;
    const panneau = parseInt(f[5]) || 0;

    if (!candidatesByKey.has(key)) {
      candidatesByKey.set(key, new Map());
    }

    const byPanneau = candidatesByKey.get(key)!;
    const existing = byPanneau.get(panneau);
    if (existing) {
      existing.voix += parseInt(f[6]) || 0;
    } else {
      byPanneau.set(panneau, {
        panneau,
        nom: f[11] || '',
        prenom: f[12] || '',
        sexe: f[10] || null,
        nuance: f[9] || null,
        voix: parseInt(f[6]) || 0,
        ratioInscrits: 0,
        ratioExprimes: 0,
      });
    }
  });

  logger.info(`  ${candidatesByKey.size} commune/tour candidate sets loaded`);

  const results: LegislativeGeneralResult[] = [];

  for (const [key, general] of generalByKey) {
    const candidates = candidatesByKey.get(key);
    const candidateList = candidates ? [...candidates.values()] : [];

    for (const c of candidateList) {
      c.ratioInscrits =
        general.inscrits > 0
          ? Math.round((c.voix / general.inscrits) * 10000) / 100
          : 0;
      c.ratioExprimes =
        general.exprimes > 0
          ? Math.round((c.voix / general.exprimes) * 10000) / 100
          : 0;
    }

    candidateList.sort((a, b) => b.voix - a.voix);

    results.push({
      ...general,
      candidates: candidateList,
    });
  }

  logger.info(`  ${results.length} total results built`);
  return results;
}
