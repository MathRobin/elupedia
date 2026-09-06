import { Readable } from 'node:stream';
import { Extract } from 'unzipper';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdir, readFile, mkdir, rm } from 'node:fs/promises';
import { logger } from '../logger.js';

export const SCRUTINS_URL =
  'https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip';

export interface ScrutinVotant {
  acteurRef: string;
  position: 'pour' | 'contre' | 'abstention' | 'non-votant';
}

export interface ScrutinGroupPosition {
  organeRef: string;
  positionMajoritaire: string;
  memberCount: number;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  votesAbsent: number;
}

export interface Scrutin {
  uid: string;
  numero: string;
  titre: string;
  date: string;
  type: string;
  sort: string;
  votants: ScrutinVotant[];
  groupPositions: ScrutinGroupPosition[];
}

function extractVotants(
  decompteNominatif: Record<string, unknown> | null | undefined,
  position: ScrutinVotant['position'],
): ScrutinVotant[] {
  if (!decompteNominatif) return [];
  const bucket = decompteNominatif as Record<
    string,
    { votant?: unknown } | null
  >;
  const posKey =
    position === 'pour'
      ? 'pours'
      : position === 'contre'
        ? 'contres'
        : position === 'abstention'
          ? 'abstentions'
          : 'nonVotants';
  const container = bucket[posKey];
  if (!container?.votant) return [];

  const votants = Array.isArray(container.votant)
    ? container.votant
    : [container.votant];

  return votants
    .filter((v: unknown): v is { acteurRef: string } => {
      const obj = v as Record<string, unknown>;
      return typeof obj?.acteurRef === 'string';
    })
    .map((v) => ({ acteurRef: v.acteurRef, position }));
}

export async function fetchScrutins(
  fetchFn: typeof fetch = fetch,
): Promise<Scrutin[]> {
  const response = await fetchFn(SCRUTINS_URL);
  if (!response.ok) {
    throw new Error(`AN scrutins ZIP error: ${response.status}`);
  }

  const extractDir = join(tmpdir(), `an-scrutins-${Date.now()}`);
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

    const jsonDir = join(extractDir, 'json');
    let files: string[];
    try {
      files = await readdir(jsonDir);
    } catch {
      return [];
    }

    logger.info(`AN scrutins: ${files.length} files to parse`);

    const results: Scrutin[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const raw = await readFile(join(jsonDir, file), 'utf-8');

      let scrutin: Record<string, unknown>;
      try {
        scrutin = (JSON.parse(raw) as { scrutin: Record<string, unknown> })
          .scrutin;
      } catch {
        continue;
      }

      const uid = scrutin.uid as string | undefined;
      const numero = scrutin.numero as string | undefined;
      const dateScrutin = scrutin.dateScrutin as string | undefined;
      const titre = scrutin.titre as string | undefined;
      if (!uid || !dateScrutin || !titre) continue;

      const typeVote = scrutin.typeVote as Record<string, string> | undefined;
      const sort = scrutin.sort as Record<string, string> | undefined;

      const ventilation = scrutin.ventilationVotes as
        Record<string, unknown> | undefined;
      const organe = ventilation?.organe as Record<string, unknown> | undefined;
      const groupes = organe?.groupes as Record<string, unknown> | undefined;
      const groupeList = groupes?.groupe;
      const groupeArr = Array.isArray(groupeList)
        ? groupeList
        : groupeList
          ? [groupeList]
          : [];

      const votants: ScrutinVotant[] = [];
      const groupPositions: ScrutinGroupPosition[] = [];

      for (const groupe of groupeArr) {
        const g = groupe as Record<string, unknown>;
        const vote = g.vote as Record<string, unknown> | undefined;
        const decompte = vote?.decompteNominatif as
          Record<string, unknown> | undefined;

        votants.push(
          ...extractVotants(decompte, 'pour'),
          ...extractVotants(decompte, 'contre'),
          ...extractVotants(decompte, 'abstention'),
          ...extractVotants(decompte, 'non-votant'),
        );

        const organeRef = g.organeRef as string | undefined;
        const positionMajoritaire = vote?.positionMajoritaire as
          string | undefined;
        if (organeRef && positionMajoritaire) {
          const decompteVoix = vote?.decompteVoix as
            Record<string, string> | undefined;
          groupPositions.push({
            organeRef,
            positionMajoritaire,
            memberCount: parseInt((g.nombreMembresGroupe as string) ?? '0', 10),
            votesFor: parseInt(decompteVoix?.pour ?? '0', 10),
            votesAgainst: parseInt(decompteVoix?.contre ?? '0', 10),
            votesAbstain: parseInt(decompteVoix?.abstentions ?? '0', 10),
            votesAbsent: parseInt(decompteVoix?.nonVotants ?? '0', 10),
          });
        }
      }

      results.push({
        uid,
        numero: numero ?? uid,
        titre,
        date: dateScrutin,
        type: typeVote?.libelleTypeVote ?? 'ordinaire',
        sort: sort?.code ?? '',
        votants,
        groupPositions,
      });
    }

    logger.info(
      `AN scrutins: ${results.length} scrutins parsed, ${results.reduce((s, r) => s + r.votants.length, 0)} votes`,
    );
    return results;
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }
}
