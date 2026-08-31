import { parseArgs } from 'node:util';
import { logger } from './logger.js';

export const AN_STEP_NAMES = [
  'deputes',
  'collaborateurs',
  'interests',
  'addresses',
  'activity',
  'committees',
  'votes',
] as const;

export type AnStepName = (typeof AN_STEP_NAMES)[number];

export const SENAT_STEP_NAMES = [
  'senateurs',
  'senat-votes',
  'senat-affiliations',
  'senat-collaborateurs',
  'senat-adresses',
  'senat-elections',
  'senat-commissions',
  'senat-activite',
  'senat-social-links',
] as const;

export type SenatStepName = (typeof SENAT_STEP_NAMES)[number];

export const MAIRES_STEP_NAMES = ['maires'] as const;

export type MairesStepName = (typeof MAIRES_STEP_NAMES)[number];

export type StepName = AnStepName | SenatStepName | MairesStepName;

export const STEP_NAMES: readonly StepName[] = [
  ...AN_STEP_NAMES,
  ...SENAT_STEP_NAMES,
  ...MAIRES_STEP_NAMES,
];

function printHelp(stepNames: readonly string[]): void {
  const steps = stepNames.join(', ');
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
    '  yarn ingest --only deputes           # uniquement deputes',
    '  yarn ingest --only deputes,activity',
    '  yarn ingest --skip interests,addresses',
  ];
  logger.info(lines.join('\n'));
}

function parseStepList(raw: string, validNames: readonly string[]): StepName[] {
  const names = raw.split(',').map((s) => s.trim());
  for (const name of names) {
    if (!validNames.includes(name)) {
      throw new Error(
        `Étape inconnue : "${name}". Disponibles : ${validNames.join(', ')}`,
      );
    }
  }
  return names as StepName[];
}

export function parseCliArgs(
  argv: string[] = process.argv.slice(2),
  stepNames: readonly string[] = STEP_NAMES,
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
    printHelp(stepNames);
    return null;
  }

  if (values.only && values.skip) {
    throw new Error('--only et --skip sont mutuellement exclusifs');
  }

  if (values.only) {
    return new Set(parseStepList(values.only, stepNames));
  }

  if (values.skip) {
    const toSkip = new Set<string>(parseStepList(values.skip, stepNames));
    return new Set(
      (stepNames as readonly StepName[]).filter((s) => !toSkip.has(s)),
    );
  }

  return new Set(stepNames as readonly StepName[]);
}
