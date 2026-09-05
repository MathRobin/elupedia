import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Extract } from 'unzipper';

import { DEPARTMENT_NAMES } from '@elupedia/shared';
import { ActeurFileSchema, OrganeFileSchema } from '../schemas.js';

export interface DeputeMandat {
  type: 'depute' | 'senateur';
  nom_circo: string;
  num_deptmt: string;
  num_circo: number;
  mandat_debut: string;
  mandat_fin?: string;
  groupe_sigle?: string;
}

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
  mandat_type: 'depute' | 'senateur';
  death_date?: string;
  full: unknown;
  allMandates: DeputeMandat[];
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

function photoUrl(anId: string, legislature: number | string): string {
  const numericId = anId.replace(/^PA/, '');
  return `https://www.assemblee-nationale.fr/dyn/static/tribun/${legislature}/photos/carre/${numericId}.jpg`;
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

// The AN open data ZIP is missing some GP organes (notably 17th legislature groups).
const GP_FALLBACK: Record<string, string> = {
  PO845407: 'Ensemble pour la République (EPR)',
  PO845413: 'La France insoumise - Nouveau Front Populaire (LFI-NFP)',
  PO845439: 'Écologiste et Social (EcoS)',
  PO845470: 'Horizons & Indépendants (HOR)',
  PO872880: 'À Droite ! (AD)',
  PO840056: 'Non inscrits (NI)',
};

async function loadOrganes(extractDir: string): Promise<Map<string, string>> {
  const map = new Map<string, string>(Object.entries(GP_FALLBACK));
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
    if (o.codeType === 'GP' || o.codeType === 'GROUPESENAT') {
      const label =
        o.libelle && o.libelleAbrege
          ? `${o.libelle} (${o.libelleAbrege})`
          : (o.libelle ?? o.libelleAbrege ?? '');
      map.set(o.uid, label);
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

    const parlMandats = allMandats.filter(
      (m) => m.typeOrgane === 'ASSEMBLEE' || m.typeOrgane === 'SENAT',
    );

    if (parlMandats.length === 0) continue;

    const latestMandat = parlMandats.sort((a, b) =>
      b.dateDebut.localeCompare(a.dateDebut),
    )[0];

    const isSenat = latestMandat.typeOrgane === 'SENAT';

    const latestAnMandat = parlMandats
      .filter((m) => m.typeOrgane === 'ASSEMBLEE')
      .sort((a, b) => b.dateDebut.localeCompare(a.dateDebut))[0];

    const gpTypes = isSenat ? ['GROUPESENAT'] : ['GP'];

    const latestGp = allMandats
      .filter((m) => gpTypes.includes(m.typeOrgane) && !m.dateFin)
      .sort((a, b) => b.dateDebut.localeCompare(a.dateDebut))[0];

    const gpRef = latestGp?.organes?.organeRef;
    const groupeSigle = gpRef
      ? organes.get(Array.isArray(gpRef) ? gpRef[0] : gpRef)
      : undefined;

    const lieu = latestMandat.election?.lieu;

    const deathDate =
      typeof ec.dateDeces === 'string' ? ec.dateDeces : undefined;

    const allParlMandates: DeputeMandat[] = parlMandats.map((m) => {
      const mLieu = m.election?.lieu;
      const mIsSenat = m.typeOrgane === 'SENAT';
      const dept =
        mLieu?.departement ||
        DEPARTMENT_NAMES[mLieu?.numDepartement ?? ''] ||
        '';
      return {
        type: mIsSenat ? ('senateur' as const) : ('depute' as const),
        nom_circo: dept,
        num_deptmt: mLieu?.numDepartement ?? '',
        num_circo: parseInt(mLieu?.numCirco ?? '0', 10),
        mandat_debut: m.dateDebut,
        mandat_fin: m.dateFin ?? undefined,
        groupe_sigle: groupeSigle,
      };
    });

    const latestDept =
      lieu?.departement || DEPARTMENT_NAMES[lieu?.numDepartement ?? ''] || '';

    deputes.push({
      id_an: anId,
      nom: ec.ident.nom,
      prenom: ec.ident.prenom,
      sexe: ec.ident.civ === 'Mme' ? 'F' : 'H',
      date_naissance:
        typeof ec.infoNaissance.dateNais === 'string'
          ? ec.infoNaissance.dateNais
          : '',
      nom_circo: latestDept,
      num_deptmt: lieu?.numDepartement ?? '',
      num_circo: parseInt(lieu?.numCirco ?? '0', 10),
      mandat_debut: latestMandat.dateDebut,
      mandat_fin: latestMandat.dateFin ?? undefined,
      groupe_sigle: groupeSigle,
      slug: slugify(ec.ident.prenom, ec.ident.nom),
      photo_url: latestAnMandat?.legislature
        ? photoUrl(anId, latestAnMandat.legislature)
        : undefined,
      mandat_type: isSenat ? 'senateur' : 'depute',
      death_date: deathDate,
      full: rawJson,
      allMandates: allParlMandates,
    });
  }

  return deputes;
}
