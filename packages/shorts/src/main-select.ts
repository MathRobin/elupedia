import { parseArgs } from 'node:util';
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { formatRanking, selectShortCandidates } from './select-candidates.js';

const { values } = parseArgs({
  options: {
    days: { type: 'string', default: '7' },
    'max-shorts': { type: 'string', default: '2' },
    'min-score': { type: 'string', default: '50' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(
    [
      'Usage: yarn --cwd packages/shorts select [options]',
      '',
      'Sélectionne les scrutins AN/Sénat récents candidats à un short vidéo',
      'et les enregistre dans video_shorts (statut candidate).',
      '',
      'Options:',
      '  --days <n>        Fenêtre glissante en jours (défaut : 7)',
      '  --max-shorts <n>  Candidats créés au maximum par exécution (défaut : 2)',
      '  --min-score <n>   Score minimal pour devenir candidat (défaut : 50)',
      '  --dry-run         Affiche le classement sans rien écrire',
    ].join('\n'),
  );
  process.exit(0);
}

const toInt = (name: string, raw: string): number => {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    logger.error(`--${name} attend un entier positif, reçu « ${raw} »`);
    process.exit(1);
  }
  return n;
};

selectShortCandidates(createDb(), {
  days: toInt('days', values.days),
  maxShorts: toInt('max-shorts', values['max-shorts']),
  minScore: toInt('min-score', values['min-score']),
  dryRun: values['dry-run'],
})
  .then(({ ranked, created }) => {
    console.log(formatRanking(ranked));
    logger.info(
      `${created.length} candidat(s) créé(s)${values['dry-run'] ? ' (dry-run : rien écrit)' : ''}`,
    );
    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Sélection des shorts échouée : ${error}`);
    process.exit(1);
  });
