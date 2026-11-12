/**
 * Orchestration de l'ingestion des annuaires de groupes parlementaires
 * (tickets #276 et #277), appelée par main-group-directories-ingest.ts.
 *
 * Étapes par groupe :
 * 1. liste des membres (fetchMemberList, bloc AJAX) ;
 * 2. extraction des entrées (noms + fiches, ou liens directs si la config
 *    indique followsToDetailPage = false) ;
 * 3. rapprochement de chaque entrée avec une fiche (matchOfficial) ;
 * 4. pour les entrées rapprochées seulement : fiche du député (fetchPage,
 *    une requête par député, délai entre requêtes) puis extraction des liens ;
 * 5. écriture des liens en `pending` (upsertGroupDirectoryLinks), ou simple
 *    plan en mode dry-run.
 *
 * Les dépendances (réseau, base) sont injectées : les tests utilisent des
 * fausses réponses et un store en mémoire.
 */
import type { GroupDirectorySource } from './config/group-directories.js';
import {
  matchOfficial,
  type GroupOfficialIndex,
} from './group-directory-matching.js';
import {
  extractMemberPages,
  extractPageSocialLinks,
  extractSocialLinks,
} from './sources/group-directory-social-links.js';
import {
  planLinkWrites,
  toDbPlatform,
  upsertGroupDirectoryLinks,
  type CandidateLink,
  type LinkStore,
} from './upsert/group-directory-links.js';

export interface GroupDirectoryRunDeps {
  /** HTML de la liste des membres d'un groupe (bloc AJAX). */
  fetchMemberList(listUrl: string): Promise<string>;
  /** HTML d'une fiche de député. */
  fetchPage(url: string): Promise<string>;
  index: GroupOfficialIndex;
  store: LinkStore;
  /** Délai entre deux fiches, en millisecondes. */
  delayMs: number;
  /** Date du crawl, YYYY-MM-DD. */
  today: string;
  /** Si vrai, calcule le plan sans rien écrire. */
  dryRun: boolean;
  sleep?: (ms: number) => Promise<void>;
}

export interface GroupRunSummary {
  groupCode: string;
  /** Erreur qui a interrompu le groupe (liste inaccessible, etc.). */
  error: string | null;
  entries: number;
  resolved: number;
  exact: number;
  probable: number;
  pagesFetched: number;
  linksFound: number;
  created: number;
  skipped: number;
  /** Plan seulement, en dry-run : liens qui seraient créés. */
  wouldCreate: number;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function emptySummary(
  groupCode: string,
  error: string | null,
): GroupRunSummary {
  return {
    groupCode,
    error,
    entries: 0,
    resolved: 0,
    exact: 0,
    probable: 0,
    pagesFetched: 0,
    linksFound: 0,
    created: 0,
    skipped: 0,
    wouldCreate: 0,
  };
}

/** Exécute les sources dans l'ordre. Un groupe en erreur n'arrête pas les suivants. */
export async function runGroupDirectories(
  sources: GroupDirectorySource[],
  deps: GroupDirectoryRunDeps,
): Promise<GroupRunSummary[]> {
  const sleep = deps.sleep ?? defaultSleep;
  const summaries: GroupRunSummary[] = [];

  for (const source of sources) {
    const summary = emptySummary(source.groupCode, null);
    summaries.push(summary);
    try {
      await runOneGroup(source, deps, sleep, summary);
    } catch (error) {
      summary.error = (error as Error).message;
    }
  }
  return summaries;
}

async function runOneGroup(
  source: GroupDirectorySource,
  deps: GroupDirectoryRunDeps,
  sleep: (ms: number) => Promise<void>,
  summary: GroupRunSummary,
): Promise<void> {
  const listHtml = await deps.fetchMemberList(source.listUrl);

  if (source.followsToDetailPage && source.detailLinkSelector) {
    const pages = extractMemberPages(listHtml, {
      listItemSelector: source.listItemSelector,
      nameSelector: source.nameSelector,
      detailLinkSelector: source.detailLinkSelector,
    });
    summary.entries = pages.length;

    let fetchedOnce = false;
    for (const page of pages) {
      if (page.name === null) continue;
      const match = matchOfficial(
        { name: page.name, groupCode: source.groupCode },
        deps.index,
      );
      if (!match.officialId) continue;
      countResolution(summary, match.confidence);

      if (!page.detailHref) continue;
      const detailUrl = new URL(page.detailHref, source.listUrl).href;

      if (fetchedOnce) await sleep(deps.delayMs);
      fetchedOnce = true;
      summary.pagesFetched++;

      let detailHtml: string;
      try {
        detailHtml = await deps.fetchPage(detailUrl);
      } catch {
        continue;
      }
      const links = extractPageSocialLinks(
        detailHtml,
        source.socialLinkSelector,
      );
      await applyLinks(
        deps,
        summary,
        match.officialId,
        links.map((link) => ({
          platform: toDbPlatform(link.platform),
          url: link.url,
        })),
        {
          groupName: source.groupName,
          pageUrl: detailUrl,
          capturedAt: deps.today,
          memberName: page.name,
        },
      );
    }
    return;
  }

  // Liens publiés directement sur la liste.
  const members = extractSocialLinks(listHtml, source);
  summary.entries = members.length;
  for (const member of members) {
    if (member.name === null) continue;
    const match = matchOfficial(
      { name: member.name, groupCode: source.groupCode },
      deps.index,
    );
    if (!match.officialId) continue;
    countResolution(summary, match.confidence);
    await applyLinks(
      deps,
      summary,
      match.officialId,
      member.links.map((link) => ({
        platform: toDbPlatform(link.platform),
        url: link.url,
      })),
      {
        groupName: source.groupName,
        pageUrl: source.listUrl,
        capturedAt: deps.today,
        memberName: member.name,
      },
    );
  }
}

function countResolution(
  summary: GroupRunSummary,
  confidence: 'exact' | 'probable' | 'unresolved',
): void {
  summary.resolved++;
  if (confidence === 'exact') summary.exact++;
  if (confidence === 'probable') summary.probable++;
}

async function applyLinks(
  deps: GroupDirectoryRunDeps,
  summary: GroupRunSummary,
  officialId: string,
  links: CandidateLink[],
  provenance: Parameters<typeof upsertGroupDirectoryLinks>[3],
): Promise<void> {
  summary.linksFound += links.length;
  if (links.length === 0) return;

  if (deps.dryRun) {
    const existing = await deps.store.listExisting(officialId);
    summary.wouldCreate += planLinkWrites(existing, links).filter(
      (item) => item.action === 'insert',
    ).length;
    return;
  }

  const result = await upsertGroupDirectoryLinks(
    deps.store,
    officialId,
    links,
    provenance,
  );
  summary.created += result.created;
  summary.skipped += result.skipped;
}
