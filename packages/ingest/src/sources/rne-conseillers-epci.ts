/**
 * Conseillers communautaires (délégués des communes au sein d'un EPCI :
 * communauté de communes, d'agglomération, urbaine, métropole) — lecteur du
 * fichier RNE (Répertoire national des élus) publié sur data.gouv.fr.
 *
 * Format brut : CSV `;`, UTF-8, première ligne = en-tête, 17 colonnes :
 *   0 Code du département · 1 Libellé du département · 2 Code de la collectivité
 *   à statut particulier · 3 Libellé de la collectivité à statut particulier ·
 *   4 N° SIREN de l'EPCI · 5 Libellé de l'EPCI · 6 Code de la commune de
 *   rattachement · 7 Libellé de la commune de rattachement · 8 Nom · 9 Prénom ·
 *   10 Code sexe (M/F) · 11 Date de naissance (AAAA-MM-JJ) · 12 Code CSP ·
 *   13 Libellé CSP · 14 Date de début du mandat · 15 Libellé de la fonction ·
 *   16 Date de début de la fonction.
 *
 * Particularités :
 * - Le libellé de l'EPCI est entre guillemets quand il en contient (`"Cc
 *   ""Creuse Confluence"""`) : le découpage gère les guillemets doublés.
 * - Fonction (colonnes 15-16) : vide pour un conseiller simple, sinon
 *   « Président » ou « Nème Vice-président du conseil communautaire ». Sa date
 *   est celle de l'élection à la fonction, postérieure à celle du siège pour les
 *   présidents et vice-présidents (9 644 lignes sur 62 129 au 15/10/2026) : elle
 *   ne date donc PAS le mandat, contrairement aux conseillers départementaux
 *   (voir upsert/conseillers-epci.ts).
 * - Une collectivité à statut particulier (Corse, Guyane…) peut remplacer le
 *   département : son libellé sert alors de repli.
 * Appelé par run-conseillers-epci.ts, consommé par upsert/conseillers-epci.ts.
 */
import { logger } from '../logger.js';

const RNE_CONSEILLERS_EPCI_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/41d95d7d-b172-4636-ac44-32656367cdc7';

/** Nombre de colonnes attendu par ligne ; en deçà, la ligne est rejetée. */
const EXPECTED_COLUMNS = 17;

export interface RneConseillerEpci {
  departmentCode: string;
  departmentName: string;
  epciSiren: string;
  epciName: string;
  communeCode: string;
  communeName: string;
  lastName: string;
  firstName: string;
  gender: 'M' | 'F';
  birthDate: string;
  mandateStartDate: string;
  functionLabel: string;
  functionStartDate: string;
}

/**
 * Découpe une ligne CSV sur `;` en respectant les champs entre guillemets
 * (guillemets doublés = guillemet littéral). Les guillemets d'encadrement sont
 * retirés.
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ';') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Parse une ligne de données (hors en-tête). Retourne undefined si la ligne
 * est trop courte ou si un champ clé (SIREN, EPCI, nom, prénom, naissance)
 * est vide. Tout code sexe autre que « F » est lu comme « M ».
 */
export function parseCsvRow(line: string): RneConseillerEpci | undefined {
  const cols = splitCsvLine(line.replace(/\r$/, '')).map((c) => c.trim());
  if (cols.length < EXPECTED_COLUMNS) return undefined;

  const epciSiren = cols[4];
  const epciName = cols[5];
  const lastName = cols[8];
  const firstName = cols[9];
  const birthDate = cols[11];

  if (!epciSiren || !epciName || !lastName || !firstName || !birthDate) {
    return undefined;
  }

  return {
    departmentCode: cols[0],
    departmentName: cols[1] || cols[3],
    epciSiren,
    epciName,
    communeCode: cols[6],
    communeName: cols[7],
    lastName,
    firstName,
    gender: cols[10] === 'F' ? 'F' : 'M',
    birthDate,
    mandateStartDate: cols[14],
    functionLabel: cols[15],
    functionStartDate: cols[16],
  };
}

export async function fetchRneConseillersEpci(
  fetchFn: typeof fetch = fetch,
): Promise<RneConseillerEpci[]> {
  const res = await fetchFn(RNE_CONSEILLERS_EPCI_URL);
  if (!res.ok) {
    throw new Error(
      `RNE conseillers communautaires error: ${res.status} ${res.statusText}`,
    );
  }

  const text = await res.text();
  const lines = text.split('\n');
  const results: RneConseillerEpci[] = [];
  let rejected = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const conseiller = parseCsvRow(line);
    if (conseiller) results.push(conseiller);
    else rejected++;
  }

  logger.info(
    `RNE conseillers communautaires: ${results.length} conseillers parsed${rejected > 0 ? `, ${rejected} lignes rejetées` : ''}`,
  );
  return results;
}
