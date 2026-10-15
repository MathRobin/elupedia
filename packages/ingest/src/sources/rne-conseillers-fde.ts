/**
 * Conseillers des Français de l'étranger (conseillers consulaires) — lecteur
 * du fichier RNE (Répertoire national des élus) publié sur data.gouv.fr.
 *
 * Format brut : CSV `;`, UTF-8, première ligne = en-tête, 14 colonnes :
 *   0 Code circonscription AFE · 1 Libellé circonscription AFE · 2 Code
 *   circonscription consulaire · 3 Libellé circonscription consulaire · 4 Nom
 *   5 Prénom · 6 Code sexe (M/F) · 7 Date de naissance (AAAA-MM-JJ) · 8 Lieu de
 *   naissance · 9 Code CSP · 10 Libellé CSP · 11 Date de début du mandat
 *   12 Libellé de la fonction · 13 Date de début de la fonction.
 * Les colonnes 12-13 (« Président du conseil consulaire », etc.) sont un titre
 * au sein du conseil, pas un marqueur de remplacement : volontairement ignorées.
 *
 * Particularité : contrairement aux autres fichiers RNE (sauf membres-afe), les
 * champs texte sont entre guillemets — retirés par stripQuotes. Ce fichier est
 * aussi mis à jour avec un cycle de retard par rapport au reste du RNE (voir
 * docs/DOMAINS.md). Appelé par run-conseillers-fde.ts, consommé par
 * upsert/conseillers-fde.ts.
 */
import { logger } from '../logger.js';

const RNE_CONSEILLERS_FDE_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/84949a7b-53e0-4d78-9a66-8446f5ab6ad4';

/** Nombre de colonnes attendu par ligne ; en deçà, la ligne est rejetée. */
const EXPECTED_COLUMNS = 14;

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

/** Retire les guillemets encadrant un champ (les guillemets internes ne sont pas échappés dans ce fichier). */
function stripQuotes(field: string): string {
  return field.trim().replace(/^"|"$/g, '');
}

/**
 * Parse une ligne de données (hors en-tête), guillemets retirés. Retourne
 * undefined si la ligne est trop courte ou si un champ clé (circonscription
 * consulaire, nom, prénom, naissance) est vide. Tout code sexe autre que « F »
 * est lu comme « M ».
 */
export function parseCsvRow(line: string): RneConseillerFde | undefined {
  const cols = line.split(';').map(stripQuotes);
  if (cols.length < EXPECTED_COLUMNS) return undefined;

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

/**
 * Télécharge le CSV complet (un GET) et retourne les lignes valides.
 * Lève une erreur sur réponse HTTP non 2xx.
 */
export async function fetchRneConseillersFde(
  fetchFn: typeof fetch = fetch,
): Promise<RneConseillerFde[]> {
  const response = await fetchFn(RNE_CONSEILLERS_FDE_URL);
  if (!response.ok) {
    throw new Error(
      `RNE conseillers des Français de l'étranger error: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  const lines = text.split('\n');
  const results: RneConseillerFde[] = [];

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
    `RNE conseillers des Français de l'étranger: ${results.length} conseillers parsed`,
  );
  return results;
}
