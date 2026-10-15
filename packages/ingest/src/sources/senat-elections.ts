/**
 * Résultats des élections sénatoriales passées (2023 pour l'instant), lus
 * depuis le fichier Excel du ministère de l'Intérieur publié sur data.gouv.fr.
 *
 * Format brut : un classeur XLSX avec trois feuilles — « MAJ - T1 » et
 * « MAJ - T2 » (scrutin majoritaire, 1er et 2d tour) et « PROP » (scrutin
 * proportionnel, tour unique). Une ligne par lieu de dépouillement
 * (« Code localisation » / « Code commune »), avec les colonnes générales
 * (Inscrits, Votants, Exprimés…) puis, pour chaque candidat ou liste i de 1 à
 * MAX_CANDIDATES_PER_ROW, des colonnes suffixées « Nom candidat i »,
 * « Voix i », « % Voix/exprimés i », « Elu i », « Sièges i »… Les nombres
 * peuvent être des chaînes avec espaces de milliers et les pourcentages des
 * chaînes « 79,14% », d'où parseIntSafe / parsePercent.
 *
 * Deux vues sont produites sur les mêmes feuilles :
 *   - fetchSenatElectedResults : une ligne par élu (score, tour, nombre
 *     d'adversaires), pour la fiche de l'élu (upsert/senat-electoral-results.ts) ;
 *   - fetchSenatDepartementResults : un agrégat par département avec tous les
 *     candidats, totaux sommés sur les lignes du département
 *     (upsert/senatorial-elections.ts).
 * Appelé par run-senat.ts.
 */
import * as XLSX from 'xlsx';
import { logger } from '../logger.js';

const ELECTION_URLS: Record<string, { url: string; date: string }> = {
  '2023': {
    url: 'https://www.data.gouv.fr/api/1/datasets/r/26158ed7-7637-4707-bb37-2d3155fad10a',
    date: '2023-09-24',
  },
};

export { ELECTION_URLS };

/** Nombre maximal de blocs « candidat i » lus par ligne. */
const MAX_CANDIDATES_PER_ROW = 20;

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

/** « 79,14% » ou 79.14 → 79.14 ; 0 si illisible. */
function parsePercent(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(',', '.').replace('%', '').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

/** « 3 743 » ou 3743 → 3743 ; 0 si illisible. */
function parseIntSafe(raw: unknown): number {
  if (typeof raw === 'number') return Math.round(raw);
  if (typeof raw === 'string') {
    const n = parseInt(raw.replace(/\s/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

/**
 * Lit les blocs « candidat 1..N » d'une ligne. Un bloc sans nom de candidat
 * mais avec un libellé de liste est sauté (ligne de liste sans tête
 * nominative) ; un bloc sans nom ni liste marque la fin des candidats.
 */
function parseCandidatesFromRow(
  row: Record<string, unknown>,
): SenatorialCandidate[] {
  const candidates: SenatorialCandidate[] = [];

  for (let i = 1; i <= MAX_CANDIDATES_PER_ROW; i++) {
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

    // Élu si la colonne « Elu » contient « élu »/« elu » (test sur « lu » pour
    // ignorer l'accent) ou si des sièges lui sont attribués (scrutin de liste).
    const isElected =
      (typeof elu === 'string' && elu.toLowerCase().includes('lu')) ||
      (typeof sieges === 'number' && sieges > 0) ||
      (typeof sieges === 'string' && parseInt(sieges, 10) > 0);

    candidates.push({
      nom: nom.trim(),
      prenom: prenom.trim(),
      sexe:
        typeof sexe === 'string' && sexe.trim()
          ? sexe.trim().charAt(0).toUpperCase()
          : null,
      nuance:
        typeof nuance === 'string' && nuance.trim() ? nuance.trim() : null,
      voix,
      scorePercent: parsePercent(voixPct),
      elected: isElected,
    });
  }

  return candidates;
}

/** Colonnes générales (département + totaux de participation) d'une ligne. */
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

function sheetRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });
}

/**
 * Vue « par élu » d'une feuille : un résultat par candidat marqué élu, avec
 * le nombre d'adversaires sur la même ligne.
 */
function parseElectedFromSheet(
  sheet: XLSX.WorkSheet,
  round: number,
  electionDate: string,
): SenatElectionResult[] {
  const results: SenatElectionResult[] = [];

  for (const row of sheetRows(sheet)) {
    const candidates = parseCandidatesFromRow(row);
    const opponentCount = candidates.length - 1;

    for (const candidate of candidates) {
      if (candidate.elected) {
        results.push({
          nom: candidate.nom,
          prenom: candidate.prenom,
          electionDate,
          round,
          scorePercent: candidate.scorePercent,
          opponentCount: Math.max(opponentCount, 0),
        });
      }
    }
  }

  return results;
}

/**
 * Vue « par département » d'une feuille. Quand un département s'étend sur
 * plusieurs lignes, les totaux sont sommés et les voix d'un même candidat
 * (clé nom + prénom) cumulées.
 */
function parseDepartementResultsFromSheet(
  sheet: XLSX.WorkSheet,
  scrutinType: 'majoritaire' | 'proportionnel',
  round: number,
  year: string,
  electionDate: string,
): SenatorialDepartementResult[] {
  const byDept = new Map<string, SenatorialDepartementResult>();

  for (const row of sheetRows(sheet)) {
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
      for (const candidate of candidates) {
        const match = existing.candidates.find(
          (c) => c.nom === candidate.nom && c.prenom === candidate.prenom,
        );
        if (match) {
          match.voix += candidate.voix;
        } else {
          existing.candidates.push(candidate);
        }
      }
    } else {
      byDept.set(general.departementCode, {
        electionYear: year,
        scrutinType,
        round,
        electionDate,
        ...general,
        candidates,
      });
    }
  }

  return [...byDept.values()];
}

/** Télécharge le classeur de l'année (un GET) ; lève si l'année n'est pas configurée ou si HTTP non 2xx. */
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

/**
 * Résultats individuels des élus (score, tour, adversaires) pour une année.
 * Les feuilles absentes du classeur sont simplement ignorées.
 */
export async function fetchSenatElectedResults(
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
  if (majT1) results.push(...parseElectedFromSheet(majT1, 1, config.date));

  const majT2 = workbook.Sheets['MAJ - T2'];
  if (majT2) results.push(...parseElectedFromSheet(majT2, 2, config.date));

  const prop = workbook.Sheets['PROP'];
  if (prop) results.push(...parseElectedFromSheet(prop, 1, config.date));

  logger.info(
    `Sénat elections ${year}: ${results.length} elected with results`,
  );
  return results;
}

/**
 * Résultats agrégés par département et par tour (tous candidats, totaux de
 * participation) pour une année. Un département au scrutin majoritaire peut
 * apparaître deux fois (T1 et T2).
 */
export async function fetchSenatDepartementResults(
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
  if (majT1)
    results.push(
      ...parseDepartementResultsFromSheet(
        majT1,
        'majoritaire',
        1,
        year,
        config.date,
      ),
    );

  const majT2 = workbook.Sheets['MAJ - T2'];
  if (majT2)
    results.push(
      ...parseDepartementResultsFromSheet(
        majT2,
        'majoritaire',
        2,
        year,
        config.date,
      ),
    );

  const prop = workbook.Sheets['PROP'];
  if (prop)
    results.push(
      ...parseDepartementResultsFromSheet(
        prop,
        'proportionnel',
        1,
        year,
        config.date,
      ),
    );

  logger.info(`Sénat elections ${year}: ${results.length} département results`);
  return results;
}
