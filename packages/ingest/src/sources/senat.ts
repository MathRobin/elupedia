/**
 * Fiche d'identité et mandats des sénateurs (actuels et anciens).
 *
 * Sources : open data du Sénat, deux fichiers JSON chargés en parallèle et
 * joints sur le matricule :
 *   - ODSEN_GENERAL.json : un objet par sénateur (civilité « Qualite », nom
 *     et prénom usuels, Etat « ACTIF »/« ANCIEN », dates, circonscription) ;
 *   - ODSEN_ELUSEN.json  : une ligne par période de mandat sénatorial (dates
 *     de début/fin, motifs).
 * Les dates sont au format « AAAA/MM/JJ HH:MM:SS » → ISO « AAAA-MM-JJ ». Le
 * JSON est soit un tableau nu, soit enveloppé dans `{ results: [...] }`.
 *
 * Pièges :
 *   - le sexe est déduit de la civilité (« Mme » → F, sinon M) ;
 *   - un mandat sans date de début est ignoré ; un sénateur ACTIF sans aucun
 *     mandat exploitable reçoit un mandat synthétique démarrant à
 *     SYNTHETIC_MANDATE_START pour ne pas disparaître du site ;
 *   - le fichier des mandats ne porte pas la circonscription : elle est
 *     recopiée depuis la fiche GENERAL sur tous les mandats du sénateur, y
 *     compris les anciens (approximation si l'élu a changé de département) ;
 *   - la photo n'est pas dans l'open data : son URL senat.fr est reconstruite
 *     à partir du nom, du prénom et du matricule (convention observée).
 *
 * Appelé par run-senat.ts, consommé par upsert/senators.ts.
 */
import { z } from 'zod/v4';
import { logger } from '../logger.js';

const GENERAL_URL = 'https://data.senat.fr/data/senateurs/ODSEN_GENERAL.json';
const MANDATS_URL = 'https://data.senat.fr/data/senateurs/ODSEN_ELUSEN.json';

export { GENERAL_URL, MANDATS_URL };

/**
 * Date de début attribuée à un sénateur ACTIF sans mandat exploitable dans
 * ODSEN_ELUSEN (début de la session suivant le renouvellement de 2023).
 */
const SYNTHETIC_MANDATE_START = '2023-10-01';

const SenateurGeneralSchema = z.object({
  Matricule: z.string(),
  Qualite: z.string(),
  Nom_usuel: z.string(),
  Prenom_usuel: z.string(),
  Etat: z.string(),
  Date_naissance: z.string().nullable(),
  Date_de_deces: z.string().nullable(),
  Groupe_politique: z.string().nullable(),
  Circonscription: z.string().nullable(),
  Courrier_electronique: z.string().nullable(),
});

const SenatMandatSchema = z.object({
  Matricule: z.string(),
  Date_de_debut_de_mandat: z.string().nullable(),
  Date_de_fin_de_mandat: z.string().nullable(),
  Motif_debut_de_mandat: z.string().nullable(),
  Motif_fin_de_mandat: z.string().nullable(),
});

export { SenateurGeneralSchema, SenatMandatSchema };

export interface Senateur {
  matricule: string;
  nom: string;
  prenom: string;
  sexe: string;
  date_naissance: string | null;
  circonscription: string | null;
  slug: string;
  photo_url: string;
  /** Enregistrement GENERAL brut, conservé tel quel pour traçabilité. */
  full: unknown;
  mandats: SenatMandat[];
}

export interface SenatMandat {
  start_date: string;
  end_date: string | null;
  department: string | null;
}

/** « Jean », « Dupont » → « jean-dupont » (slug Elupedia : minuscules ASCII, tirets). */
function slugify(prenom: string, nom: string): string {
  return `${prenom}-${nom}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** « AAAA/MM/JJ HH:MM:SS » (format Sénat) → « AAAA-MM-JJ », null si absent ou illisible. */
function parseSenatDate(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return null;
}

/** Identifiant de fichier senat.fr : « dupont_jean14001a » (nom_prénom + matricule, ASCII minuscule, underscores). */
function senatSlug(nom: string, prenom: string, matricule: string): string {
  return `${nom}_${prenom}${matricule}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** URL de la photo carrée officielle sur senat.fr, reconstruite par convention (non garantie d'exister). */
function photoUrl(nom: string, prenom: string, matricule: string): string {
  return `https://www.senat.fr/senimg/${senatSlug(nom, prenom, matricule)}_carre.jpg`;
}

/**
 * Télécharge GENERAL et ELUSEN (deux GET en parallèle) et retourne un
 * sénateur par fiche GENERAL, avec ses mandats. Lève une erreur sur réponse
 * HTTP non 2xx ou JSON inattendu (zod).
 */
export async function fetchSenateurs(
  fetchFn: typeof fetch = fetch,
): Promise<Senateur[]> {
  const [generalRes, mandatsRes] = await Promise.all([
    fetchFn(GENERAL_URL),
    fetchFn(MANDATS_URL),
  ]);

  if (!generalRes.ok) {
    throw new Error(`Sénat GENERAL error: ${generalRes.status}`);
  }
  if (!mandatsRes.ok) {
    throw new Error(`Sénat MANDATS error: ${mandatsRes.status}`);
  }

  const generalRaw = await generalRes.json();
  const mandatsRaw = await mandatsRes.json();

  const unwrapResults = (data: unknown) =>
    typeof data === 'object' && data !== null && 'results' in data
      ? (data as Record<string, unknown>).results
      : data;

  const generals = z
    .array(SenateurGeneralSchema)
    .parse(unwrapResults(generalRaw));
  const mandatsAll = z
    .array(SenatMandatSchema)
    .parse(unwrapResults(mandatsRaw));

  const mandatsByMatricule = new Map<string, SenatMandat[]>();
  for (const mandatRow of mandatsAll) {
    const startDate = parseSenatDate(mandatRow.Date_de_debut_de_mandat);
    if (!startDate) continue;
    const entry: SenatMandat = {
      start_date: startDate,
      end_date: parseSenatDate(mandatRow.Date_de_fin_de_mandat),
      department: null,
    };
    const list = mandatsByMatricule.get(mandatRow.Matricule) ?? [];
    list.push(entry);
    mandatsByMatricule.set(mandatRow.Matricule, list);
  }

  const senateurs: Senateur[] = [];

  for (const general of generals) {
    let mandats = mandatsByMatricule.get(general.Matricule) ?? [];
    for (const mandat of mandats) {
      mandat.department = general.Circonscription ?? null;
    }

    if (mandats.length === 0 && general.Etat === 'ACTIF') {
      mandats = [
        {
          start_date: SYNTHETIC_MANDATE_START,
          end_date: null,
          department: general.Circonscription ?? null,
        },
      ];
    }

    senateurs.push({
      matricule: general.Matricule,
      nom: general.Nom_usuel,
      prenom: general.Prenom_usuel,
      sexe: general.Qualite === 'Mme' ? 'F' : 'M',
      date_naissance: parseSenatDate(general.Date_naissance),
      circonscription: general.Circonscription,
      slug: slugify(general.Prenom_usuel, general.Nom_usuel),
      photo_url: photoUrl(
        general.Nom_usuel,
        general.Prenom_usuel,
        general.Matricule,
      ),
      full: general,
      mandats,
    });
  }

  logger.info(
    `Sénat: ${senateurs.length} sénateurs, ${mandatsAll.length} mandats`,
  );
  return senateurs;
}
