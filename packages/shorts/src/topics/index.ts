import type { TopicDefinition } from './common.js';
import { campaignAccountsTopic } from './campaign-accounts-2024.js';
import { deputiesAgeTopic } from './deputies-age.js';
import { sponsorshipsTopic } from './sponsorships-2022.js';
import { staffersTopic } from './staffers.js';
import { writtenQuestionsTopic } from './written-questions.js';

/**
 * Registre des thèmes de shorts « thème » (voir `common.ts`). Ajouter un
 * thème = un module dans ce dossier, une entrée ici, et une ligne dans la
 * doc (`docs/DOMAINS.md`, CLAUDE.md).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TOPICS: Record<string, TopicDefinition<any>> = Object.fromEntries(
  [
    staffersTopic,
    writtenQuestionsTopic,
    sponsorshipsTopic,
    deputiesAgeTopic,
    campaignAccountsTopic,
  ].map((t) => [t.key, t]),
);
