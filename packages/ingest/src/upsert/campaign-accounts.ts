import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates, campaignAccounts } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { CnccfpRow, CnccfpElection } from '../sources/cnccfp.js';
import { logger } from '../logger.js';

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

  for (const row of rows) {
    const officialId = matchOfficial(row, lookup);

    const existing = await db
      .select({ id: campaignAccounts.id })
      .from(campaignAccounts)
      .where(eq(campaignAccounts.cnccfpId, row.cnccfpId))
      .limit(1);

    const values = {
      officialId,
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
      updatedAt: new Date(),
    };

    if (existing.length > 0) {
      await db
        .update(campaignAccounts)
        .set(values)
        .where(eq(campaignAccounts.id, existing[0].id));
      updated++;
    } else {
      await db.insert(campaignAccounts).values({
        cnccfpId: row.cnccfpId,
        ...values,
      });
      created++;
    }
  }

  logger.info(
    `[CNCCFP] ${election.id}: ${created} created, ${updated} updated, ${skipped} skipped`,
  );
  return { created, updated, skipped };
}
