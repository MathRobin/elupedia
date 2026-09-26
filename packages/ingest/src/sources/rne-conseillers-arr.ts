import { logger } from '../logger.js';

const RNE_CONSEILLERS_ARR_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/3b6b2281-b9d9-4959-ae9d-c2c166dff118';

export interface RneConseillerArr {
  departmentCode: string;
  departmentName: string;
  communeCode: string;
  communeName: string;
  sectorLabel: string;
  lastName: string;
  firstName: string;
  gender: 'M' | 'F';
  birthDate: string;
  mandateStartDate: string;
  functionLabel: string;
  functionStartDate: string;
}

export function parseCsvRow(line: string): RneConseillerArr | undefined {
  const cols = line.split(';');
  if (cols.length < 14) return undefined;

  const communeCode = cols[2]?.trim();
  const sectorLabel = cols[4]?.trim();
  const lastName = cols[5]?.trim();
  const firstName = cols[6]?.trim();
  const birthDate = cols[8]?.trim();
  const mandateStart = cols[11]?.trim();
  const functionLabel = cols[12]?.trim() ?? '';
  const functionStartDate = cols[13]?.trim().replace(/\r?\n$/, '') ?? '';

  if (!communeCode || !sectorLabel || !lastName || !firstName || !birthDate) {
    return undefined;
  }

  return {
    departmentCode: cols[0]?.trim() ?? '',
    departmentName: cols[1]?.trim() ?? '',
    communeCode,
    communeName: cols[3]?.trim() ?? '',
    sectorLabel,
    lastName,
    firstName,
    gender: cols[7]?.trim() === 'F' ? 'F' : 'M',
    birthDate,
    mandateStartDate: mandateStart ?? '',
    functionLabel,
    functionStartDate,
  };
}

export async function fetchRneConseillersArr(
  fetchFn: typeof fetch = fetch,
): Promise<RneConseillerArr[]> {
  const res = await fetchFn(RNE_CONSEILLERS_ARR_URL);
  if (!res.ok) {
    throw new Error(
      `RNE conseillers d'arrondissement error: ${res.status} ${res.statusText}`,
    );
  }

  const text = await res.text();
  const lines = text.split('\n');
  const results: RneConseillerArr[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const conseiller = parseCsvRow(line);
    if (conseiller) {
      results.push(conseiller);
    }
  }

  logger.info(
    `RNE conseillers d'arrondissement: ${results.length} conseillers parsed`,
  );
  return results;
}
