import { logger } from '../logger.js';

const RNE_MEMBRES_ASSEMBLEE_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/a595be27-cfab-4810-b9d4-22e193bffe35';

export interface RneMembreAssemblee {
  regionCode: string;
  regionName: string;
  departmentCode: string;
  departmentName: string;
  collectiviteCode: string;
  collectiviteName: string;
  circonscriptionCode: string;
  circonscriptionName: string;
  lastName: string;
  firstName: string;
  gender: 'M' | 'F';
  birthDate: string;
  mandateStartDate: string;
  functionLabel: string;
  functionStartDate: string;
}

export function parseCsvRow(line: string): RneMembreAssemblee | undefined {
  const cols = line.split(';');
  if (cols.length < 19) return undefined;

  const collectiviteCode = cols[4]?.trim();
  const collectiviteName = cols[5]?.trim();
  const lastName = cols[10]?.trim();
  const firstName = cols[11]?.trim();
  const birthDate = cols[13]?.trim();
  const mandateStart = cols[16]?.trim();
  const functionLabel = cols[17]?.trim() ?? '';
  const functionStartDate = cols[18]?.trim().replace(/\r?\n$/, '') ?? '';

  if (
    !collectiviteCode ||
    !collectiviteName ||
    !lastName ||
    !firstName ||
    !birthDate
  ) {
    return undefined;
  }

  return {
    regionCode: cols[0]?.trim() ?? '',
    regionName: cols[1]?.trim() ?? '',
    departmentCode: cols[2]?.trim() ?? '',
    departmentName: cols[3]?.trim() ?? '',
    collectiviteCode,
    collectiviteName,
    // "Section" (cols 6-7) est toujours vide dans les données actuelles — non
    // exposée. Seule la Métropole de Lyon renseigne une circonscription
    // (cols 8-9) ; les autres collectivités (Corse, Guyane, Polynésie
    // française...) forment une assemblée unique sans subdivision.
    circonscriptionCode: cols[8]?.trim() ?? '',
    circonscriptionName: cols[9]?.trim() ?? '',
    lastName,
    firstName,
    gender: cols[12]?.trim() === 'F' ? 'F' : 'M',
    birthDate,
    mandateStartDate: mandateStart ?? '',
    functionLabel,
    functionStartDate,
  };
}

export async function fetchRneMembresAssemblee(
  fetchFn: typeof fetch = fetch,
): Promise<RneMembreAssemblee[]> {
  const res = await fetchFn(RNE_MEMBRES_ASSEMBLEE_URL);
  if (!res.ok) {
    throw new Error(
      `RNE membres assemblée error: ${res.status} ${res.statusText}`,
    );
  }

  const text = await res.text();
  const lines = text.split('\n');
  const results: RneMembreAssemblee[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const membre = parseCsvRow(line);
    if (membre) {
      results.push(membre);
    }
  }

  logger.info(`RNE membres assemblée: ${results.length} membres parsed`);
  return results;
}
