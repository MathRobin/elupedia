/**
 * Scrutins publics du Sénat et votes nominatifs des sénateurs, pour une
 * session parlementaire (ex. « 2025 » = session 2025-2026).
 *
 * Sources (senat.fr/scrutin-public) :
 *   1. la page index HTML `scr<session>.html`, parcourue en DOM (cheerio) :
 *      un `<li>` par jour de séance porte la date, puis un `<p>` par scrutin
 *      (lien « Scrutin N°340 », intitulé sur plusieurs lignes, badge
 *      « Adoption »/« Rejet ») ; chaque scrutin hérite de la dernière date
 *      rencontrée ;
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
import * as cheerio from 'cheerio';
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

const MONTHS: Record<string, string> = {
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

const DATE_RE =
  /(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i;

/**
 * Index des scrutins d'une session (`scr{session}.html`). Structure réelle :
 * des `<li>` par jour de séance avec un `.list-group-subtitle` portant la
 * date, puis un `<p>` par scrutin : lien « Scrutin N°340 », intitulé coupé
 * sur plusieurs lignes, lien « consulter le dossier législatif », et un
 * `<span class="badge">` « Adoption » / « Rejet ». On parcourt le DOM plutôt
 * que les lignes du fichier : l'intitulé et le résultat ne tiennent pas sur
 * une seule ligne.
 */
export function parseScrutinsIndex(
  html: string,
  session: string,
): SenatScrutin[] {
  const $ = cheerio.load(html);
  const results: SenatScrutin[] = [];
  let currentDate = '';
  const hrefRe = new RegExp(`scr${session}-(\\d+)\\.html`);

  $('*').each((_, el) => {
    // Date portée par le texte direct de l'élément (pas celui de ses enfants),
    // pour ne pas prendre celle d'un ancêtre qui contient toute la liste.
    const ownText = $(el)
      .contents()
      .filter((__, n) => n.type === 'text')
      .text();
    // Un intitulé de scrutin peut lui-même citer une date (« l'accord du
    // 12 juillet 2025 ») : un élément qui contient un lien de scrutin n'est
    // jamais un porteur de date.
    const holdsScrutinLink =
      $(el)
        .find('a[href]')
        .filter((__, a) => hrefRe.test($(a).attr('href') ?? '')).length > 0;
    const dateMatch = holdsScrutinLink ? null : ownText.match(DATE_RE);
    if (dateMatch) {
      const month = MONTHS[dateMatch[2].toLowerCase()];
      if (month) {
        currentDate = `${dateMatch[3]}-${month}-${dateMatch[1].padStart(2, '0')}`;
      }
      return;
    }

    if (el.type !== 'tag' || el.name !== 'a') return;
    const href = $(el).attr('href') ?? '';
    const numberMatch = href.match(hrefRe);
    if (!numberMatch || !currentDate) return;

    const container = $(el).parent().clone();
    const badge = container.find('.badge').text().trim();
    container.find('.badge').remove();
    let raw = container
      .text()
      .replace(/\s+/g, ' ')
      .replace(/^.*?N°\s*\d+\s*:\s*/, '')
      .replace(/\s*-\s*consulter le dossier législatif\.?\s*$/i, '')
      .trim();
    let result = badge;
    if (!result) {
      const resultMatch = raw.match(/\.\s*(Adoption|Rejet)\s*$/i);
      if (resultMatch) {
        result = resultMatch[1];
        raw = raw.slice(0, resultMatch.index!).trim();
      }
    }
    if (raw.endsWith('.')) raw = raw.slice(0, -1);

    results.push({
      session,
      number: parseInt(numberMatch[1], 10),
      title: raw,
      date: currentDate,
      result,
    });
  });

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
