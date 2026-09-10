import { logger } from '../logger.js';

interface WikidataSearchResult {
  search: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
}

interface WikidataEntity {
  sitelinks?: Record<string, { title: string }>;
  claims?: Record<
    string,
    Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>
  >;
}

interface WikidataEntitiesResponse {
  entities: Record<string, WikidataEntity>;
}

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

// P31 = "instance of", Q5 = "human"
// P27 = "country of citizenship", Q142 = "France"
function looksLikeFrenchPolitician(entity: WikidataEntity): boolean {
  const instanceOf = entity.claims?.P31 ?? [];
  const isHuman = instanceOf.some(
    (c) =>
      (c.mainsnak?.datavalue?.value as Record<string, unknown>)?.id === 'Q5',
  );
  if (!isHuman) return false;

  const citizenship = entity.claims?.P27 ?? [];
  const isFrench = citizenship.some(
    (c) =>
      (c.mainsnak?.datavalue?.value as Record<string, unknown>)?.id === 'Q142',
  );
  return isFrench;
}

export async function findWikipediaUrl(
  firstName: string,
  lastName: string,
): Promise<string | null> {
  const query = `${firstName} ${lastName}`;

  const searchUrl = new URL(WIKIDATA_API);
  searchUrl.searchParams.set('action', 'wbsearchentities');
  searchUrl.searchParams.set('search', query);
  searchUrl.searchParams.set('language', 'fr');
  searchUrl.searchParams.set('uselang', 'fr');
  searchUrl.searchParams.set('type', 'item');
  searchUrl.searchParams.set('limit', '5');
  searchUrl.searchParams.set('format', 'json');

  const searchRes = await fetch(searchUrl.toString(), {
    headers: { 'User-Agent': 'Elupedia/1.0 (https://www.elupedia.fr)' },
  });
  if (!searchRes.ok) {
    throw new Error(`Wikidata search failed: ${searchRes.status}`);
  }

  const searchData = (await searchRes.json()) as WikidataSearchResult;
  if (searchData.search.length === 0) return null;

  const ids = searchData.search.map((r) => r.id);

  const entityUrl = new URL(WIKIDATA_API);
  entityUrl.searchParams.set('action', 'wbgetentities');
  entityUrl.searchParams.set('ids', ids.join('|'));
  entityUrl.searchParams.set('props', 'sitelinks|claims');
  entityUrl.searchParams.set('sitefilter', 'frwiki');
  entityUrl.searchParams.set('format', 'json');

  const entityRes = await fetch(entityUrl.toString(), {
    headers: { 'User-Agent': 'Elupedia/1.0 (https://www.elupedia.fr)' },
  });
  if (!entityRes.ok) {
    throw new Error(`Wikidata entities failed: ${entityRes.status}`);
  }

  const entityData = (await entityRes.json()) as WikidataEntitiesResponse;

  for (const id of ids) {
    const entity = entityData.entities[id];
    if (!entity?.sitelinks?.frwiki) continue;

    if (!looksLikeFrenchPolitician(entity)) {
      logger.debug(`  Skipping ${id} for "${query}" — not a French person`);
      continue;
    }

    const title = entity.sitelinks.frwiki.title;
    return `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  }

  return null;
}
