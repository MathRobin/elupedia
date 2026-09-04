import { logger } from '../logger.js';

const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

const SPARQL_QUERY = `
SELECT DISTINCT ?person ?personLabel ?birthDate ?image WHERE {
  ?person wdt:P18 ?image ;
          wdt:P569 ?birthDate ;
          wdt:P27 wd:Q142 .
  ?person p:P39 ?stmt .
  ?stmt ps:P39/wdt:P279* wd:Q382617 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr" . }
}
`;

export interface WikidataMayorPhoto {
  name: string;
  birthDate: string;
  imageUrl: string;
}

interface SparqlResults {
  results: {
    bindings: Array<{
      personLabel: { value: string };
      birthDate: { value: string };
      image: { value: string };
    }>;
  };
}

function toThumbUrl(commonsUrl: string, width = 400): string {
  return commonsUrl.replace('http://', 'https://') + `?width=${width}`;
}

export async function fetchWikidataMayorPhotos(
  fetchFn: typeof fetch = fetch,
): Promise<WikidataMayorPhoto[]> {
  const url = `${WIKIDATA_SPARQL}?query=${encodeURIComponent(SPARQL_QUERY)}`;

  const res = await fetchFn(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent':
        'Elupedia/1.0 (https://www.elupedia.fr; mthrobin@gmail.com)',
    },
  });

  if (!res.ok) {
    throw new Error(`Wikidata SPARQL error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as SparqlResults;

  const seen = new Set<string>();
  const results: WikidataMayorPhoto[] = [];

  for (const b of data.results.bindings) {
    const birthDate = b.birthDate.value.slice(0, 10);
    const key = `${b.personLabel.value}|${birthDate}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      name: b.personLabel.value,
      birthDate,
      imageUrl: toThumbUrl(b.image.value),
    });
  }

  logger.info(`Wikidata: ${results.length} mayor photos fetched`);
  return results;
}
