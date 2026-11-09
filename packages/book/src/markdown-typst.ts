/**
 * Conversion Markdown → Typst (markup) pour les textes du livre.
 *
 * Couvre ce que les brouillons de `docs/livre/` utilisent : titres,
 * paragraphes, gras, italique, code, liens, listes (sans imbrication),
 * citations (rendues en encadrés) et tableaux. Rien d'autre : un Markdown plus
 * riche (images, HTML, notes de bas de page) sera mal converti.
 *
 * Appelants : `chapters.ts`.
 * Pièges : le texte est échappé pour le mode markup de Typst (`#`, `$`, `@`,
 * `<`, `>`, `*`, `_`, `` ` ``, `~`, crochets, `//`). L'encadré est la fonction
 * Typst `encadre`, définie dans `typst/main.typ`.
 */

/** Échappe un texte brut pour le mode markup de Typst. */
export function escapeTypst(s: string): string {
  return s.replace(/[\\#$@<>*_`~[\]]/g, '\\$&').replace(/\/\//g, '/\\/');
}

interface InlineRule {
  re: RegExp;
  out: (m: RegExpExecArray) => string;
}

const quoted = (s: string): string => s.replace(/["\\]/g, '\\$&');

const INLINE_RULES: InlineRule[] = [
  { re: /\*\*(.+?)\*\*/s, out: (m) => `#strong[${inline(m[1] ?? '')}]` },
  {
    re: /(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/s,
    out: (m) => `#emph[${inline(m[1] ?? '')}]`,
  },
  {
    re: /(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)/s,
    out: (m) => `#emph[${inline(m[1] ?? '')}]`,
  },
  { re: /`([^`]+)`/, out: (m) => `#raw("${quoted(m[1] ?? '')}")` },
  {
    re: /\[([^\]]+)\]\(([^)]+)\)/,
    out: (m) => `#link("${quoted(m[2] ?? '')}")[${inline(m[1] ?? '')}]`,
  },
];

/** Convertit le balisage en ligne (gras, italique, code, lien). */
export function inline(s: string): string {
  let best: { m: RegExpExecArray; rule: InlineRule } | null = null;
  for (const rule of INLINE_RULES) {
    const m = rule.re.exec(s);
    if (m && (best === null || m.index < best.m.index)) best = { m, rule };
  }
  if (!best) return escapeTypst(s);
  const { m, rule } = best;
  return (
    escapeTypst(s.slice(0, m.index)) +
    rule.out(m) +
    inline(s.slice(m.index + m[0].length))
  );
}

const isTableRow = (l: string): boolean => /^\s*\|.*\|\s*$/.test(l);
const isBullet = (l: string): boolean => /^\s*[-*]\s+/.test(l);
const isNumbered = (l: string): boolean => /^\s*\d+\.\s+/.test(l);
const isHeading = (l: string): boolean => /^#{1,6}\s+/.test(l);
const isQuote = (l: string): boolean => /^\s*>/.test(l);

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** Une colonne est alignée à droite quand toutes ses cellules sont des nombres. */
const NUMERIC_CELL = /^[\d\s\u00a0\u202f,.%€()+\-–/]*(M€|k€|M|k)?$/;

function table(rows: string[]): string {
  const [head = [], , ...body] = rows.map(splitRow);
  const align = head.map((_, col) =>
    body.length > 0 &&
    col > 0 &&
    body.every((r) => NUMERIC_CELL.test(r[col] ?? ''))
      ? 'right'
      : 'left',
  );
  const header = head.map((c) => (c ? `[*${inline(c)}*]` : '[]')).join(', ');
  const cells = body
    .flatMap((r) => head.map((_, col) => `[${inline(r[col] ?? '')}]`))
    .join(', ');
  const widths = head.map((_, col) => (col === 0 ? '2.2fr' : '1fr')).join(', ');
  return (
    `#block(above: 0.6em, below: 0.9em)[#set par(justify: false); ` +
    `#set text(size: 8.5pt, hyphenate: false); ` +
    `#table(columns: (${widths}), align: (${align.join(', ')}), ` +
    `table.header(${header}), ${cells})]\n`
  );
}

function list(lines: string[], numbered: boolean): string {
  const items: string[] = [];
  for (const l of lines) {
    if (isBullet(l) || isNumbered(l)) {
      items.push(l.replace(/^\s*([-*]|\d+\.)\s+/, ''));
    } else if (items.length > 0) {
      items[items.length - 1] += ' ' + l.trim();
    }
  }
  const marker = numbered ? '+ ' : '- ';
  return items.map((t) => marker + inline(t)).join('\n') + '\n';
}

/** Convertit un Markdown (lignes) en une liste de blocs Typst. */
function blocks(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  const at = (n: number): string => lines[n] ?? '';
  while (i < lines.length) {
    const l = at(i);
    if (l.trim() === '') {
      i++;
    } else if (isHeading(l)) {
      const m = /^(#{1,6})\s+(.*)$/.exec(l);
      out.push(`${'='.repeat(m?.[1]?.length ?? 1)} ${inline(m?.[2] ?? '')}\n`);
      i++;
    } else if (isQuote(l)) {
      const q: string[] = [];
      while (i < lines.length && isQuote(at(i))) {
        q.push(at(i++).replace(/^\s*> ?/, ''));
      }
      out.push(`#encadre[\n${blocks(q).join('\n')}\n]\n`);
    } else if (isTableRow(l)) {
      const rows: string[] = [];
      while (i < lines.length && isTableRow(at(i))) rows.push(at(i++));
      out.push(table(rows));
    } else if (isBullet(l) || isNumbered(l)) {
      const numbered = isNumbered(l);
      const item: string[] = [];
      while (
        i < lines.length &&
        at(i).trim() !== '' &&
        !isHeading(at(i)) &&
        !isQuote(at(i)) &&
        (isBullet(at(i)) || isNumbered(at(i)) || /^\s+\S/.test(at(i)))
      ) {
        item.push(at(i++));
      }
      out.push(list(item, numbered));
    } else {
      const p: string[] = [];
      while (
        i < lines.length &&
        at(i).trim() !== '' &&
        !isHeading(at(i)) &&
        !isQuote(at(i)) &&
        !isTableRow(at(i)) &&
        !isBullet(at(i)) &&
        !isNumbered(at(i))
      ) {
        p.push(at(i++).trim());
      }
      let text = inline(p.join(' '));
      if (/^[-+=/]/.test(text)) text = '\\' + text;
      out.push(text + '\n');
    }
  }
  return out;
}

/** Markdown → Typst (markup), blocs séparés par une ligne vide. */
export function markdownToTypst(markdown: string): string {
  return blocks(markdown.split('\n')).join('\n');
}
