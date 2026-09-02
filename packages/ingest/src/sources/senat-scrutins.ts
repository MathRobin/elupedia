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

export function mapSenatVotePosition(
  code: string,
): 'for' | 'against' | 'abstain' | 'absent' {
  return VOTE_MAP[code] ?? 'absent';
}

export function parseScrutinsIndex(
  html: string,
  session: string,
): SenatScrutin[] {
  const results: SenatScrutin[] = [];
  let currentDate = '';

  const lines = html.split('\n');

  for (const line of lines) {
    const dateMatch = line.match(
      /(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i,
    );
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const monthName = dateMatch[2].toLowerCase();
      const year = dateMatch[3];
      const monthMap: Record<string, string> = {
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
      const month = monthMap[monthName];
      if (month) currentDate = `${year}-${month}-${day}`;
    }

    const scrutinMatch = line.match(
      /scr\d{4}-(\d+)\.html[^>]*>.*?N(?:°|&deg;)\s*(\d+)<\/a>\s*(?:&nbsp;)?:\s*(.*)/i,
    );
    if (scrutinMatch && currentDate) {
      const number = parseInt(scrutinMatch[1], 10);
      let raw = scrutinMatch[3]
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      let result = '';
      const resultMatch = raw.match(/\.\s*(Adoption|Rejet)\s*$/i);
      if (resultMatch) {
        result = resultMatch[1];
        raw = raw.slice(0, resultMatch.index!).trim();
      }
      if (raw.endsWith('.')) raw = raw.slice(0, -1);
      results.push({
        session,
        number,
        title: raw,
        date: currentDate,
        result,
      });
    }
  }

  return results;
}

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
      const data = (await voteRes.json()) as {
        votes: { matricule: string; vote: string; siege: number }[];
      };
      results.push({
        ...scrutin,
        votes: data.votes.map((v) => ({
          matricule: v.matricule,
          position: v.vote as 'p' | 'c' | 'a' | 'n',
        })),
      });
    } catch {
      logger.warn(`Scrutin ${scrutin.number}: fetch failed, skipped`);
    }
  }

  logger.info(`Sénat scrutins ${session}: ${results.length} with votes loaded`);
  return results;
}
