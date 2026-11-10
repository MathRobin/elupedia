/**
 * Insertion des parrainages présidentiels (Conseil constitutionnel,
 * `sources/parrainages.ts`, via `main-parrainages.ts`) et des signatures de
 * référendum d'initiative partagée (`sources/rip-signatures.ts`, via
 * `main-rip-signatures.ts`) dans une table commune.
 *
 * Table écrite : `sponsorships` (`type` = `parrainage_presidentiel` ou
 * `rip_signature`).
 * Clé de dédoublonnage des parrainages : (type, election_year, nom publié,
 * mandat, circonscription, département, candidat) — voir `sponsorshipKey`.
 * Le nom seul ne suffit pas : des élus homonymes (communes ou départements
 * différents) parrainent des candidats, et une clé sur le nom écartait le
 * second (50 lignes perdues sur 13 427 en 2022). Les signatures RIP gardent
 * le nom seul (une signature par personne).
 * Rattachement à `officials` par NOM|PRÉNOM sans accents : approximatif, figé
 * à l'insertion ; un nom qui apparaît plusieurs fois dans le fichier désigne
 * des élus différents, il n'est donc pas rattaché (official_id null).
 *
 * Insert-only : une ligne déjà présente n'est jamais réécrite (ni le
 * rattachement, ni les champs bruts) — relancer n'actualise rien, il faut
 * purger pour réimporter.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, sponsorships } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { ParrainageRow } from '../sources/parrainages.js';
import type { RipSignataireRow } from '../sources/rip-signatures.js';
import { logger } from '../logger.js';

/** Majuscules sans accents : les publications du CC sont en capitales. */
function normalize(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

/** Index `NOM|PRÉNOM` normalisés → official id, sur toute la table. */
async function buildOfficialCache(
  db: NeonHttpDatabase,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
    })
    .from(officials);

  const cache = new Map<string, string>();
  for (const row of rows) {
    const key = `${normalize(row.lastName)}|${normalize(row.firstName)}`;
    cache.set(key, row.id);
  }
  return cache;
}

export interface SponsorshipKeyParts {
  name: string;
  func: string;
  circonscription: string | null | undefined;
  departement: string | null | undefined;
  candidate: string;
}

/** Clé de dédoublonnage d'un parrainage : un même nom avec un autre mandat, une autre circonscription ou un autre candidat est un autre parrainage. */
export function sponsorshipKey(parts: SponsorshipKeyParts): string {
  return [
    parts.name,
    parts.func,
    parts.circonscription ?? '',
    parts.departement ?? '',
    parts.candidate,
  ].join('|');
}

/** Lignes déjà enregistrées pour ce (type, année), avec les champs de la clé de dédoublonnage. */
async function loadExisting(
  db: NeonHttpDatabase,
  electionYear: number,
  type: string,
) {
  return db
    .select({
      rawElectedName: sponsorships.rawElectedName,
      rawFunction: sponsorships.rawFunction,
      rawCircumscription: sponsorships.rawCircumscription,
      rawDepartment: sponsorships.rawDepartment,
      candidateName: sponsorships.candidateName,
    })
    .from(sponsorships)
    .where(
      and(
        eq(sponsorships.type, type),
        eq(sponsorships.electionYear, electionYear),
      ),
    );
}

/** Clés de dédoublonnage des parrainages déjà enregistrés. */
async function buildExistingKeys(
  db: NeonHttpDatabase,
  electionYear: number,
  type: string,
): Promise<Set<string>> {
  const rows = await loadExisting(db, electionYear, type);
  return new Set(
    rows.map((row) =>
      sponsorshipKey({
        name: row.rawElectedName,
        func: row.rawFunction,
        circonscription: row.rawCircumscription,
        departement: row.rawDepartment,
        candidate: row.candidateName,
      }),
    ),
  );
}

/** Noms bruts déjà enregistrés pour ce (type, année) : clé de dédoublonnage des signatures RIP. */
async function buildExistingCache(
  db: NeonHttpDatabase,
  electionYear: number,
  type: string,
): Promise<Set<string>> {
  const rows = await loadExisting(db, electionYear, type);
  return new Set(rows.map((row) => row.rawElectedName));
}

function matchOfficial(
  row: ParrainageRow,
  cache: Map<string, string>,
): string | null {
  const key = `${normalize(row.nom)}|${normalize(row.prenom)}`;
  return cache.get(key) ?? null;
}

/** Taille des INSERT groupés (limite de paramètres Postgres). */
const BATCH_SIZE = 500;

/**
 * Insère les parrainages inconnus d'une élection présidentielle. Écrit dans
 * `sponsorships`. Retourne `{ created, updated, matched }` — attention,
 * `updated` est en réalité le nombre de lignes ignorées car déjà présentes.
 */
export async function upsertSponsorships(
  db: NeonHttpDatabase,
  rows: ParrainageRow[],
  electionYear: number,
  type: string = 'parrainage_presidentiel',
): Promise<{ created: number; updated: number; matched: number }> {
  const officialCache = await buildOfficialCache(db);
  const existingKeys = await buildExistingKeys(db, electionYear, type);
  let created = 0;
  let skipped = 0;
  let matched = 0;

  // Un NOM|PRÉNOM présent plusieurs fois dans le fichier désigne des élus
  // différents : rattacher par le nom seul en choisirait un au hasard.
  const nameCounts = new Map<string, number>();
  for (const row of rows) {
    const key = `${normalize(row.nom)}|${normalize(row.prenom)}`;
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  const toInsert: (typeof sponsorships.$inferInsert)[] = [];

  for (const row of rows) {
    const nameKey = `${normalize(row.nom)}|${normalize(row.prenom)}`;
    const officialId =
      (nameCounts.get(nameKey) ?? 0) > 1
        ? null
        : matchOfficial(row, officialCache);
    if (officialId) matched++;

    const rawName = `${row.nom} ${row.prenom}`;
    const key = sponsorshipKey({
      name: rawName,
      func: row.mandat,
      circonscription: row.circonscription || null,
      departement: row.departement || null,
      candidate: row.candidat,
    });

    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    existingKeys.add(key);

    toInsert.push({
      officialId,
      type,
      electionYear,
      candidateName: row.candidat,
      rawElectedName: rawName,
      rawFunction: row.mandat,
      rawCircumscription: row.circonscription || null,
      rawDepartment: row.departement || null,
      publicationDate: row.datePublication || null,
      matched: !!officialId,
    });
  }

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    await db.insert(sponsorships).values(batch);
    created += batch.length;
    logger.info(
      `[Parrainages] ${electionYear}: inserted ${Math.min(i + BATCH_SIZE, toInsert.length)}/${toInsert.length}`,
    );
  }

  logger.info(
    `[Parrainages] ${electionYear}: ${created} created, ${skipped} skipped (existing), ${matched}/${rows.length} matched`,
  );
  return { created, updated: skipped, matched };
}

/**
 * Insère les signatures RIP inconnues pour un référendum (`subject`) d'une
 * année donnée. Écrit dans `sponsorships`. Retourne créés / ignorés /
 * rattachés.
 */
export async function upsertRipSignatures(
  db: NeonHttpDatabase,
  rows: RipSignataireRow[],
  year: number,
  subject: string,
  decisionDate?: string,
): Promise<{ created: number; skipped: number; matched: number }> {
  const type = 'rip_signature';
  const officialCache = await buildOfficialCache(db);
  const existingNames = await buildExistingCache(db, year, type);
  let created = 0;
  let skipped = 0;
  let matched = 0;

  const toInsert: (typeof sponsorships.$inferInsert)[] = [];

  for (const row of rows) {
    const key = `${normalize(row.lastName)}|${normalize(row.firstName)}`;
    const officialId = officialCache.get(key) ?? null;
    if (officialId) matched++;

    const rawName = `${row.lastName} ${row.firstName}`;

    if (existingNames.has(rawName)) {
      skipped++;
      continue;
    }

    toInsert.push({
      officialId,
      type,
      electionYear: year,
      candidateName: subject,
      rawElectedName: rawName,
      rawFunction: 'Parlementaire',
      publicationDate: decisionDate ?? null,
      matched: !!officialId,
    });
  }

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    await db.insert(sponsorships).values(batch);
    created += batch.length;
    logger.info(
      `[RIP] ${year} ${subject}: inserted ${Math.min(i + BATCH_SIZE, toInsert.length)}/${toInsert.length}`,
    );
  }

  logger.info(
    `[RIP] ${year} ${subject}: ${created} created, ${skipped} skipped, ${matched}/${rows.length} matched`,
  );
  return { created, skipped, matched };
}
