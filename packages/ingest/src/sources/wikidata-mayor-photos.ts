/**
 * Photos de maires depuis Wikidata / Wikimedia Commons.
 *
 * 1. fetchWikidataMayorPhotos : une requête SPARQL sur query.wikidata.org
 *    renvoyant les personnes de nationalité française (P27 = Q142) ayant une
 *    image (P18), une date de naissance (P569, utile pour le rapprochement
 *    avec le RNE) et une position « maire » (P39 = Q382617) en cours (pas de
 *    date de fin P582), rattachée à une commune via « applies to jurisdiction »
 *    (P1001) ou « electoral district » (P768), commune dont on lit le code
 *    INSEE (P374). Réponse en JSON SPARQL (`results.bindings`), libellés en
 *    français. Une même personne peut sortir plusieurs fois (plusieurs
 *    images, plusieurs qualificatifs) : dédoublonnée sur (personne, commune).
 * 2. fetchCommonsLicense : pour une URL d'image Commons, interroge l'API
 *    MediaWiki (prop=imageinfo, extmetadata) pour la licence courte et son URL.
 *
 * Les deux endpoints limitent le débit (429) : appels encapsulés dans withRetry
 * avec un User-Agent identifiant le projet, comme le demande la politique
 * Wikimedia. Appelé par run-maires.ts et upsert/mayor-photos.ts.
 */
import { logger } from '../logger.js';
import { withRetry } from '../utils/retry.js';

const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
/** Politique Wikimedia : un User-Agent descriptif avec un contact. */
const USER_AGENT = 'Elupedia/1.0 (https://www.elupedia.fr; mthrobin@gmail.com)';

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
  /** « AAAA-MM-JJ » (tronqué depuis le dateTime SPARQL). */
  birthDate: string;
  /** URL Commons de l'image, forcée en https. */
  imageUrl: string;
  communeQid: string;
  communeName: string;
  /** Code INSEE de la commune (P374). */
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

/** « http://www.wikidata.org/entity/Q42 » → « Q42 ». */
function extractQid(uri: string): string {
  return uri.split('/').pop() ?? uri;
}

/**
 * Exécute la requête SPARQL (un GET, jusqu'à 3 tentatives) et retourne une
 * entrée par couple (maire, commune). Lève une erreur si toutes les tentatives
 * échouent.
 */
export async function fetchWikidataMayorPhotos(
  fetchFn: typeof fetch = fetch,
): Promise<WikidataMayorPhoto[]> {
  const url = `${WIKIDATA_SPARQL}?query=${encodeURIComponent(SPARQL_QUERY)}`;

  const response = await withRetry(
    async () => {
      const attempt = await fetchFn(url, {
        headers: {
          Accept: 'application/sparql-results+json',
          'User-Agent': USER_AGENT,
        },
      });
      // Le 429 est signalé explicitement : withRetry applique alors un délai plus long.
      if (attempt.status === 429) {
        throw new Error('Rate limited by Wikidata (429)');
      }
      if (!attempt.ok) {
        throw new Error(
          `Wikidata SPARQL error: ${attempt.status} ${attempt.statusText}`,
        );
      }
      return attempt;
    },
    { source: 'wikidata-sparql', maxAttempts: 3, baseDelayMs: 5000 },
  );

  const data = (await response.json()) as SparqlResults;

  const seen = new Set<string>();
  const results: WikidataMayorPhoto[] = [];

  for (const binding of data.results.bindings) {
    const qid = extractQid(binding.person.value);
    const key = `${qid}|${extractQid(binding.commune.value)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      qid,
      name: binding.personLabel.value,
      birthDate: binding.birthDate.value.slice(0, 10),
      imageUrl: binding.image.value.replace('http://', 'https://'),
      communeQid: extractQid(binding.commune.value),
      communeName: binding.communeLabel.value,
      communeCode: binding.communeCode.value,
    });
  }

  logger.info(`Wikidata: ${results.length} mayor photos fetched`);
  return results;
}

export interface CommonsLicense {
  name: string;
  url: string;
}

/**
 * Licence d'un fichier Commons à partir de son URL (le nom de fichier est le
 * dernier segment, décodé). Un GET avec jusqu'à 2 tentatives. Retourne null
 * si l'URL n'a pas de nom de fichier ou si Commons n'a pas de métadonnées
 * pour ce fichier ; « Unknown » / '' si la licence n'y est pas renseignée.
 */
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

  const response = await withRetry(
    async () => {
      const attempt = await fetchFn(apiUrl.toString(), {
        headers: { 'User-Agent': USER_AGENT },
      });
      if (attempt.status === 429)
        throw new Error('Rate limited by Commons (429)');
      if (!attempt.ok) throw new Error(`Commons API error: ${attempt.status}`);
      return attempt;
    },
    { source: 'commons-license', maxAttempts: 2, baseDelayMs: 3000 },
  );

  const data = (await response.json()) as {
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

  // `pages` est indexé par id de page (« -1 » si le fichier est inconnu) ; on n'en a demandé qu'une.
  const pages = Object.values(data.query.pages);
  const meta = pages[0]?.imageinfo?.[0]?.extmetadata;
  if (!meta) return null;

  return {
    name: meta.LicenseShortName?.value ?? 'Unknown',
    url: meta.LicenseUrl?.value ?? '',
  };
}
