/**
 * Insertion des liens sociaux trouvés sur les annuaires de groupes
 * parlementaires (ticket #277), appelée par run-group-directories.ts.
 *
 * Table écrite : `external_links`, toujours en `status = 'pending'` (validation
 * dans l'admin) et `source = 'group_directory'`. Une ligne `data_provenance`
 * par lien créé (page exacte, date de crawl, nom de l'élu).
 *
 * Règles, par lien candidat (plan pur, `planLinkWrites`) :
 * - plateforme déjà présente avec la même URL canonique → ignoré (idempotence) ;
 * - plateforme déjà présente avec `rejected` ou `deleted`, quelle que soit
 *   l'URL → jamais réinséré (anti-resurgence) ;
 * - plateforme déjà présente avec une autre URL : la priorité des sources
 *   tranche (link-source-priority.ts). Si l'annuaire est plus prioritaire que
 *   le lien existant (pending ou published), le lien existant est remplacé
 *   et repasse en `pending` ; sinon (ou égalité) le candidat est ignoré et
 *   le lien existant est conservé ;
 * - plateforme absente → inséré en `pending`.
 *
 * Le plan ne lit ni n'écrit rien. `upsertGroupDirectoryLinks` applique le plan
 * via un `LinkStore` ; `drizzleLinkStore` est l'implémentation base. Les tests
 * utilisent un store en mémoire (pas de base de test disponible dans le repo).
 */
import { eq } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import {
  externalLinks,
  externalLinkComparisonKey,
  normalizeExternalLinkUrl,
} from '@elupedia/shared';
import { writeProvenance } from './provenance.js';
import {
  compareLinkSources,
  linkSourcePriority,
} from '../link-source-priority.js';

export const GROUP_DIRECTORY_LINK_SOURCE = 'group_directory';

/** Statuts qu'un lien d'une source moins prioritaire peut remplacer. */
const REPLACEABLE_STATUSES = new Set(['pending', 'published']);

/** Platformes du site : le scraper dit « x », la table et le site disent « twitter ». */
export function toDbPlatform(platform: string): string {
  return platform === 'x' ? 'twitter' : platform;
}

export interface CandidateLink {
  /** Plateforme telle que stockée en base (voir `toDbPlatform`). */
  platform: string;
  url: string;
}

export interface ExistingLink {
  id: string;
  platform: string;
  url: string;
  status: string;
  source: string;
}

export interface GroupDirectoryProvenance {
  groupName: string;
  /** URL exacte de la page d'où vient le lien (liste ou fiche). */
  pageUrl: string;
  /** Date du crawl, YYYY-MM-DD. */
  capturedAt: string;
  memberName: string;
}

export type PlannedWrite =
  | { action: 'insert'; link: CandidateLink }
  | { action: 'replace'; existingId: string; link: CandidateLink }
  | { action: 'skip'; link: CandidateLink; reason: string };

const CLOSED_STATUSES = new Set(['rejected', 'deleted']);

/**
 * Décide, pour chaque lien candidat, ce qu'il faut écrire. Fonction pure.
 * Un même lot ne peut écrire qu'une fois par plateforme.
 * `candidateSource` : source du lot (par défaut l'annuaire de groupe).
 */
export function planLinkWrites(
  existing: ExistingLink[],
  candidates: CandidateLink[],
  candidateSource: string = GROUP_DIRECTORY_LINK_SOURCE,
): PlannedWrite[] {
  const plannedPlatforms = new Set<string>();
  const plan: PlannedWrite[] = [];

  for (const link of candidates) {
    if (plannedPlatforms.has(link.platform)) {
      plan.push({
        action: 'skip',
        link,
        reason: 'plateforme déjà traitée dans ce lot',
      });
      continue;
    }

    const samePlatform = existing.filter(
      (row) => row.platform === link.platform,
    );
    const key = externalLinkComparisonKey(link.url);

    if (samePlatform.some((row) => CLOSED_STATUSES.has(row.status))) {
      plan.push({
        action: 'skip',
        link,
        reason: 'plateforme rejetée ou supprimée pour cet élu',
      });
    } else if (
      samePlatform.some((row) => externalLinkComparisonKey(row.url) === key)
    ) {
      plan.push({ action: 'skip', link, reason: 'lien déjà présent' });
    } else if (samePlatform.length === 0) {
      plan.push({ action: 'insert', link });
      plannedPlatforms.add(link.platform);
    } else {
      // Conflit : même plateforme, autre URL. La source la plus prioritaire
      // gagne ; le lien le plus prioritaire déjà présent sert de référence.
      const replaceable = samePlatform.filter((row) =>
        REPLACEABLE_STATUSES.has(row.status),
      );
      const top = replaceable.reduce<ExistingLink | null>(
        (best, row) =>
          best === null ||
          linkSourcePriority(row.source) > linkSourcePriority(best.source)
            ? row
            : best,
        null,
      );
      if (top === null) {
        plan.push({
          action: 'skip',
          link,
          reason: 'plateforme occupée sans lien remplaçable',
        });
        continue;
      }
      const outcome = compareLinkSources(top.source, candidateSource);
      if (outcome === 'candidate_wins') {
        plan.push({ action: 'replace', existingId: top.id, link });
        plannedPlatforms.add(link.platform);
      } else if (outcome === 'existing_wins') {
        plan.push({
          action: 'skip',
          link,
          reason: `source existante plus prioritaire (${top.source}), valeur conservée`,
        });
      } else {
        plan.push({
          action: 'skip',
          link,
          reason: `égalité de priorité avec ${top.source}, valeur conservée`,
        });
      }
    }
  }
  return plan;
}

/** Accès à `external_links` et `data_provenance`, séparé pour être testable. */
export interface LinkStore {
  listExisting(officialId: string): Promise<ExistingLink[]>;
  insertPending(
    officialId: string,
    link: CandidateLink,
    capturedAt: string,
  ): Promise<string>;
  /** Remplace URL et source d'un lien existant, qui repasse en `pending`. */
  replacePending(
    existingId: string,
    link: CandidateLink,
    capturedAt: string,
  ): Promise<void>;
  writeProvenance(
    linkId: string,
    provenance: GroupDirectoryProvenance,
    link: CandidateLink,
  ): Promise<void>;
}

export interface GroupDirectoryUpsertResult {
  created: number;
  replaced: number;
  skipped: number;
  skips: { link: CandidateLink; reason: string }[];
}

/**
 * Applique le plan : insertion ou remplacement en `pending`, puis provenance
 * pour chaque ligne écrite. Les liens perdants sont listés dans `skips`.
 */
export async function upsertGroupDirectoryLinks(
  store: LinkStore,
  officialId: string,
  candidates: CandidateLink[],
  provenance: GroupDirectoryProvenance,
): Promise<GroupDirectoryUpsertResult> {
  if (candidates.length === 0) {
    return { created: 0, replaced: 0, skipped: 0, skips: [] };
  }

  const existing = await store.listExisting(officialId);
  const plan = planLinkWrites(existing, candidates);

  const skips: { link: CandidateLink; reason: string }[] = [];
  let created = 0;
  let replaced = 0;
  for (const item of plan) {
    if (item.action === 'skip') {
      skips.push({ link: item.link, reason: item.reason });
      continue;
    }
    if (item.action === 'insert') {
      const linkId = await store.insertPending(
        officialId,
        item.link,
        provenance.capturedAt,
      );
      await store.writeProvenance(linkId, provenance, item.link);
      created++;
    } else {
      await store.replacePending(
        item.existingId,
        item.link,
        provenance.capturedAt,
      );
      await store.writeProvenance(item.existingId, provenance, item.link);
      replaced++;
    }
  }
  return { created, replaced, skipped: skips.length, skips };
}

/** Implémentation base (Drizzle). */
export function drizzleLinkStore(db: NeonHttpDatabase): LinkStore {
  return {
    async listExisting(officialId) {
      return db
        .select({
          id: externalLinks.id,
          platform: externalLinks.platform,
          url: externalLinks.url,
          status: externalLinks.status,
          source: externalLinks.source,
        })
        .from(externalLinks)
        .where(eq(externalLinks.officialId, officialId));
    },

    async insertPending(officialId, link, capturedAt) {
      const [row] = await db
        .insert(externalLinks)
        .values({
          officialId,
          platform: link.platform,
          url: normalizeExternalLinkUrl(link.url),
          status: 'pending',
          source: GROUP_DIRECTORY_LINK_SOURCE,
          capturedAt,
        })
        .returning({ id: externalLinks.id });
      return row.id;
    },

    async replacePending(existingId, link, capturedAt) {
      await db
        .update(externalLinks)
        .set({
          url: normalizeExternalLinkUrl(link.url),
          status: 'pending',
          source: GROUP_DIRECTORY_LINK_SOURCE,
          capturedAt,
          updatedAt: new Date(),
        })
        .where(eq(externalLinks.id, existingId));
    },

    async writeProvenance(linkId, provenance, link) {
      await writeProvenance(db, {
        sourceTable: 'external_links',
        sourceRecordId: linkId,
        sourceName: `Annuaire du groupe ${provenance.groupName} (Assemblée nationale)`,
        sourceUrl: provenance.pageUrl,
        legalBasis:
          'Page publique de groupe parlementaire, voir docs/DATA-LICENSES.md',
        rawData: {
          member: provenance.memberName,
          platform: link.platform,
          url: link.url,
          capturedAt: provenance.capturedAt,
        },
      });
    },
  };
}
