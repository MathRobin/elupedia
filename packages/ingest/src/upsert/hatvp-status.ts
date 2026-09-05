import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates, interests } from '@elupedia/shared';
import { eq, isNull, sql, inArray, and } from 'drizzle-orm';

import { logger } from '../logger.js';
import { checkHatvpStatus } from '../sources/hatvp-status.js';

const DELAY_MS = 1500;
const COMMUNES_20K_URL =
  'https://www.insee.fr/fr/statistiques/fichier/8680726/ensemble.zip';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchCommunesOver20k(
  fetchFn: typeof fetch = fetch,
): Promise<Set<string>> {
  const { default: unzipper } = await import('unzipper');

  const response = await fetchFn(COMMUNES_20K_URL);
  if (!response.ok)
    throw new Error(`INSEE download failed: ${response.status}`);

  const codes = new Set<string>();

  const directory = await unzipper.Open.buffer(
    Buffer.from(await response.arrayBuffer()),
  );
  const communesFile = directory.files.find((f) =>
    f.path.includes('donnees_communes'),
  );
  if (!communesFile) throw new Error('donnees_communes.csv not found in ZIP');

  const content = (await communesFile.buffer()).toString('utf-8');
  const lines = content.split('\n');

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    const code = cols[6]; // COM column
    const pop = parseInt(cols[8], 10); // PMUN column
    if (code && pop >= 20000) {
      codes.add(code);
    }
  }

  logger.info(`INSEE: ${codes.size} communes with 20k+ population`);
  return codes;
}

interface OfficialToCheck {
  id: string;
  firstName: string;
  lastName: string;
}

export async function upsertHatvpStatuses(
  db: NeonHttpDatabase,
  fetchFn: typeof fetch = fetch,
) {
  const summary = { checked: 0, pending: 0, skipped: 0 };

  const bigCommuneCodes = await fetchCommunesOver20k(fetchFn);

  const officialsWithInterests = await db
    .selectDistinct({ officialId: interests.officialId })
    .from(interests);
  const hasInterests = new Set(officialsWithInterests.map((r) => r.officialId));

  const parlementaires = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
    })
    .from(officials)
    .innerJoin(mandates, eq(mandates.officialId, officials.id))
    .where(
      and(
        isNull(mandates.endDate),
        inArray(mandates.type, ['depute', 'senateur']),
      ),
    );

  const maires = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      communeCode: mandates.communeCode,
    })
    .from(officials)
    .innerJoin(mandates, eq(mandates.officialId, officials.id))
    .where(and(isNull(mandates.endDate), eq(mandates.type, 'maire')));

  const bigMaires = maires.filter(
    (m) => m.communeCode && bigCommuneCodes.has(m.communeCode),
  );

  logger.info(
    `Candidates: ${parlementaires.length} parlementaires + ${bigMaires.length} maires (communes >20k)`,
  );

  const seen = new Set<string>();
  const toCheck: OfficialToCheck[] = [];

  for (const o of [...parlementaires, ...bigMaires]) {
    if (seen.has(o.id) || hasInterests.has(o.id)) continue;
    seen.add(o.id);
    toCheck.push({ id: o.id, firstName: o.firstName, lastName: o.lastName });
  }

  logger.info(
    `${toCheck.length} officials without published interests to check`,
  );

  for (let i = 0; i < toCheck.length; i++) {
    const o = toCheck[i];
    logger.info(`  [${i + 1}/${toCheck.length}] ${o.firstName} ${o.lastName}`);

    try {
      const status = await checkHatvpStatus(o.firstName, o.lastName, fetchFn);

      if (status === 'pending') {
        await db
          .update(officials)
          .set({ hatvpStatus: 'pending', updatedAt: new Date() })
          .where(eq(officials.id, o.id));
        summary.pending++;
        logger.info(`    → pending (déposée, publication à venir)`);
      } else {
        summary.skipped++;
      }
      summary.checked++;
    } catch (err) {
      logger.warn(
        `    → error: ${err instanceof Error ? err.message : String(err)}`,
      );
      summary.skipped++;
    }

    if (i < toCheck.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Clear pending status for officials who now have published interests
  await db
    .update(officials)
    .set({ hatvpStatus: null, updatedAt: new Date() })
    .where(
      and(
        eq(officials.hatvpStatus, 'pending'),
        sql`${officials.id} IN (SELECT DISTINCT official_id FROM interests)`,
      ),
    );

  logger.info(
    `HATVP status: ${summary.checked} checked, ${summary.pending} pending, ${summary.skipped} skipped`,
  );
  return summary;
}
