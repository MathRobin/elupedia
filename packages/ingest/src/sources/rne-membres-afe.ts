/**
 * Membres de l'Assemblée des Français de l'étranger (AFE) — lecteur du
 * fichier RNE (Répertoire national des élus) publié sur data.gouv.fr (~90 lignes).
 *
 * Format brut : CSV `;`, UTF-8, première ligne = en-tête, 11 colonnes :
 *   0 Code circonscription AFE · 1 Libellé circonscription AFE · 2 Nom
 *   3 Prénom · 4 Code sexe (M/F) · 5 Date de naissance (AAAA-MM-JJ) · 6 Code
 *   CSP · 7 Libellé CSP · 8 Date de début du mandat · 9 Libellé de la fonction
 *   (« Président », etc., ignoré) · 10 Date de début de la fonction (ignorée).
 * Pas de circonscription consulaire ici : seule la circonscription AFE (zone
 * géographique large) est fournie.
 *
 * Particularité : comme conseillers-fde, les champs texte sont entre
 * guillemets (retirés par stripQuotes), et le fichier est publié avec un cycle
 * de retard par rapport au reste du RNE (voir docs/DOMAINS.md). Appelé par
 * run-membres-afe.ts, consommé par upsert/membres-afe.ts.
 */
import { logger } from '../logger.js';

const RNE_MEMBRES_AFE_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/41cea915-fa63-46f2-825f-97fa354a26bc';

/** Nombre de colonnes attendu par ligne ; en deçà, la ligne est rejetée. */
const EXPECTED_COLUMNS = 11;

export interface RneMembreAfe {
  afeCode: string;
  afeName: string;
  lastName: string;
  firstName: string;
  gender: 'M' | 'F';
  birthDate: string;
  mandateStartDate: string;
}

/** Retire les guillemets encadrant un champ (les guillemets internes ne sont pas échappés dans ce fichier). */
function stripQuotes(field: string): string {
  return field.trim().replace(/^"|"$/g, '');
}

/**
 * Parse une ligne de données (hors en-tête), guillemets retirés. Retourne
 * undefined si la ligne est trop courte ou si un champ clé (libellé AFE, nom,
 * prénom, naissance) est vide. Tout code sexe autre que « F » est lu comme « M ».
 */
export function parseCsvRow(line: string): RneMembreAfe | undefined {
  const cols = line.split(';').map(stripQuotes);
  if (cols.length < EXPECTED_COLUMNS) return undefined;

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

/**
 * Télécharge le CSV complet (un GET) et retourne les lignes valides.
 * Lève une erreur sur réponse HTTP non 2xx.
 */
export async function fetchRneMembresAfe(
  fetchFn: typeof fetch = fetch,
): Promise<RneMembreAfe[]> {
  const response = await fetchFn(RNE_MEMBRES_AFE_URL);
  if (!response.ok) {
    throw new Error(
      `RNE membres de l'Assemblée des Français de l'étranger error: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  const lines = text.split('\n');
  const results: RneMembreAfe[] = [];

  // Ligne 0 = en-tête.
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
