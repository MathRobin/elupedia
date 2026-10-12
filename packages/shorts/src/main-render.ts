import { parseArgs } from 'node:util';
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { renderShorts } from './render.js';
import { DEFAULT_OUTPUT_DIR } from './voiceover.js';

const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    out: { type: 'string' },
    force: { type: 'boolean', default: false },
    draft: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(
    [
      'Usage: yarn --cwd packages/shorts render [options]',
      '',
      'Rend la vidéo (Remotion, 1080×1920 H.264) et la vignette des shorts au',
      'statut draft qui ont un script, dans <out>/<shortId>/short.mp4. Les MP3',
      'de la voix off et les images broll/*.jpg du dossier du short sont utilisés.',
      '',
      'Options:',
      '  --id <uuid>    Un short précis (sinon tous les draft sans vidéo)',
      '  --force        Rend à nouveau même si une vidéo existe déjà',
      '  --draft        Rendu rapide basse qualité (échelle 0.5) pour vérifier',
      `  --out <dir>    Dossier de sortie (défaut : $SHORTS_OUTPUT_DIR ou ${DEFAULT_OUTPUT_DIR})`,
      '  --dry-run      Affiche la timeline sans rendre',
    ].join('\n'),
  );
  process.exit(0);
}

renderShorts(createDb(), {
  shortId: values.id,
  force: values.force,
  draft: values.draft,
  dryRun: values['dry-run'],
  outputDir: values.out ?? process.env.SHORTS_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR,
})
  .then(({ rendered, failed }) => {
    logger.info(
      `${rendered.length} rendu(s), ${failed.length} échec(s)${values['dry-run'] ? ' (dry-run : rien rendu)' : ''}`,
    );
    process.exit(failed.length > 0 ? 1 : 0);
  })
  .catch((error) => {
    logger.error(`Rendu échoué : ${error}`);
    process.exit(1);
  });
