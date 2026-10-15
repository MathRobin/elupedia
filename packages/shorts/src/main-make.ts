import { parseArgs } from 'node:util';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import {
  DEFAULT_MODEL,
  createModelCall,
  generateScriptsForShorts,
} from './generate-script.js';
import {
  describePlan,
  inspectRecordings,
  loadMakeRow,
  planMake,
} from './make.js';
import { renderShorts } from './render.js';
import {
  DEFAULT_OUTPUT_DIR,
  importRecordings,
  loadReadingTargets,
  storeVoiceover,
  writeReadingSheet,
} from './voiceover.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    model: { type: 'string', default: DEFAULT_MODEL },
    rescript: { type: 'boolean', default: false },
    reimport: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    silent: { type: 'boolean', default: false },
    draft: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});
const [shortId] = positionals;

if (values.help || !shortId) {
  console.log(
    [
      'Usage: yarn --cwd packages/shorts make <id> [options]',
      '',
      'Enchaîne pour un short : script (si absent) → import de la voix (prises',
      'recordings/scene-<id>.wav) → rendu vidéo, en sautant ce qui est à jour.',
      'S’arrête avec la fiche de lecture si des prises manquent. La revue',
      '(review approve) et la publication restent à part : c’est le gate humain.',
      '',
      'Options :',
      '  --rescript   Regénère le script (invalide la voix : à ré-enregistrer)',
      '  --reimport   Réimporte les prises même si elles n’ont pas changé',
      '  --force      Rend la vidéo même si rien n’a changé',
      '  --silent     Continue sans voix : muet, sous-titres estimés',
      '  --draft      Rendu rapide basse qualité',
      `  --out <dir>  Dossier de sortie (défaut : $SHORTS_OUTPUT_DIR ou ${DEFAULT_OUTPUT_DIR})`,
      '  --dry-run    Affiche les étapes prévues sans rien exécuter',
    ].join('\n'),
  );
  process.exit(values.help ? 0 : 1);
}

const outputDir =
  values.out ?? process.env.SHORTS_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
const db = createDb();

async function main(): Promise<number> {
  const id = shortId!;
  let row = await loadMakeRow(db, id);
  const recordingsDir = path.join(outputDir, id, 'recordings');

  // État initial, sur le script actuel ; s'il est regénéré, la voix est refaite.
  const takes = row.script
    ? await inspectRecordings(recordingsDir, row.script.script)
    : { missing: [] as string[], latestMtime: null };
  const flags = {
    rescript: values.rescript,
    reimport: values.reimport,
    force: values.force,
    silent: values.silent,
  };
  const plan = planMake(
    {
      hasScript: row.script !== null,
      voiceImportedAt: row.voiceover
        ? Date.parse(row.voiceover.generatedAt)
        : null,
      missingTakes: takes.missing,
      latestTakeAt: takes.latestMtime,
      hasVideo: row.videoKey !== null,
    },
    flags,
  );
  logger.info(`short ${id} : ${describePlan(plan)}`);
  for (const reason of plan.reasons) logger.info(`  · ${reason}`);
  if (values['dry-run']) return 0;

  if (plan.script) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'ANTHROPIC_API_KEY manquante : impossible de générer le script',
      );
    }
    const r = await generateScriptsForShorts(
      db,
      createModelCall(new Anthropic()),
      { shortId: id, force: true, dryRun: false, model: values.model },
    );
    if (r.failed.length > 0) {
      throw new Error('script non conforme, voir notes du short (review list)');
    }
    row = await loadMakeRow(db, id);
  }

  // Prises : état recalculé sur le script à jour.
  const script = row.script!.script;
  const takesNow = await inspectRecordings(recordingsDir, script);

  if (plan.script && takesNow.missing.length > 0 && !flags.silent) {
    // Nouveau script : l'ancienne voix ne correspond plus aux textes.
    const target = (await loadReadingTargets(db, id))[0];
    const { file } = await writeReadingSheet(target, outputDir);
    logger.warn(
      `nouveau script : prises à (ré)enregistrer d'après ${file}, puis relancer make ${id}`,
    );
    return 2;
  }
  if (plan.needTakes) {
    const target = (await loadReadingTargets(db, id))[0];
    const { file } = await writeReadingSheet(target, outputDir);
    logger.warn(
      `prises manquantes (${takesNow.missing.map((s) => `scene-${s}`).join(', ')}) : lire d'après ${file}, déposer les prises dans ${recordingsDir}, puis relancer make ${id}`,
    );
    return 2;
  }

  if (plan.importVoice && takesNow.missing.length === 0) {
    const voiceover = await importRecordings(id, script, {
      outputDir,
    });
    await storeVoiceover(db, id, voiceover);
    const total = voiceover.scenes.reduce((n, s) => n + s.durationSec, 0);
    logger.info(
      `voix importée : ${voiceover.scenes.length} prise(s), ${total.toFixed(1)} s`,
    );
  }

  if (plan.render) {
    const r = await renderShorts(db, {
      shortId: id,
      force: true,
      dryRun: false,
      outputDir,
      draft: values.draft,
      silent: values.silent,
    });
    if (r.failed.length > 0) throw new Error('rendu échoué');
    logger.info(`vidéo : ${path.join(outputDir, id, 'short.mp4')}`);
  } else {
    logger.info('vidéo déjà à jour (--force pour la rendre à nouveau)');
  }
  logger.info(
    `étape suivante : yarn --cwd packages/shorts review approve ${id}`,
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    logger.error(String(error));
    process.exit(1);
  });
