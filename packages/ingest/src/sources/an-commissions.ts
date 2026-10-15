/**
 * Appartenances des députés aux commissions, délégations et groupes
 * (open data AN, jeu AMO30 — le même ZIP que assemblee-nationale.ts).
 *
 * Source : dossier `json/organe/` (un fichier par organe : commission,
 * groupe politique, etc.) et `json/acteur/` (un fichier par acteur avec tous
 * ses mandats, y compris les mandats « membre de l'organe X »).
 *
 * Extrait : pour chaque député, la liste de ses appartenances aux organes
 * dont le `codeType` figure dans CODE_TYPE_MAP, avec dates de début/fin.
 *
 * Pièges :
 * - `mandats.mandat` et `organes.organeRef` peuvent être un objet/une chaîne
 *   ou un tableau (conversion XML→JSON) ; on ne garde que le premier
 *   organeRef.
 * - Les organes sont chargés d'abord pour résoudre les libellés ; un mandat
 *   dont l'organe est inconnu ou hors périmètre est ignoré.
 *
 * Appelé par run-an.ts via upsert/committees.ts.
 */
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Extract } from 'unzipper';

import { DATASET_URL } from './assemblee-nationale.js';
import {
  ActeurFileSchema,
  OrganeFileSchema,
  CommitteeItemSchema,
  type CommitteeItem,
} from '../schemas.js';

export { CommitteeItemSchema, type CommitteeItem };

export interface DeputeCommittees {
  id_an: string;
  committees: CommitteeItem[];
}

/** Codes d'organe AN retenus et leur type côté Elupedia. */
const CODE_TYPE_MAP: Record<string, CommitteeItem['type']> = {
  COMPER: 'standing_committee',
  COMSPST: 'special_committee',
  DELEG: 'delegation',
  GE: 'study_group',
  GA: 'friendship_group',
};

interface OrganeInfo {
  uid: string;
  name: string;
  type: CommitteeItem['type'];
}

/**
 * Télécharge le ZIP AMO30 et renvoie les appartenances par député (seuls les
 * députés ayant au moins une appartenance sont renvoyés).
 * Lève une erreur si le téléchargement échoue.
 */
export async function fetchCommittees(
  fetchFn: typeof fetch = fetch,
): Promise<DeputeCommittees[]> {
  const response = await fetchFn(DATASET_URL);
  if (!response.ok) {
    throw new Error(
      `AN commissions API error: ${response.status} ${response.statusText}`,
    );
  }

  const extractDir = join(tmpdir(), `an-commissions-${Date.now()}`);
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

    const organes = await loadCommitteeOrganes(extractDir);
    return await loadMemberships(extractDir, organes);
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }
}

/** Index uid → organe, limité aux types de CODE_TYPE_MAP. */
async function loadCommitteeOrganes(
  extractDir: string,
): Promise<Map<string, OrganeInfo>> {
  const organesByUid = new Map<string, OrganeInfo>();
  const organeDir = join(extractDir, 'json', 'organe');

  let files: string[];
  try {
    files = await readdir(organeDir);
  } catch {
    return organesByUid;
  }

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await readFile(join(organeDir, file), 'utf-8');
    const parsed = OrganeFileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) continue;

    const organe = parsed.data.organe;
    const committeeType = CODE_TYPE_MAP[organe.codeType];
    if (!committeeType) continue;

    organesByUid.set(organe.uid, {
      uid: organe.uid,
      // Le libellé abrégé de l'open data AN est le plus souvent identique au
      // libellé complet : on ne garde que ce dernier pour éviter des noms de
      // commissions dupliqués sous deux formes.
      name: organe.libelle ?? organe.libelleAbrege ?? '',
      type: committeeType,
    });
  }

  return organesByUid;
}

async function loadMemberships(
  extractDir: string,
  organes: Map<string, OrganeInfo>,
): Promise<DeputeCommittees[]> {
  const acteurDir = join(extractDir, 'json', 'acteur');
  let files: string[];
  try {
    files = await readdir(acteurDir);
  } catch {
    return [];
  }

  const result: DeputeCommittees[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await readFile(join(acteurDir, file), 'utf-8');
    const parsed = ActeurFileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) continue;

    const acteur = parsed.data.acteur;
    const anId = acteur.uid['#text'];

    const allMandats = Array.isArray(acteur.mandats.mandat)
      ? acteur.mandats.mandat
      : [acteur.mandats.mandat];

    const committees: CommitteeItem[] = [];

    for (const mandat of allMandats) {
      const rawRef = mandat.organes?.organeRef;
      if (!rawRef) continue;
      const organeRef = Array.isArray(rawRef) ? rawRef[0] : rawRef;

      const organe = organes.get(organeRef);
      if (!organe) continue;

      committees.push({
        name: organe.name,
        type: organe.type,
        start_date: mandat.dateDebut,
        end_date: mandat.dateFin ?? undefined,
        an_uid: organe.uid,
      });
    }

    if (committees.length > 0) {
      result.push({ id_an: anId, committees });
    }
  }

  return result;
}
