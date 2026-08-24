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

const CODE_TYPE_MAP: Record<string, CommitteeItem['type']> = {
  COMPER: 'standing_committee',
  COMSPST: 'special_committee',
  DELEG: 'delegation',
  GE: 'study_group',
  GA: 'friendship_group',
};

interface OrganeInfo {
  name: string;
  type: CommitteeItem['type'];
}

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

async function loadCommitteeOrganes(
  extractDir: string,
): Promise<Map<string, OrganeInfo>> {
  const map = new Map<string, OrganeInfo>();
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
    const committeeType = CODE_TYPE_MAP[o.codeType];
    if (!committeeType) continue;

    map.set(o.uid, {
      name:
        o.libelle && o.libelleAbrege
          ? `${o.libelle} (${o.libelleAbrege})`
          : (o.libelle ?? o.libelleAbrege ?? ''),

      type: committeeType,
    });
  }

  return map;
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

    for (const m of allMandats) {
      const organeRef = m.organes?.organeRef;
      if (!organeRef) continue;

      const organe = organes.get(organeRef);
      if (!organe) continue;

      committees.push({
        name: organe.name,
        type: organe.type,
        start_date: m.dateDebut,
        end_date: m.dateFin ?? undefined,
      });
    }

    if (committees.length > 0) {
      result.push({ id_an: anId, committees });
    }
  }

  return result;
}
