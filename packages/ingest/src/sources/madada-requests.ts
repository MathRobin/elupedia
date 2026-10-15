/**
 * Demandes d'accès aux documents administratifs adressées à une mairie sur
 * madada.fr (instance Alaveteli, équivalent français de WhatDoTheyKnow).
 *
 * Source : scraping des pages HTML `/body/{url_name}?page=N` pour collecter
 * les slugs des demandes (liens `/request/{slug}`), puis `GET
 * /request/{slug}.json` pour le détail de chacune (API JSON Alaveteli).
 *
 * Extrait : une `MadadaRequest` par demande (id, titre, statut, dates).
 *
 * Pièges :
 * - Pas d'API de liste : la pagination s'arrête quand la page n'annonce plus
 *   de `page=N+1` ou ne contient plus de lien de demande.
 * - Temporisations (SLUG_PAGE_DELAY_MS, REQUEST_DELAY_MS) pour ménager le
 *   serveur associatif.
 * - Une erreur sur une demande est loguée et n'interrompt pas le lot.
 *
 * Appelé par main-madada.ts via upsert/madada-requests.ts ; `madadaUrlName`
 * vient de madada.ts (fetchMadadaBody).
 */
import { logger } from '../logger.js';

export interface MadadaRequest {
  madadaId: number;
  urlTitle: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** Réponse de `/request/{slug}.json` (champs utilisés). */
interface RequestJson {
  id: number;
  url_title: string;
  title: string;
  created_at: string;
  updated_at: string;
  described_state: string;
  display_status: string;
}

const REQUEST_SLUG_RE = /href="\/request\/([^"#]+)/g;

/** Pause entre deux pages de liste. */
const SLUG_PAGE_DELAY_MS = 200;
/** Pause entre deux détails de demande. */
const REQUEST_DELAY_MS = 150;
const UNKNOWN_STATUS = 'unknown';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Slugs (dédoublonnés, dans l'ordre d'apparition) de toutes les pages. */
async function fetchRequestSlugs(
  madadaUrlName: string,
  fetchFn: typeof fetch,
): Promise<string[]> {
  const slugs: string[] = [];
  let page = 1;

  while (true) {
    const response = await fetchFn(
      `https://madada.fr/body/${madadaUrlName}?page=${page}`,
    );
    if (!response.ok) break;

    const html = await response.text();
    const matches = [...html.matchAll(REQUEST_SLUG_RE)];
    if (matches.length === 0) break;

    for (const match of matches) {
      if (!slugs.includes(match[1])) slugs.push(match[1]);
    }

    if (!html.includes(`page=${page + 1}`)) break;
    page++;
    await sleep(SLUG_PAGE_DELAY_MS);
  }

  return slugs;
}

async function fetchRequestJson(
  slug: string,
  fetchFn: typeof fetch,
): Promise<MadadaRequest | null> {
  const response = await fetchFn(`https://madada.fr/request/${slug}.json`);
  if (!response.ok) return null;

  const payload = (await response.json()) as RequestJson;
  return {
    madadaId: payload.id,
    urlTitle: payload.url_title,
    title: payload.title,
    status: payload.described_state ?? payload.display_status ?? UNKNOWN_STATUS,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
}

/**
 * Toutes les demandes adressées à l'autorité `madadaUrlName`. Ne lève pas :
 * une page de liste en erreur arrête la collecte, une demande en erreur est
 * ignorée (warn).
 */
export async function fetchMadadaRequests(
  madadaUrlName: string,
  fetchFn: typeof fetch = fetch,
): Promise<MadadaRequest[]> {
  const slugs = await fetchRequestSlugs(madadaUrlName, fetchFn);
  if (slugs.length === 0) return [];

  const results: MadadaRequest[] = [];

  for (const slug of slugs) {
    try {
      const request = await fetchRequestJson(slug, fetchFn);
      if (request) results.push(request);
    } catch (error) {
      logger.warn(`  Failed to fetch request ${slug}: ${error}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  return results;
}
