import { parseArgs } from 'node:util';
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { formatReviewRow, listShorts, reviewShort } from './review.js';
import { DEFAULT_OUTPUT_DIR } from './voiceover.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    status: { type: 'string', default: 'draft' },
    note: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const [command, shortId] = positionals;

if (
  values.help ||
  !['list', 'approve', 'reject', undefined].includes(command)
) {
  console.log(
    [
      'Usage:',
      '  yarn --cwd packages/shorts review [list] [--status draft|approved|published|rejected|candidate|all]',
      '  yarn --cwd packages/shorts review approve <id> [--note "…"]',
      '  yarn --cwd packages/shorts review reject <id> --note "…"',
      '',
      'La revue est le seul gate manuel : relire le script, écouter la voix off,',
      'regarder la vidéo dans le dossier de sortie, puis approuver (publiable) ou',
      'rejeter. Pour corriger : script/voiceover/render avec --id <id> --force.',
    ].join('\n'),
  );
  process.exit(values.help ? 0 : 1);
}

const db = createDb();
const outputDir = process.env.SHORTS_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;

async function main(): Promise<void> {
  if (command === undefined || command === 'list') {
    const statuses =
      values.status === 'all'
        ? ['candidate', 'draft', 'approved', 'published', 'rejected']
        : values.status.split(',');
    const rows = await listShorts(db, statuses);
    if (rows.length === 0) {
      console.log(`Aucun short au statut ${statuses.join(', ')}.`);
      return;
    }
    console.log(rows.map((r) => formatReviewRow(r, outputDir)).join('\n\n'));
    return;
  }
  if (!shortId) throw new Error(`${command} attend l'identifiant d'un short`);
  if (command === 'reject' && !values.note) {
    throw new Error('reject attend --note (motif, conservé dans notes)');
  }
  await reviewShort(db, {
    shortId,
    decision: command === 'approve' ? 'approved' : 'rejected',
    note: values.note,
  });
  logger.info(
    `short ${shortId} : ${command === 'approve' ? 'approuvé, publiable' : 'rejeté'}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(String(error));
    process.exit(1);
  });
