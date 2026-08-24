import { z } from 'zod/v4';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Extract } from 'unzipper';

const IdentSchema = z.object({
  civ: z.string(),
  prenom: z.string(),
  nom: z.string(),
});

const InfoNaissanceSchema = z.object({
  dateNais: z.string().optional().nullable(),
  villeNais: z.string().optional().nullable(),
  depNais: z.string().optional().nullable(),
});

const EtatCivilSchema = z.object({
  ident: IdentSchema,
  infoNaissance: InfoNaissanceSchema,
});

const ElectionLieuSchema = z.object({
  region: z.string().optional().nullable(),
  departement: z.string().optional().nullable(),
  numDepartement: z.string().optional().nullable(),
  numCirco: z.string().optional().nullable(),
});

const MandatSchema = z.object({
  uid: z.string(),
  legislature: z.string().optional().nullable(),
  typeOrgane: z.string(),
  dateDebut: z.string(),
  dateFin: z.string().optional().nullable(),
  organes: z.object({ organeRef: z.string() }).optional().nullable(),
  election: z.object({ lieu: ElectionLieuSchema }).optional().nullable(),
});

const ActeurSchema = z.object({
  uid: z.object({ '#text': z.string() }),
  etatCivil: EtatCivilSchema,
  mandats: z.object({
    mandat: z.union([z.array(MandatSchema), MandatSchema]),
  }),
});

const ActeurFileSchema = z.object({
  acteur: ActeurSchema,
});

const OrganeSchema = z.object({
  uid: z.string(),
  codeType: z.string(),
  libelleAbrege: z.string().optional().nullable(),
  libelle: z.string().optional().nullable(),
});

const OrganeFileSchema = z.object({
  organe: OrganeSchema,
});

export interface Depute {
  id_an: string;
  nom: string;
  prenom: string;
  sexe: string;
  date_naissance: string;
  nom_circo: string;
  num_deptmt: string;
  num_circo: number;
  mandat_debut: string;
  mandat_fin?: string;
  groupe_sigle?: string;
  slug: string;
  photo_url?: string;
  full: unknown;
}

export const DATASET_URL =
  'https://data.assemblee-nationale.fr/static/openData/repository/17/amo/tous_acteurs_mandats_organes_xi_legislature/AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip';

function slugify(prenom: string, nom: string): string {
  return `${prenom}-${nom}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function photoUrl(anId: string): string {
  const numericId = anId.replace(/^PA/, '');
  return `https://www2.assemblee-nationale.fr/static/tribun/17/photos/${numericId}.jpg`;
}

export async function fetchDeputes(
  fetchFn: typeof fetch = fetch,
): Promise<Depute[]> {
  const response = await fetchFn(DATASET_URL);
  if (!response.ok) {
    throw new Error(
      `Assemblée nationale API error: ${response.status} ${response.statusText}`,
    );
  }

  const extractDir = join(tmpdir(), `an-data-${Date.now()}`);
  await mkdir(extractDir, { recursive: true });

  try {
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await new Promise<void>((resolve, reject) => {
      const extractor = Extract({ path: extractDir });
      extractor.on('close', resolve);
      extractor.on('error', reject);
      Readable.from(buffer).pipe(extractor);
    });

    const organes = await loadOrganes(extractDir);
    return await loadActeurs(extractDir, organes);
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }
}

async function loadOrganes(extractDir: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const organeDir = join(extractDir, 'json', 'organe');

  let files: string[];
  try {
    files = await readdir(organeDir);
  } catch {
    return map;
  }

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await readFile(join(organeDir, file), 'utf-8');
    const parsed = OrganeFileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) continue;
    const o = parsed.data.organe;
    if (o.codeType === 'GP') {
      map.set(o.uid, o.libelleAbrege ?? o.libelle ?? '');
    }
  }

  return map;
}

async function loadActeurs(
  extractDir: string,
  organes: Map<string, string>,
): Promise<Depute[]> {
  const acteurDir = join(extractDir, 'json', 'acteur');
  let files: string[];
  try {
    files = await readdir(acteurDir);
  } catch {
    return [];
  }
  const deputes: Depute[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await readFile(join(acteurDir, file), 'utf-8');
    const rawJson = JSON.parse(raw);
    const parsed = ActeurFileSchema.safeParse(rawJson);
    if (!parsed.success) continue;

    const acteur = parsed.data.acteur;
    const anId = acteur.uid['#text'];
    const ec = acteur.etatCivil;

    const allMandats = Array.isArray(acteur.mandats.mandat)
      ? acteur.mandats.mandat
      : [acteur.mandats.mandat];

    const assembleeMandats = allMandats.filter(
      (m) => m.typeOrgane === 'ASSEMBLEE',
    );

    if (assembleeMandats.length === 0) continue;

    const latestGp = allMandats
      .filter((m) => m.typeOrgane === 'GP' && !m.dateFin)
      .sort((a, b) => b.dateDebut.localeCompare(a.dateDebut))[0];

    const groupeSigle = latestGp?.organes?.organeRef
      ? organes.get(latestGp.organes.organeRef)
      : undefined;

    const latestMandat = assembleeMandats.sort((a, b) =>
      b.dateDebut.localeCompare(a.dateDebut),
    )[0];
    const lieu = latestMandat.election?.lieu;

    deputes.push({
      id_an: anId,
      nom: ec.ident.nom,
      prenom: ec.ident.prenom,
      sexe: ec.ident.civ === 'Mme' ? 'F' : 'H',
      date_naissance: ec.infoNaissance.dateNais ?? '',
      nom_circo: lieu?.departement ?? '',
      num_deptmt: lieu?.numDepartement ?? '',
      num_circo: parseInt(lieu?.numCirco ?? '0', 10),
      mandat_debut: latestMandat.dateDebut,
      mandat_fin: latestMandat.dateFin ?? undefined,
      groupe_sigle: groupeSigle,
      slug: slugify(ec.ident.prenom, ec.ident.nom),
      photo_url: photoUrl(anId),
      full: rawJson,
    });
  }

  return deputes;
}
