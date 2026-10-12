/**
 * Adresse de contact « bureau au Sénat » des sénateurs en exercice.
 *
 * Source : open data du Sénat, fichier ODSEN_GENERAL.json (une entrée par
 * sénateur, actuels et anciens). On ne lit que trois champs : Matricule, Etat
 * (« ACTIF » / « ANCIEN ») et Courrier_electronique. Le JSON est soit un
 * tableau nu, soit enveloppé dans `{ results: [...] }` selon la version
 * publiée, d'où le déballage avant validation zod.
 *
 * Il n'y a pas d'adresse individuelle dans l'open data : tous les sénateurs
 * actifs reçoivent l'adresse postale et le standard du Palais du Luxembourg
 * (SENAT_ADDRESS), seul l'e-mail est propre à chacun.
 *
 * Appelé par run-senat.ts, consommé par upsert/senat-addresses.ts.
 */
import { z } from 'zod/v4';
import { logger } from '../logger.js';

const GENERAL_URL = 'https://data.senat.fr/data/senateurs/ODSEN_GENERAL.json';

export { GENERAL_URL };

const ContactSchema = z.object({
  Matricule: z.string(),
  Etat: z.string(),
  Courrier_electronique: z.string().nullable(),
});

export interface SenatAddressData {
  matricule: string;
  type: 'assembly_office';
  street: string;
  postal_code: string;
  city: string;
  phone: string;
  email: string | undefined;
}

/** Adresse et standard du Sénat, communs à tous les sénateurs. */
const SENAT_ADDRESS = {
  street: '15 rue de Vaugirard',
  postal_code: '75291',
  city: 'Paris Cedex 06',
  phone: '+33 1 42 34 20 00',
} as const;

/**
 * Télécharge ODSEN_GENERAL.json (un GET) et retourne une adresse de bureau
 * par sénateur actif. Lève une erreur sur réponse HTTP non 2xx ou JSON
 * inattendu (zod).
 */
export async function fetchSenatAdresses(
  fetchFn: typeof fetch = fetch,
): Promise<SenatAddressData[]> {
  const response = await fetchFn(GENERAL_URL);
  if (!response.ok) {
    throw new Error(`Sénat adresses error: ${response.status}`);
  }

  const raw = await response.json();
  const data =
    typeof raw === 'object' && raw !== null && 'results' in raw
      ? (raw as Record<string, unknown>).results
      : raw;
  const records = z.array(ContactSchema).parse(data);
  const results: SenatAddressData[] = [];

  for (const record of records) {
    if (record.Etat !== 'ACTIF') continue;

    results.push({
      matricule: record.Matricule,
      type: 'assembly_office',
      ...SENAT_ADDRESS,
      email: record.Courrier_electronique ?? undefined,
    });
  }

  logger.info(`Sénat adresses: ${results.length} sénateurs actifs`);
  return results;
}
