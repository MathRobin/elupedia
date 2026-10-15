/**
 * Upsert des comptes de campagne publiés par la CNCCFP (une ligne par
 * candidat et par élection), avec rattachement optionnel à un official.
 * Données issues de `sources/cnccfp.ts`, appelé par `run.ts` pour chaque
 * élection de CNCCFP_ELECTIONS.
 *
 * Table écrite : `campaign_accounts`, clé `cnccfp_id` (unique).
 * Idempotent : ON CONFLICT DO UPDATE réécrit tous les champs, y compris
 * `official_id` — le rattachement est donc recalculé à chaque run (un
 * official créé depuis le dernier run peut être rattaché a posteriori, et
 * inversement un rattachement peut redevenir NULL).
 * Rattachement : par nom + prénom normalisés (sans accents ni ponctuation),
 * départagé si besoin par le département puis le numéro de circonscription
 * des mandats de l'official ; en cas d'ambiguïté persistante, `official_id`
 * reste NULL et un warn est loggé.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { sql, inArray, eq } from 'drizzle-orm';
import { officials, mandates, campaignAccounts } from '@elupedia/shared';
import type { CnccfpRow, CnccfpElection } from '../sources/cnccfp.js';
import { logger } from '../logger.js';

const BATCH_SIZE = 200;
// Un log de progression toutes les N itérations de lot.
const PROGRESS_LOG_EVERY_BATCHES = 10;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Normalisation agressive pour comparer des noms de sources différentes :
// accents retirés, tout ce qui n'est pas une lettre devient un espace.
function normalize(text: string): string {
  return text
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
  /** Départements de tous les mandats de l'official (actifs ou non). */
  departments: string[];
  /** Circonscriptions (`mandates.district`) de tous ses mandats. */
  districts: string[];
}

// "3ème circonscription", "Circonscription 3", "03" -> "3" (premier nombre
// trouvé), pour comparer des libellés de circonscription hétérogènes.
function extractCirconscriptionNumber(label: string): string | null {
  const match = label.match(/(\d+)/);
  return match ? match[1] : null;
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

  const lookupByOfficialId = new Map<string, OfficialLookup>();
  for (const row of rows) {
    let entry = lookupByOfficialId.get(row.officialId);
    if (!entry) {
      entry = {
        officialId: row.officialId,
        firstName: row.firstName,
        lastName: row.lastName,
        departments: [],
        districts: [],
      };
      lookupByOfficialId.set(row.officialId, entry);
    }
    if (row.department && !entry.departments.includes(row.department)) {
      entry.departments.push(row.department);
    }
    if (row.district && !entry.districts.includes(row.district)) {
      entry.districts.push(row.district);
    }
  }
  return [...lookupByOfficialId.values()];
}

// Rattachement nom/prénom -> département -> n° de circonscription. Retourne
// null dès qu'un niveau ne permet pas d'isoler un seul candidat.
function matchOfficial(
  row: CnccfpRow,
  lookup: OfficialLookup[],
): string | null {
  const normalizedLastName = normalize(row.lastName);
  const normalizedFirstName = normalize(row.firstName);
  const normalizedDepartment = normalize(row.department);

  const candidates = lookup.filter(
    (official) =>
      normalize(official.lastName) === normalizedLastName &&
      normalize(official.firstName) === normalizedFirstName,
  );

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].officialId;

  const withDepartment = candidates.filter((official) =>
    official.departments.some(
      (department) => normalize(department) === normalizedDepartment,
    ),
  );
  if (withDepartment.length === 1) return withDepartment[0].officialId;

  if (withDepartment.length > 1 && row.constituency) {
    const circonscriptionNumber = extractCirconscriptionNumber(
      row.constituency,
    );
    if (circonscriptionNumber) {
      const withCirconscription = withDepartment.filter((official) =>
        official.districts.some(
          (district) =>
            extractCirconscriptionNumber(district) === circonscriptionNumber,
        ),
      );
      if (withCirconscription.length === 1) {
        return withCirconscription[0].officialId;
      }
    }
  }

  logger.warn(
    `[CNCCFP] Ambiguous match for ${row.candidateName} (${row.department}, ${row.constituency}): ${(withDepartment.length > 0 ? withDepartment : candidates).length} candidates`,
  );
  return null;
}

/**
 * Upsert en base des comptes de campagne d'une élection (écriture DB).
 * `skipped` est toujours 0 : conservé pour la forme du résumé attendue par
 * `run.ts`.
 */
export async function upsertCampaignAccounts(
  db: NeonHttpDatabase,
  rows: CnccfpRow[],
  election: CnccfpElection,
): Promise<{ created: number; updated: number; skipped: number }> {
  const lookup = await buildLookup(db);
  let created = 0;
  let updated = 0;
  const skipped = 0;

  const batches = chunk(rows, BATCH_SIZE);
  logger.info(`[CNCCFP] ${election.id}: ${rows.length} rows to process`);

  for (const [batchIndex, batch] of batches.entries()) {
    const batchNum = batchIndex + 1;
    if (
      batchNum % PROGRESS_LOG_EVERY_BATCHES === 1 ||
      batchNum === batches.length
    ) {
      logger.info(`  [CNCCFP] batch ${batchNum}/${batches.length}`);
    }

    // Lu avant l'upsert uniquement pour distinguer créations et mises à
    // jour dans les compteurs.
    const batchIds = batch.map((row) => row.cnccfpId);
    const preExisting = await db
      .select({ cnccfpId: campaignAccounts.cnccfpId })
      .from(campaignAccounts)
      .where(inArray(campaignAccounts.cnccfpId, batchIds));
    const preExistingIds = new Set(preExisting.map((row) => row.cnccfpId));

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

    try {
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
    } catch (error) {
      logger.error(
        `  [CNCCFP] batch ${batchNum}/${batches.length} failed (cnccfp_id: ${batchIds.join(', ')}): ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

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
