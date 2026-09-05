import { logger } from '../logger.js';

const CANDIDATES_URL =
  'https://data-pipeline-open.s3.sbg.io.cloud.ovh.net/elections/candidats_results.csv';
const GENERAL_URL =
  'https://data-pipeline-open.s3.sbg.io.cloud.ovh.net/elections/general_results.csv';

const ELECTION_DATES: Record<string, string> = {
  '2008_muni_t1': '2008-03-09',
  '2008_muni_t2': '2008-03-16',
  '2014_muni_t1': '2014-03-23',
  '2014_muni_t2': '2014-03-30',
  '2020_muni_t1': '2020-03-15',
  '2020_muni_t2': '2020-06-28',
  '2026_muni_t1': '2026-03-15',
  '2026_muni_t2': '2026-03-22',
};

export type MunicipalCandidate = {
  panneau: number;
  nom: string;
  prenom: string;
  sexe: string | null;
  nuance: string | null;
  liste: string | null;
  voix: number;
  ratioInscrits: number;
  ratioExprimes: number;
};

export type MunicipalGeneralResult = {
  electionId: string;
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
  candidates: MunicipalCandidate[];
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
  if (!res.body) throw new Error(`No body in response from ${url}`);

  const decoder = new TextDecoder();
  let remainder = '';
  let headerSkipped = false;

  for await (const chunk of res.body) {
    const text = remainder + decoder.decode(chunk, { stream: true });
    const lines = text.split('\n');
    remainder = lines.pop()!;

    for (const line of lines) {
      if (!headerSkipped) {
        headerSkipped = true;
        continue;
      }
      if (!line.includes(filter)) continue;
      onLine(line.split(';'));
    }
  }

  if (headerSkipped && remainder && remainder.includes(filter)) {
    onLine(remainder.split(';'));
  }
}

export async function fetchMunicipalElections(): Promise<
  MunicipalGeneralResult[]
> {
  logger.info('  Fetching general results...');

  const generalByKey = new Map<
    string,
    {
      electionId: string;
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

  await streamCsv(GENERAL_URL, '_muni_', (f) => {
    const electionId = f[0];
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

  const candidatesByKey = new Map<string, Map<number, MunicipalCandidate>>();

  await streamCsv(CANDIDATES_URL, '_muni_', (f) => {
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
        liste: f[15] || f[14] || null,
        voix: parseInt(f[6]) || 0,
        ratioInscrits: 0,
        ratioExprimes: 0,
      });
    }
  });

  logger.info(`  ${candidatesByKey.size} commune/tour candidate sets loaded`);

  const results: MunicipalGeneralResult[] = [];

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
