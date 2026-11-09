/**
 * Outil de maintenance : revérifie les rattachements existants des
 * décorations aux élus (`decorations.official_id`) avec les règles de
 * `decoration-match.ts` et détache ceux qui ne sont pas confirmés par une
 * date de naissance identique. Les fiches décorées restent en base, sans
 * official ; relancer `ingest:decorations` ne recrée que les rattachements
 * vérifiés.
 *
 * Usage : yarn --cwd packages/ingest reconcile:decorations [options]
 *   (sans option)      dry-run : rapport, rien n'est écrit
 *   --apply            détache les rattachements rejetés ou non confirmés
 *   --backup <fichier> sauvegarde JSON des rattachements détachés
 *                      (défaut : decorations-detached-<date>.json)
 *   --restore <fichier> rétablit les rattachements d'une sauvegarde
 *
 * Écriture : `decorations.official_id` seulement, par paquets de 500 id.
 * Piège : la sauvegarde est écrite avant la première modification ; un
 * rattachement rétabli par `--restore` n'est pas revérifié.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { createDb, decorations, mandates, officials } from '@elupedia/shared';
import {
  POLITICAL_QUALITY,
  classifyDecorationMatch,
  type DecorationMatch,
} from './decoration-match.js';
import { logger } from './logger.js';

const CHUNK = 500;

const { values } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    backup: { type: 'string' },
    restore: { type: 'string' },
  },
});

const iso = (d: string | Date | null): string | null =>
  d ? new Date(d).toISOString().slice(0, 10) : null;

async function main() {
  const db = createDb();

  if (values.restore) {
    const saved = JSON.parse(readFileSync(values.restore, 'utf8')) as {
      id: string;
      officialId: string;
    }[];
    for (const row of saved) {
      await db
        .update(decorations)
        .set({ officialId: row.officialId })
        .where(eq(decorations.id, row.id));
    }
    logger.info(`${saved.length} rattachements rétablis`);
    return;
  }

  const activeIds = new Set(
    (
      await db
        .select({ id: mandates.officialId })
        .from(mandates)
        .where(isNull(mandates.endDate))
    ).map((r) => r.id),
  );

  const rows = await db
    .select({
      id: decorations.id,
      officialId: decorations.officialId,
      decorationBirth: decorations.birthDate,
      decorationDeath: decorations.deathDate,
      decreeDate: decorations.decreeDate,
      quality: decorations.quality,
      officialBirth: officials.birthDate,
      officialDeath: officials.deathDate,
    })
    .from(decorations)
    .innerJoin(officials, eq(officials.id, decorations.officialId));

  const counts: Record<DecorationMatch, number> = {
    verified: 0,
    rejected: 0,
    unverified: 0,
  };
  let politicalLeads = 0;
  const detach: { id: string; officialId: string }[] = [];

  for (const r of rows) {
    const verdict = classifyDecorationMatch({
      officialBirth: iso(r.officialBirth),
      officialDeath: iso(r.officialDeath),
      officialActive: activeIds.has(r.officialId!),
      decorationBirth: iso(r.decorationBirth),
      decorationDeath: iso(r.decorationDeath),
      decreeDate: iso(r.decreeDate),
    });
    counts[verdict]++;
    if (verdict !== 'verified') {
      detach.push({ id: r.id, officialId: r.officialId! });
      if (verdict === 'unverified' && POLITICAL_QUALITY.test(r.quality ?? '')) {
        politicalLeads++;
      }
    }
  }

  logger.info(
    `${rows.length} décorations rattachées : ${counts.verified} vérifiées (date de naissance identique), ${counts.rejected} rejetées, ${counts.unverified} non confirmables ; dont ${politicalLeads} non confirmables à qualité politique (à examiner à la main)`,
  );

  if (!values.apply) {
    logger.info(`Dry-run : ${detach.length} rattachements seraient détachés`);
    return;
  }

  const backup =
    values.backup ??
    `decorations-detached-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(backup, JSON.stringify(detach));
  logger.info(`Sauvegarde : ${backup} (${detach.length} lignes)`);

  for (let i = 0; i < detach.length; i += CHUNK) {
    const ids = detach.slice(i, i + CHUNK).map((d) => d.id);
    await db
      .update(decorations)
      .set({ officialId: null })
      .where(and(inArray(decorations.id, ids)));
  }
  logger.info(`${detach.length} rattachements détachés`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`Reconcile decorations failed: ${error}`);
    process.exit(1);
  });
