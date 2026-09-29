import { logger } from '../logger.js';

const RNE_MEMBRES_AFE_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/41cea915-fa63-46f2-825f-97fa354a26bc';

export interface RneMembreAfe {
  afeCode: string;
  afeName: string;
  lastName: string;
  firstName: string;
  gender: 'M' | 'F';
  birthDate: string;
  mandateStartDate: string;
}

function stripQuotes(s: string): string {
  return s.trim().replace(/^"|"$/g, '');
}

// Contrairement aux autres fichiers RNE (hors conseillers-fde), les champs
// texte de celui-ci sont systématiquement entre guillemets (ex.
// 1;"Canada";"DELLAPINA";"Olivier";...). Pas de circonscription consulaire
// ici : seule la circonscription AFE (zone géographique large) est fournie.
export function parseCsvRow(line: string): RneMembreAfe | undefined {
  const cols = line.split(';').map(stripQuotes);
  if (cols.length < 11) return undefined;

  const afeName = cols[1];
  const lastName = cols[2];
  const firstName = cols[3];
  const birthDate = cols[5];
  const mandateStartDate = cols[8];

  if (!afeName || !lastName || !firstName || !birthDate) {
    return undefined;
  }

  return {
    afeCode: cols[0] ?? '',
    afeName,
    lastName,
    firstName,
    gender: cols[4] === 'F' ? 'F' : 'M',
    birthDate,
    mandateStartDate: mandateStartDate ?? '',
  };
}

export async function fetchRneMembresAfe(
  fetchFn: typeof fetch = fetch,
): Promise<RneMembreAfe[]> {
  const res = await fetchFn(RNE_MEMBRES_AFE_URL);
  if (!res.ok) {
    throw new Error(
      `RNE membres de l'Assemblée des Français de l'étranger error: ${res.status} ${res.statusText}`,
    );
  }

  const text = await res.text();
  const lines = text.split('\n');
  const results: RneMembreAfe[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const membre = parseCsvRow(line);
    if (membre) {
      results.push(membre);
    }
  }

  logger.info(
    `RNE membres de l'Assemblée des Français de l'étranger: ${results.length} membres parsed`,
  );
  return results;
}
