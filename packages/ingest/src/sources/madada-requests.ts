import { logger } from '../logger.js';

export interface MadadaRequest {
  madadaId: number;
  urlTitle: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

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

async function fetchRequestSlugs(
  madadaUrlName: string,
  fetchFn: typeof fetch,
): Promise<string[]> {
  const slugs: string[] = [];
  let page = 1;

  while (true) {
    const res = await fetchFn(
      `https://madada.fr/body/${madadaUrlName}?page=${page}`,
    );
    if (!res.ok) break;

    const html = await res.text();
    const matches = [...html.matchAll(REQUEST_SLUG_RE)];
    if (matches.length === 0) break;

    for (const m of matches) {
      if (!slugs.includes(m[1])) slugs.push(m[1]);
    }

    if (!html.includes(`page=${page + 1}`)) break;
    page++;
    await new Promise((r) => setTimeout(r, 200));
  }

  return slugs;
}

async function fetchRequestJson(
  slug: string,
  fetchFn: typeof fetch,
): Promise<MadadaRequest | null> {
  const res = await fetchFn(`https://madada.fr/request/${slug}.json`);
  if (!res.ok) return null;

  const data = (await res.json()) as RequestJson;
  return {
    madadaId: data.id,
    urlTitle: data.url_title,
    title: data.title,
    status: data.described_state ?? data.display_status ?? 'unknown',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function fetchMadadaRequests(
  madadaUrlName: string,
  fetchFn: typeof fetch = fetch,
): Promise<MadadaRequest[]> {
  const slugs = await fetchRequestSlugs(madadaUrlName, fetchFn);
  if (slugs.length === 0) return [];

  const results: MadadaRequest[] = [];

  for (const slug of slugs) {
    try {
      const req = await fetchRequestJson(slug, fetchFn);
      if (req) results.push(req);
    } catch (e) {
      logger.warn(`  Failed to fetch request ${slug}: ${e}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  return results;
}
