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

export async function fetchMadadaBody(
  communeName: string,
  communeCode: string,
  fetchFn: typeof fetch = fetch,
): Promise<MadadaBody | null> {
  const slug = `mairie_${normalizeCommune(communeName)}`;

  const res = await fetchFn(`https://madada.fr/body/${slug}.json`, {
    headers: { Accept: 'application/json' },
  });

  if (res.ok) {
    const data = (await res.json()) as MadadaBody;
    return data;
  }

  if (res.status === 301 || res.status === 302) {
    const location = res.headers.get('location');
    if (location) {
      const jsonUrl = location.endsWith('.json')
        ? location
        : `${location}.json`;
      const res2 = await fetchFn(
        jsonUrl.startsWith('http') ? jsonUrl : `https://madada.fr${jsonUrl}`,
        { headers: { Accept: 'application/json' } },
      );
      if (res2.ok) return (await res2.json()) as MadadaBody;
    }
  }

  const deptCode = communeCode.slice(0, 2);
  const slugWithCode = `mairie_${normalizeCommune(communeName)}_${deptCode}${communeCode.slice(2)}_01`;
  const res3 = await fetchFn(`https://madada.fr/body/${slugWithCode}.json`, {
    headers: { Accept: 'application/json' },
  });
  if (res3.ok) return (await res3.json()) as MadadaBody;

  return null;
}

export interface CommuneForMadada {
  communeCode: string;
  communeName: string;
}

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

    if ((i + 1) % 500 === 0) {
      logger.info(
        `Madada: ${i + 1}/${communes.length} processed (${found} found, ${notFound} not found, ${errors} errors)`,
      );
    }

    if ((i + 1) % 50 === 0) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  logger.info(
    `Madada: ${communes.length} communes processed — ${found} found, ${notFound} not found, ${errors} errors`,
  );
  return results;
}
