import { z } from 'zod/v4';
import { logger } from '../logger.js';

const GENERAL_URL = 'https://data.senat.fr/data/senateurs/ODSEN_GENERAL.json';
const MANDATS_URL = 'https://data.senat.fr/data/senateurs/ODSEN_ELUSEN.json';

export { GENERAL_URL, MANDATS_URL };

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
  full: unknown;
  mandats: SenatMandat[];
}

export interface SenatMandat {
  start_date: string;
  end_date: string | null;
  department: string | null;
}

function slugify(prenom: string, nom: string): string {
  return `${prenom}-${nom}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseSenatDate(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return null;
}

function photoUrl(matricule: string): string {
  return `https://www.senat.fr/senimg/photo_${matricule}.jpg`;
}

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

  const unwrap = (data: unknown) =>
    typeof data === 'object' && data !== null && 'results' in data
      ? (data as Record<string, unknown>).results
      : data;

  const generals = z.array(SenateurGeneralSchema).parse(unwrap(generalRaw));
  const mandatsAll = z.array(SenatMandatSchema).parse(unwrap(mandatsRaw));

  const mandatsByMatricule = new Map<string, SenatMandat[]>();
  for (const m of mandatsAll) {
    const startDate = parseSenatDate(m.Date_de_debut_de_mandat);
    if (!startDate) continue;
    const entry: SenatMandat = {
      start_date: startDate,
      end_date: parseSenatDate(m.Date_de_fin_de_mandat),
      department: null,
    };
    const list = mandatsByMatricule.get(m.Matricule) ?? [];
    list.push(entry);
    mandatsByMatricule.set(m.Matricule, list);
  }

  const senateurs: Senateur[] = [];

  for (const g of generals) {
    const mandats = mandatsByMatricule.get(g.Matricule) ?? [];
    for (const m of mandats) {
      m.department = g.Circonscription ?? null;
    }

    senateurs.push({
      matricule: g.Matricule,
      nom: g.Nom_usuel,
      prenom: g.Prenom_usuel,
      sexe: g.Qualite === 'Mme' ? 'F' : 'M',
      date_naissance: parseSenatDate(g.Date_naissance),
      circonscription: g.Circonscription,
      slug: slugify(g.Prenom_usuel, g.Nom_usuel),
      photo_url: photoUrl(g.Matricule),
      full: g,
      mandats,
    });
  }

  logger.info(
    `Sénat: ${senateurs.length} sénateurs, ${mandatsAll.length} mandats`,
  );
  return senateurs;
}
