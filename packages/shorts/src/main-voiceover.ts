import { parseArgs } from 'node:util';
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import {
  DEFAULT_OUTPUT_DIR,
  importRecordings,
  loadReadingTargets,
  storeVoiceover,
  writeReadingSheet,
  type SheetTarget,
} from './voiceover.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: 'string' },
    from: { type: 'string' },
    out: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});
const [command] = positionals;

if (values.help || !['sheet', 'import'].includes(command ?? '')) {
  console.log(
    [
      'Usage:',
      '  yarn --cwd packages/shorts voiceover sheet [--id <uuid>]',
      '  yarn --cwd packages/shorts voiceover import --id <uuid> [--from <dossier>]',
      '',
      'La voix off est enregistrée par l’équipe, une prise par scène.',
      '  sheet   écrit la fiche de lecture (<out>/<id>/lecture.txt) et crée le dossier',
      '          recordings/ ; sans --id, pour tous les shorts draft sans voix.',
      '  import  recadre, normalise et horodate les prises scene-<id>.wav (ou mp3, m4a,',
      '          flac) du dossier recordings/ (ou --from), puis enregistre la voix off.',
      '',
      `Options : --out <dir> (défaut : $SHORTS_OUTPUT_DIR ou ${DEFAULT_OUTPUT_DIR})`,
    ].join('\n'),
  );
  process.exit(values.help ? 0 : 1);
}

const outputDir =
  values.out ?? process.env.SHORTS_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
const db = createDb();

async function main(): Promise<void> {
  if (command === 'sheet') {
    const targets = await loadReadingTargets(db, values.id);
    if (targets.length === 0) {
      console.log('Aucun short en attente de voix off.');
      return;
    }
    for (const t of targets) {
      const { file, text } = await writeReadingSheet(t, outputDir);
      console.log(`${text}\n→ fiche écrite dans ${file}\n`);
    }
    return;
  }
  if (!values.id) throw new Error('import attend --id <uuid>');
  const [target] = (await loadReadingTargets(db, values.id)) as SheetTarget[];
  if (!target) throw new Error(`video_short ${values.id} sans script`);
  const voiceover = await importRecordings(target.id, target.script.script, {
    from: values.from,
    outputDir,
  });
  await storeVoiceover(db, target.id, voiceover);
  const total = voiceover.scenes.reduce((n, s) => n + s.durationSec, 0);
  logger.info(
    `short ${target.id} : ${voiceover.scenes.length} prise(s) importée(s), ${total.toFixed(1)} s de voix`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(String(error));
    process.exit(1);
  });
