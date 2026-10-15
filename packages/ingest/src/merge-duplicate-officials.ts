/**
 * Fusion des fiches `officials` en doublon entre l'open data Sénat et l'AN.
 *
 * Contexte : le jeu AMO30 de l'AN décrit aussi les sénateurs ; avant que le
 * rapprochement nom + prénom + date de naissance existe dans
 * upsert/officials.ts et upsert/senators.ts, une même personne a pu recevoir
 * deux fiches : l'une créée par le Sénat (`senat_id`), l'autre par l'AN
 * (`an_id`). Ce rapprochement n'est tenté qu'à la création d'une fiche, les
 * doublons anciens ne se résorbent donc jamais. Constaté en octobre 2026 :
 * 48 paires, surtout des sénateurs des Français établis hors de France et
 * d'outre-mer.
 *
 * Règle de fusion : la fiche Sénat est conservée (elle porte la photo, le
 * matricule et les mandats avec département) ; la fiche AN lui cède son
 * `an_id`, ses champs encore vides sur la fiche conservée, et toutes ses
 * lignes dépendantes. Une ligne dépendante déjà présente sur la fiche
 * conservée (même clé naturelle, voir NATURAL_KEYS) est supprimée plutôt que
 * déplacée : les deux sources ont souvent ingéré le même mandat ou le même
 * article. La fiche AN est ensuite supprimée ; son slug (URL publique) cesse
 * d'exister, sauf s'il est la forme canonique du slug conservé
 * (`marie-pierre-mouton` vs `marie-pierre-mouton-1`) : la fiche conservée le
 * reprend alors, et c'est l'URL suffixée qui disparaît.
 *
 * Lancé par main-merge-duplicate-officials.ts (`yarn --cwd packages/ingest
 * merge:duplicate-officials [--apply]`). Sans `--apply`, rien n'est écrit :
 * le script affiche, paire par paire, ce qui serait déplacé et supprimé.
 * Non transactionnel (driver HTTP Neon) mais relançable : chaque étape est
 * idempotente et l'ordre (suppression des doublons, puis réaffectation, puis
 * suppression de la fiche) garantit qu'une interruption laisse une base
 * cohérente, à terminer par une nouvelle exécution.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { logger } from './logger.js';

/**
 * Pour chaque table portant `official_id` : les colonnes qui identifient une
 * ligne pour une personne donnée. Deux lignes de même clé sur les deux fiches
 * sont le même fait vu par deux sources ; celle de la fiche AN est supprimée.
 * `mandates` reprend l'index unique (official_id, type, start_date) ; les
 * autres clés sont celles des upserts correspondants (voir upsert/*.ts).
 */
export const NATURAL_KEYS: Record<string, readonly string[]> = {
  mandates: ['type', 'start_date'],
  votes: ['ballot_id'],
  press_mentions: ['source_url'],
  interests: ['type', 'entity_name', 'declared_date'],
  addresses: ['type'],
  external_links: ['platform', 'url'],
  committees: ['name', 'type', 'start_date'],
  affiliations: ['party_or_group', 'kind', 'start_date'],
  staffers: ['first_name', 'last_name', 'start_date'],
  declaration_snapshots: ['declaration_date', 'declaration_type'],
  fact_checks: ['review_url'],
  parliamentary_activity: ['type', 'title', 'date'],
  electoral_results: ['election_type', 'election_date', 'round'],
  campaign_accounts: ['cnccfp_id'],
  sponsorships: ['type', 'election_year', 'candidate_name'],
  decorations: ['arko_ref', 'order_name'],
  // Candidats : `official_id` est un rattachement facultatif (sans FK) posé
  // par reconcile ; une personne n'est candidate qu'une fois par scrutin.
  municipal_candidates: ['election_id'],
  legislative_candidates: ['election_id'],
  senatorial_candidates: ['election_id'],
};

/** Une paire à fusionner : `kept` = fiche Sénat conservée, `dup` = fiche AN. */
export interface DuplicatePair {
  name: string;
  birthDate: string;
  keptId: string;
  keptSlug: string | null;
  keptAnId: string | null;
  dupId: string;
  dupSlug: string | null;
  dupAnId: string | null;
}

/** Ce qui arrive aux lignes d'une table pour une paire. */
export interface TablePlan {
  table: string;
  /** Lignes de la fiche AN supprimées (même clé naturelle déjà sur la fiche conservée). */
  dropped: number;
  /** Lignes de la fiche AN réaffectées à la fiche conservée. */
  moved: number;
}

export interface MergeSummary {
  pairs: number;
  skipped: number;
  moved: number;
  dropped: number;
  dryRun: boolean;
}

/**
 * Paires (fiche Sénat, fiche sans matricule) de même nom, prénom et date de
 * naissance. La date de naissance est exigée des deux côtés : sans elle, un
 * homonyme serait fusionné à tort.
 */
export async function findDuplicateOfficialPairs(
  db: NeonHttpDatabase,
): Promise<DuplicatePair[]> {
  const rows = await db.execute(sql`
    select
      kept.first_name || ' ' || kept.last_name as name,
      kept.birth_date::text as birth_date,
      kept.id as kept_id,
      kept.slug as kept_slug,
      kept.an_id as kept_an_id,
      dup.id as dup_id,
      dup.slug as dup_slug,
      dup.an_id as dup_an_id
    from officials kept
    join officials dup
      on lower(dup.last_name) = lower(kept.last_name)
     and lower(dup.first_name) = lower(kept.first_name)
     and dup.birth_date = kept.birth_date
     and dup.id <> kept.id
    where kept.senat_id is not null
      and dup.senat_id is null
    order by kept.last_name, kept.first_name
  `);
  return (rows.rows as Record<string, unknown>[]).map((row) => ({
    name: row.name as string,
    birthDate: row.birth_date as string,
    keptId: row.kept_id as string,
    keptSlug: (row.kept_slug as string | null) ?? null,
    keptAnId: (row.kept_an_id as string | null) ?? null,
    dupId: row.dup_id as string,
    dupSlug: (row.dup_slug as string | null) ?? null,
    dupAnId: (row.dup_an_id as string | null) ?? null,
  }));
}

/**
 * Condition SQL « la fiche conservée a déjà une ligne de même clé naturelle »
 * pour une ligne `d` de la fiche AN, dans la table `table`.
 */
function sameKeyExists(table: string, keptId: string) {
  const comparisons = NATURAL_KEYS[table].map(
    (column) =>
      sql`k.${sql.identifier(column)} is not distinct from d.${sql.identifier(column)}`,
  );
  return sql`exists (
    select 1 from ${sql.identifier(table)} k
    where k.official_id = ${keptId}
      and ${sql.join(comparisons, sql` and `)}
  )`;
}

/** Comptages de ce que la fusion ferait sur une table (lecture seule). */
export async function planTableMerge(
  db: NeonHttpDatabase,
  pair: DuplicatePair,
  table: string,
): Promise<TablePlan> {
  const result = await db.execute(sql`
    select
      count(*) filter (where ${sameKeyExists(table, pair.keptId)})::int as dropped,
      count(*) filter (where not ${sameKeyExists(table, pair.keptId)})::int as moved
    from ${sql.identifier(table)} d
    where d.official_id = ${pair.dupId}
  `);
  const row = result.rows[0] as { dropped: number; moved: number };
  return { table, dropped: row.dropped, moved: row.moved };
}

/**
 * Applique la fusion d'une table : supprime les lignes de la fiche AN déjà
 * connues de la fiche conservée, puis réaffecte les autres. Les deux requêtes
 * sont idempotentes.
 */
async function applyTableMerge(
  db: NeonHttpDatabase,
  pair: DuplicatePair,
  table: string,
): Promise<void> {
  await db.execute(sql`
    delete from ${sql.identifier(table)} d
    where d.official_id = ${pair.dupId}
      and ${sameKeyExists(table, pair.keptId)}
  `);
  await db.execute(sql`
    update ${sql.identifier(table)}
    set official_id = ${pair.keptId}
    where official_id = ${pair.dupId}
  `);
}

/**
 * Transfère sur la fiche conservée ce qu'elle n'a pas encore (photo, décès,
 * statut HATVP, dates de vérification). `full` (JSON brut de la source) n'est
 * pas touché : la fiche conservée garde celui du Sénat. L'`an_id` est traité
 * à part (transferAnId) à cause de sa contrainte unique.
 */
async function fillKeptOfficialFromDup(
  db: NeonHttpDatabase,
  pair: DuplicatePair,
): Promise<void> {
  await db.execute(sql`
    update officials kept
    set
      photo_url = coalesce(kept.photo_url, dup.photo_url),
      s3_photo_url = coalesce(kept.s3_photo_url, dup.s3_photo_url),
      death_date = coalesce(kept.death_date, dup.death_date),
      hatvp_status = coalesce(kept.hatvp_status, dup.hatvp_status),
      press_checked_at = greatest(kept.press_checked_at, dup.press_checked_at),
      factchecks_checked_at = greatest(kept.factchecks_checked_at, dup.factchecks_checked_at),
      updated_at = now()
    from officials dup
    where kept.id = ${pair.keptId} and dup.id = ${pair.dupId}
  `);
}

/**
 * Pose l'`an_id` de la fiche AN sur la fiche conservée. La colonne est
 * unique : la fiche AN doit le libérer d'abord. La valeur vient de `pair`
 * (lue avant toute écriture), si bien qu'une interruption entre les deux
 * requêtes se rattrape en relançant le script : la paire est retrouvée tant
 * que la fiche AN existe, et l'an_id est reposé depuis `pair.dupAnId`… qui,
 * lui, serait alors null. D'où le `coalesce` : au pire la fiche conservée
 * reste sans an_id et l'ingestion AN la rattachera (nom + prénom + naissance).
 */
async function transferAnId(
  db: NeonHttpDatabase,
  pair: DuplicatePair,
): Promise<void> {
  if (!pair.dupAnId || pair.keptAnId) return;
  await db.execute(sql`
    update officials set an_id = null where id = ${pair.dupId}
  `);
  await db.execute(sql`
    update officials set an_id = ${pair.dupAnId}, updated_at = now()
    where id = ${pair.keptId} and an_id is null
  `);
}

/**
 * Slug final de la fiche conservée : celui de la fiche AN quand le slug
 * conservé n'en est qu'une variante suffixée (`-1`, `-2`...), sinon inchangé.
 */
export function finalSlug(pair: DuplicatePair): string | null {
  if (!pair.dupSlug || !pair.keptSlug) return pair.keptSlug;
  const suffixed = new RegExp(
    `^${pair.dupSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`,
  );
  return suffixed.test(pair.keptSlug) ? pair.dupSlug : pair.keptSlug;
}

/**
 * Fusionne toutes les paires trouvées. En dry-run, affiche le plan et
 * n'écrit rien. Retourne un bilan.
 */
export async function mergeDuplicateOfficials(
  db: NeonHttpDatabase,
  options: { dryRun: boolean },
): Promise<MergeSummary> {
  const pairs = await findDuplicateOfficialPairs(db);
  const summary: MergeSummary = {
    pairs: 0,
    skipped: 0,
    moved: 0,
    dropped: 0,
    dryRun: options.dryRun,
  };
  logger.info(
    `${pairs.length} paire(s) de fiches en doublon ${options.dryRun ? '(dry-run, rien ne sera écrit)' : ''}`,
  );

  for (const pair of pairs) {
    if (pair.keptAnId && pair.dupAnId && pair.keptAnId !== pair.dupAnId) {
      logger.warn(
        `  ${pair.name} (${pair.birthDate}) : deux an_id différents (${pair.keptAnId} / ${pair.dupAnId}), paire ignorée — à vérifier à la main`,
      );
      summary.skipped++;
      continue;
    }

    const plans: TablePlan[] = [];
    for (const table of Object.keys(NATURAL_KEYS)) {
      plans.push(await planTableMerge(db, pair, table));
    }
    const moved = plans.reduce((sum, plan) => sum + plan.moved, 0);
    const dropped = plans.reduce((sum, plan) => sum + plan.dropped, 0);
    const details = plans
      .filter((plan) => plan.moved + plan.dropped > 0)
      .map((plan) => `${plan.table} +${plan.moved}/-${plan.dropped}`)
      .join(', ');
    const slug = finalSlug(pair);
    const slugNote = slug !== pair.keptSlug ? ` (reprend le slug ${slug})` : '';
    logger.info(
      `  ${pair.name} (${pair.birthDate}) : garde ${pair.keptSlug} ← supprime ${pair.dupSlug} (an_id ${pair.dupAnId ?? '—'})${slugNote} : ${moved} déplacées, ${dropped} supprimées [${details || 'rien à déplacer'}]`,
    );

    if (!options.dryRun) {
      for (const table of Object.keys(NATURAL_KEYS)) {
        await applyTableMerge(db, pair, table);
      }
      await fillKeptOfficialFromDup(db, pair);
      await transferAnId(db, pair);
      await db.execute(sql`delete from officials where id = ${pair.dupId}`);
      if (slug !== pair.keptSlug) {
        await db.execute(sql`
          update officials set slug = ${slug}, updated_at = now()
          where id = ${pair.keptId}
        `);
      }
    }

    summary.pairs++;
    summary.moved += moved;
    summary.dropped += dropped;
  }

  logger.info(
    `Fusion ${options.dryRun ? 'simulée' : 'appliquée'} : ${summary.pairs} paire(s), ` +
      `${summary.moved} lignes déplacées, ${summary.dropped} supprimées, ${summary.skipped} ignorée(s)`,
  );
  return summary;
}
