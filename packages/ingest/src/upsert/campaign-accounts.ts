import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { sql, inArray, eq } from 'drizzle-orm';
import { officials, mandates, campaignAccounts } from '@elupedia/shared';
import type { CnccfpRow, CnccfpElection } from '../sources/cnccfp.js';
import { logger } from '../logger.js';

const BATCH_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface OfficialLookup {
  officialId: string;
  firstName: string;
  lastName: string;
  departments: string[];
  districts: string[];
}

function extractCirconscriptionNumber(s: string): string | null {
  const m = s.match(/(\d+)/);
  return m ? m[1] : null;
}

async function buildLookup(db: NeonHttpDatabase): Promise<OfficialLookup[]> {
  const rows = await db
    .select({
      officialId: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      department: mandates.department,
      district: mandates.district,
    })
    .from(officials)
    .innerJoin(mandates, eq(mandates.officialId, officials.id));

  const map = new Map<string, OfficialLookup>();
  for (const r of rows) {
    let entry = map.get(r.officialId);
    if (!entry) {
      entry = {
        officialId: r.officialId,
        firstName: r.firstName,
        lastName: r.lastName,
        departments: [],
        districts: [],
      };
      map.set(r.officialId, entry);
    }
    if (r.department && !entry.departments.includes(r.department)) {
      entry.departments.push(r.department);
    }
    if (r.district && !entry.districts.includes(r.district)) {
      entry.districts.push(r.district);
    }
  }
  return [...map.values()];
}

function matchOfficial(
  row: CnccfpRow,
  lookup: OfficialLookup[],
): string | null {
  const normLast = normalize(row.lastName);
  const normFirst = normalize(row.firstName);
  const normDept = normalize(row.department);

  const candidates = lookup.filter(
    (o) =>
      normalize(o.lastName) === normLast &&
      normalize(o.firstName) === normFirst,
  );

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].officialId;

  const withDept = candidates.filter((o) =>
    o.departments.some((d) => normalize(d) === normDept),
  );
  if (withDept.length === 1) return withDept[0].officialId;

  if (withDept.length > 1 && row.constituency) {
    const circNum = extractCirconscriptionNumber(row.constituency);
    if (circNum) {
      const withCirc = withDept.filter((o) =>
        o.districts.some((d) => extractCirconscriptionNumber(d) === circNum),
      );
      if (withCirc.length === 1) return withCirc[0].officialId;
    }
  }

  logger.warn(
    `[CNCCFP] Ambiguous match for ${row.candidateName} (${row.department}, ${row.constituency}): ${(withDept.length > 0 ? withDept : candidates).length} candidates`,
  );
  return null;
}

export async function upsertCampaignAccounts(
  db: NeonHttpDatabase,
  rows: CnccfpRow[],
  election: CnccfpElection,
): Promise<{ created: number; updated: number; skipped: number }> {
  const lookup = await buildLookup(db);
  let created = 0;
  let updated = 0;
  const skipped = 0;

  for (const batch of chunk(rows, BATCH_SIZE)) {
    const batchIds = batch.map((r) => r.cnccfpId);
    const preExisting = await db
      .select({ cnccfpId: campaignAccounts.cnccfpId })
      .from(campaignAccounts)
      .where(inArray(campaignAccounts.cnccfpId, batchIds));
    const preExistingIds = new Set(preExisting.map((r) => r.cnccfpId));

    const values = batch.map((row) => ({
      cnccfpId: row.cnccfpId,
      officialId: matchOfficial(row, lookup),
      candidateName: row.candidateName,
      electionType: election.id,
      electionDate: election.date,
      constituency: row.constituency || null,
      department: row.department || null,
      departmentCode: row.departmentCode || null,
      politicalLabel: row.politicalLabel,
      expensesDeclared: row.expensesDeclared,
      expensesRetained: row.expensesRetained,
      revenueDeclared: row.revenueDeclared,
      revenueRetained: row.revenueRetained,
      donationsDeclared: row.donationsDeclared,
      donationsRetained: row.donationsRetained,
      personalContributionDeclared: row.personalContributionDeclared,
      personalContributionRetained: row.personalContributionRetained,
      partyContributionsDeclared: row.partyContributionsDeclared,
      partyContributionsRetained: row.partyContributionsRetained,
      reimbursement: row.reimbursement,
      decision: row.decision,
    }));

    await db
      .insert(campaignAccounts)
      .values(values)
      .onConflictDoUpdate({
        target: campaignAccounts.cnccfpId,
        set: {
          officialId: sql`excluded.official_id`,
          candidateName: sql`excluded.candidate_name`,
          electionType: sql`excluded.election_type`,
          electionDate: sql`excluded.election_date`,
          constituency: sql`excluded.constituency`,
          department: sql`excluded.department`,
          departmentCode: sql`excluded.department_code`,
          politicalLabel: sql`excluded.political_label`,
          expensesDeclared: sql`excluded.expenses_declared`,
          expensesRetained: sql`excluded.expenses_retained`,
          revenueDeclared: sql`excluded.revenue_declared`,
          revenueRetained: sql`excluded.revenue_retained`,
          donationsDeclared: sql`excluded.donations_declared`,
          donationsRetained: sql`excluded.donations_retained`,
          personalContributionDeclared: sql`excluded.personal_contribution_declared`,
          personalContributionRetained: sql`excluded.personal_contribution_retained`,
          partyContributionsDeclared: sql`excluded.party_contributions_declared`,
          partyContributionsRetained: sql`excluded.party_contributions_retained`,
          reimbursement: sql`excluded.reimbursement`,
          decision: sql`excluded.decision`,
          updatedAt: new Date(),
        },
      });

    for (const row of batch) {
      if (preExistingIds.has(row.cnccfpId)) {
        updated++;
      } else {
        created++;
      }
    }
  }

  logger.info(
    `[CNCCFP] ${election.id}: ${created} created, ${updated} updated, ${skipped} skipped`,
  );
  return { created, updated, skipped };
}
