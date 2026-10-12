/**
 * Scrutins publics du Sénat et votes nominatifs des sénateurs, pour une
 * session parlementaire (ex. « 2025 » = session 2025-2026).
 *
 * Sources (senat.fr/scrutin-public) :
 *   1. la page index HTML `scr<session>.html`, parsée ligne à ligne par
 *      regex : les titres de date (« 21 juillet 2026 ») précèdent les liens
 *      « Scrutin N°340 : <intitulé>. Adoption|Rejet », et chaque scrutin hérite
 *      de la dernière date rencontrée ;
 *   2. un JSON par scrutin `<session>/scr<session>-<n>.json` avec la liste
 *      `votes` (matricule, code de vote p/c/a/n, siège).
 *
 * Codes de vote Sénat : p = pour, c = contre, a = abstention, n = non-votant ;
 * mapSenatVotePosition les traduit vers le vocabulaire commun (tout code
 * inconnu → absent). Un JSON de scrutin en échec est logué et sauté ; seule
 * la page index en erreur fait échouer l'appel. Appel séquentiel, sans pause,
 * ~300 scrutins par session.
 *
 * Appelé par run-senat.ts, consommé par upsert/senat-votes.ts.
 */
import { logger } from '../logger.js';

const SCRUTINS_INDEX_URL =
  'https://www.senat.fr/scrutin-public/scr{session}.html';
const SCRUTIN_JSON_URL =
  'https://www.senat.fr/scrutin-public/{session}/scr{session}-{number}.json';

export { SCRUTINS_INDEX_URL, SCRUTIN_JSON_URL };

export interface SenatScrutin {
  session: string;
  number: number;
  title: string;
  date: string;
  /** « Adoption », « Rejet » ou '' si non indiqué sur l'index. */
  result: string;
}

export interface SenatVote {
  matricule: string;
  position: 'p' | 'c' | 'a' | 'n';
}

export interface SenatScrutinWithVotes extends SenatScrutin {
  votes: SenatVote[];
}

const VOTE_MAP: Record<string, 'for' | 'against' | 'abstain' | 'absent'> = {
  p: 'for',
  c: 'against',
  a: 'abstain',
  n: 'absent',
};

/** Code de vote Sénat (p/c/a/n) → position commune ; tout code inconnu → « absent ». */
export function mapSenatVotePosition(
  code: string,
): 'for' | 'against' | 'abstain' | 'absent' {
  return VOTE_MAP[code] ?? 'absent';
}

const FRENCH_MONTH_NUMBERS: Record<string, string> = {
  janvier: '01',
  février: '02',
  mars: '03',
  avril: '04',
  mai: '05',
  juin: '06',
  juillet: '07',
  août: '08',
  septembre: '09',
  octobre: '10',
  novembre: '11',
  décembre: '12',
};

/** Date en toutes lettres (« 21 juillet 2026 ») n'importe où dans une ligne. */
const DATE_IN_LINE_RE =
  /(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i;

/**
 * Lien vers un scrutin suivi de son intitulé : `scr2025-340.html…>…N°340</a> : <titre>`.
 * Le « ° » peut être encodé `&deg;` et le « : » précédé de `&nbsp;` dans le HTML réel.
 */
const SCRUTIN_LINK_RE =
  /scr\d{4}-(\d+)\.html[^>]*>.*?N(?:°|&deg;)\s*(\d+)<\/a>\s*(?:&nbsp;)?:\s*(.*)/i;

/**
 * Parse la page index d'une session. Un scrutin rencontré avant tout titre de
 * date est ignoré (pas de date à lui attribuer). Exporté pour les tests.
 */
export function parseScrutinsIndex(
  html: string,
  session: string,
): SenatScrutin[] {
  const results: SenatScrutin[] = [];
  let currentDate = '';

  const lines = html.split('\n');

  for (const line of lines) {
    const dateMatch = line.match(DATE_IN_LINE_RE);
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const monthName = dateMatch[2].toLowerCase();
      const year = dateMatch[3];
      const month = FRENCH_MONTH_NUMBERS[monthName];
      if (month) currentDate = `${year}-${month}-${day}`;
    }

    const scrutinMatch = line.match(SCRUTIN_LINK_RE);
    if (scrutinMatch && currentDate) {
      const number = parseInt(scrutinMatch[1], 10);
      let title = scrutinMatch[3]
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      // L'intitulé se termine par « . Adoption » ou « . Rejet » : on l'isole
      // comme résultat et on retire le point final restant.
      let result = '';
      const resultMatch = title.match(/\.\s*(Adoption|Rejet)\s*$/i);
      if (resultMatch) {
        result = resultMatch[1];
        title = title.slice(0, resultMatch.index!).trim();
      }
      if (title.endsWith('.')) title = title.slice(0, -1);
      results.push({
        session,
        number,
        title,
        date: currentDate,
        result,
      });
    }
  }

  return results;
}

/**
 * Télécharge l'index d'une session puis le JSON de chaque scrutin (1 + N GET).
 * Retourne les scrutins dont les votes ont pu être chargés. Lève une erreur
 * si l'index ne répond pas en 2xx.
 */
export async function fetchSenatScrutins(
  session: string = '2025',
  fetchFn: typeof fetch = fetch,
): Promise<SenatScrutinWithVotes[]> {
  const indexUrl = SCRUTINS_INDEX_URL.replace(/{session}/g, session);
  const indexRes = await fetchFn(indexUrl);
  if (!indexRes.ok) {
    throw new Error(`Sénat scrutins index error: ${indexRes.status}`);
  }
  const html = await indexRes.text();
  const scrutins = parseScrutinsIndex(html, session);
  logger.info(`Sénat scrutins ${session}: ${scrutins.length} scrutins found`);

  const results: SenatScrutinWithVotes[] = [];

  for (const scrutin of scrutins) {
    const jsonUrl = SCRUTIN_JSON_URL.replace(/{session}/g, session).replace(
      /{number}/g,
      String(scrutin.number),
    );
    try {
      const voteRes = await fetchFn(jsonUrl);
      if (!voteRes.ok) {
        logger.warn(
          `Scrutin ${scrutin.number}: HTTP ${voteRes.status}, skipped`,
        );
        continue;
      }
      const payload = (await voteRes.json()) as {
        votes: { matricule: string; vote: string; siege: number }[];
      };
      results.push({
        ...scrutin,
        // Le code est pris tel quel ; mapSenatVotePosition absorbe les valeurs inattendues en aval.
        votes: payload.votes.map((vote) => ({
          matricule: vote.matricule,
          position: vote.vote as 'p' | 'c' | 'a' | 'n',
        })),
      });
    } catch {
      logger.warn(`Scrutin ${scrutin.number}: fetch failed, skipped`);
    }
  }

  logger.info(`Sénat scrutins ${session}: ${results.length} with votes loaded`);
  return results;
}
