/**
 * Résultats des élections législatives (2002 → 2024) par commune et par tour.
 *
 * Source : deux gros CSV (séparateur « ; ») publiés sur un bucket S3 OVH
 * (« data-pipeline-open », agrégation des résultats du ministère de
 * l'Intérieur), communs à toutes les élections :
 * - general_results.csv : participation par bureau de vote ;
 * - candidats_results.csv : voix par candidat et par bureau de vote.
 * Les fichiers sont lus en flux ligne à ligne ; seules les lignes dont
 * l'identifiant d'élection contient `_legi_` sont retenues (pré-filtre
 * textuel, avant tout découpage).
 *
 * Extrait : un `LegislativeGeneralResult` par (élection, commune), avec la
 * participation agrégée sur les bureaux et la liste des candidats triée par
 * voix décroissantes, ratios en % (2 décimales).
 *
 * Pièges :
 * - Les colonnes sont adressées par position (constantes GENERAL_COL_* et
 *   CANDIDATE_COL_*) : un changement de format amont casse silencieusement.
 * - Pas de gestion des champs entre guillemets contenant « ; ».
 * - Les lignes d'une élection absente d'ELECTION_DATES sont ignorées.
 * - Utilise le `fetch` global (pas d'injection : non testé unitairement).
 * - municipal-elections.ts est une copie quasi identique pour les
 *   municipales.
 *
 * Appelé par run-an.ts via upsert/legislative-elections.ts.
 */
import { logger } from '../logger.js';

const CANDIDATES_URL =
  'https://data-pipeline-open.s3.sbg.io.cloud.ovh.net/elections/candidats_results.csv';
const GENERAL_URL =
  'https://data-pipeline-open.s3.sbg.io.cloud.ovh.net/elections/general_results.csv';

/** Identifiant d'élection du CSV → date du tour. */
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

/** Sous-chaîne de l'identifiant d'élection qui sélectionne les législatives. */
const ELECTION_ID_FILTER = '_legi_';
const CSV_SEPARATOR = ';';

// Positions des colonnes dans general_results.csv.
const GENERAL_COL_ELECTION_ID = 0;
const GENERAL_COL_DEPARTEMENT_CODE = 2;
const GENERAL_COL_COMMUNE_CODE = 6;
const GENERAL_COL_COMMUNE_NAME = 7;
const GENERAL_COL_INSCRITS = 11;
const GENERAL_COL_ABSTENTIONS = 12;
const GENERAL_COL_VOTANTS = 13;
const GENERAL_COL_BLANCS = 14;
const GENERAL_COL_NULS = 15;
const GENERAL_COL_EXPRIMES = 16;

// Positions des colonnes dans candidats_results.csv.
const CANDIDATE_COL_ELECTION_ID = 0;
const CANDIDATE_COL_COMMUNE_CODE = 3;
const CANDIDATE_COL_PANNEAU = 5;
const CANDIDATE_COL_VOIX = 6;
const CANDIDATE_COL_NUANCE = 9;
const CANDIDATE_COL_SEXE = 10;
const CANDIDATE_COL_NOM = 11;
const CANDIDATE_COL_PRENOM = 12;

export type LegislativeCandidate = {
  /** Numéro de panneau : identifie le candidat au sein d'une élection. */
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

/** Participation d'une commune avant rattachement des candidats. */
type GeneralAggregate = Omit<LegislativeGeneralResult, 'candidates'>;

/**
 * Lit un CSV en flux et appelle `onLine` avec les champs de chaque ligne
 * (hors en-tête) contenant `filter`.
 */
async function streamCsv(
  url: string,
  filter: string,
  onLine: (fields: string[]) => void,
): Promise<void> {
  const response = await fetch(url, {
    headers: { 'Accept-Encoding': 'gzip, deflate' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  if (!response.body) throw new Error(`No body in response from ${url}`);

  const decoder = new TextDecoder();
  // Fin de ligne incomplète reportée sur le chunk suivant.
  let remainder = '';
  let headerSkipped = false;

  for await (const chunk of response.body) {
    const text = remainder + decoder.decode(chunk, { stream: true });
    const lines = text.split('\n');
    remainder = lines.pop()!;

    for (const line of lines) {
      if (!headerSkipped) {
        headerSkipped = true;
        continue;
      }
      if (!line.includes(filter)) continue;
      onLine(line.split(CSV_SEPARATOR));
    }
  }

  // Dernière ligne sans retour chariot final.
  if (headerSkipped && remainder && remainder.includes(filter)) {
    onLine(remainder.split(CSV_SEPARATOR));
  }
}

/** Entier du CSV, 0 si vide ou invalide. */
function toInt(raw: string | undefined): number {
  return parseInt(raw!) || 0;
}

/** Pourcentage arrondi à 2 décimales, 0 si le dénominateur est nul. */
function toPercent(numerator: number, denominator: number): number {
  return denominator > 0
    ? Math.round((numerator / denominator) * 10000) / 100
    : 0;
}

/**
 * Télécharge et agrège les deux CSV. Effets : deux téléchargements de
 * plusieurs centaines de Mo, logs de progression.
 */
export async function fetchLegislativeElections(): Promise<
  LegislativeGeneralResult[]
> {
  logger.info('  Fetching general results...');

  // Clé : `${electionId}|${communeCode}` ; les bureaux de vote d'une même
  // commune sont additionnés.
  const generalByKey = new Map<string, GeneralAggregate>();

  await streamCsv(GENERAL_URL, ELECTION_ID_FILTER, (fields) => {
    const electionId = fields[GENERAL_COL_ELECTION_ID];
    const departementCode = fields[GENERAL_COL_DEPARTEMENT_CODE];
    const communeCode = fields[GENERAL_COL_COMMUNE_CODE];
    const key = `${electionId}|${communeCode}`;
    const round = electionId.endsWith('_t2') ? 2 : 1;
    const electionDate = ELECTION_DATES[electionId];
    if (!electionDate) return;

    const existing = generalByKey.get(key);
    if (existing) {
      existing.inscrits += toInt(fields[GENERAL_COL_INSCRITS]);
      existing.abstentions += toInt(fields[GENERAL_COL_ABSTENTIONS]);
      existing.votants += toInt(fields[GENERAL_COL_VOTANTS]);
      existing.blancs += toInt(fields[GENERAL_COL_BLANCS]);
      existing.nuls += toInt(fields[GENERAL_COL_NULS]);
      existing.exprimes += toInt(fields[GENERAL_COL_EXPRIMES]);
    } else {
      generalByKey.set(key, {
        electionId,
        departementCode,
        communeCode,
        communeName: fields[GENERAL_COL_COMMUNE_NAME] || null,
        round,
        electionDate,
        inscrits: toInt(fields[GENERAL_COL_INSCRITS]),
        abstentions: toInt(fields[GENERAL_COL_ABSTENTIONS]),
        votants: toInt(fields[GENERAL_COL_VOTANTS]),
        blancs: toInt(fields[GENERAL_COL_BLANCS]),
        nuls: toInt(fields[GENERAL_COL_NULS]),
        exprimes: toInt(fields[GENERAL_COL_EXPRIMES]),
      });
    }
  });

  logger.info(`  ${generalByKey.size} commune/tour combinations loaded`);
  logger.info('  Fetching candidate results...');

  // Même clé que generalByKey ; par commune, les candidats sont indexés par
  // panneau pour additionner leurs voix sur les bureaux.
  const candidatesByKey = new Map<string, Map<number, LegislativeCandidate>>();

  await streamCsv(CANDIDATES_URL, ELECTION_ID_FILTER, (fields) => {
    const electionId = fields[CANDIDATE_COL_ELECTION_ID];
    const communeCode = fields[CANDIDATE_COL_COMMUNE_CODE];
    const key = `${electionId}|${communeCode}`;
    const panneau = toInt(fields[CANDIDATE_COL_PANNEAU]);

    if (!candidatesByKey.has(key)) {
      candidatesByKey.set(key, new Map());
    }

    const byPanneau = candidatesByKey.get(key)!;
    const existing = byPanneau.get(panneau);
    if (existing) {
      existing.voix += toInt(fields[CANDIDATE_COL_VOIX]);
    } else {
      byPanneau.set(panneau, {
        panneau,
        nom: fields[CANDIDATE_COL_NOM] || '',
        prenom: fields[CANDIDATE_COL_PRENOM] || '',
        sexe: fields[CANDIDATE_COL_SEXE] || null,
        nuance: fields[CANDIDATE_COL_NUANCE] || null,
        voix: toInt(fields[CANDIDATE_COL_VOIX]),
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

    for (const candidate of candidateList) {
      candidate.ratioInscrits = toPercent(candidate.voix, general.inscrits);
      candidate.ratioExprimes = toPercent(candidate.voix, general.exprimes);
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
