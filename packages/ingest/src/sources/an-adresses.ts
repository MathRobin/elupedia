/**
 * Adresses de contact des députés en exercice (open data AN, jeu AMO10).
 *
 * Source : ZIP `AMO10_deputes_actifs_mandats_actifs_organes.json.zip`, dossier
 * `json/acteur/` avec un fichier par député (`{ acteur: {...} }`).
 *
 * Extrait : une `AddressData` par adresse postale de type « officielle »
 * (bureau à l'Assemblée) ou « publiée de circonscription », enrichie du
 * téléphone rattaché à cette adresse et de l'e-mail général du député.
 *
 * Pièges :
 * - `adresses.adresse` est tantôt un objet, tantôt un tableau (conversion
 *   XML→JSON) : voir normalizeArray.
 * - Le téléphone est une « adresse » à part (type 11) reliée à l'adresse
 *   postale par `adresseDeRattachement`. Plusieurs numéros peuvent être
 *   concaténés avec « / » : on ne garde que le premier.
 * - Les parties de rue se terminent parfois par une virgule parasite.
 *
 * Appelé par run-an.ts via upsert/addresses.ts.
 */
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

// Codes `type` du référentiel AN pour les entrées de `adresses.adresse`.
/** Adresse officielle (bureau à l'Assemblée nationale). */
const ADDRESS_TYPE_ASSEMBLY = '0';
/** Adresse publiée de circonscription (permanence). */
const ADDRESS_TYPE_CONSTITUENCY = '2';
/** Numéro de téléphone, rattaché à une adresse postale. */
const ADDRESS_TYPE_PHONE = '11';
/** Adresse e-mail. */
const ADDRESS_TYPE_EMAIL = '15';

/** Taille de la colonne `phone` en base. */
const MAX_PHONE_LENGTH = 50;

interface RawAddress {
  uid: string;
  type: string;
  adresseDeRattachement?: string | null;
  numeroRue?: string | null;
  nomRue?: string | null;
  complementAdresse?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  /** Valeur « électronique » : numéro de téléphone ou e-mail selon `type`. */
  valElec?: string | null;
}

/** Concatène numéro, rue et complément en supprimant les virgules finales. */
function buildStreet(address: RawAddress): string | undefined {
  const parts = [address.numeroRue, address.nomRue, address.complementAdresse]
    .filter((part): part is string => part != null && part.trim() !== '')
    .map((part) => part.trim().replace(/,\s*$/, ''));
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/** Ne garde que le premier numéro d'une liste « 01 .. / 02 .. ». */
function cleanPhone(raw: string): string {
  const firstNumber = raw.split('/')[0].trim();
  return firstNumber.substring(0, MAX_PHONE_LENGTH);
}

function normalizeArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Télécharge le ZIP AMO10 et renvoie toutes les adresses de bureau des
 * députés actifs. Lève une erreur si le téléchargement échoue.
 */
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

    const rawAddresses: RawAddress[] = normalizeArray(
      adressesObj.adresse as RawAddress | RawAddress[],
    );
    if (rawAddresses.length === 0) continue;

    // Première passe : indexer les téléphones par adresse de rattachement et
    // retenir le premier e-mail (commun à toutes les adresses du député).
    const phoneByRattachement = new Map<string, string>();
    let generalEmail: string | undefined;

    for (const address of rawAddresses) {
      if (
        address.type === ADDRESS_TYPE_PHONE &&
        address.valElec &&
        address.adresseDeRattachement
      ) {
        phoneByRattachement.set(
          address.adresseDeRattachement,
          cleanPhone(address.valElec),
        );
      }
      if (
        address.type === ADDRESS_TYPE_EMAIL &&
        address.valElec &&
        !generalEmail
      ) {
        generalEmail = address.valElec;
      }
    }

    // Seconde passe : émettre les adresses postales.
    for (const address of rawAddresses) {
      let addressType: 'assembly_office' | 'constituency_office' | undefined;
      if (address.type === ADDRESS_TYPE_ASSEMBLY) {
        addressType = 'assembly_office';
      } else if (address.type === ADDRESS_TYPE_CONSTITUENCY) {
        addressType = 'constituency_office';
      } else {
        continue;
      }

      results.push({
        id_an: anId,
        type: addressType,
        street: buildStreet(address),
        postal_code: address.codePostal ?? undefined,
        city: address.ville ?? undefined,
        phone: phoneByRattachement.get(address.uid) ?? undefined,
        email: generalEmail,
      });
    }
  }

  return results;
}
