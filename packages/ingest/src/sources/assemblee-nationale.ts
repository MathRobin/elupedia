/**
 * Députés (et anciens députés devenus sénateurs) depuis l'open data AN.
 *
 * Source : ZIP AMO30 « tous acteurs, tous mandats, tous organes, historique »
 * (législature 17). Dossiers `json/acteur/` (état civil + tous les mandats
 * de chaque personne) et `json/organe/` (groupes politiques, commissions…).
 * Les fichiers sont validés avec les schémas Zod de ../schemas.ts.
 *
 * Extrait : un `Depute` par acteur ayant au moins un mandat ASSEMBLEE ou
 * SENAT. Le mandat parlementaire le plus récent fixe le type (`depute` /
 * `senateur`), la circonscription et les dates ; `allMandates` conserve
 * l'historique complet des mandats parlementaires. Le groupe est celui du
 * mandat de groupe (GP / GROUPESENAT) encore ouvert.
 *
 * Pièges :
 * - `mandats.mandat` et `organes.organeRef` : objet ou tableau selon le cas
 *   (conversion XML→JSON).
 * - Le ZIP n'inclut pas tous les organes GP : GP_FALLBACK complète.
 * - `slug` est calculé ici à partir de prénom-nom ; les collisions sont
 *   gérées à l'upsert.
 * - `full` embarque le JSON brut complet de l'acteur (stocké en base).
 *
 * Appelé par run-an.ts via upsert/officials.ts ; DATASET_URL est aussi
 * utilisée par an-commissions.ts.
 */
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

/** `prenom-nom` en minuscules ASCII, sans accents ni ponctuation. */
function slugify(prenom: string, nom: string): string {
  return `${prenom}-${nom}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Photo officielle « carrée » du député pour une législature donnée. */
function photoUrl(anId: string, legislature: number | string): string {
  const numericId = anId.replace(/^PA/, '');
  return `https://www.assemblee-nationale.fr/dyn/static/tribun/${legislature}/photos/carre/${numericId}.jpg`;
}

/**
 * Télécharge le ZIP AMO30 et renvoie tous les parlementaires qu'il contient.
 * Lève une erreur si le téléchargement échoue.
 */
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

/**
 * Libellés de groupes politiques absents du ZIP open data (notamment ceux
 * de la 17e législature), au format « Libellé (SIGLE) » comme loadOrganes.
 */
export const GP_FALLBACK: Record<string, string> = {
  PO840056: 'Non inscrit (NI)',
  PO845401: 'Rassemblement National (RN)',
  PO845407: 'Ensemble pour la République (EPR)',
  PO845413: 'La France insoumise - Nouveau Front Populaire (LFI-NFP)',
  PO845419: 'Socialistes et apparentés (SOC)',
  PO845425: 'Droite Républicaine (DR)',
  PO845439: 'Écologiste et Social (EcoS)',
  PO845454: 'Les Démocrates (Dem)',
  PO845470: 'Horizons & Indépendants (HOR)',
  PO845485: 'Libertés, Indépendants, Outre-mer et Territoires (LIOT)',
  PO845514: 'Gauche Démocrate et Républicaine (GDR)',
  PO847173: 'UDR (UDR)',
  PO872880: 'À Droite ! (AD)',
};

/** Index uid d'organe → libellé « Nom (SIGLE) », pour les groupes seulement. */
async function loadOrganes(extractDir: string): Promise<Map<string, string>> {
  const labelsByUid = new Map<string, string>(Object.entries(GP_FALLBACK));
  const organeDir = join(extractDir, 'json', 'organe');

  let files: string[];
  try {
    files = await readdir(organeDir);
  } catch {
    return labelsByUid;
  }

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await readFile(join(organeDir, file), 'utf-8');
    const parsed = OrganeFileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) continue;
    const organe = parsed.data.organe;
    if (organe.codeType === 'GP' || organe.codeType === 'GROUPESENAT') {
      const label =
        organe.libelle && organe.libelleAbrege
          ? `${organe.libelle} (${organe.libelleAbrege})`
          : (organe.libelle ?? organe.libelleAbrege ?? '');
      labelsByUid.set(organe.uid, label);
    }
  }

  return labelsByUid;
}

/** Lieu d'élection tel que décrit dans un mandat AN. */
interface ElectionLieu {
  departement?: string | null;
  numDepartement?: string | null;
  numCirco?: string | null;
}

/**
 * Nom du département : celui du mandat, sinon le référentiel partagé via le
 * numéro, sinon chaîne vide.
 */
function resolveDepartmentName(lieu: ElectionLieu | undefined): string {
  return (
    lieu?.departement || DEPARTMENT_NAMES[lieu?.numDepartement ?? ''] || ''
  );
}

/** Trie en place par date de début décroissante et renvoie le tableau. */
function sortNewestFirst<T extends { dateDebut: string }>(mandats: T[]): T[] {
  return mandats.sort((a, b) => b.dateDebut.localeCompare(a.dateDebut));
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
    const etatCivil = acteur.etatCivil;

    const allMandats = Array.isArray(acteur.mandats.mandat)
      ? acteur.mandats.mandat
      : [acteur.mandats.mandat];

    const parlMandats = allMandats.filter(
      (mandat) =>
        mandat.typeOrgane === 'ASSEMBLEE' || mandat.typeOrgane === 'SENAT',
    );

    // Ministres, collaborateurs, etc. : hors périmètre.
    if (parlMandats.length === 0) continue;

    // Tri en place : allMandates est donc émis du plus récent au plus ancien.
    const latestMandat = sortNewestFirst(parlMandats)[0];

    const isSenat = latestMandat.typeOrgane === 'SENAT';

    // La photo n'existe que côté AN : on prend la législature du dernier
    // mandat de député, même pour un sénateur ex-député.
    const latestAnMandat = sortNewestFirst(
      parlMandats.filter((mandat) => mandat.typeOrgane === 'ASSEMBLEE'),
    )[0];

    const gpTypes = isSenat ? ['GROUPESENAT'] : ['GP'];

    // Groupe courant = mandat de groupe sans date de fin, le plus récent.
    const latestGp = sortNewestFirst(
      allMandats.filter(
        (mandat) => gpTypes.includes(mandat.typeOrgane) && !mandat.dateFin,
      ),
    )[0];

    const gpRef = latestGp?.organes?.organeRef;
    const groupeSigle = gpRef
      ? organes.get(Array.isArray(gpRef) ? gpRef[0] : gpRef)
      : undefined;

    const latestLieu = latestMandat.election?.lieu;

    const deathDate =
      typeof etatCivil.dateDeces === 'string' ? etatCivil.dateDeces : undefined;

    const allParlMandates: DeputeMandat[] = parlMandats.map((mandat) => {
      const lieu = mandat.election?.lieu;
      const mandatIsSenat = mandat.typeOrgane === 'SENAT';
      return {
        type: mandatIsSenat ? ('senateur' as const) : ('depute' as const),
        nom_circo: resolveDepartmentName(lieu),
        num_deptmt: lieu?.numDepartement ?? '',
        num_circo: parseInt(lieu?.numCirco ?? '0', 10),
        mandat_debut: mandat.dateDebut,
        mandat_fin: mandat.dateFin ?? undefined,
        groupe_sigle: groupeSigle,
      };
    });

    deputes.push({
      id_an: anId,
      nom: etatCivil.ident.nom,
      prenom: etatCivil.ident.prenom,
      sexe: etatCivil.ident.civ === 'Mme' ? 'F' : 'H',
      date_naissance:
        typeof etatCivil.infoNaissance.dateNais === 'string'
          ? etatCivil.infoNaissance.dateNais
          : '',
      nom_circo: resolveDepartmentName(latestLieu),
      num_deptmt: latestLieu?.numDepartement ?? '',
      num_circo: parseInt(latestLieu?.numCirco ?? '0', 10),
      mandat_debut: latestMandat.dateDebut,
      mandat_fin: latestMandat.dateFin ?? undefined,
      groupe_sigle: groupeSigle,
      slug: slugify(etatCivil.ident.prenom, etatCivil.ident.nom),
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
