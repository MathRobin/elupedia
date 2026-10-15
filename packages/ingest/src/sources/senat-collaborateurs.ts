/**
 * Collaborateurs parlementaires des sénateurs.
 *
 * Source : le Sénat ne publie pas ce jeu en open data ; on lit le CSV maintenu
 * par Regards Citoyens sur GitHub (Collaborateurs-Parlement). Format : CSV `,`
 * avec champs entre guillemets (guillemets internes doublés), en-tête en
 * première ligne, 11 colonnes :
 *   0 parlementaire · 1 nom_parlementaire · 2 prénom_parlementaire
 *   3 sexe_parlementaire · 4 collaborateur · 5 nom_collaborateur
 *   6 prénom_collaborateur · 7 sexe_collaborateur · 8 url_api_RC
 *   9 url_institution · 10 information complémentaire.
 *
 * Le CSV ne contient pas le matricule : on l'extrait de l'URL de la fiche
 * senat.fr (`…/senateur/allizard_pascal14133k.html` → `14133K`). Les lignes
 * sans URL exploitable sont ignorées. Le fichier est mis à jour à la main par
 * des bénévoles : fraîcheur non garantie.
 *
 * Appelé par run-senat.ts, consommé par upsert/senat-staffers-diff.ts.
 */
import { logger } from '../logger.js';

export const DATASET_URL =
  'https://raw.githubusercontent.com/regardscitoyens/Collaborateurs-Parlement/master/data/liste_senateurs_collaborateurs.csv';

export interface Collaborateur {
  prenom: string;
  nom: string;
}

export interface CollaborateursSenateur {
  matricule: string;
  collaborateurs: Collaborateur[];
}

// Indices des colonnes utilisées (voir l'en-tête du fichier).
const COL_NOM_COLLABORATEUR = 5;
const COL_PRENOM_COLLABORATEUR = 6;
const COL_URL_INSTITUTION = 9;
/** Nombre minimal de colonnes pour qu'une ligne soit exploitable. */
const MIN_COLUMNS = 10;

/** Parse une ligne CSV à la RFC 4180 (séparateur `,`, guillemets doublés pour échapper). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/** Matricule Sénat (5 chiffres + 1 lettre) en fin d'URL de fiche senat.fr, normalisé en majuscules. */
function extractMatricule(url: string): string | null {
  const match = url.match(/(\d{5}[a-z])\.html$/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Télécharge le CSV (un GET) et regroupe les collaborateurs par matricule de
 * sénateur. Lève une erreur sur réponse HTTP non 2xx ; un fichier sans ligne
 * de données retourne [].
 */
export async function fetchSenatCollaborateurs(
  fetchFn: typeof fetch = fetch,
): Promise<CollaborateursSenateur[]> {
  const response = await fetchFn(DATASET_URL);
  if (!response.ok) {
    throw new Error(`Sénat collaborateurs error: ${response.status}`);
  }

  const text = await response.text();
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const byMatricule = new Map<string, Collaborateur[]>();

  // Ligne 0 = en-tête.
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < MIN_COLUMNS) continue;

    const urlInstitution = fields[COL_URL_INSTITUTION];
    const nomCollab = fields[COL_NOM_COLLABORATEUR];
    const prenomCollab = fields[COL_PRENOM_COLLABORATEUR];

    if (!urlInstitution || !nomCollab || !prenomCollab) continue;

    const matricule = extractMatricule(urlInstitution);
    if (!matricule) continue;

    let list = byMatricule.get(matricule);
    if (!list) {
      list = [];
      byMatricule.set(matricule, list);
    }
    list.push({ prenom: prenomCollab, nom: nomCollab });
  }

  const result: CollaborateursSenateur[] = [];
  for (const [matricule, collaborateurs] of byMatricule) {
    result.push({ matricule, collaborateurs });
  }

  logger.info(
    `Sénat collaborateurs: ${result.length} sénateurs, ${lines.length - 1} lignes`,
  );
  return result;
}
