import { parseArgs } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import {
  DEFAULT_MODEL,
  createModelCall,
  generateScriptsForShorts,
} from './generate-script.js';

const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    model: { type: 'string', default: DEFAULT_MODEL },
    force: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(
    [
      'Usage: yarn --cwd packages/shorts script [options]',
      '',
      'Génère le script (scènes, voix off, textes) des shorts au statut',
      'candidate via l’API Claude, le valide, puis passe le short en draft.',
      'Nécessite ANTHROPIC_API_KEY.',
      '',
      'Options:',
      '  --id <uuid>      Un short précis (sinon tous les candidate sans script)',
      '  --force          Regénère même si un script existe déjà',
      `  --model <id>     Modèle (défaut : ${DEFAULT_MODEL})`,
      '  --dry-run        Affiche le script sans rien écrire',
    ].join('\n'),
  );
  process.exit(0);
}

if (!process.env.ANTHROPIC_API_KEY) {
  logger.error('ANTHROPIC_API_KEY manquante');
  process.exit(1);
}

generateScriptsForShorts(createDb(), createModelCall(new Anthropic()), {
  shortId: values.id,
  force: values.force,
  dryRun: values['dry-run'],
  model: values.model,
})
  .then(({ generated, failed }) => {
    logger.info(
      `${generated.length} script(s) généré(s), ${failed.length} échec(s)${values['dry-run'] ? ' (dry-run : rien écrit)' : ''}`,
    );
    process.exit(failed.length > 0 ? 1 : 0);
  })
  .catch((error) => {
    logger.error(`Génération des scripts échouée : ${error}`);
    process.exit(1);
  });
