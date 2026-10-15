/**
 * Conseillers régionaux — lecteur du fichier RNE (Répertoire national des
 * élus) publié sur data.gouv.fr.
 *
 * Format brut : CSV `;` sans guillemets, UTF-8, CRLF, première ligne = en-tête,
 * 13 colonnes dans cet ordre :
 *   0 Code de la région · 1 Libellé de la région · 2 Code de la section
 *   départementale (code département, ou « 69M » pour la Métropole de Lyon)
 *   3 Libellé de la section · 4 Nom · 5 Prénom · 6 Code sexe (M/F) · 7 Date de
 *   naissance (AAAA-MM-JJ) · 8 Code CSP · 9 Libellé CSP · 10 Date de début du
 *   mandat · 11 Libellé de la fonction (facultatif, ex. « Président du conseil
 *   régional ») · 12 Date de début de la fonction.
 *
 * Scrutin de liste : N élus par section départementale. Mise à jour
 * trimestrielle, pas de pagination. Les lignes incomplètes sont ignorées
 * silencieusement. Appelé par run-conseillers-reg.ts, consommé par
 * upsert/conseillers-reg.ts. Voir docs/DOMAINS.md.
 */
import { logger } from '../logger.js';

const RNE_CONSEILLERS_REG_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/430e13f9-834b-4411-a1a8-da0b4b6e715c';

/** Nombre de colonnes attendu par ligne ; en deçà, la ligne est rejetée. */
const EXPECTED_COLUMNS = 13;

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

/**
 * Parse une ligne de données (hors en-tête). Retourne undefined si la ligne
 * est trop courte ou si un champ clé (section, nom, prénom, naissance) est
 * vide. Tout code sexe autre que « F » est lu comme « M ».
 */
export function parseCsvRow(line: string): RneConseillerReg | undefined {
  const cols = line.split(';');
  if (cols.length < EXPECTED_COLUMNS) return undefined;

  const sectionCode = cols[2]?.trim();
  const lastName = cols[4]?.trim();
  const firstName = cols[5]?.trim();
  const birthDate = cols[7]?.trim();
  const mandateStart = cols[10]?.trim();
  const functionLabel = cols[11]?.trim() ?? '';
  // Dernière colonne : trim() retire déjà le CR d'une fin de ligne CRLF,
  // le replace est une ceinture supplémentaire.
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

/**
 * Télécharge le CSV complet (un GET) et retourne les lignes valides.
 * Lève une erreur sur réponse HTTP non 2xx.
 */
export async function fetchRneConseillersReg(
  fetchFn: typeof fetch = fetch,
): Promise<RneConseillerReg[]> {
  const response = await fetchFn(RNE_CONSEILLERS_REG_URL);
  if (!response.ok) {
    throw new Error(
      `RNE conseillers régionaux error: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  const lines = text.split('\n');
  const results: RneConseillerReg[] = [];

  // Ligne 0 = en-tête.
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
