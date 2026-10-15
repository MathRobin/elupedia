/**
 * Membres des assemblées des collectivités à statut particulier (Corse,
 * Guyane, Martinique, Métropole de Lyon, Nouvelle-Calédonie, Polynésie
 * française, Saint-Barthélemy, Saint-Martin, Saint-Pierre-et-Miquelon,
 * Wallis-et-Futuna) — lecteur du fichier RNE publié sur data.gouv.fr.
 *
 * Format brut : CSV `;` sans guillemets, UTF-8, CRLF, première ligne = en-tête,
 * 19 colonnes (la plus riche des sources RNE locales) :
 *   0-1 Code/Libellé région · 2-3 Code/Libellé département · 4-5 Code/Libellé
 *   de la collectivité · 6-7 Code/Libellé de la section (toujours vides) · 8-9
 *   Code/Libellé de la circonscription métropolitaine (Métropole de Lyon
 *   uniquement) · 10 Nom · 11 Prénom · 12 Code sexe (M/F) · 13 Date de
 *   naissance (AAAA-MM-JJ) · 14 Code CSP · 15 Libellé CSP · 16 Date de début
 *   du mandat · 17 Libellé de la fonction (facultatif) · 18 Date de début de la fonction.
 * Les colonnes 0-3 sont vides pour les collectivités d'outre-mer sans
 * rattachement région/département (ex. Saint-Pierre-et-Miquelon).
 *
 * Mise à jour trimestrielle, pas de pagination. Les lignes incomplètes sont
 * ignorées silencieusement. Appelé par run-membres-assemblee.ts, consommé par
 * upsert/membres-assemblee.ts. Voir docs/DOMAINS.md.
 */
import { logger } from '../logger.js';

const RNE_MEMBRES_ASSEMBLEE_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/a595be27-cfab-4810-b9d4-22e193bffe35';

/** Nombre de colonnes attendu par ligne ; en deçà, la ligne est rejetée. */
const EXPECTED_COLUMNS = 19;

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

/**
 * Parse une ligne de données (hors en-tête). Retourne undefined si la ligne
 * est trop courte ou si un champ clé (code et libellé de collectivité, nom,
 * prénom, naissance) est vide. Tout code sexe autre que « F » est lu comme « M ».
 */
export function parseCsvRow(line: string): RneMembreAssemblee | undefined {
  const cols = line.split(';');
  if (cols.length < EXPECTED_COLUMNS) return undefined;

  const collectiviteCode = cols[4]?.trim();
  const collectiviteName = cols[5]?.trim();
  const lastName = cols[10]?.trim();
  const firstName = cols[11]?.trim();
  const birthDate = cols[13]?.trim();
  const mandateStart = cols[16]?.trim();
  const functionLabel = cols[17]?.trim() ?? '';
  // Dernière colonne : trim() retire déjà le CR d'une fin de ligne CRLF,
  // le replace est une ceinture supplémentaire.
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

/**
 * Télécharge le CSV complet (un GET) et retourne les lignes valides.
 * Lève une erreur sur réponse HTTP non 2xx.
 */
export async function fetchRneMembresAssemblee(
  fetchFn: typeof fetch = fetch,
): Promise<RneMembreAssemblee[]> {
  const response = await fetchFn(RNE_MEMBRES_ASSEMBLEE_URL);
  if (!response.ok) {
    throw new Error(
      `RNE membres assemblée error: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  const lines = text.split('\n');
  const results: RneMembreAssemblee[] = [];

  // Ligne 0 = en-tête.
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
