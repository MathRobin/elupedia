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

const SENAT_ADDRESS = {
  street: '15 rue de Vaugirard',
  postal_code: '75291',
  city: 'Paris Cedex 06',
  phone: '+33 1 42 34 20 00',
} as const;

export async function fetchSenatAdresses(
  fetchFn: typeof fetch = fetch,
): Promise<SenatAddressData[]> {
  const res = await fetchFn(GENERAL_URL);
  if (!res.ok) {
    throw new Error(`Sénat adresses error: ${res.status}`);
  }

  const raw = await res.json();
  const data =
    typeof raw === 'object' && raw !== null && 'results' in raw
      ? (raw as Record<string, unknown>).results
      : raw;
  const records = z.array(ContactSchema).parse(data);
  const results: SenatAddressData[] = [];

  for (const r of records) {
    if (r.Etat !== 'ACTIF') continue;

    results.push({
      matricule: r.Matricule,
      type: 'assembly_office',
      ...SENAT_ADDRESS,
      email: r.Courrier_electronique ?? undefined,
    });
  }

  logger.info(`Sénat adresses: ${results.length} sénateurs actifs`);
  return results;
}
