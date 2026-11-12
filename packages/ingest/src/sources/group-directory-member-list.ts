/**
 * Récupération de la liste des membres d'un groupe parlementaire sur le site
 * de l'Assemblée (ticket #276, utilisé aussi par le debug du rapprochement).
 *
 * La page du groupe ne contient pas la liste : elle est chargée par un POST
 * AJAX vers `/layout/set/ajax/content/view/embed/<nodeId>`, où `nodeId` est
 * l'identifiant du bloc « Composition » porté par la page (lien
 * `data-content-type="an_instance_composition"`). Sans Referer ni
 * X-Requested-With, le POST renvoie une réponse vide.
 *
 * Lecture seule, une requête GET puis une requête POST par groupe.
 * Appelée par main-group-directories-match.ts.
 */
import * as cheerio from 'cheerio';

const USER_AGENT = 'Elupedia/1.0 (https://www.elupedia.fr)';
const TIMEOUT_MS = 30_000;

/** Identifiant du bloc « Composition » sur la page du groupe, ou null. */
export function findCompositionNodeId(pageHtml: string): string | null {
  const $ = cheerio.load(pageHtml);
  const nodeId = $('[data-content-type="an_instance_composition"]')
    .first()
    .attr('data-node-id');
  return nodeId && /^\d+$/.test(nodeId) ? nodeId : null;
}

/**
 * Télécharge la page du groupe puis le bloc de composition. Renvoie le HTML
 * de la liste des membres, à passer à `extractSocialLinks`.
 * Lève une erreur si la page ou le bloc est introuvable.
 */
export async function fetchGroupMemberList(listUrl: string): Promise<string> {
  const pageHtml = await fetchWithRetry(listUrl, {});
  const nodeId = findCompositionNodeId(pageHtml);
  if (!nodeId) {
    throw new Error(`bloc de composition introuvable sur ${listUrl}`);
  }

  const origin = new URL(listUrl).origin;
  return fetchWithRetry(
    `${origin}/layout/set/ajax/content/view/embed/${nodeId}`,
    {
      method: 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Referer: listUrl,
      },
    },
  );
}

/** HTML d'une fiche de député (GET, même politesse que la liste). */
export function fetchPage(url: string): Promise<string> {
  return fetchWithRetry(url, {});
}

/** Pauses avant chaque nouvelle tentative (3 tentatives au total). */
export const RETRY_DELAYS_MS = [5000, 15000];

/** Statuts qui justifient une nouvelle tentative : charge du site, limitation. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * GET ou POST avec User-Agent. Réessaie les erreurs réseau (« fetch failed »,
 * délai dépassé) et les statuts de RETRYABLE_STATUS ; les autres statuts
 * échouent tout de suite. Lève la dernière erreur si toutes les tentatives échouent.
 */
export async function fetchWithRetry(
  url: string,
  init: { method?: string; headers?: Record<string, string> },
  delays: number[] = RETRY_DELAYS_MS,
): Promise<string> {
  let lastError: Error = new Error(`échec sur ${url}`);
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt - 1]));
    }
    let retryable = true;
    try {
      const response = await fetch(url, {
        ...init,
        headers: { 'User-Agent': USER_AGENT, ...init.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) return await response.text();
      lastError = new Error(`HTTP ${response.status} sur ${url}`);
      retryable = RETRYABLE_STATUS.has(response.status);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    if (!retryable) break;
  }
  throw lastError;
}
