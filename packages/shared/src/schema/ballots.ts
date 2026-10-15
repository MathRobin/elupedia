/**
 * Table `ballots` : un scrutin public (vote nominatif) d'une assemblée.
 * Les positions individuelles sont dans `votes`, celles des groupes dans
 * `ballot_group_positions`.
 *
 * Alimentée par les scrutins AN (`an-scrutins.ts`), Sénat (`senat-scrutins.ts`)
 * et Parlement européen (`parlement-europeen-votes.ts`, votes par appel
 * nominal uniquement).
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Résultat officiel du scrutin tel que publié par l'assemblée (AN : `sort.code`,
 * Sénat : suffixe « Adoption »/« Rejet » de l'index), normalisé en anglais.
 * `null` quand la source ne le publie pas (ex. scrutins europarl, limités à la
 * délégation française).
 */
export const ballotResultEnum = ['adopted', 'rejected'] as const;
export type BallotResult = (typeof ballotResultEnum)[number];

/** Auteur d'un texte soumis au vote, résolu depuis le dossier législatif. */
export interface BallotProposer {
  officialId: string;
  name: string;
  /** Sigle du groupe du député (ex. « RN »), null si inconnu. */
  group: string | null;
}

export const ballots = pgTable('ballots', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Malgré son nom, identifiant source toutes assemblées confondues, préfixé
  // par origine : `scrutin-{uid}` (AN), `senat-scrutin-{session}-{numéro}`,
  // `europarl-vote-{id}`. Clé d'upsert.
  anId: varchar('an_id', { length: 50 }).unique(),
  // Certains intitulés du Sénat dépassent 1 000 caractères (motions longues).
  title: text('title').notNull(),
  date: date('date').notNull(),
  // Libellé source du type de vote (AN : « ordinaire », « solennel »... ;
  // Sénat : 'ordinaire' ; PE : 'europarl').
  type: varchar('type', { length: 100 }).notNull(),
  result: varchar('result', { length: 20 }),
  /** Dossier législatif du texte (AN : `objet.dossierLegislatif.dossierRef`). */
  dossierRef: varchar('dossier_ref', { length: 50 }),
  /** Qui a demandé le scrutin public (AN : `demandeur.texte`), pas l'auteur du texte. */
  requestedBy: text('requested_by'),
  /** Auteurs du texte (initiateurs du dossier) ; null = pas encore résolu, [] = aucun. */
  proposers: jsonb('proposers').$type<BallotProposer[]>(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
