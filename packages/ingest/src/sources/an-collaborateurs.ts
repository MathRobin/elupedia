/**
 * Collaborateurs parlementaires des députés (open data AN).
 *
 * Source : CSV `liste_collaborateurs_libre_office.csv` (législature 17),
 * séparateur virgule, champs entre guillemets, une ligne par collaborateur.
 * Colonnes : identifiant du député, nom du député, prénom du député, nom du
 * collaborateur, prénom du collaborateur.
 *
 * Extrait : la liste des collaborateurs (prénom, nom) par identifiant AN.
 *
 * Pièges : les noms peuvent contenir des virgules et des guillemets échappés
 * (`""`), d'où le mini-parseur CSV maison plutôt qu'un `split(',')`.
 *
 * Appelé par run-an.ts via upsert/staffers-diff.ts.
 */
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

// Index des colonnes utilisées dans le CSV.
const COLUMN_DEPUTE_ID = 0;
const COLUMN_COLLABORATEUR_NOM = 3;
const COLUMN_COLLABORATEUR_PRENOM = 4;
/** Nombre minimal de colonnes pour qu'une ligne soit exploitable. */
const MIN_COLUMNS = 5;

/** Découpe une ligne CSV (virgule, guillemets doubles, `""` = guillemet). */
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

/**
 * Télécharge le CSV et regroupe les collaborateurs par député.
 * Lève une erreur si le téléchargement échoue ; renvoie [] si le fichier ne
 * contient que l'en-tête.
 */
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
  const lines = text.split('\n').filter((line) => line.trim().length > 0);

  if (lines.length < 2) return [];

  const collaborateursByDepute = new Map<string, Collaborateur[]>();

  // La première ligne est l'en-tête.
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < MIN_COLUMNS) continue;

    const idAn = fields[COLUMN_DEPUTE_ID];
    const nomCollab = fields[COLUMN_COLLABORATEUR_NOM];
    const prenomCollab = fields[COLUMN_COLLABORATEUR_PRENOM];

    if (!idAn || !nomCollab || !prenomCollab) continue;

    let collaborateurs = collaborateursByDepute.get(idAn);
    if (!collaborateurs) {
      collaborateurs = [];
      collaborateursByDepute.set(idAn, collaborateurs);
    }
    collaborateurs.push({ prenom: prenomCollab, nom: nomCollab });
  }

  const result: CollaborateursDepute[] = [];
  for (const [id_an, collaborateurs] of collaborateursByDepute) {
    result.push({ id_an, collaborateurs });
  }

  return result;
}
