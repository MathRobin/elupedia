import { parseArgs } from 'node:util';
import { createDb, videoShorts } from '@elupedia/shared';
import { logger } from './logger.js';
import type { StoredScript } from './generate-script.js';
import { validateScript } from './script-validate.js';
import { DEFAULT_OUTPUT_DIR, writeReadingSheet } from './voiceover.js';
import { TOPICS } from './topics/index.js';

/**
 * CLI : crée un short « thème » (sans scrutin) : faits calculés depuis la
 * base, script de gabarit validé, short inséré en `draft` avec sa fiche de
 * lecture. Ensuite : enregistrer les prises, puis `make <id>`.
 *
 * Usage : yarn --cwd packages/shorts topic <thème> [--dry-run] [--out <dir>]
 * Thèmes : voir `topics/index.ts`.
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});
const topicKey = positionals[0];
const topic = topicKey ? TOPICS[topicKey] : undefined;

if (values.help || !topic) {
  console.log(
    [
      'Usage: yarn --cwd packages/shorts topic <thème> [options]',
      '',
      'Crée un short « thème » : faits calculés depuis la base, script de gabarit',
      'validé comme un script généré, short en draft avec sa fiche de lecture.',
      '',
      'Thèmes :',
      ...Object.values(TOPICS).map((t) => `  ${t.key.padEnd(24)} ${t.summary}`),
      '',
      'Options :',
      '  --dry-run     Affiche faits et script sans rien écrire',
      `  --out <dir>   Dossier de sortie (défaut : $SHORTS_OUTPUT_DIR ou ${DEFAULT_OUTPUT_DIR})`,
    ].join('\n'),
  );
  process.exit(values.help ? 0 : 2);
}

const outputDir =
  values.out ?? process.env.SHORTS_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;

async function main(): Promise<number> {
  const db = createDb();
  const shortId = values['dry-run'] ? 'dry-run' : crypto.randomUUID();
  const facts = topic!.build(shortId, await topic!.load(db));
  const script = topic!.script(facts);
  const issues = validateScript(script, facts);
  if (issues.length > 0) {
    for (const i of issues) logger.error(`${i.code} : ${i.message}`);
    throw new Error('script non conforme');
  }
  const total = script.scenes.reduce((s, sc) => s + sc.durationSec, 0);
  logger.info(
    `script « ${script.title} » : ${script.scenes.length} scènes, ${total} s prévues`,
  );
  if (values['dry-run']) {
    console.log(JSON.stringify({ facts: facts.topic, script }, null, 2));
    return 0;
  }
  const stored: StoredScript = {
    version: 1,
    generatedAt: new Date().toISOString(),
    model: `topic:${topic!.key}`,
    attempts: 1,
    usage: { inputTokens: 0, outputTokens: 0 },
    facts,
    script,
  };
  await db.insert(videoShorts).values({
    id: shortId,
    status: 'draft',
    score: 0,
    scoreDetails: { kind: 'topic', topic: topic!.key },
    script: stored,
  });
  const { file } = await writeReadingSheet(
    { id: shortId, script: stored },
    outputDir,
  );
  logger.info(`short ${shortId} créé (draft), fiche de lecture : ${file}`);
  logger.info(
    `étape suivante : enregistrer les prises dans ${outputDir}/${shortId}/recordings/ puis yarn --cwd packages/shorts make ${shortId}`,
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    logger.error(`${error}`);
    process.exit(1);
  });
