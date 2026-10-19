/**
 * Table `sponsorships` : parrainages présidentiels validés par le Conseil
 * constitutionnel (2017, 2022) et signatures de propositions de loi
 * référendaires (RIP), une ligne par (élu parrain, candidat ou texte).
 *
 * Alimentée par `parrainages.ts` (CSV data.gouv.fr) et `rip-signatures.ts`
 * (HTML AN/Sénat) → `upsert/sponsorships.ts`, ingestion one-shot par
 * scrutin. La source ne donne que le nom, la fonction et la circonscription
 * de l'élu, en texte libre : les colonnes `raw_*` les conservent telles
 * quelles, et `official_id` n'est renseigné que si le matching par nom
 * normalisé a abouti (`matched`) ; `reconcile` complète ensuite les
 * rattachements et qualifie le reste (`resolution`). Le dédoublonnage se fait
 * sur (election_year, type, raw_elected_name).
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  date,
  timestamp,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

/**
 * Verdict du dernier `reconcile` sur une ligne encore sans `official_id` :
 * - no_match  : aucune fiche de ce nom en base (ex. maire de 2017 qui n'est
 *               plus en fonction, absent du RNE) — rien à rattacher ;
 * - ambiguous : des fiches existent mais aucune n'est confirmée (homonymes,
 *               département discordant) — à trancher dans l'admin.
 * `null` : ligne jamais examinée par `reconcile`.
 */
export const reconciliationResolutionEnum = ['no_match', 'ambiguous'] as const;
export type ReconciliationResolution =
  (typeof reconciliationResolutionEnum)[number];

export const sponsorships = pgTable('sponsorships', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id').references(() => officials.id),
  // 'parrainage_presidentiel' ou 'rip_signature'.
  type: varchar('type', { length: 50 }).notNull(),
  electionYear: integer('election_year').notNull(),
  // Candidat parrainé, ou intitulé du texte pour un RIP.
  candidateName: varchar('candidate_name', { length: 255 }).notNull(),
  rawElectedName: varchar('raw_elected_name', { length: 255 }).notNull(),
  rawFunction: varchar('raw_function', { length: 255 }).notNull(),
  rawCircumscription: varchar('raw_circumscription', { length: 255 }),
  rawDepartment: varchar('raw_department', { length: 255 }),
  publicationDate: date('publication_date'),
  matched: boolean('matched').notNull().default(false),
  // Voir reconciliationResolutionEnum ; n'a de sens que si official_id est null.
  resolution: varchar('resolution', { length: 20 }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
