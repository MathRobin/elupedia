/**
 * Upsert du registre de présence des séances plénières du Parlement européen,
 * pour les eurodéputés français. Les séances viennent de
 * `sources/parlement-europeen-votes.ts` et les signatures de
 * `sources/parlement-europeen-presence.ts` ; `run-europe.ts` (étape
 * « eurodeputes-presence ») fournit la liste des séances et une fonction de
 * récupération (avec retry et rate limit côté appelant).
 *
 * Tables écrites : `europarl_attendance` (une ligne par élu et par jour signé,
 * clé (official_id, sitting_date)) et `data_provenance` (source_table
 * 'europarl_attendance' : une ligne par séance définitive traitée, marqueur
 * « ne plus rejouer », même mécanique que les votes).
 *
 * Idempotent : la signature d'un élu déjà enregistrée n'est pas dupliquée ;
 * seul `pv_url` est rafraîchi (l'annexe peut être publiée après la séance).
 *
 * Pièges :
 * - Les listes de l'API couvrent les ~700 eurodéputés : les signataires sans
 *   `officials.europarl_id` en base sont des non-français, comptés dans
 *   `unknownSigners` et ignorés sans erreur.
 * - Une séance sans liste de signataires n'est jamais marquée traitée : la
 *   liste peut arriver plus tard.
 * - Rien n'est écrit pour une absence : l'absence de ligne EST l'absence de
 *   signature (cf. en-tête de `schema/europarl-attendance.ts`).
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { europarlAttendance, dataProvenance } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { PlenarySitting } from '../sources/parlement-europeen-votes.js';
import type { SittingAttendance } from '../sources/parlement-europeen-presence.js';
import { isSittingFinal } from './europe-votes.js';
import { logger } from '../logger.js';

const SOURCE_NAME = 'Parlement européen - Open Data API';
const LEGAL_BASIS = 'Licence CC BY 4.0 - data.europarl.europa.eu';
const PROVENANCE_TABLE = 'europarl_attendance';
/**
 * Provenance de repli quand la séance ne publie pas d'annexe de présence :
 * l'endpoint qui a servi la liste. `data_provenance.source_url` est NOT NULL.
 */
const MEETING_API_URL = 'https://data.europarl.europa.eu/api/v2/meetings';
// Un log de progression toutes les N séances.
const PROGRESS_LOG_EVERY = 20;

/** Vrai si la présence de la séance a déjà été marquée traitée. */
export async function wasAttendanceProcessed(
  db: NeonHttpDatabase,
  sittingId: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: dataProvenance.id })
    .from(dataProvenance)
    .where(
      and(
        eq(dataProvenance.sourceTable, PROVENANCE_TABLE),
        eq(dataProvenance.sourceRecordId, sittingId),
      ),
    )
    .limit(1);
  return existing.length > 0;
}

async function markAttendanceProcessed(
  db: NeonHttpDatabase,
  attendance: SittingAttendance,
  frenchSigners: number,
): Promise<void> {
  await db.insert(dataProvenance).values({
    sourceTable: PROVENANCE_TABLE,
    sourceRecordId: attendance.sittingId,
    sourceName: SOURCE_NAME,
    sourceUrl:
      attendance.attendanceListUrl ??
      `${MEETING_API_URL}/${attendance.sittingId}`,
    legalBasis: LEGAL_BASIS,
    rawData: {
      attendeeCount: attendance.attendeeCount,
      signers: attendance.signedPersonIds.length,
      frenchSigners,
      excused: attendance.excusedPersonIds.length,
    },
    fetchedAt: new Date(),
  });
}

export interface SittingAttendanceResult {
  /** Signatures d'eurodéputés français écrites (insérées ou rafraîchies). */
  frenchSigners: number;
  /** Signataires sans fiche en base (eurodéputés non français). */
  unknownSigners: number;
}

/**
 * Écrit les signatures d'une séance pour les seuls eurodéputés français
 * (`officialIdByEuroparlId` vient de `loadOfficialIdsByEuroparlId`).
 * Une seule requête d'insertion par séance.
 */
export async function upsertSittingAttendance(
  db: NeonHttpDatabase,
  attendance: SittingAttendance,
  officialIdByEuroparlId: Map<string, string>,
): Promise<SittingAttendanceResult> {
  const rows: {
    officialId: string;
    sittingDate: string;
    pvUrl: string | null;
  }[] = [];
  let unknownSigners = 0;

  // Dédoublonnage obligatoire : deux lignes de même (official_id,
  // sitting_date) dans un même INSERT ... ON CONFLICT DO UPDATE font échouer
  // la requête (« cannot affect row a second time »). Un même signataire
  // listé deux fois par la source suffirait donc à casser la séance.
  const seen = new Set<string>();
  for (const personId of attendance.signedPersonIds) {
    const officialId = officialIdByEuroparlId.get(personId);
    if (!officialId) {
      unknownSigners++;
      continue;
    }
    if (seen.has(officialId)) continue;
    seen.add(officialId);
    rows.push({
      officialId,
      sittingDate: attendance.date,
      pvUrl: attendance.attendanceListUrl,
    });
  }

  if (rows.length > 0) {
    await db
      .insert(europarlAttendance)
      .values(rows)
      .onConflictDoUpdate({
        target: [europarlAttendance.officialId, europarlAttendance.sittingDate],
        set: {
          pvUrl: attendance.attendanceListUrl,
          updatedAt: new Date(),
        },
      });
  }

  return { frenchSigners: rows.length, unknownSigners };
}

export interface EuropePresenceSummary {
  /** Séances définitives déjà traitées, ignorées sans appel réseau. */
  sittingsSkipped: number;
  /** Séances traitées (appel réseau effectué). */
  sittingsProcessed: number;
  /** Séances sans liste de signataires publiée. */
  sittingsWithoutList: number;
  /** Signatures d'eurodéputés français écrites. */
  signatures: number;
}

/**
 * Traite chaque séance : saute celles déjà définitives et marquées, sinon
 * récupère son registre via `fetchAttendance`, écrit les signatures
 * françaises et marque la séance si elle est définitive. Une erreur sur une
 * séance interrompt le run (même politique que les votes).
 */
export async function upsertEuropePresence(
  db: NeonHttpDatabase,
  sittings: PlenarySitting[],
  fetchAttendance: (sittingId: string) => Promise<SittingAttendance | null>,
  officialIdByEuroparlId: Map<string, string>,
): Promise<EuropePresenceSummary> {
  const summary: EuropePresenceSummary = {
    sittingsSkipped: 0,
    sittingsProcessed: 0,
    sittingsWithoutList: 0,
    signatures: 0,
  };

  logger.info(`  ${sittings.length} sittings to process`);

  for (let i = 0; i < sittings.length; i++) {
    const sitting = sittings[i];

    if (i % PROGRESS_LOG_EVERY === 0) {
      logger.info(`  [${i + 1}/${sittings.length}] sittings...`);
    }

    try {
      const isFinal = isSittingFinal(sitting.date);
      if (isFinal && (await wasAttendanceProcessed(db, sitting.id))) {
        summary.sittingsSkipped++;
        continue;
      }

      const attendance = await fetchAttendance(sitting.id);
      if (!attendance) {
        // Séance future ou sans fiche : rien à écrire, rien à marquer.
        continue;
      }
      summary.sittingsProcessed++;

      if (attendance.signedPersonIds.length === 0) {
        summary.sittingsWithoutList++;
        continue;
      }

      const result = await upsertSittingAttendance(
        db,
        attendance,
        officialIdByEuroparlId,
      );
      summary.signatures += result.frenchSigners;

      if (isFinal) {
        await markAttendanceProcessed(db, attendance, result.frenchSigners);
      }
    } catch (error) {
      logger.error(
        `  Failed processing attendance ${sitting.id} (${sitting.date}): ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  logger.info(
    `Europe presence: ${summary.sittingsSkipped} sittings skipped (already final), ${summary.sittingsProcessed} processed, ${summary.signatures} signatures`,
  );
  return summary;
}
