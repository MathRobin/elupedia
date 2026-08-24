import { parseArgs } from 'node:util';
import { logger } from './logger.js';

export const STEP_NAMES = [
  'officials',
  'senators',
  'collaborateurs',
  'interests',
  'addresses',
  'activity',
  'committees',
  'senat-votes',
  'senat-affiliations',
  'senat-collaborateurs',
  'senat-adresses',
  'senat-elections',
] as const;

export type StepName = (typeof STEP_NAMES)[number];

function printHelp(): void {
  const steps = STEP_NAMES.join(', ');
  const lines = [
    'Usage: yarn ingest [options]',
    '',
    'Options:',
    '  --only <steps>   Exécuter uniquement ces étapes (séparées par des virgules)',
    '  --skip <steps>   Ignorer ces étapes (séparées par des virgules)',
    '  --help           Afficher cette aide',
    '',
    `Étapes disponibles: ${steps}`,
    '',
    'Exemples:',
    '  yarn ingest                          # toutes les étapes',
    '  yarn ingest --only officials         # uniquement officials',
    '  yarn ingest --only officials,activity',
    '  yarn ingest --skip interests,addresses',
  ];
  logger.info(lines.join('\n'));
}

function parseStepList(raw: string): StepName[] {
  const names = raw.split(',').map((s) => s.trim());
  for (const name of names) {
    if (!STEP_NAMES.includes(name as StepName)) {
      throw new Error(
        `Étape inconnue : "${name}". Disponibles : ${STEP_NAMES.join(', ')}`,
      );
    }
  }
  return names as StepName[];
}

export function parseCliArgs(
  argv: string[] = process.argv.slice(2),
): Set<StepName> | null {
  const { values } = parseArgs({
    args: argv,
    options: {
      only: { type: 'string' },
      skip: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });

  if (values.help) {
    printHelp();
    return null;
  }

  if (values.only && values.skip) {
    throw new Error('--only et --skip sont mutuellement exclusifs');
  }

  if (values.only) {
    return new Set(parseStepList(values.only));
  }

  if (values.skip) {
    const toSkip = new Set<StepName>(parseStepList(values.skip));
    return new Set(STEP_NAMES.filter((s) => !toSkip.has(s)));
  }

  return new Set(STEP_NAMES);
}
