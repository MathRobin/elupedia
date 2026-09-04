/**
 * Script temporaire — backfill des mandats historiques de maires
 * via les snapshots Wayback Machine du RNE.
 *
 * Usage: npx tsx packages/ingest/src/backfill-mayor-history.ts
 */
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, officials, mandates } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import { parseCsvRow, type RneMaire } from './sources/rne-maires.js';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, '../../../.env') });

const RNE_RESOURCE_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503';

const WAYBACK_TIMESTAMPS = [
  '20190801',
  '20200201',
  '20200801',
  '20210201',
  '20210801',
  '20220201',
  '20220801',
  '20230201',
  '20230801',
  '20240201',
  '20240801',
  '20250201',
  '20250801',
  '20260201',
];

interface Snapshot {
  date: string;
  mayors: Map<string, RneMaire>;
}

function waybackUrl(timestamp: string): string {
  return `https://web.archive.org/web/${timestamp}000000id_/${RNE_RESOURCE_URL}`;
}

async function fetchSnapshot(
  timestamp: string,
): Promise<Map<string, RneMaire> | null> {
  const url = waybackUrl(timestamp);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'Accept-Encoding': 'gzip, deflate' },
    });
    if (!res.ok) {
      logger.warn(`  ${timestamp}: HTTP ${res.status} — skipped`);
      return null;
    }
    const text = await res.text();
    const lines = text.split('\n');
    const mayors = new Map<string, RneMaire>();
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const maire = parseCsvRow(line);
      if (maire) {
        mayors.set(maire.communeCode, maire);
      }
    }
    logger.info(`  ${timestamp}: ${mayors.size} maires`);
    return mayors;
  } catch (e) {
    logger.warn(
      `  ${timestamp}: ${e instanceof Error ? e.message : String(e)} — skipped`,
    );
    return null;
  }
}

function maireKey(m: RneMaire): string {
  return `${m.firstName.toLowerCase()}|${m.lastName.toLowerCase()}|${m.birthDate}`;
}

async function run() {
  logger.info('=== Backfill mayor history from Wayback Machine ===\n');

  logger.info('Fetching snapshots...');
  const snapshots: Snapshot[] = [];

  for (const ts of WAYBACK_TIMESTAMPS) {
    const mayors = await fetchSnapshot(ts);
    if (mayors && mayors.size > 1000) {
      const date = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
      snapshots.push({ date, mayors });
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  logger.info(`\n${snapshots.length} valid snapshots loaded\n`);

  if (snapshots.length < 2) {
    logger.info('Not enough snapshots to diff — aborting.');
    return;
  }

  const db = createDb();

  const allOfficials = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      birthDate: officials.birthDate,
    })
    .from(officials);

  const officialByKey = new Map<string, string>();
  for (const o of allOfficials) {
    const key = `${o.firstName.toLowerCase()}|${o.lastName.toLowerCase()}|${o.birthDate ?? ''}`;
    officialByKey.set(key, o.id);
  }

  logger.info(`${officialByKey.size} officials loaded for matching\n`);

  const summary = { ended: 0, skipped: 0 };

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    let changes = 0;

    logger.info(`Diffing ${prev.date} → ${curr.date}...`);

    for (const [communeCode, prevMaire] of prev.mayors) {
      const currMaire = curr.mayors.get(communeCode);
      if (!currMaire) continue;

      if (maireKey(prevMaire) === maireKey(currMaire)) continue;

      changes++;

      const prevOfficialId = officialByKey.get(maireKey(prevMaire));
      if (!prevOfficialId) continue;

      const existing = await db
        .select({ id: mandates.id, endDate: mandates.endDate })
        .from(mandates)
        .where(
          and(
            eq(mandates.officialId, prevOfficialId),
            eq(mandates.type, 'maire'),
            eq(mandates.communeCode, communeCode),
          ),
        )
        .limit(1);

      if (existing.length > 0 && !existing[0].endDate) {
        const endDate =
          currMaire.mandateStartDate ||
          currMaire.functionStartDate ||
          curr.date;
        await db
          .update(mandates)
          .set({ endDate, updatedAt: new Date() })
          .where(eq(mandates.id, existing[0].id));
        summary.ended++;
      } else {
        summary.skipped++;
      }
    }

    logger.info(
      `  ${changes} mayor changes detected, ${summary.ended} mandates ended so far`,
    );
  }

  logger.info(
    `\n=== Done: ${summary.ended} mandates ended, ${summary.skipped} skipped ===`,
  );
}

run().catch((e) => {
  logger.error(`Backfill failed: ${e}`);
  process.exit(1);
});
