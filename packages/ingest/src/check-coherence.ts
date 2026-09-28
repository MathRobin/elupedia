import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { logger } from './logger.js';

/**
 * Contrôles de cohérence « métier » sur des données déjà en base, au-delà de
 * ce que les contraintes SQL peuvent vérifier (chevauchements de dates,
 * rapprochements incohérents entre tables ingérées séparément, etc.).
 *
 * Purement diagnostique : aucune requête ici n'écrit en base. Chaque contrôle
 * est une requête ensembliste unique plutôt qu'une boucle ligne à ligne, les
 * tables concernées comptant des dizaines de milliers de lignes.
 *
 * Les plages de dates utilisent la borne '[)' (début inclus, fin exclue) :
 * end_date est la date à laquelle le mandat suivant commence, pas le
 * dernier jour du mandat courant. Deux mandats consécutifs qui se touchent
 * exactement à cette date (fin de l'un = début de l'autre) ne doivent donc
 * pas remonter comme un chevauchement.
 */

const SAMPLE_LIMIT = 200;

export interface CoherenceCheckResult {
  key: string;
  description: string;
  count: number;
  truncated: boolean;
  samples: string[];
}

export interface CoherenceReport {
  results: CoherenceCheckResult[];
  totalIssues: number;
}

interface CheckDefinition<Row> {
  key: string;
  description: string;
  query: ReturnType<typeof sql>;
  format: (row: Row) => string;
}

async function runCheck(
  db: NeonHttpDatabase,
  // Chaque définition est cohérente en interne (query/format sur le même
  // Row) ; ce paramètre n'a besoin d'être générique que pour ce couplage
  // local, pas pour l'itération ci-dessous sur des types hétérogènes.
  def: CheckDefinition<never>,
): Promise<CoherenceCheckResult> {
  const { rows } = (await db.execute(def.query)) as unknown as {
    rows: never[];
  };

  return {
    key: def.key,
    description: def.description,
    count: rows.length,
    truncated: rows.length === SAMPLE_LIMIT,
    samples: rows.map(def.format),
  };
}

interface OverlappingMandateRow {
  official_id: string;
  first_name: string;
  last_name: string;
  type: string;
  start_a: string;
  end_a: string | null;
  start_b: string;
  end_b: string | null;
}

interface MandateChronologyRow {
  official_id: string;
  first_name: string;
  last_name: string;
  type: string;
  start_date: string;
  end_date: string;
}

interface ActiveMandateAfterDeathRow {
  official_id: string;
  first_name: string;
  last_name: string;
  death_date: string;
  type: string;
  end_date: string | null;
}

interface CommuneConflictRow {
  commune_code: string;
  first_a: string;
  last_a: string;
  first_b: string;
  last_b: string;
}

interface SponsorshipWithoutMandateRow {
  official_id: string;
  first_name: string;
  last_name: string;
  type: string;
  election_year: number;
  publication_date: string;
}

interface SponsorshipDepartmentMismatchRow {
  official_id: string;
  first_name: string;
  last_name: string;
  raw_department: string;
  mandate_department: string;
  publication_date: string;
}

interface DecorationOutsideLifetimeRow {
  official_id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  death_date: string | null;
  order_name: string;
  decree_date: string;
}

const checks: {
  overlappingMandates: CheckDefinition<OverlappingMandateRow>;
  mandateChronology: CheckDefinition<MandateChronologyRow>;
  activeMandateAfterDeath: CheckDefinition<ActiveMandateAfterDeathRow>;
  communeConflict: CheckDefinition<CommuneConflictRow>;
  sponsorshipWithoutMandate: CheckDefinition<SponsorshipWithoutMandateRow>;
  sponsorshipDepartmentMismatch: CheckDefinition<SponsorshipDepartmentMismatchRow>;
  decorationOutsideLifetime: CheckDefinition<DecorationOutsideLifetimeRow>;
} = {
  overlappingMandates: {
    key: 'overlapping_mandates',
    description:
      'Deux mandats de même type pour le même élu avec des dates qui se recoupent',
    query: sql`
      select
        m1.official_id,
        o.first_name,
        o.last_name,
        m1.type,
        m1.start_date as start_a,
        m1.end_date as end_a,
        m2.start_date as start_b,
        m2.end_date as end_b
      from mandates m1
      join mandates m2
        on m2.official_id = m1.official_id
        and m2.type = m1.type
        and m2.id > m1.id
      join officials o on o.id = m1.official_id
      where daterange(m1.start_date, coalesce(m1.end_date, 'infinity'::date), '[)')
         && daterange(m2.start_date, coalesce(m2.end_date, 'infinity'::date), '[)')
      order by m1.official_id
      limit ${SAMPLE_LIMIT}
    `,
    format: (r) =>
      `${r.first_name} ${r.last_name} (${r.type}) : ${r.start_a} → ${r.end_a ?? 'en cours'} et ${r.start_b} → ${r.end_b ?? 'en cours'}`,
  },

  mandateChronology: {
    key: 'mandate_chronology',
    description: 'Mandat dont la date de fin précède ou égale la date de début',
    query: sql`
      select m.official_id, o.first_name, o.last_name, m.type, m.start_date, m.end_date
      from mandates m
      join officials o on o.id = m.official_id
      where m.end_date is not null and m.end_date <= m.start_date
      limit ${SAMPLE_LIMIT}
    `,
    format: (r) =>
      `${r.first_name} ${r.last_name} (${r.type}) : fin ${r.end_date} ${r.end_date === r.start_date ? '= début (plage vide)' : 'avant début'} ${r.start_date}`,
  },

  activeMandateAfterDeath: {
    key: 'active_mandate_after_death',
    description: "Mandat encore actif après la date de décès de l'élu",
    query: sql`
      select m.official_id, o.first_name, o.last_name, o.death_date, m.type, m.end_date
      from mandates m
      join officials o on o.id = m.official_id
      where o.death_date is not null
        and (m.end_date is null or m.end_date > o.death_date)
      limit ${SAMPLE_LIMIT}
    `,
    format: (r) =>
      `${r.first_name} ${r.last_name} (${r.type}) : décès le ${r.death_date}, mandat ${r.end_date ? `clos le ${r.end_date}` : 'toujours actif'}`,
  },

  communeConflict: {
    key: 'commune_conflict',
    description:
      'Deux élus différents avec un mandat de maire actif sur la même commune',
    query: sql`
      select
        m1.commune_code,
        oa.first_name as first_a,
        oa.last_name as last_a,
        ob.first_name as first_b,
        ob.last_name as last_b
      from mandates m1
      join mandates m2
        on m2.commune_code = m1.commune_code
        and m2.official_id <> m1.official_id
        and m2.id > m1.id
      join officials oa on oa.id = m1.official_id
      join officials ob on ob.id = m2.official_id
      where m1.type = 'maire' and m2.type = 'maire'
        and m1.end_date is null and m2.end_date is null
        and m1.commune_code is not null
      limit ${SAMPLE_LIMIT}
    `,
    format: (r) =>
      `Commune ${r.commune_code} : ${r.first_a} ${r.last_a} et ${r.first_b} ${r.last_b} tous deux maires actifs`,
  },

  sponsorshipWithoutMandate: {
    key: 'sponsorship_without_mandate',
    description:
      "Parrainage rapproché d'un élu qui ne tenait aucun mandat à la date de publication",
    query: sql`
      select s.official_id, o.first_name, o.last_name, s.type, s.election_year, s.publication_date
      from sponsorships s
      join officials o on o.id = s.official_id
      where s.matched = true
        and s.official_id is not null
        and s.publication_date is not null
        and not exists (
          select 1 from mandates m
          where m.official_id = s.official_id
            and daterange(m.start_date, coalesce(m.end_date, 'infinity'::date), '[)') @> s.publication_date
        )
      limit ${SAMPLE_LIMIT}
    `,
    format: (r) =>
      `${r.first_name} ${r.last_name} : parrainage ${r.type} ${r.election_year} le ${r.publication_date}, aucun mandat à cette date`,
  },

  sponsorshipDepartmentMismatch: {
    key: 'sponsorship_department_mismatch',
    description:
      'Parrainage rapproché dont le département déclaré ne correspond pas au mandat actif',
    query: sql`
      select
        s.official_id,
        o.first_name,
        o.last_name,
        s.raw_department,
        m.department as mandate_department,
        s.publication_date
      from sponsorships s
      join officials o on o.id = s.official_id
      join lateral (
        select m.department
        from mandates m
        where m.official_id = s.official_id
          and daterange(m.start_date, coalesce(m.end_date, 'infinity'::date), '[)') @> s.publication_date
        order by m.start_date desc
        limit 1
      ) m on true
      where s.matched = true
        and s.raw_department is not null
        and m.department is not null
        and lower(m.department) <> lower(s.raw_department)
      limit ${SAMPLE_LIMIT}
    `,
    format: (r) =>
      `${r.first_name} ${r.last_name} : parrainage déclaré "${r.raw_department}" vs mandat "${r.mandate_department}" (${r.publication_date})`,
  },

  decorationOutsideLifetime: {
    key: 'decoration_outside_lifetime',
    description: 'Décoration décrétée avant la naissance ou après le décès',
    query: sql`
      select
        d.official_id,
        o.first_name,
        o.last_name,
        o.birth_date,
        o.death_date,
        d.order_name,
        d.decree_date
      from decorations d
      join officials o on o.id = d.official_id
      where d.decree_date is not null
        and (
          (o.birth_date is not null and d.decree_date < o.birth_date)
          or (o.death_date is not null and d.decree_date > o.death_date)
        )
      limit ${SAMPLE_LIMIT}
    `,
    format: (r) =>
      `${r.first_name} ${r.last_name} : ${r.order_name} décrétée le ${r.decree_date} (naissance ${r.birth_date ?? '?'}, décès ${r.death_date ?? '?'})`,
  },
};

export async function checkCoherence(
  db: NeonHttpDatabase,
): Promise<CoherenceReport> {
  const results = await Promise.all(
    Object.values(checks).map((def) => runCheck(db, def)),
  );

  return {
    results,
    totalIssues: results.reduce((sum, r) => sum + r.count, 0),
  };
}

export function printCoherenceReport(
  report: CoherenceReport,
  log: Pick<typeof logger, 'info' | 'warn'> = logger,
): void {
  log.info('=== Contrôle de cohérence ===\n');

  for (const result of report.results) {
    if (result.count === 0) {
      log.info(`✓ ${result.description} : aucun cas`);
      continue;
    }

    log.warn(
      `✗ ${result.description} : ${result.count}${result.truncated ? '+' : ''} cas`,
    );
    for (const sample of result.samples.slice(0, 10)) {
      log.warn(`    - ${sample}`);
    }
    if (result.samples.length > 10) {
      log.warn(`    … et ${result.samples.length - 10} de plus`);
    }
  }

  log.info(`\nTotal : ${report.totalIssues} incohérence(s) détectée(s)`);
}
