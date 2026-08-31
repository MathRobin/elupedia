import { logger } from '../logger.js';

const RNE_MAIRES_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503';

export interface RneMaire {
  departmentCode: string;
  departmentName: string;
  communeCode: string;
  communeName: string;
  lastName: string;
  firstName: string;
  gender: 'M' | 'F';
  birthDate: string;
  mandateStartDate: string;
  functionStartDate: string;
}

export function parseCsvRow(line: string): RneMaire | undefined {
  const cols = line.split(';');
  if (cols.length < 14) return undefined;

  const communeCode = cols[4]?.trim();
  const lastName = cols[6]?.trim();
  const firstName = cols[7]?.trim();
  const birthDate = cols[9]?.trim();
  const mandateStart = cols[12]?.trim();
  const functionStart = cols[13]?.trim().replace(/\r?\n$/, '');

  if (!communeCode || !lastName || !firstName || !birthDate) {
    return undefined;
  }

  return {
    departmentCode: cols[0]?.trim() ?? '',
    departmentName: cols[1]?.trim() ?? '',
    communeCode,
    communeName: cols[5]?.trim() ?? '',
    lastName,
    firstName,
    gender: cols[8]?.trim() === 'F' ? 'F' : 'M',
    birthDate,
    mandateStartDate: mandateStart ?? '',
    functionStartDate: functionStart ?? '',
  };
}

export async function fetchRneMaires(
  fetchFn: typeof fetch = fetch,
): Promise<RneMaire[]> {
  const res = await fetchFn(RNE_MAIRES_URL);
  if (!res.ok) {
    throw new Error(`RNE maires error: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const lines = text.split('\n');
  const results: RneMaire[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const maire = parseCsvRow(line);
    if (maire) {
      results.push(maire);
    }
  }

  logger.info(`RNE maires: ${results.length} maires parsed`);
  return results;
}
