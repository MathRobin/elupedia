/**
 * Coordonnées des mairies (Annuaire de l'administration, DILA).
 *
 * Source : API Opendatasoft « api-lannuaire-administration » (explore v2.1),
 * filtrée sur `pivot like "mairie"`. Chaque enregistrement est une mairie
 * avec son code INSEE, son adresse, téléphone, e-mail et site.
 *
 * Extrait : une `MairieData` par enregistrement ayant un code commune.
 *
 * Pièges :
 * - Plusieurs champs (`adresse`, `telephone`, `site_internet`, `pivot`) sont
 *   des chaînes JSON imbriquées dans le JSON : à re-parser.
 * - L'API refuse un offset > 10 000 : on partitionne les requêtes par
 *   préfixe de code INSEE (département) pour rester sous la limite.
 * - `code_insee_commune` est parfois null ; on retombe alors sur le premier
 *   code du `pivot`.
 *
 * Appelé par run-maires.ts via upsert/mayor-addresses.ts.
 */
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
  /** Chaîne JSON : ApiAddress[]. */
  adresse: string | null;
  /** Chaîne JSON : { valeur: string }[]. */
  telephone: string | null;
  adresse_courriel: string | null;
  /** Chaîne JSON : { valeur: string }[]. */
  site_internet: string | null;
  /** Chaîne JSON : { code_insee_commune?: string[] }[]. */
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

/** Adresse physique (type « Adresse ») de préférence à l'adresse postale. */
function parseAddress(raw: string | null): ApiAddress | undefined {
  if (!raw) return undefined;
  try {
    const addresses = JSON.parse(raw) as ApiAddress[];
    return (
      addresses.find((address) => address.type_adresse === 'Adresse') ??
      addresses[0]
    );
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

// L'API limite l'offset à 10 000 : on partitionne par préfixe de code INSEE
// (01..96, Corse 2A/2B, DOM 971-976) pour rester en dessous.
const DEPT_PREFIXES = [
  ...Array.from({ length: 96 }, (_, i) => String(i + 1).padStart(2, '0')),
  '2A',
  '2B',
  ...['971', '972', '973', '974', '976'],
];

/** Toutes les mairies dont le code INSEE commence par `prefix` (paginé). */
async function fetchPartition(
  prefix: string,
  fetchFn: typeof fetch,
): Promise<MairieData[]> {
  const results: MairieData[] = [];
  let offset = 0;
  let total = Infinity;

  const whereClause = encodeURIComponent(
    `pivot like "mairie" AND startswith(code_insee_commune, "${prefix}")`,
  );

  while (offset < total) {
    const url = `${API_BASE}?where=${whereClause}&limit=${PAGE_SIZE}&offset=${offset}&select=code_insee_commune,adresse,telephone,adresse_courriel,site_internet,pivot`;

    const response = await fetchFn(url);
    if (!response.ok) {
      throw new Error(
        `DILA API error: ${response.status} ${response.statusText}`,
      );
    }

    const page = (await response.json()) as {
      total_count: number;
      results: ApiRecord[];
    };
    total = page.total_count;

    for (const record of page.results) {
      const communeCode = extractCommuneCode(record);
      if (!communeCode) continue;

      const address = parseAddress(record.adresse);

      results.push({
        communeCode,
        street: address?.numero_voie ?? '',
        postalCode: address?.code_postal ?? '',
        city: address?.nom_commune ?? '',
        phone: parsePhone(record.telephone),
        email: record.adresse_courriel || undefined,
        website: parseWebsite(record.site_internet),
      });
    }

    offset += PAGE_SIZE;
  }

  return results;
}

/**
 * Récupère toutes les mairies de France, département par département.
 * Lève à la première erreur HTTP.
 */
export async function fetchDilaMairies(
  fetchFn: typeof fetch = fetch,
): Promise<MairieData[]> {
  const results: MairieData[] = [];

  for (const prefix of DEPT_PREFIXES) {
    const partition = await fetchPartition(prefix, fetchFn);
    results.push(...partition);
  }

  logger.info(`DILA mairies: ${results.length} mairies fetched`);
  return results;
}
