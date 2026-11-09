import { spawnSync } from 'node:child_process';
import { writeBookData } from './main-data.js';

/**
 * CLI : génère `out/data.json` puis compile le gabarit Typst en PDF
 * (`out/livre.pdf`). Nécessite le binaire `typst` dans le PATH
 * (https://typst.app/open-source/#download).
 *
 * Usage : yarn --cwd packages/book build
 */

const DATA = 'out/data.json';
const PDF = 'out/livre.pdf';

async function main(): Promise<void> {
  await writeBookData(DATA);
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
