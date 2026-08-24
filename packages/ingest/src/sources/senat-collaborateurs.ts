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

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function extractMatricule(url: string): string | null {
  const match = url.match(/(\d{5}[a-z])\.html$/i);
  return match ? match[1].toUpperCase() : null;
}

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

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 10) continue;

    const urlInstitution = fields[9];
    const nomCollab = fields[5];
    const prenomCollab = fields[6];

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
