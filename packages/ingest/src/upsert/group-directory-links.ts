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
 * - plateforme déjà présente (autre source ou autre compte) → ignoré pour
 *   l'instant ; la priorité entre sources arrive avec #278 ;
 * - sinon → inséré en `pending`.
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

export const GROUP_DIRECTORY_LINK_SOURCE = 'group_directory';

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
  | { action: 'skip'; link: CandidateLink; reason: string };

const CLOSED_STATUSES = new Set(['rejected', 'deleted']);

/**
 * Décide, pour chaque lien candidat, ce qu'il faut écrire. Fonction pure.
 * Un même lot ne peut insérer qu'une fois par plateforme.
 */
export function planLinkWrites(
  existing: ExistingLink[],
  candidates: CandidateLink[],
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
    } else if (samePlatform.length > 0) {
      plan.push({
        action: 'skip',
        link,
        reason: 'plateforme déjà renseignée par une autre source',
      });
    } else {
      plan.push({ action: 'insert', link });
      plannedPlatforms.add(link.platform);
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
  writeProvenance(
    linkId: string,
    provenance: GroupDirectoryProvenance,
    link: CandidateLink,
  ): Promise<void>;
}

export interface GroupDirectoryUpsertResult {
  created: number;
  skipped: number;
  skips: { link: CandidateLink; reason: string }[];
}

/** Applique le plan : insertion en `pending` puis provenance pour chaque ligne créée. */
export async function upsertGroupDirectoryLinks(
  store: LinkStore,
  officialId: string,
  candidates: CandidateLink[],
  provenance: GroupDirectoryProvenance,
): Promise<GroupDirectoryUpsertResult> {
  if (candidates.length === 0) {
    return { created: 0, skipped: 0, skips: [] };
  }

  const existing = await store.listExisting(officialId);
  const plan = planLinkWrites(existing, candidates);

  const skips: { link: CandidateLink; reason: string }[] = [];
  let created = 0;
  for (const item of plan) {
    if (item.action === 'skip') {
      skips.push({ link: item.link, reason: item.reason });
      continue;
    }
    const linkId = await store.insertPending(
      officialId,
      item.link,
      provenance.capturedAt,
    );
    await store.writeProvenance(linkId, provenance, item.link);
    created++;
  }
  return { created, skipped: skips.length, skips };
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
