import { parseArgs } from 'node:util';
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { ELEVENLABS_DEFAULT_MODEL, createElevenLabsProvider } from './tts.js';
import { DEFAULT_OUTPUT_DIR, generateVoiceovers } from './voiceover.js';

const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    out: { type: 'string' },
    force: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(
    [
      'Usage: yarn --cwd packages/shorts voiceover [options]',
      '',
      'Synthétise la voix off (ElevenLabs) des shorts au statut draft qui ont',
      'un script : un MP3 par scène + horodatage des mots, enregistrés dans',
      'video_shorts.voiceover. Nécessite ELEVENLABS_API_KEY et ELEVENLABS_VOICE_ID.',
      '',
      'Options:',
      '  --id <uuid>    Un short précis (sinon tous les draft sans voix off)',
      '  --force        Resynthétise même si une voix off existe déjà',
      `  --out <dir>    Dossier de sortie (défaut : $SHORTS_OUTPUT_DIR ou ${DEFAULT_OUTPUT_DIR})`,
      '  --dry-run      Affiche ce qui serait synthétisé, sans appel ni écriture',
    ].join('\n'),
  );
  process.exit(0);
}

const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID;
if (!values['dry-run'] && (!apiKey || !voiceId)) {
  logger.error('ELEVENLABS_API_KEY et ELEVENLABS_VOICE_ID sont requises');
  process.exit(1);
}

const provider = createElevenLabsProvider({
  apiKey: apiKey ?? '',
  voiceId: voiceId ?? '',
  modelId: process.env.ELEVENLABS_MODEL_ID ?? ELEVENLABS_DEFAULT_MODEL,
});

generateVoiceovers(createDb(), provider, {
  shortId: values.id,
  force: values.force,
  dryRun: values['dry-run'],
  outputDir: values.out ?? process.env.SHORTS_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR,
})
  .then(({ generated, failed }) => {
    logger.info(
      `${generated.length} voix off générée(s), ${failed.length} échec(s)${values['dry-run'] ? ' (dry-run : rien écrit)' : ''}`,
    );
    process.exit(failed.length > 0 ? 1 : 0);
  })
  .catch((error) => {
    logger.error(`Voix off échouée : ${error}`);
    process.exit(1);
  });
