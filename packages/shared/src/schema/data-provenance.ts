/**
 * Table `data_provenance` : traçabilité de l'origine d'un enregistrement
 * (quelle source, quelle URL, quelle licence, quand) avec la donnée brute
 * telle que reçue. Sert à la page « Sources » du site et à l'audit.
 *
 * Écrite par `upsert/provenance.ts` (`writeProvenance`), une ligne par
 * (`source_table`, `source_record_id`), mise à jour à chaque ré-ingestion.
 * Aucune clé étrangère : `source_table`/`source_record_id` sont des
 * chaînes libres.
 *
 * Piège : la table est aussi détournée comme stockage de curseurs
 * d'ingestion incrémentale (`source_table` = 'europarl_sittings',
 * 'europarl_questions_cursor'), qui ne correspondent à aucune table réelle.
 */
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const dataProvenance = pgTable('data_provenance', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceTable: text('source_table').notNull(),
  sourceRecordId: text('source_record_id').notNull(),
  sourceName: text('source_name').notNull(),
  sourceUrl: text('source_url').notNull(),
  // Licence ou fondement juridique de réutilisation (ex. Licence Ouverte).
  legalBasis: text('legal_basis').notNull(),
  // Copie brute de l'enregistrement source ; nullable car certaines
  // ingestions ne la conservent pas (test `rawData column is nullable`).
  rawData: jsonb('raw_data'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
});
