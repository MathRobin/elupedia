import { sql } from 'drizzle-orm';
import type { createDb } from '@elupedia/shared';
import type {
  AgeRow,
  CampaignRow,
  GroupCountRow,
  SponsorshipFunctionRow,
} from './facts.js';

/**
 * Lectures en base du livre : requêtes agrégées en lecture seule (aucune
 * écriture), une par tableau. Les chiffres sont ceux de `docs/livre/`.
 *
 * Appelants : `main-data.ts`.
 * Pièges : les groupes viennent du mandat de député en cours
 * (`mandates.end_date is null`), donc les questions d'anciens députés ne sont
 * pas rattachées à un groupe ; le statut des questions écrites est vide dans
 * les données de l'Assemblée, la réponse se déduit de `response_date` ;
 * `db.execute` renvoie les nombres Postgres sous forme de chaînes (cast
 * explicite ici).
 */

type Db = ReturnType<typeof createDb>;

async function rows<T>(db: Db, query: ReturnType<typeof sql>): Promise<T[]> {
  const res = (await db.execute(query)) as unknown as { rows: T[] };
  return res.rows;
}

export async function loadSponsorships(
  db: Db,
): Promise<SponsorshipFunctionRow[]> {
  const r = await rows<{ year: number; raw_function: string; n: number }>(
    db,
    sql`select election_year::int as year, coalesce(raw_function, '') as raw_function, count(*)::int as n
        from sponsorships
        where type = 'parrainage_presidentiel'
        group by 1, 2`,
  );
  return r.map((x) => ({ year: x.year, rawFunction: x.raw_function, n: x.n }));
}

export async function loadCampaignAccounts(db: Db): Promise<CampaignRow[]> {
  const r = await rows<{
    election_type: string;
    accounts: number;
    expenses: number;
    with_expenses: number;
    reimbursement: number;
    rejected: number;
    not_filed: number;
    reimbursed: number;
  }>(
    db,
    sql`select election_type,
          count(*)::int as accounts,
          coalesce(sum(expenses_retained), 0)::bigint::float8 as expenses,
          count(expenses_retained)::int as with_expenses,
          coalesce(sum(reimbursement), 0)::bigint::float8 as reimbursement,
          (count(*) filter (where decision = 'R'))::int as rejected,
          (count(*) filter (where decision = 'DD'))::int as not_filed,
          (count(*) filter (where reimbursement > 0))::int as reimbursed
        from campaign_accounts
        group by election_type`,
  );
  return r.map((x) => ({
    electionType: x.election_type,
    accounts: x.accounts,
    expensesRetained: x.expenses,
    accountsWithExpenses: x.with_expenses,
    reimbursement: x.reimbursement,
    rejected: x.rejected,
    notFiled: x.not_filed,
    reimbursed: x.reimbursed,
  }));
}

export async function loadStaffersByGroup(db: Db): Promise<GroupCountRow[]> {
  const r = await rows<{ grp: string; deputies: number; n: number }>(
    db,
    sql`with dep as (
          select distinct on (official_id) official_id, political_group as grp
          from mandates where type = 'depute' and end_date is null
        ), s as (
          select official_id, count(*)::int as n
          from staffers where end_date is null group by 1
        )
        select coalesce(dep.grp, '(sans groupe)') as grp,
               count(*)::int as deputies,
               coalesce(sum(s.n), 0)::int as n
        from dep left join s using (official_id)
        group by 1`,
  );
  return r.map((x) => ({ group: x.grp, deputies: x.deputies, count: x.n }));
}

export async function loadWrittenQuestionsByGroup(
  db: Db,
): Promise<GroupCountRow[]> {
  const r = await rows<{ grp: string; deputies: number; n: number }>(
    db,
    sql`with dep as (
          select distinct on (official_id) official_id, political_group as grp
          from mandates where type = 'depute' and end_date is null
        ), q as (
          select official_id, count(*)::int as n
          from parliamentary_activity
          where type = 'written_question' and source = 'assemblee_nationale'
          group by 1
        )
        select coalesce(dep.grp, '(sans groupe)') as grp,
               count(*)::int as deputies,
               coalesce(sum(q.n), 0)::int as n
        from dep left join q using (official_id)
        group by 1`,
  );
  return r.map((x) => ({ group: x.grp, deputies: x.deputies, count: x.n }));
}

export async function loadDeputiesAge(db: Db): Promise<AgeRow> {
  const r = await rows<{
    n: number;
    mean: number;
    median: number;
    min: number;
    max: number;
  }>(
    db,
    sql`with dep as (
          select distinct on (m.official_id)
                 extract(year from age(current_date, o.birth_date))::int as age
          from mandates m join officials o on o.id = m.official_id
          where m.type = 'depute' and m.end_date is null and o.birth_date is not null
        )
        select count(*)::int as n,
               avg(age)::float8 as mean,
               (percentile_cont(0.5) within group (order by age))::float8 as median,
               min(age)::int as min,
               max(age)::int as max
        from dep`,
  );
  return r[0]!;
}
