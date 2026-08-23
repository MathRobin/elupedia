import { Readable } from 'node:stream';
import { Extract } from 'unzipper';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdir, readFile, mkdir, rm } from 'node:fs/promises';

export interface AddressData {
  id_an: string;
  type: 'constituency_office' | 'assembly_office';
  street?: string;
  postal_code?: string;
  city?: string;
  phone?: string;
  email?: string;
}

export const DATASET_URL =
  'https://data.assemblee-nationale.fr/static/openData/repository/17/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes.json.zip';

interface RawAddress {
  uid: string;
  type: string;
  adresseDeRattachement?: string | null;
  numeroRue?: string | null;
  nomRue?: string | null;
  complementAdresse?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  valElec?: string | null;
}

function buildStreet(addr: RawAddress): string | undefined {
  const parts = [addr.numeroRue, addr.nomRue, addr.complementAdresse]
    .filter((p): p is string => p != null && p.trim() !== '')
    .map((p) => p.trim().replace(/,\s*$/, ''));
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function cleanPhone(raw: string): string {
  const first = raw.split('/')[0].trim();
  return first.substring(0, 50);
}

function normalizeArray<T>(val: T | T[] | undefined | null): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

export async function fetchAddresses(
  fetchFn: typeof fetch = fetch,
): Promise<AddressData[]> {
  const response = await fetchFn(DATASET_URL);
  if (!response.ok) {
    throw new Error(
      `AN adresses API error: ${response.status} ${response.statusText}`,
    );
  }

  const extractDir = join(tmpdir(), `an-addr-${Date.now()}`);
  await mkdir(extractDir, { recursive: true });

  try {
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await new Promise<void>((resolve, reject) => {
      const extractor = Extract({ path: extractDir });
      extractor.on('close', resolve);
      extractor.on('error', reject);
      Readable.from(buffer).pipe(extractor);
    });

    return await loadAddresses(extractDir);
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }
}

async function loadAddresses(extractDir: string): Promise<AddressData[]> {
  const acteurDir = join(extractDir, 'json', 'acteur');
  let files: string[];
  try {
    files = await readdir(acteurDir);
  } catch {
    return [];
  }

  const results: AddressData[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await readFile(join(acteurDir, file), 'utf-8');
    let acteur: Record<string, unknown>;
    try {
      acteur = (JSON.parse(raw) as { acteur: Record<string, unknown> }).acteur;
    } catch {
      continue;
    }

    const anId = (acteur?.uid as Record<string, string> | undefined)?.['#text'];
    if (!anId) continue;

    const adressesObj = acteur?.adresses as Record<string, unknown> | undefined;
    if (!adressesObj) continue;

    const rawAddrs: RawAddress[] = normalizeArray(
      adressesObj.adresse as RawAddress | RawAddress[],
    );
    if (rawAddrs.length === 0) continue;

    const phoneByRattachement = new Map<string, string>();
    let generalEmail: string | undefined;

    for (const addr of rawAddrs) {
      if (addr.type === '11' && addr.valElec && addr.adresseDeRattachement) {
        phoneByRattachement.set(
          addr.adresseDeRattachement,
          cleanPhone(addr.valElec),
        );
      }
      if (addr.type === '15' && addr.valElec && !generalEmail) {
        generalEmail = addr.valElec;
      }
    }

    for (const addr of rawAddrs) {
      let addressType: 'assembly_office' | 'constituency_office' | undefined;
      if (addr.type === '0') addressType = 'assembly_office';
      else if (addr.type === '2') addressType = 'constituency_office';
      else continue;

      results.push({
        id_an: anId,
        type: addressType,
        street: buildStreet(addr),
        postal_code: addr.codePostal ?? undefined,
        city: addr.ville ?? undefined,
        phone: phoneByRattachement.get(addr.uid) ?? undefined,
        email: generalEmail,
      });
    }
  }

  return results;
}
