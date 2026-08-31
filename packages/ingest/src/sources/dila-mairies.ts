import { logger } from '../logger.js';

const API_BASE =
  'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records';
const PAGE_SIZE = 100;

export interface MairieData {
  communeCode: string;
  street: string;
  postalCode: string;
  city: string;
  phone: string | undefined;
  email: string | undefined;
  website: string | undefined;
}

interface ApiAddress {
  type_adresse: string;
  numero_voie: string;
  code_postal: string;
  nom_commune: string;
}

interface ApiRecord {
  code_insee_commune: string | null;
  adresse: string | null;
  telephone: string | null;
  adresse_courriel: string | null;
  site_internet: string | null;
  pivot: string | null;
}

function extractCommuneCode(record: ApiRecord): string | undefined {
  if (record.code_insee_commune) return record.code_insee_commune;
  if (!record.pivot) return undefined;
  try {
    const pivots = JSON.parse(record.pivot) as {
      code_insee_commune?: string[];
    }[];
    return pivots[0]?.code_insee_commune?.[0];
  } catch {
    return undefined;
  }
}

function parseAddress(raw: string | null): ApiAddress | undefined {
  if (!raw) return undefined;
  try {
    const addrs = JSON.parse(raw) as ApiAddress[];
    return addrs.find((a) => a.type_adresse === 'Adresse') ?? addrs[0];
  } catch {
    return undefined;
  }
}

function parsePhone(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const phones = JSON.parse(raw) as { valeur: string }[];
    return phones[0]?.valeur || undefined;
  } catch {
    return undefined;
  }
}

function parseWebsite(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const sites = JSON.parse(raw) as { valeur: string }[];
    return sites[0]?.valeur || undefined;
  } catch {
    return undefined;
  }
}

export async function fetchDilaMairies(
  fetchFn: typeof fetch = fetch,
): Promise<MairieData[]> {
  const results: MairieData[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const url = `${API_BASE}?where=pivot%20like%20%22mairie%22&limit=${PAGE_SIZE}&offset=${offset}&select=code_insee_commune,adresse,telephone,adresse_courriel,site_internet,pivot`;

    const res = await fetchFn(url);
    if (!res.ok) {
      throw new Error(`DILA API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      total_count: number;
      results: ApiRecord[];
    };
    total = data.total_count;

    for (const record of data.results) {
      const communeCode = extractCommuneCode(record);
      if (!communeCode) continue;

      const addr = parseAddress(record.adresse);

      results.push({
        communeCode,
        street: addr?.numero_voie ?? '',
        postalCode: addr?.code_postal ?? '',
        city: addr?.nom_commune ?? '',
        phone: parsePhone(record.telephone),
        email: record.adresse_courriel || undefined,
        website: parseWebsite(record.site_internet),
      });
    }

    offset += PAGE_SIZE;
  }

  logger.info(`DILA mairies: ${results.length} mairies fetched`);
  return results;
}
