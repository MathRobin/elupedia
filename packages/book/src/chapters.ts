import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdownToTypst } from './markdown-typst.js';

/**
 * Texte des chapitres : convertit les brouillons `docs/livre/NN-*.md` en
 * fichiers Typst `out/chapitres/NN-*.typ`, inclus par `typst/main.typ`.
 *
 * Le titre de niveau 1 de chaque brouillon est retiré (le gabarit pose le
 * sien). Les sections de travail (« Angles possibles », « Précautions »,
 * « À rédiger ») sont rendues en encadrés `note-travail`, ou omises avec
 * `notes: false` : elles ne sont pas destinées à l'impression.
 *
 * Appelants : `main-build.ts`.
 * Pièges : les tableaux des brouillons sont écrits à la main dans le
 * Markdown ; ils ne sont pas régénérés depuis la base (contrairement à ceux de
 * `data.json`).
 */

const DRAFTS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../docs/livre',
);
const CHAPTER_FILE = /^0[1-9]-.*\.md$/;
/** Un `#include` ne voit pas les définitions de `main.typ` : chaque chapitre importe `typst/lib.typ`. */
const LIB_IMPORT = '#import "/typst/lib.typ": encadre, note-travail';
const NOTE_SECTIONS = new Set(['Angles possibles', 'Précautions', 'À rédiger']);

export interface ChapterOptions {
  /** Garde les sections de travail (encadrés). Défaut : oui, tant que le livre est un brouillon. */
  notes?: boolean;
}

/** Brouillon Markdown → Typst, sans le titre de niveau 1. */
export function chapterToTypst(
  markdown: string,
  { notes = true }: ChapterOptions = {},
): string {
  const all = markdown.split('\n');
  const title = all.findIndex((l) => l.startsWith('# '));
  const body = title === -1 ? all : all.filter((_, i) => i !== title);
  const sections: { title: string | null; lines: string[] }[] = [
    { title: null, lines: [] },
  ];
  for (const line of body) {
    const m = /^## (.*)$/.exec(line);
    if (m) sections.push({ title: m[1] ?? '', lines: [line] });
    else sections.at(-1)?.lines.push(line);
  }
  const typst = sections
    .map(({ title, lines }) => {
      // Avant le premier `##` : on ne garde que l'encadré de source ; le texte d'ouverture est repris par `chapitres/*.md`.
      if (title === null) {
        return markdownToTypst(
          lines.filter((l) => l.startsWith('>')).join('\n'),
        );
      }
      if (!NOTE_SECTIONS.has(title)) return markdownToTypst(lines.join('\n'));
      if (!notes) return '';
      const inner = markdownToTypst(lines.slice(1).join('\n'));
      return `#note-travail("${title}")[\n${inner}\n]\n`;
    })
    .join('\n');
  return `${LIB_IMPORT}\n${typst}`;
}

/** Écrit `<outDir>/NN-*.typ` pour chaque brouillon de chapitre ; renvoie les noms. */
export async function writeChapters(
  outDir: string,
  options: ChapterOptions = {},
): Promise<string[]> {
  const dir = resolve(outDir);
  await mkdir(dir, { recursive: true });
  const files = (await readdir(DRAFTS_DIR))
    .filter((f) => CHAPTER_FILE.test(f))
    .sort();
  for (const f of files) {
    const md = await readFile(join(DRAFTS_DIR, f), 'utf8');
    await writeFile(
      join(dir, f.replace(/\.md$/, '.typ')),
      chapterToTypst(md, options),
    );
  }
  return files;
}
