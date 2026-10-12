/**
 * Scrutins publics de l'Assemblée nationale et votes nominatifs des députés.
 *
 * Source : ZIP `Scrutins.json.zip` (open data AN, législature 17), dossier
 * `json/` avec un fichier par scrutin (`{ scrutin: {...} }`).
 *
 * Extrait : pour chaque scrutin, ses métadonnées (numéro, titre, date, type
 * de vote, sort) plus :
 * - `votants` : la position de chaque député (pour/contre/abstention/
 *   non-votant) avec son numéro de siège ;
 * - `groupPositions` : la position majoritaire et le décompte par groupe.
 *
 * Structure brute : `ventilationVotes.organe.groupes.groupe[]`, chaque groupe
 * portant `vote.decompteNominatif.{pours,contres,abstentions,nonVotants}.votant[]`
 * et `vote.decompteVoix` (totaux). Comme pour tous les JSON de l'AN, un
 * élément unique n'est pas enveloppé dans un tableau : voir toArray.
 *
 * Appelé par run-an.ts via upsert/an-votes.ts.
 */
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
  seatNumber: number | null;
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

/** Clé du `decompteNominatif` AN pour chaque position Elupedia. */
const DECOMPTE_KEY_BY_POSITION: Record<ScrutinVotant['position'], string> = {
  pour: 'pours',
  contre: 'contres',
  abstention: 'abstentions',
  'non-votant': 'nonVotants',
};

/** Type de vote par défaut quand `typeVote.libelleTypeVote` est absent. */
const DEFAULT_VOTE_TYPE = 'ordinaire';

/** Les JSON de l'AN n'enveloppent pas un élément unique dans un tableau. */
function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

/** Votants d'un groupe pour une position donnée. */
function extractVotants(
  decompteNominatif: Record<string, unknown> | null | undefined,
  position: ScrutinVotant['position'],
): ScrutinVotant[] {
  if (!decompteNominatif) return [];
  const buckets = decompteNominatif as Record<
    string,
    { votant?: unknown } | null
  >;
  const bucket = buckets[DECOMPTE_KEY_BY_POSITION[position]];
  if (!bucket?.votant) return [];

  const votants = Array.isArray(bucket.votant)
    ? bucket.votant
    : [bucket.votant];

  return votants
    .filter((raw: unknown): raw is { acteurRef: string; numPlace?: string } => {
      const votant = raw as Record<string, unknown>;
      return typeof votant?.acteurRef === 'string';
    })
    .map((votant) => ({
      acteurRef: votant.acteurRef,
      position,
      seatNumber: votant.numPlace ? parseInt(votant.numPlace, 10) : null,
    }));
}

/**
 * Télécharge le ZIP des scrutins et renvoie un `Scrutin` par fichier valide
 * (uid, date et titre obligatoires). Lève si le téléchargement échoue.
 */
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

      const parsed = parseScrutin(scrutin);
      if (parsed) results.push(parsed);
    }

    logger.info(
      `AN scrutins: ${results.length} scrutins parsed, ${results.reduce((total, scrutin) => total + scrutin.votants.length, 0)} votes`,
    );
    return results;
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }
}

/** Convertit un scrutin brut ; undefined s'il manque uid, date ou titre. */
function parseScrutin(scrutin: Record<string, unknown>): Scrutin | undefined {
  const uid = scrutin.uid as string | undefined;
  const numero = scrutin.numero as string | undefined;
  const dateScrutin = scrutin.dateScrutin as string | undefined;
  const titre = scrutin.titre as string | undefined;
  if (!uid || !dateScrutin || !titre) return undefined;

  const typeVote = scrutin.typeVote as Record<string, string> | undefined;
  const sort = scrutin.sort as Record<string, string> | undefined;

  const ventilation = scrutin.ventilationVotes as
    Record<string, unknown> | undefined;
  const organe = ventilation?.organe as Record<string, unknown> | undefined;
  const groupes = organe?.groupes as Record<string, unknown> | undefined;
  const groupeList = toArray(groupes?.groupe);

  const votants: ScrutinVotant[] = [];
  const groupPositions: ScrutinGroupPosition[] = [];

  for (const rawGroupe of groupeList) {
    const groupe = rawGroupe as Record<string, unknown>;
    const vote = groupe.vote as Record<string, unknown> | undefined;
    const decompte = vote?.decompteNominatif as
      Record<string, unknown> | undefined;

    votants.push(
      ...extractVotants(decompte, 'pour'),
      ...extractVotants(decompte, 'contre'),
      ...extractVotants(decompte, 'abstention'),
      ...extractVotants(decompte, 'non-votant'),
    );

    const organeRef = groupe.organeRef as string | undefined;
    const positionMajoritaire = vote?.positionMajoritaire as string | undefined;
    if (organeRef && positionMajoritaire) {
      const decompteVoix = vote?.decompteVoix as
        Record<string, string> | undefined;
      groupPositions.push({
        organeRef,
        positionMajoritaire,
        memberCount: parseInt(
          (groupe.nombreMembresGroupe as string) ?? '0',
          10,
        ),
        votesFor: parseInt(decompteVoix?.pour ?? '0', 10),
        votesAgainst: parseInt(decompteVoix?.contre ?? '0', 10),
        votesAbstain: parseInt(decompteVoix?.abstentions ?? '0', 10),
        votesAbsent: parseInt(decompteVoix?.nonVotants ?? '0', 10),
      });
    }
  }

  return {
    uid,
    // Certains scrutins n'ont pas de numéro : l'uid sert alors d'identifiant
    // affichable.
    numero: numero ?? uid,
    titre,
    date: dateScrutin,
    type: typeVote?.libelleTypeVote ?? DEFAULT_VOTE_TYPE,
    sort: sort?.code ?? '',
    votants,
    groupPositions,
  };
}
