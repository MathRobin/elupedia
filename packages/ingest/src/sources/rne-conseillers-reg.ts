import { logger } from '../logger.js';

const RNE_CONSEILLERS_REG_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/430e13f9-834b-4411-a1a8-da0b4b6e715c';

export interface RneConseillerReg {
  regionCode: string;
  regionName: string;
  sectionCode: string;
  sectionName: string;
  lastName: string;
  firstName: string;
  gender: 'M' | 'F';
  birthDate: string;
  mandateStartDate: string;
  functionLabel: string;
  functionStartDate: string;
}

export function parseCsvRow(line: string): RneConseillerReg | undefined {
  const cols = line.split(';');
  if (cols.length < 13) return undefined;

  const sectionCode = cols[2]?.trim();
  const lastName = cols[4]?.trim();
  const firstName = cols[5]?.trim();
  const birthDate = cols[7]?.trim();
  const mandateStart = cols[10]?.trim();
  const functionLabel = cols[11]?.trim() ?? '';
  const functionStartDate = cols[12]?.trim().replace(/\r?\n$/, '') ?? '';

  if (!sectionCode || !lastName || !firstName || !birthDate) {
    return undefined;
  }

  return {
    regionCode: cols[0]?.trim() ?? '',
    regionName: cols[1]?.trim() ?? '',
    sectionCode,
    sectionName: cols[3]?.trim() ?? '',
    lastName,
    firstName,
    gender: cols[6]?.trim() === 'F' ? 'F' : 'M',
    birthDate,
    mandateStartDate: mandateStart ?? '',
    functionLabel,
    functionStartDate,
  };
}

export async function fetchRneConseillersReg(
  fetchFn: typeof fetch = fetch,
): Promise<RneConseillerReg[]> {
  const res = await fetchFn(RNE_CONSEILLERS_REG_URL);
  if (!res.ok) {
    throw new Error(
      `RNE conseillers régionaux error: ${res.status} ${res.statusText}`,
    );
  }

  const text = await res.text();
  const lines = text.split('\n');
  const results: RneConseillerReg[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const conseiller = parseCsvRow(line);
    if (conseiller) {
      results.push(conseiller);
    }
  }

  logger.info(
    `RNE conseillers régionaux: ${results.length} conseillers parsed`,
  );
  return results;
}
