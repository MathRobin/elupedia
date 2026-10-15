/**
 * Table `declaration_snapshots` : une ligne par déclaration d'intérêts
 * HATVP déposée (initiale ou modificative), pour afficher l'historique des
 * dépôts d'un élu. Le contenu détaillé est dans `interests`.
 *
 * Alimentée par `upsert/declaration-snapshots.ts` à partir du XML HATVP
 * (`hatvp.ts`). Rattachement à `officials` par NOM|PRÉNOM en majuscules,
 * sans date de naissance : des homonymes peuvent donc être confondus.
 * Clé d'upsert logique : (official_id, declaration_date), sans contrainte
 * SQL.
 */
import {
  pgTable,
  uuid,
  varchar,
  date,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

/**
 * Déduit du code du document HATVP : préfixe « DM » ou mention « MODIF »
 * → modification, sinon initial.
 */
export const declarationTypeEnum = ['initial', 'modification'] as const;

export type DeclarationType = (typeof declarationTypeEnum)[number];

export const declarationSnapshots = pgTable('declaration_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  declarationDate: date('declaration_date').notNull(),
  declarationType: varchar('declaration_type', { length: 20 }).notNull(),
  // PDF de la déclaration sur hatvp.fr, quand le XML le référence.
  sourceDocumentUrl: text('source_document_url'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
