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

/** Réessaie les 503 (charge du site) avec une pause croissante, 3 tentatives au total. */
async function fetchWithRetry(
  url: string,
  init: { method?: string; headers?: Record<string, string> },
): Promise<string> {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) return response.text();
    if (response.status !== 503 || attempt === attempts) {
      throw new Error(`HTTP ${response.status} sur ${url}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
  }
  throw new Error(`échec sur ${url}`);
}
