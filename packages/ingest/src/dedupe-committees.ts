import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { logger } from './logger.js';

/**
 * Jusqu'à septembre 2026, l'ingestion AN nommait les commissions
 * `libellé (libellé abrégé)`, alors que des ingestions plus anciennes ne
 * gardaient que le libellé. La même commission existe donc en base sous deux
 * noms, ce qui produit deux pages distinctes sur le site.
 *
 * Ce script ramène ces noms à leur forme canonique et fusionne les adhésions
 * devenues identiques. Les requêtes sont ensemblistes : la table compte des
 * dizaines de milliers de lignes, et les traiter une par une prendrait des
 * heures sur le driver HTTP de Neon.
 *
 * Lancé par main-dedupe-committees.ts (`yarn --cwd packages/ingest
 * dedupe:committees [--dry-run]`). Trois requêtes : un comptage préalable
 * (affiché, et renvoyé comme bilan), la fusion sur la ligne conservée, puis
 * la suppression des lignes redondantes. Non transactionnel (driver HTTP) :
 * relançable sans dommage, les requêtes sont idempotentes.
 */

/**
 * Motif du dernier groupe parenthésé fermant un nom, un niveau d'imbrication
 * compris (« France-Tchèque (République) (Tchèque (République)) »).
 */
const ABBREVIATION_SUFFIX = String.raw`\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)$`;

/** Bilan du dédoublonnage ; zéros en mode dry-run. */
export interface DedupeCounts {
  renamed: number;
  deleted: number;
}

/**
 * Nom canonique de chaque adhésion : le nom amputé de son suffixe abrégé quand
 * ce suffixe répète le reste du nom, ou quand le nom tronqué désigne déjà une
 * commission existante. Sinon le nom est laissé tel quel — certains libellés de
 * l'AN se terminent légitimement par des parenthèses (« France-Tchèque
 * (République) ») et les tronquer perdrait de l'information.
 */
const canonicalNames = sql`
  select
    c.id,
    c.official_id,
    c.type,
    c.start_date,
    c.end_date,
    c.an_uid,
    c.name,
    case
      when stripped.base is null or stripped.base = '' then c.name
      when lower(stripped.base) = lower(btrim(stripped.abbr)) then stripped.base
      when exists (select 1 from committees o where o.name = stripped.base) then stripped.base
      else c.name
    end as canonical_name
  from committees c
  left join lateral (
    select
      btrim(regexp_replace(c.name, ${ABBREVIATION_SUFFIX}, '')) as base,
      (regexp_match(c.name, ${ABBREVIATION_SUFFIX}))[1] as abbr
    where c.name ~ ${ABBREVIATION_SUFFIX}
  ) stripped on true
`;

/**
 * Renomme puis fusionne les adhésions en double. En `dryRun`, se contente
 * d'afficher ce qui serait fait. Les compteurs renvoyés viennent du comptage
 * préalable, pas du nombre de lignes réellement affectées.
 */
export async function dedupeCommittees(
  db: NeonHttpDatabase,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<DedupeCounts> {
  const preview = (
    (await db.execute(sql`
      with canonical as (${canonicalNames})
      select
        count(*) filter (where canonical_name <> name)::int as to_rename,
        (
          select coalesce(sum(n - 1), 0)::int
          from (
            select count(*) as n
            from canonical
            group by official_id, canonical_name, type, start_date
          ) groups
        ) as to_delete
      from canonical
    `)) as unknown as { rows: { to_rename: number; to_delete: number }[] }
  ).rows[0];

  logger.info(
    `${preview.to_rename} adhésions à renommer, ${preview.to_delete} lignes redondantes à supprimer`,
  );

  if (dryRun) return { renamed: 0, deleted: 0 };

  // Ligne conservée par groupe (official, nom canonique, type, début) : celle
  // qui a un uid AN, sinon la plus ancienne. Une adhésion en cours prime sur
  // une adhésion close, et l'uid AN de l'une des écritures est reporté sur
  // la ligne conservée.
  await db.execute(sql`
    with canonical as (${canonicalNames}),
    merged as (
      select
        official_id, canonical_name, type, start_date,
        (array_agg(id order by (an_uid is null), id))[1] as keep_id,
        bool_or(end_date is null) as ongoing,
        max(end_date) as last_end_date,
        min(an_uid) filter (where an_uid is not null) as an_uid
      from canonical
      group by official_id, canonical_name, type, start_date
    )
    update committees c
    set
      name = m.canonical_name,
      end_date = case when m.ongoing then null else m.last_end_date end,
      an_uid = coalesce(m.an_uid, c.an_uid),
      updated_at = now()
    from merged m
    where c.id = m.keep_id
      and (
        c.name is distinct from m.canonical_name
        or c.end_date is distinct from (case when m.ongoing then null else m.last_end_date end)
        or c.an_uid is distinct from coalesce(m.an_uid, c.an_uid)
      )
  `);

  // Les lignes non retenues portent encore leur ancien nom : elles ne peuvent
  // pas entrer en collision avec celle qu'on vient de renommer.
  await db.execute(sql`
    with canonical as (${canonicalNames}),
    ranked as (
      select
        id,
        row_number() over (
          partition by official_id, canonical_name, type, start_date
          order by (an_uid is null), id
        ) as rank
      from canonical
    )
    delete from committees
    where id in (select id from ranked where rank > 1)
  `);

  logger.info(
    `Terminé : ${preview.to_rename} renommées, ${preview.to_delete} supprimées`,
  );

  return { renamed: preview.to_rename, deleted: preview.to_delete };
}
