/**
 * Agrégateur du schéma Drizzle : ré-exporte chaque table (et les listes de
 * valeurs `*Enum` associées) pour que `drizzle.config.ts`, l'ingest, le
 * site et l'admin importent tout depuis `@elupedia/shared`.
 *
 * Les `*Enum` sont des tableaux TypeScript `as const`, pas des enums
 * Postgres : les colonnes correspondantes restent des varchar libres et
 * rien n'empêche une autre valeur en base.
 *
 * Toute nouvelle table doit être ajoutée ici, sinon drizzle-kit l'ignore et
 * `tests/schema.test.js` échoue.
 */
export { officials } from './officials.js';
export { mandates } from './mandates.js';
export {
  ballots,
  ballotResultEnum,
  type BallotResult,
  type BallotProposer,
} from './ballots.js';
export { votes, votePositionEnum } from './votes.js';
export { staffers } from './staffers.js';
export { affiliations } from './affiliations.js';
export {
  interests,
  interestCategoryEnum,
  type InterestCategory,
} from './interests.js';
export { addresses, addressTypeEnum } from './addresses.js';
export {
  externalLinks,
  platformEnum,
  linkStatusEnum,
  linkSourceEnum,
} from './external-links.js';
export { pressMentions } from './press-mentions.js';
export {
  parliamentaryActivity,
  activityTypeEnum,
  amendmentStatusEnum,
} from './parliamentary-activity.js';
export { committees, committeeTypeEnum } from './committees.js';
export { electoralResults } from './electoral-results.js';
export { users, userRoleEnum, accounts, verificationTokens } from './users.js';
export { dataProvenance } from './data-provenance.js';
export {
  declarationSnapshots,
  declarationTypeEnum,
  type DeclarationType,
} from './declaration-snapshots.js';
export { campaignAccounts } from './campaign-accounts.js';
export {
  sponsorships,
  reconciliationResolutionEnum,
  type ReconciliationResolution,
} from './sponsorships.js';
export {
  municipalElections,
  municipalCandidates,
} from './municipal-elections.js';
export {
  legislativeElections,
  legislativeCandidates,
} from './legislative-elections.js';
export {
  senatorialElections,
  senatorialCandidates,
} from './senatorial-elections.js';
export { decorations } from './decorations.js';
export { ballotGroupPositions } from './ballot-group-positions.js';
export { communeTransparency } from './commune-transparency.js';
export { madadaRequests } from './madada-requests.js';
export { factChecks } from './fact-checks.js';
export {
  videoShorts,
  videoShortBallots,
  videoShortStatusEnum,
  type VideoShortStatus,
} from './video-shorts.js';
