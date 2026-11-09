/**
 * Députés (et anciens députés devenus sénateurs) depuis l'open data AN.
 *
 * Source : ZIP AMO30 « tous acteurs, tous mandats, tous organes, historique »
 * (législature 17). Dossiers `json/acteur/` (état civil + tous les mandats
 * de chaque personne) et `json/organe/` (groupes politiques, commissions…).
 * Les fichiers sont validés avec les schémas Zod de ../schemas.ts.
 *
 * Extrait : un `Depute` par acteur ayant au moins un mandat ASSEMBLEE, SENAT
 * ou MINISTERE (membres du Gouvernement, parlementaires ou non : l'AN les
 * suit pour les questions au gouvernement). Le mandat parlementaire le plus
 * récent fixe le type (`depute` / `senateur`), la circonscription et les
 * dates ; `allMandates` conserve
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
  type:
    'depute' | 'senateur' | 'premier_ministre' | 'ministre' | 'secretaire_etat';
  nom_circo: string;
  num_deptmt: string;
  num_circo: number;
  mandat_debut: string;
  mandat_fin?: string;
  groupe_sigle?: string;
  /** Mandats gouvernementaux : intitulé du portefeuille (organe MINISTERE). */
  intitule?: string;
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
  /** `gouvernement` : membre du Gouvernement jamais parlementaire. */
  mandat_type: 'depute' | 'senateur' | 'gouvernement';
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

/**
 * Index uid d'organe → libellé : « Nom (SIGLE) » pour les groupes, intitulé
 * du portefeuille (« Ministre des Armées ») pour les organes MINISTERE.
 */
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
    } else if (organe.codeType === 'MINISTERE' && organe.libelle) {
      labelsByUid.set(organe.uid, organe.libelle);
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

/**
 * Type Elupedia d'un mandat MINISTERE d'après sa qualité AN : « Premier
 * ministre » ; « Secrétaire d'État » ; tout le reste (ministre, ministre
 * d'État, ministre délégué, haut-commissaire…) est rangé en `ministre`.
 */
function governmentMandateType(
  libQualite: string | null | undefined,
): 'premier_ministre' | 'ministre' | 'secretaire_etat' {
  const qualite = (libQualite ?? '').toLowerCase();
  if (qualite.includes('premier ministre')) return 'premier_ministre';
  if (/secr[ée]taire d.[ée]tat/.test(qualite)) return 'secretaire_etat';
  return 'ministre';
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
    // Membres du Gouvernement : une ligne MINISTERE par portefeuille (les
    // lignes GOUVERNEMENT, appartenance à une équipe, sont redondantes).
    const gouvMandats = sortNewestFirst(
      allMandats.filter((mandat) => mandat.typeOrgane === 'MINISTERE'),
    );

    // Collaborateurs, membres d'organes extra-parlementaires… : hors périmètre.
    if (parlMandats.length === 0 && gouvMandats.length === 0) continue;

    // Tri en place : allMandates est donc émis du plus récent au plus ancien.
    // Un membre du Gouvernement jamais parlementaire n'a pas de mandat de
    // référence : les champs de circonscription restent vides.
    const latestMandat: (typeof parlMandats)[number] | undefined =
      sortNewestFirst(parlMandats)[0];

    const isSenat = latestMandat?.typeOrgane === 'SENAT';

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

    const latestLieu = latestMandat?.election?.lieu;

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

    const governmentMandates: DeputeMandat[] = gouvMandats.map((mandat) => {
      const ref = mandat.organes?.organeRef;
      const organeRef = Array.isArray(ref) ? ref[0] : ref;
      const libQualite = mandat.infosQualite?.libQualite ?? undefined;
      return {
        type: governmentMandateType(libQualite),
        nom_circo: '',
        num_deptmt: '',
        num_circo: 0,
        mandat_debut: mandat.dateDebut,
        mandat_fin: mandat.dateFin ?? undefined,
        intitule:
          (organeRef ? organes.get(organeRef) : undefined) ?? libQualite,
      };
    });

    // Référence de la fiche : dernier mandat parlementaire, sinon dernier
    // mandat gouvernemental.
    const reference = latestMandat ?? gouvMandats[0];

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
      mandat_debut: reference.dateDebut,
      mandat_fin: reference.dateFin ?? undefined,
      groupe_sigle: groupeSigle,
      slug: slugify(etatCivil.ident.prenom, etatCivil.ident.nom),
      photo_url: latestAnMandat?.legislature
        ? photoUrl(anId, latestAnMandat.legislature)
        : undefined,
      mandat_type: latestMandat
        ? isSenat
          ? 'senateur'
          : 'depute'
        : 'gouvernement',
      death_date: deathDate,
      full: rawJson,
      allMandates: [...allParlMandates, ...governmentMandates],
    });
  }

  return deputes;
}
