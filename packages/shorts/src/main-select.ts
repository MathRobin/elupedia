/**
 * CLI : sélectionne les scrutins AN/Sénat récents candidats à un short vidéo
 * et les écrit en `candidate` (select-candidates.ts, qui porte le barème).
 *
 * `--min-score-floor` existe pour le DAG `ingest-votes`, qui cherche un short
 * par jour : sans scrutin au-dessus de `--min-score`, le seuil redescend
 * jusqu'au plancher, et ne reprend qu'un scrutin de moins de 36 h. Quand la
 * fenêtre ne contient aucun scrutin exploitable (congés parlementaires) ou
 * aucun scrutin récent, la journée n'a pas de vidéo : il n'existe plus de repli
 * « thème » depuis le 24/11/2026, seuls les scrutins font un short.
 *
 * Usage : yarn --cwd packages/shorts select [--days n] [--max-shorts n]
 *         [--min-score n] [--min-score-floor n] [--dry-run]
 */
import { parseArgs } from 'node:util';
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { formatRanking, selectShortCandidates } from './select-candidates.js';
import { writeShortsFailureReport, writeShortsReport } from './report.js';

const { values } = parseArgs({
  options: {
    days: { type: 'string', default: '7' },
    'max-shorts': { type: 'string', default: '2' },
    'min-score': { type: 'string', default: '50' },
    'min-score-floor': { type: 'string', default: '0' },
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
      '  --min-score-floor <n>',
      '                    Quand aucun scrutin n’atteint --min-score, le seuil',
      '                    redescend par paliers de 10 jusqu’à cette valeur et',
      '                    un seul short est retenu, à condition qu’il ait moins',
      '                    de 36 h (défaut : 0). Mettre la même valeur que',
      '                    --min-score pour ne pas descendre.',
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
  minScoreFloor: toInt('min-score-floor', values['min-score-floor']),
  dryRun: values['dry-run'],
})
  .then(({ ranked, created }) => {
    console.log(formatRanking(ranked));
    logger.info(
      `${created.length} candidat(s) créé(s)${values['dry-run'] ? ' (dry-run : rien écrit)' : ''}`,
    );
    if (!values['dry-run'])
      writeShortsReport('select', { done: created.length, failed: 0 });
    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Sélection des shorts échouée : ${error}`);
    if (!values['dry-run']) writeShortsFailureReport('select');
    process.exit(1);
  });
