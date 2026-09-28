import { logger } from '../logger.js';

const RNE_CONSEILLERS_FDE_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/84949a7b-53e0-4d78-9a66-8446f5ab6ad4';

export interface RneConseillerFde {
  afeCode: string;
  afeName: string;
  consularCode: string;
  consularName: string;
  lastName: string;
  firstName: string;
  gender: 'M' | 'F';
  birthDate: string;
  mandateStartDate: string;
}

function stripQuotes(s: string): string {
  return s.trim().replace(/^"|"$/g, '');
}

// Contrairement aux autres fichiers RNE, les champs texte de celui-ci sont
// systématiquement entre guillemets (ex. "Canada";101;"Canada - 1re
// circonscription").
export function parseCsvRow(line: string): RneConseillerFde | undefined {
  const cols = line.split(';').map(stripQuotes);
  if (cols.length < 14) return undefined;

  const consularCode = cols[2];
  const lastName = cols[4];
  const firstName = cols[5];
  const birthDate = cols[7];
  const mandateStartDate = cols[11];

  if (!consularCode || !lastName || !firstName || !birthDate) {
    return undefined;
  }

  return {
    afeCode: cols[0] ?? '',
    afeName: cols[1] ?? '',
    consularCode,
    consularName: cols[3] ?? '',
    lastName,
    firstName,
    gender: cols[6] === 'F' ? 'F' : 'M',
    birthDate,
    mandateStartDate: mandateStartDate ?? '',
  };
}

export async function fetchRneConseillersFde(
  fetchFn: typeof fetch = fetch,
): Promise<RneConseillerFde[]> {
  const res = await fetchFn(RNE_CONSEILLERS_FDE_URL);
  if (!res.ok) {
    throw new Error(
      `RNE conseillers des Français de l'étranger error: ${res.status} ${res.statusText}`,
    );
  }

  const text = await res.text();
  const lines = text.split('\n');
  const results: RneConseillerFde[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const conseiller = parseCsvRow(line);
    if (conseiller) {
      results.push(conseiller);
    }
  }

  logger.info(
    `RNE conseillers des Français de l'étranger: ${results.length} conseillers parsed`,
  );
  return results;
}
