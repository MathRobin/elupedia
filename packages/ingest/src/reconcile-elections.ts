/**
 * Réconciliation a posteriori des enregistrements qui citent un élu sans
 * identifiant : candidats aux élections (municipales, législatives,
 * sénatoriales) et parrainages présidentiels / signatures RIP. Chaque ligne
 * encore sans `official_id` est confrontée aux fiches `officials` par le
 * résolveur de official-resolver.ts (nom normalisé, puis département pour
 * départager les homonymes).
 *
 * Résultat par ligne :
 * - une fiche confirmée → `official_id` posé ;
 * - aucune fiche de ce nom → `resolution = 'no_match'` (sénatoriales et
 *   parrainages seulement, les tables municipales/législatives n'ont pas la
 *   colonne) : rien à rattacher, la ligne sort de la file de l'admin ;
 * - fiches candidates mais aucune confirmée → `resolution = 'ambiguous'` :
 *   à trancher dans l'admin (« Rattachements à une fiche élu »).
 * Les lignes déjà rattachées ne sont jamais retouchées ; les verdicts sont
 * recalculés à chaque run (de nouvelles fiches peuvent lever une ambiguïté).
 *
 * Lancé par main-reconcile.ts (`yarn --cwd packages/ingest reconcile`),
 * typiquement après chaque ingestion d'élections ou de nouvelles fiches
 * (DAG `ingest-reconcile`). Écrit en base (UPDATE official_id / resolution).
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { and, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  officials,
  mandates,
  municipalCandidates,
  legislativeCandidates,
  senatorialCandidates,
  senatorialElections,
  sponsorships,
  type ReconciliationResolution,
} from '@elupedia/shared';
import { logger } from './logger.js';
import {
  buildOfficialIndex,
  resolveOfficial,
  splitUppercaseLastName,
  type OfficialIndex,
} from './official-resolver.js';

// Certaines tables (municipal_candidates) dépassent le million de lignes non
// rattachées : un unique SELECT sans pagination provoque des coupures de
// connexion intermittentes côté driver HTTP de Neon ("TypeError: terminated"
// depuis undici) une fois la réponse trop volumineuse. On pagine par
// curseur (id > dernier id vu) plutôt que par OFFSET : les lignes déjà
// mises à jour dans cette même passe sortent naturellement du filtre
// "official_id IS NULL" sans décaler les pages suivantes.
const BATCH_SIZE = 5000;

/** Taille des lots d'UPDATE … WHERE id IN (…) pour poser les verdicts. */
const RESOLUTION_CHUNK_SIZE = 500;

type CandidateTable =
  | typeof municipalCandidates
  | typeof legislativeCandidates
  | typeof senatorialCandidates;

export interface ReconcileCounts {
  /** Lignes rattachées pendant ce run. */
  updated: number;
  /** Lignes sans official_id parcourues. */
  total: number;
  /** Verdicts posés (0 pour les tables sans colonne `resolution`). */
  noMatch: number;
  ambiguous: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/**
 * Rattache les candidats sans official_id d'une table. `departmentOf` donne
 * le département de l'élection d'un candidat (sénatoriales), pour départager
 * les homonymes ; `withResolution` indique si la table porte la colonne
 * `resolution` à alimenter.
 */
async function reconcileTable(
  db: NeonHttpDatabase,
  table: CandidateTable,
  label: string,
  index: OfficialIndex,
  options: {
    departmentOf?: (electionId: string) => string | null;
    withResolution?: boolean;
  } = {},
): Promise<ReconcileCounts> {
  const counts: ReconcileCounts = {
    updated: 0,
    total: 0,
    noMatch: 0,
    ambiguous: 0,
  };
  const verdicts: Record<ReconciliationResolution, string[]> = {
    no_match: [],
    ambiguous: [],
  };
  let cursor: string | null = null;

  while (true) {
    const page = await db
      .select({
        id: table.id,
        nom: table.nom,
        prenom: table.prenom,
        electionId: table.electionId,
      })
      .from(table)
      .where(
        cursor
          ? and(isNull(table.officialId), gt(table.id, cursor))
          : isNull(table.officialId),
      )
      .orderBy(table.id)
      .limit(BATCH_SIZE);

    if (page.length === 0) break;

    for (const candidate of page) {
      counts.total++;
      const resolution = resolveOfficial(
        index,
        candidate.nom,
        candidate.prenom,
        options.departmentOf?.(candidate.electionId) ?? null,
      );
      if (typeof resolution === 'string') {
        verdicts[resolution].push(candidate.id);
        continue;
      }
      await db
        .update(table)
        .set({ officialId: resolution.officialId, updatedAt: new Date() })
        .where(eq(table.id, candidate.id));
      counts.updated++;
    }

    cursor = page[page.length - 1].id;
  }

  if (options.withResolution && table === senatorialCandidates) {
    counts.noMatch = verdicts.no_match.length;
    counts.ambiguous = verdicts.ambiguous.length;
    for (const [resolution, ids] of Object.entries(verdicts)) {
      for (const ids500 of chunk(ids, RESOLUTION_CHUNK_SIZE)) {
        await db
          .update(senatorialCandidates)
          .set({ resolution, updatedAt: new Date() })
          .where(inArray(senatorialCandidates.id, ids500));
      }
    }
  }

  logger.info(
    `  ${label}: ${counts.updated} linked / ${counts.total} unlinked` +
      (options.withResolution
        ? ` (${counts.noMatch} no_match, ${counts.ambiguous} ambiguous)`
        : ''),
  );
  return counts;
}

/**
 * Rattache les parrainages et signatures RIP sans official_id. Le nom
 * source est « NOM Prénom » (capitales puis prénoms) ; le département de la
 * source (`raw_department`) départage les homonymes. Un nom indécoupable
 * est compté en `ambiguous` : un humain le lira.
 */
async function reconcileSponsorships(
  db: NeonHttpDatabase,
  index: OfficialIndex,
): Promise<ReconcileCounts> {
  const counts: ReconcileCounts = {
    updated: 0,
    total: 0,
    noMatch: 0,
    ambiguous: 0,
  };
  const verdicts: Record<ReconciliationResolution, string[]> = {
    no_match: [],
    ambiguous: [],
  };
  let cursor: string | null = null;

  while (true) {
    const page = await db
      .select({
        id: sponsorships.id,
        rawElectedName: sponsorships.rawElectedName,
        rawDepartment: sponsorships.rawDepartment,
      })
      .from(sponsorships)
      .where(
        cursor
          ? and(isNull(sponsorships.officialId), gt(sponsorships.id, cursor))
          : isNull(sponsorships.officialId),
      )
      .orderBy(sponsorships.id)
      .limit(BATCH_SIZE);

    if (page.length === 0) break;

    for (const row of page) {
      counts.total++;
      const name = splitUppercaseLastName(row.rawElectedName);
      const resolution = name
        ? resolveOfficial(
            index,
            name.lastName,
            name.firstName,
            row.rawDepartment,
          )
        : 'ambiguous';
      if (typeof resolution === 'string') {
        verdicts[resolution].push(row.id);
        continue;
      }
      await db
        .update(sponsorships)
        .set({
          officialId: resolution.officialId,
          matched: true,
          resolution: null,
          updatedAt: new Date(),
        })
        .where(eq(sponsorships.id, row.id));
      counts.updated++;
    }

    cursor = page[page.length - 1].id;
  }

  counts.noMatch = verdicts.no_match.length;
  counts.ambiguous = verdicts.ambiguous.length;
  for (const [resolution, ids] of Object.entries(verdicts)) {
    for (const ids500 of chunk(ids, RESOLUTION_CHUNK_SIZE)) {
      await db
        .update(sponsorships)
        .set({ resolution, updatedAt: new Date() })
        .where(inArray(sponsorships.id, ids500));
    }
  }

  logger.info(
    `  Sponsorships: ${counts.updated} linked / ${counts.total} unlinked (${counts.noMatch} no_match, ${counts.ambiguous} ambiguous)`,
  );
  return counts;
}

/**
 * Rattache les candidats des trois tables et les parrainages, puis affiche
 * le taux de couverture final. Renvoie les compteurs par table (`muni`,
 * `legi`, `sena`, `sponsorships` ; noms figés, utilisés par les tests).
 */
export async function reconcileElections(db: NeonHttpDatabase) {
  logger.info('=== Election candidate reconciliation ===\n');

  const allOfficials = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
    })
    .from(officials);

  // Départements des mandats, pour départager les homonymes.
  const mandateDepartments = await db
    .select({
      officialId: mandates.officialId,
      department: mandates.department,
    })
    .from(mandates)
    .where(isNotNull(mandates.department));

  const index = buildOfficialIndex(allOfficials, mandateDepartments);
  logger.info(`${allOfficials.length} officials loaded for matching\n`);

  // Département de chaque scrutin sénatorial, par id d'élection.
  const senatorialDepartments = new Map(
    (
      await db
        .select({
          id: senatorialElections.id,
          departementName: senatorialElections.departementName,
        })
        .from(senatorialElections)
    ).map((election) => [election.id, election.departementName]),
  );

  const muni = await reconcileTable(
    db,
    municipalCandidates,
    'Municipal',
    index,
  );
  const legi = await reconcileTable(
    db,
    legislativeCandidates,
    'Legislative',
    index,
  );
  const sena = await reconcileTable(
    db,
    senatorialCandidates,
    'Senatorial',
    index,
    {
      departmentOf: (electionId) =>
        senatorialDepartments.get(electionId) ?? null,
      withResolution: true,
    },
  );
  const sponsorshipCounts = await reconcileSponsorships(db, index);

  const totalUpdated =
    muni.updated + legi.updated + sena.updated + sponsorshipCounts.updated;

  // Couverture globale après passage (pas seulement ce run).
  const counts = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM municipal_candidates WHERE official_id IS NOT NULL) as muni_linked,
      (SELECT COUNT(*) FROM municipal_candidates) as muni_total,
      (SELECT COUNT(*) FROM legislative_candidates WHERE official_id IS NOT NULL) as legi_linked,
      (SELECT COUNT(*) FROM legislative_candidates) as legi_total,
      (SELECT COUNT(*) FROM senatorial_candidates WHERE official_id IS NOT NULL) as sena_linked,
      (SELECT COUNT(*) FROM senatorial_candidates) as sena_total,
      (SELECT COUNT(*) FROM sponsorships WHERE official_id IS NOT NULL) as spons_linked,
      (SELECT COUNT(*) FROM sponsorships) as spons_total
  `);

  const row = counts.rows[0];
  const percent = (linked: unknown, total: unknown) =>
    Number(total) === 0
      ? '0.0'
      : ((Number(linked) / Number(total)) * 100).toFixed(1);
  logger.info(`\n=== Summary ===`);
  logger.info(`Newly linked: ${totalUpdated}`);
  logger.info(
    `Municipal:    ${row.muni_linked}/${row.muni_total} linked (${percent(row.muni_linked, row.muni_total)}%)`,
  );
  logger.info(
    `Legislative:  ${row.legi_linked}/${row.legi_total} linked (${percent(row.legi_linked, row.legi_total)}%)`,
  );
  logger.info(
    `Senatorial:   ${row.sena_linked}/${row.sena_total} linked (${percent(row.sena_linked, row.sena_total)}%)`,
  );
  logger.info(
    `Sponsorships: ${row.spons_linked}/${row.spons_total} linked (${percent(row.spons_linked, row.spons_total)}%)`,
  );

  return { totalUpdated, muni, legi, sena, sponsorships: sponsorshipCounts };
}
