import { logger } from '../logger.js';
import { withRetry } from '../utils/retry.js';

const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

const SPARQL_QUERY = `
SELECT DISTINCT ?person ?personLabel ?birthDate ?image ?commune ?communeLabel ?communeCode WHERE {
  ?person wdt:P18 ?image ;
          wdt:P569 ?birthDate ;
          wdt:P27 wd:Q142 .
  ?person p:P39 ?stmt .
  ?stmt ps:P39 wd:Q382617 .
  { ?stmt pq:P1001 ?commune } UNION { ?stmt pq:P768 ?commune }
  ?commune wdt:P374 ?communeCode .
  FILTER NOT EXISTS { ?stmt pq:P582 ?endDate }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr" . }
}
`;

export interface WikidataMayorPhoto {
  qid: string;
  name: string;
  birthDate: string;
  imageUrl: string;
  communeQid: string;
  communeName: string;
  communeCode: string;
}

interface SparqlResults {
  results: {
    bindings: Array<{
      person: { value: string };
      personLabel: { value: string };
      birthDate: { value: string };
      image: { value: string };
      commune: { value: string };
      communeLabel: { value: string };
      communeCode: { value: string };
    }>;
  };
}

function extractQid(uri: string): string {
  return uri.split('/').pop() ?? uri;
}

export async function fetchWikidataMayorPhotos(
  fetchFn: typeof fetch = fetch,
): Promise<WikidataMayorPhoto[]> {
  const url = `${WIKIDATA_SPARQL}?query=${encodeURIComponent(SPARQL_QUERY)}`;

  const res = await withRetry(
    async () => {
      const r = await fetchFn(url, {
        headers: {
          Accept: 'application/sparql-results+json',
          'User-Agent':
            'Elupedia/1.0 (https://www.elupedia.fr; mthrobin@gmail.com)',
        },
      });
      if (r.status === 429) {
        throw new Error('Rate limited by Wikidata (429)');
      }
      if (!r.ok) {
        throw new Error(`Wikidata SPARQL error: ${r.status} ${r.statusText}`);
      }
      return r;
    },
    { source: 'wikidata-sparql', maxAttempts: 3, baseDelayMs: 5000 },
  );

  const data = (await res.json()) as SparqlResults;

  const seen = new Set<string>();
  const results: WikidataMayorPhoto[] = [];

  for (const b of data.results.bindings) {
    const qid = extractQid(b.person.value);
    const key = `${qid}|${extractQid(b.commune.value)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      qid,
      name: b.personLabel.value,
      birthDate: b.birthDate.value.slice(0, 10),
      imageUrl: b.image.value.replace('http://', 'https://'),
      communeQid: extractQid(b.commune.value),
      communeName: b.communeLabel.value,
      communeCode: b.communeCode.value,
    });
  }

  logger.info(`Wikidata: ${results.length} mayor photos fetched`);
  return results;
}

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

export interface CommonsLicense {
  name: string;
  url: string;
}

export async function fetchCommonsLicense(
  commonsUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<CommonsLicense | null> {
  const filename = decodeURIComponent(commonsUrl.split('/').pop() ?? '');
  if (!filename) return null;

  const apiUrl = new URL(COMMONS_API);
  apiUrl.searchParams.set('action', 'query');
  apiUrl.searchParams.set('titles', `File:${filename}`);
  apiUrl.searchParams.set('prop', 'imageinfo');
  apiUrl.searchParams.set('iiprop', 'extmetadata');
  apiUrl.searchParams.set('format', 'json');

  const res = await withRetry(
    async () => {
      const r = await fetchFn(apiUrl.toString(), {
        headers: {
          'User-Agent':
            'Elupedia/1.0 (https://www.elupedia.fr; mthrobin@gmail.com)',
        },
      });
      if (r.status === 429) throw new Error('Rate limited by Commons (429)');
      if (!r.ok) throw new Error(`Commons API error: ${r.status}`);
      return r;
    },
    { source: 'commons-license', maxAttempts: 2, baseDelayMs: 3000 },
  );

  const data = (await res.json()) as {
    query: {
      pages: Record<
        string,
        {
          imageinfo?: Array<{
            extmetadata?: {
              LicenseShortName?: { value: string };
              LicenseUrl?: { value: string };
            };
          }>;
        }
      >;
    };
  };

  const pages = Object.values(data.query.pages);
  const meta = pages[0]?.imageinfo?.[0]?.extmetadata;
  if (!meta) return null;

  return {
    name: meta.LicenseShortName?.value ?? 'Unknown',
    url: meta.LicenseUrl?.value ?? '',
  };
}
