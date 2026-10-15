/**
 * Recherche de la page Wikipédia francophone d'un élu à partir de son nom.
 *
 * On ne cherche pas directement sur Wikipédia (homonymes, redirections) mais
 * via l'API Wikidata (www.wikidata.org/w/api.php), en deux appels :
 *   1. `wbsearchentities` : jusqu'à MAX_SEARCH_RESULTS entités dont le libellé
 *      correspond à « Prénom Nom » (langue fr) ;
 *   2. `wbgetentities` : pour ces entités, leurs claims et leur sitelink
 *      `frwiki`.
 * On retient la première entité (dans l'ordre de pertinence de la recherche)
 * qui a une page frwiki et qui est un être humain (P31 = Q5) de nationalité
 * française (P27 = Q142). Pas de vérification de la fonction politique :
 * un homonyme français ayant une page peut donc être retourné à tort.
 *
 * Appelé par run-wikipedia.ts, un élu à la fois, avec le `fetch` global.
 * Pas de gestion du débit ici : c'est à l'appelant d'espacer les appels.
 */
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
const USER_AGENT = 'Elupedia/1.0 (https://www.elupedia.fr)';
/** Nombre de candidats examinés par recherche. */
const MAX_SEARCH_RESULTS = '5';

/** Vrai si l'un des claims de `property` pointe vers l'entité `qid`. */
function hasClaimValue(
  entity: WikidataEntity,
  property: string,
  qid: string,
): boolean {
  const claims = entity.claims?.[property] ?? [];
  return claims.some(
    (claim) =>
      (claim.mainsnak?.datavalue?.value as Record<string, unknown>)?.id === qid,
  );
}

// P31 = "instance of", Q5 = "human"
// P27 = "country of citizenship", Q142 = "France"
function isFrenchHuman(entity: WikidataEntity): boolean {
  if (!hasClaimValue(entity, 'P31', 'Q5')) return false;
  return hasClaimValue(entity, 'P27', 'Q142');
}

/**
 * Retourne l'URL fr.wikipedia.org de l'élu, ou null si aucune entité
 * plausible n'est trouvée. Deux GET sur l'API Wikidata ; lève une erreur sur
 * réponse HTTP non 2xx.
 */
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
  searchUrl.searchParams.set('limit', MAX_SEARCH_RESULTS);
  searchUrl.searchParams.set('format', 'json');

  const searchRes = await fetch(searchUrl.toString(), {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!searchRes.ok) {
    throw new Error(`Wikidata search failed: ${searchRes.status}`);
  }

  const searchData = (await searchRes.json()) as WikidataSearchResult;
  if (searchData.search.length === 0) return null;

  const ids = searchData.search.map((result) => result.id);

  const entityUrl = new URL(WIKIDATA_API);
  entityUrl.searchParams.set('action', 'wbgetentities');
  entityUrl.searchParams.set('ids', ids.join('|'));
  entityUrl.searchParams.set('props', 'sitelinks|claims');
  entityUrl.searchParams.set('sitefilter', 'frwiki');
  entityUrl.searchParams.set('format', 'json');

  const entityRes = await fetch(entityUrl.toString(), {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!entityRes.ok) {
    throw new Error(`Wikidata entities failed: ${entityRes.status}`);
  }

  const entityData = (await entityRes.json()) as WikidataEntitiesResponse;

  // Parcours dans l'ordre de pertinence de la recherche, pas celui de la réponse entities.
  for (const id of ids) {
    const entity = entityData.entities[id];
    if (!entity?.sitelinks?.frwiki) continue;

    if (!isFrenchHuman(entity)) {
      logger.debug(`  Skipping ${id} for "${query}" — not a French person`);
      continue;
    }

    const title = entity.sitelinks.frwiki.title;
    return `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  }

  return null;
}
