import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { writeChapters } from './chapters.js';
import { writeBookData } from './main-data.js';

/**
 * CLI : génère `out/data.json` et `out/chapitres/*.typ` (texte des brouillons
 * de `docs/livre/`) puis compile le gabarit Typst en PDF (`out/livre.pdf`).
 * Nécessite le binaire `typst` dans le PATH
 * (https://typst.app/open-source/#download).
 *
 * Usage : yarn --cwd packages/book build [--sans-notes]
 * `--sans-notes` omet les sections de travail (angles, précautions, à rédiger).
 */

const DATA = 'out/data.json';
const CHAPTERS = 'out/chapitres';
const PDF = 'out/livre.pdf';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { 'sans-notes': { type: 'boolean', default: false } },
  });
  await writeBookData(DATA);
  await writeChapters(CHAPTERS, { notes: !values['sans-notes'] });
  const res = spawnSync(
    'typst',
    ['compile', '--root', '.', 'typst/main.typ', PDF],
    { stdio: 'inherit' },
  );
  if (res.error) {
    throw new Error(
      `typst introuvable (${res.error.message}) : installer le binaire, ou utiliser « yarn data » seul`,
    );
  }
  process.exit(res.status ?? 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
