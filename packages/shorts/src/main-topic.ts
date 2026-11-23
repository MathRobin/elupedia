import { parseArgs } from 'node:util';
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { createDb, envValue, videoShorts } from '@elupedia/shared';
import { logger } from './logger.js';
import type { StoredScript } from './generate-script.js';
import { validateScript } from './script-validate.js';
import { DEFAULT_OUTPUT_DIR, writeReadingSheet } from './voiceover.js';
import type { TopicDefinition } from './topics/common.js';
import { TOPICS } from './topics/index.js';
import {
  countShortsCreatedSince,
  loadTopicLastUse,
  orderTopicKeys,
  startOfDay,
} from './topic-rotation.js';

/**
 * CLI : crée un short « thème » (sans scrutin) : faits calculés depuis la
 * base, script de gabarit validé, short inséré en `draft` avec sa fiche de
 * lecture. Ensuite : enregistrer les prises, puis `make <id>`.
 *
 * Commande manuelle : depuis le 23/11/2026, aucun DAG ne l'appelle. Le DAG
 * `ingest-votes` ne produit que des shorts de scrutin (étape `topic-fallback`
 * retirée), et une journée sans scrutin exploitable n'a pas de vidéo. Ce
 * fichier reste pour un short ponctuel demandé à la main.
 *
 * `--auto` choisit le thème par rotation (topic-rotation.ts) et `--if-none-today`
 * ne crée rien si la journée a déjà son short. Avec `--auto`, un thème dont le
 * gabarit ne passe pas la validation est écarté et le suivant est essayé ; un
 * thème demandé explicitement, lui, échoue sans repli — c'est celui-là qu'on
 * voulait.
 *
 * Usage : yarn --cwd packages/shorts topic <thème> [--dry-run] [--out <dir>]
 *         yarn --cwd packages/shorts topic --auto [--if-none-today]
 * Thèmes : voir `topics/index.ts`.
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    auto: { type: 'boolean', default: false },
    'if-none-today': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});
const topicKey = positionals[0];

if (values.help || (!values.auto && !topicKey)) {
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
      '  --auto           Choisit le thème par rotation (le moins récemment',
      '                   utilisé) au lieu de le prendre en argument',
      '  --if-none-today  Ne crée rien si un short existe déjà pour la journée',
      '  --dry-run        Affiche faits et script sans rien écrire',
      `  --out <dir>      Dossier de sortie (défaut : $SHORTS_OUTPUT_DIR ou ${DEFAULT_OUTPUT_DIR})`,
    ].join('\n'),
  );
  process.exit(values.help ? 0 : 2);
}

const outputDir =
  values.out ?? envValue('SHORTS_OUTPUT_DIR') ?? DEFAULT_OUTPUT_DIR;

/**
 * Produit le short d'un thème : faits, script de gabarit, validation, écriture
 * et fiche de lecture. Lève si le gabarit ne passe pas la validation — les
 * problèmes sont dans le message, l'appelant décidant de passer au thème
 * suivant (`--auto`) ou d'échouer.
 */
async function produceTopic(
  db: NeonHttpDatabase,
  topic: TopicDefinition<unknown>,
): Promise<number> {
  const shortId = values['dry-run'] ? 'dry-run' : crypto.randomUUID();
  const facts = topic.build(shortId, await topic.load(db));
  const script = topic.script(facts);
  const issues = validateScript(script, facts);
  if (issues.length > 0) {
    throw new Error(
      `script non conforme : ${issues
        .map((i) => `${i.code} (${i.message})`)
        .join(' · ')}`,
    );
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
    model: `topic:${topic.key}`,
    attempts: 1,
    usage: { inputTokens: 0, outputTokens: 0 },
    facts,
    script,
  };
  await db.insert(videoShorts).values({
    id: shortId,
    status: 'draft',
    score: 0,
    scoreDetails: { kind: 'topic', topic: topic.key },
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

async function main(): Promise<number> {
  const db = createDb();

  if (values['if-none-today']) {
    const since = startOfDay(new Date());
    const dejaFaits = await countShortsCreatedSince(db, since);
    if (dejaFaits > 0) {
      logger.info(
        `${dejaFaits} short(s) déjà créé(s) depuis ${since.toISOString()} : rien à faire`,
      );
      return 0;
    }
  }

  if (values.auto) {
    const ordre = orderTopicKeys(
      Object.keys(TOPICS),
      await loadTopicLastUse(db),
    );
    if (ordre.length === 0) {
      logger.error('aucun thème disponible dans le registre');
      return 1;
    }
    for (const key of ordre) {
      logger.info(`thème essayé par rotation : ${key}`);
      try {
        return await produceTopic(db, TOPICS[key]!);
      } catch (error) {
        logger.warn(`thème ${key} écarté : ${error}`);
      }
    }
    logger.error(
      `aucun thème ne produit un short conforme (${ordre.length} essayé(s))`,
    );
    return 1;
  }

  const topic = topicKey ? TOPICS[topicKey] : undefined;
  if (!topic) {
    logger.error(`thème inconnu : ${topicKey}`);
    return 2;
  }
  return produceTopic(db, topic);
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    logger.error(`${error}`);
    process.exit(1);
  });
