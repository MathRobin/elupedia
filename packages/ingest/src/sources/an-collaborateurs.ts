export const DATASET_URL =
  'https://data.assemblee-nationale.fr/static/openData/repository/17/amo/collaborateurs_csv_opendata/liste_collaborateurs_libre_office.csv';

export interface Collaborateur {
  prenom: string;
  nom: string;
}

export interface CollaborateursDepute {
  id_an: string;
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

export async function fetchCollaborateurs(
  fetchFn: typeof fetch = fetch,
): Promise<CollaborateursDepute[]> {
  const response = await fetchFn(DATASET_URL);

  if (!response.ok) {
    throw new Error(
      `AN collaborateurs API error: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  const lines = text.split('\n').filter((l) => l.trim().length > 0);

  if (lines.length < 2) return [];

  const byDepute = new Map<string, Collaborateur[]>();

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 5) continue;

    const idAn = fields[0];
    const nomCollab = fields[3];
    const prenomCollab = fields[4];

    if (!idAn || !nomCollab || !prenomCollab) continue;

    let list = byDepute.get(idAn);
    if (!list) {
      list = [];
      byDepute.set(idAn, list);
    }
    list.push({ prenom: prenomCollab, nom: nomCollab });
  }

  const result: CollaborateursDepute[] = [];
  for (const [id_an, collaborateurs] of byDepute) {
    result.push({ id_an, collaborateurs });
  }

  return result;
}
