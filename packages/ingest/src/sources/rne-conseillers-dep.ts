import { logger } from '../logger.js';

const RNE_CONSEILLERS_DEP_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/601ef073-d986-4582-8e1a-ed14dc857fba';

export interface RneConseillerDep {
  departmentCode: string;
  departmentName: string;
  cantonCode: string;
  cantonName: string;
  lastName: string;
  firstName: string;
  gender: 'M' | 'F';
  birthDate: string;
  mandateStartDate: string;
  functionLabel: string;
  functionStartDate: string;
}

export function parseCsvRow(line: string): RneConseillerDep | undefined {
  const cols = line.split(';');
  if (cols.length < 13) return undefined;

  const cantonCode = cols[2]?.trim();
  const lastName = cols[4]?.trim();
  const firstName = cols[5]?.trim();
  const birthDate = cols[7]?.trim();
  const mandateStart = cols[10]?.trim();
  const functionLabel = cols[11]?.trim() ?? '';
  const functionStartDate = cols[12]?.trim().replace(/\r?\n$/, '') ?? '';

  if (!cantonCode || !lastName || !firstName || !birthDate) {
    return undefined;
  }

  return {
    departmentCode: cols[0]?.trim() ?? '',
    departmentName: cols[1]?.trim() ?? '',
    cantonCode,
    cantonName: cols[3]?.trim() ?? '',
    lastName,
    firstName,
    gender: cols[6]?.trim() === 'F' ? 'F' : 'M',
    birthDate,
    mandateStartDate: mandateStart ?? '',
    functionLabel,
    functionStartDate,
  };
}

export async function fetchRneConseillersDep(
  fetchFn: typeof fetch = fetch,
): Promise<RneConseillerDep[]> {
  const res = await fetchFn(RNE_CONSEILLERS_DEP_URL);
  if (!res.ok) {
    throw new Error(
      `RNE conseillers départementaux error: ${res.status} ${res.statusText}`,
    );
  }

  const text = await res.text();
  const lines = text.split('\n');
  const results: RneConseillerDep[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const conseiller = parseCsvRow(line);
    if (conseiller) {
      results.push(conseiller);
    }
  }

  logger.info(
    `RNE conseillers départementaux: ${results.length} conseillers parsed`,
  );
  return results;
}
