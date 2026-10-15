/**
 * Parsing des options communes aux points d'entrée `main-*.ts` qui acceptent
 * `--only` / `--skip` / `--help`, et catalogue des noms d'étapes par domaine.
 *
 * Chaque `run-*.ts` teste `enabledSteps.has('<étape>')` avant de lancer une
 * étape : les constantes *_STEP_NAMES ci-dessous doivent donc rester alignées
 * avec les chaînes utilisées dans le `run-*.ts` correspondant. Un main
 * mono-domaine passe sa propre liste à parseCliArgs pour que `--only deputes`
 * soit refusé dans le périmètre Sénat, par exemple.
 *
 * Piège : STEP_NAMES (run complet) ne contient ni `photos` ni `hatvp-status`,
 * alors que run.ts les teste — ces deux étapes ne tournent donc qu'en
 * l'absence totale de --only/--skip.
 */
import { parseArgs } from 'node:util';
import { logger } from './logger.js';

export const AN_STEP_NAMES = [
  'deputes',
  'affiliations',
  'collaborateurs',
  'addresses',
  'activity',
  'committees',
  'votes',
  'ballot-proposers',
  'elections',
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

export const MAIRES_STEP_NAMES = [
  'maires',
  'maires-addresses',
  'maires-photos',
  'maires-elections',
  'maires-social-scrape',
] as const;

export type MairesStepName = (typeof MAIRES_STEP_NAMES)[number];

export const CONSEILLERS_DEP_STEP_NAMES = ['conseillers-dep'] as const;

export type ConseillersDepStepName =
  (typeof CONSEILLERS_DEP_STEP_NAMES)[number];

export const CONSEILLERS_EPCI_STEP_NAMES = ['conseillers-epci'] as const;

export type ConseillersEpciStepName =
  (typeof CONSEILLERS_EPCI_STEP_NAMES)[number];

export const CONSEILLERS_REG_STEP_NAMES = ['conseillers-reg'] as const;

export type ConseillersRegStepName =
  (typeof CONSEILLERS_REG_STEP_NAMES)[number];

export const CONSEILLERS_ARR_STEP_NAMES = ['conseillers-arr'] as const;

export type ConseillersArrStepName =
  (typeof CONSEILLERS_ARR_STEP_NAMES)[number];

export const MEMBRES_ASSEMBLEE_STEP_NAMES = ['membres-assemblee'] as const;

export type MembresAssembleeStepName =
  (typeof MEMBRES_ASSEMBLEE_STEP_NAMES)[number];

export const CONSEILLERS_FDE_STEP_NAMES = ['conseillers-fde'] as const;

export type ConseillersFdeStepName =
  (typeof CONSEILLERS_FDE_STEP_NAMES)[number];

export const MEMBRES_AFE_STEP_NAMES = ['membres-afe'] as const;

export type MembresAfeStepName = (typeof MEMBRES_AFE_STEP_NAMES)[number];

export const EUROPE_STEP_NAMES = [
  'eurodeputes',
  'eurodeputes-votes',
  'eurodeputes-questions',
] as const;

export type EuropeStepName = (typeof EUROPE_STEP_NAMES)[number];

// Étapes transverses du run complet (run.ts), hors sous-orchestrateurs.
export const COMMON_STEP_NAMES = [
  'interests',
  'geocode',
  'maps',
  'campaign-accounts',
] as const;

export type CommonStepName = (typeof COMMON_STEP_NAMES)[number];

export type StepName =
  | AnStepName
  | SenatStepName
  | MairesStepName
  | ConseillersDepStepName
  | ConseillersEpciStepName
  | ConseillersRegStepName
  | ConseillersArrStepName
  | MembresAssembleeStepName
  | ConseillersFdeStepName
  | MembresAfeStepName
  | EuropeStepName
  | CommonStepName;

export const STEP_NAMES: readonly StepName[] = [
  ...AN_STEP_NAMES,
  ...SENAT_STEP_NAMES,
  ...MAIRES_STEP_NAMES,
  ...CONSEILLERS_DEP_STEP_NAMES,
  ...CONSEILLERS_REG_STEP_NAMES,
  ...CONSEILLERS_ARR_STEP_NAMES,
  ...MEMBRES_ASSEMBLEE_STEP_NAMES,
  ...CONSEILLERS_FDE_STEP_NAMES,
  ...MEMBRES_AFE_STEP_NAMES,
  ...EUROPE_STEP_NAMES,
  ...COMMON_STEP_NAMES,
];

// Aide générique : les exemples mentionnent `yarn ingest` même pour un main
// mono-domaine (ingest:an, etc.), seule la liste des étapes est adaptée.
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

/** Découpe « a,b,c » et refuse tout nom hors de `validNames`. */
function parseStepList(raw: string, validNames: readonly string[]): StepName[] {
  const names = raw.split(',').map((name) => name.trim());
  for (const name of names) {
    if (!validNames.includes(name)) {
      throw new Error(
        `Étape inconnue : "${name}". Disponibles : ${validNames.join(', ')}`,
      );
    }
  }
  return names as StepName[];
}

/**
 * Lit `--only a,b` / `--skip a,b` / `--help` et renvoie l'ensemble des étapes
 * à exécuter parmi `stepNames` (toutes par défaut).
 *
 * Renvoie `null` après avoir affiché l'aide (`--help`) : l'appelant doit
 * alors sortir sans rien lancer. Lève une erreur sur un nom d'étape inconnu,
 * sur `--only` + `--skip` combinés, ou sur une option non reconnue
 * (`strict: true`).
 */
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
      (stepNames as readonly StepName[]).filter((step) => !toSkip.has(step)),
    );
  }

  return new Set(stepNames as readonly StepName[]);
}
