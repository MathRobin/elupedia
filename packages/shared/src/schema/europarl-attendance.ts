/**
 * Table `europarl_attendance` : une ligne par (eurodéputé, jour de séance)
 * où l'élu a signé le registre de présence du Parlement européen.
 *
 * L'absence de ligne est donc l'absence de signature : la table ne stocke que
 * les signatures, jamais une « absence » déduite. Les compteurs affichés sur
 * la fiche élu (`computeMepGap` dans `attendance-gap.ts`) croisent ces
 * signatures avec les jours de scrutin nominatif (`ballots` de type
 * `europarl`) et les positions exprimées (`votes`).
 *
 * Alimentée par `packages/ingest/src/upsert/europe-presence.ts` (étape
 * « eurodeputes-presence » de `run-europe.ts`), depuis
 * `had_participant_person` de l'API open data du PE. Seuls les eurodéputés
 * français (ceux qui ont un `officials.europarl_id` en base) sont écrits.
 *
 * `pv_url` est le PDF de l'annexe « Liste de présence » du procès-verbal du
 * jour : la pièce justificative de la signature, à afficher comme source.
 * Null si la séance ne publie pas d'annexe.
 *
 * Unique sur (official_id, sitting_date) : l'ingestion est idempotente et un
 * élu ne signe qu'une fois par jour de séance. Supprimée avec la fiche
 * (cascade).
 */
import {
  pgTable,
  uuid,
  text,
  date,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const europarlAttendance = pgTable(
  'europarl_attendance',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    officialId: uuid('official_id')
      .notNull()
      .references(() => officials.id, { onDelete: 'cascade' }),
    /** Jour de la séance plénière signée (`AAAA-MM-JJ`). */
    sittingDate: date('sitting_date').notNull(),
    /** PDF de l'annexe « Liste de présence » du PV de ce jour. */
    pvUrl: text('pv_url'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('europarl_attendance_official_sitting_idx').on(
      table.officialId,
      table.sittingDate,
    ),
    index('europarl_attendance_sitting_date_idx').on(table.sittingDate),
  ],
);
