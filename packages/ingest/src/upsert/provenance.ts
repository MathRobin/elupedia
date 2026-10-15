/**
 * Traçabilité des données : enregistre, pour chaque ligne ingérée, la source
 * (nom, URL, base légale) et la donnée brute telle que reçue. Utilisé par la
 * plupart des modules d'upsert (officials, senators, meps, votes...).
 *
 * Table écrite : `data_provenance`.
 * Clé de rapprochement : (`source_table`, `source_record_id`) — l'id du
 * record est un identifiant de la source (an_id, matricule Sénat, europarl
 * id préfixé...), pas la PK interne.
 *
 * Idempotent : une ligne existante est mise à jour (raw_data, fetched_at),
 * les métadonnées de source (nom, URL, base légale) ne sont jamais réécrites.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { dataProvenance } from '@elupedia/shared';
import { eq, and, inArray } from 'drizzle-orm';

/** Taille des lots (SELECT IN + INSERT groupé), limite de paramètres Postgres. */
const PROVENANCE_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Écrit ou rafraîchit la provenance d'un record : INSERT s'il est inconnu,
 * sinon UPDATE de `raw_data` et `fetched_at`. Un `rawData` undefined est
 * stocké comme NULL.
 */
export async function writeProvenance(
  db: NeonHttpDatabase,
  opts: {
    sourceTable: string;
    sourceRecordId: string;
    sourceName: string;
    sourceUrl: string;
    legalBasis: string;
    rawData: unknown;
  },
): Promise<void> {
  const existing = await db
    .select({ id: dataProvenance.id })
    .from(dataProvenance)
    .where(
      and(
        eq(dataProvenance.sourceTable, opts.sourceTable),
        eq(dataProvenance.sourceRecordId, opts.sourceRecordId),
      ),
    )
    .limit(1);

  const now = new Date();

  if (existing.length === 0) {
    await db.insert(dataProvenance).values({
      sourceTable: opts.sourceTable,
      sourceRecordId: opts.sourceRecordId,
      sourceName: opts.sourceName,
      sourceUrl: opts.sourceUrl,
      legalBasis: opts.legalBasis,
      rawData: (opts.rawData ?? null) as Record<string, unknown> | null,
      fetchedAt: now,
    });
  } else {
    await db
      .update(dataProvenance)
      .set({
        rawData: (opts.rawData ?? null) as Record<string, unknown> | null,
        fetchedAt: now,
      })
      .where(eq(dataProvenance.id, existing[0].id));
  }
}

/**
 * Même sémantique que `writeProvenance`, mais pour de nombreux records de la
 * même `sourceTable` : un SELECT + un INSERT groupé par lot au lieu d'un
 * SELECT + INSERT/UPDATE par ligne. Les lignes existantes ne sont mises à
 * jour que si `rawData` a réellement changé (comparaison JSON), car
 * re-télécharger des données identiques est le cas courant d'une
 * ré-ingestion.
 *
 * Piège : la `sourceTable` est lue sur le premier élément de chaque lot ;
 * tous les items d'un appel doivent donc partager la même table.
 */
export async function writeProvenanceBatch(
  db: NeonHttpDatabase,
  items: {
    sourceTable: string;
    sourceRecordId: string;
    sourceName: string;
    sourceUrl: string;
    legalBasis: string;
    rawData: unknown;
  }[],
): Promise<void> {
  for (const batch of chunk(items, PROVENANCE_CHUNK_SIZE)) {
    if (batch.length === 0) continue;
    const sourceTable = batch[0].sourceTable;
    const recordIds = batch.map((item) => item.sourceRecordId);

    const existing = await db
      .select({
        id: dataProvenance.id,
        sourceRecordId: dataProvenance.sourceRecordId,
        rawData: dataProvenance.rawData,
      })
      .from(dataProvenance)
      .where(
        and(
          eq(dataProvenance.sourceTable, sourceTable),
          inArray(dataProvenance.sourceRecordId, recordIds),
        ),
      );

    const existingByRecordId = new Map(
      existing.map((row) => [row.sourceRecordId, row]),
    );
    const now = new Date();
    const newRows: (typeof dataProvenance.$inferInsert)[] = [];

    for (const item of batch) {
      const found = existingByRecordId.get(item.sourceRecordId);
      const rawData = (item.rawData ?? null) as Record<string, unknown> | null;

      if (!found) {
        newRows.push({
          sourceTable: item.sourceTable,
          sourceRecordId: item.sourceRecordId,
          sourceName: item.sourceName,
          sourceUrl: item.sourceUrl,
          legalBasis: item.legalBasis,
          rawData,
          fetchedAt: now,
        });
      } else if (JSON.stringify(found.rawData) !== JSON.stringify(rawData)) {
        await db
          .update(dataProvenance)
          .set({ rawData, fetchedAt: now })
          .where(eq(dataProvenance.id, found.id));
      }
    }

    if (newRows.length > 0) {
      await db.insert(dataProvenance).values(newRows);
    }
  }
}
