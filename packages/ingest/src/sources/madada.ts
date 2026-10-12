/**
 * Statistiques de transparence d'une commune sur madada.fr (instance
 * Alaveteli : demandes d'accès aux documents administratifs).
 *
 * Source : API JSON Alaveteli `GET /body/{slug}.json`, où le « body » est
 * l'autorité publique (ici la mairie). Le slug est construit localement
 * (`mairie_<nom normalisé>`) puisque madada n'offre pas de recherche par
 * code INSEE.
 *
 * Extrait : le `MadadaBody` (url_name, nom, compteurs de demandes) par code
 * commune, uniquement pour les mairies ayant au moins une demande.
 *
 * Pièges :
 * - Trois tentatives de slug par commune : nom seul, puis suivi d'une
 *   redirection éventuelle, puis variante suffixée par le code INSEE et
 *   « _01 » (homonymes).
 * - Les communes sont traitées séquentiellement avec une pause toutes les
 *   50 pour ménager le serveur ; le lot complet (≈ 35 000 communes) est long.
 * - Une erreur réseau sur une commune est comptée, pas propagée.
 *
 * Appelé par main-madada.ts via upsert/commune-transparency.ts ; le
 * `url_name` obtenu alimente madada-requests.ts.
 */
import { logger } from '../logger.js';

export interface MadadaBody {
  url_name: string;
  name: string;
  info: {
    requests_count: number;
    requests_successful_count: number;
    requests_overdue_count: number;
    requests_not_held_count: number;
  };
}

const JSON_HEADERS = { Accept: 'application/json' };

/** Nombre de communes entre deux pauses. */
const PAUSE_EVERY_COMMUNES = 50;
const PAUSE_MS = 200;
/** Nombre de communes entre deux logs de progression. */
const LOG_EVERY_COMMUNES = 500;

/** « L'Haÿ-les-Roses » → « l_hay_les_roses » (convention des slugs madada). */
function normalizeCommune(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['']/g, '_')
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Cherche l'autorité madada d'une mairie. Renvoie null si aucun des slugs
 * candidats n'existe. Lève sur erreur réseau (pas sur 404).
 */
export async function fetchMadadaBody(
  communeName: string,
  communeCode: string,
  fetchFn: typeof fetch = fetch,
): Promise<MadadaBody | null> {
  const slug = `mairie_${normalizeCommune(communeName)}`;

  const response = await fetchFn(`https://madada.fr/body/${slug}.json`, {
    headers: JSON_HEADERS,
  });

  if (response.ok) {
    const body = (await response.json()) as MadadaBody;
    return body;
  }

  // Slug renommé côté madada : suivre la redirection vers le nouveau slug.
  if (response.status === 301 || response.status === 302) {
    const location = response.headers.get('location');
    if (location) {
      const jsonUrl = location.endsWith('.json')
        ? location
        : `${location}.json`;
      const redirectedResponse = await fetchFn(
        jsonUrl.startsWith('http') ? jsonUrl : `https://madada.fr${jsonUrl}`,
        { headers: JSON_HEADERS },
      );
      if (redirectedResponse.ok)
        return (await redirectedResponse.json()) as MadadaBody;
    }
  }

  // Homonymes : madada suffixe le slug par le code INSEE et un rang.
  const deptCode = communeCode.slice(0, 2);
  const slugWithCode = `mairie_${normalizeCommune(communeName)}_${deptCode}${communeCode.slice(2)}_01`;
  const codedSlugResponse = await fetchFn(
    `https://madada.fr/body/${slugWithCode}.json`,
    {
      headers: JSON_HEADERS,
    },
  );
  if (codedSlugResponse.ok)
    return (await codedSlugResponse.json()) as MadadaBody;

  return null;
}

export interface CommuneForMadada {
  communeCode: string;
  communeName: string;
}

/**
 * Interroge madada pour chaque commune et renvoie, indexés par code
 * commune, les bodies ayant au moins une demande. Ne lève jamais ; logue la
 * progression.
 */
export async function fetchMadadaStats(
  communes: CommuneForMadada[],
  fetchFn: typeof fetch = fetch,
): Promise<Map<string, MadadaBody>> {
  const results = new Map<string, MadadaBody>();
  let found = 0;
  let notFound = 0;
  let errors = 0;

  for (let i = 0; i < communes.length; i++) {
    const { communeCode, communeName } = communes[i];

    try {
      const body = await fetchMadadaBody(communeName, communeCode, fetchFn);
      if (body && body.info.requests_count > 0) {
        results.set(communeCode, body);
        found++;
      } else {
        notFound++;
      }
    } catch {
      errors++;
    }

    if ((i + 1) % LOG_EVERY_COMMUNES === 0) {
      logger.info(
        `Madada: ${i + 1}/${communes.length} processed (${found} found, ${notFound} not found, ${errors} errors)`,
      );
    }

    if ((i + 1) % PAUSE_EVERY_COMMUNES === 0) {
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
  }

  logger.info(
    `Madada: ${communes.length} communes processed — ${found} found, ${notFound} not found, ${errors} errors`,
  );
  return results;
}
