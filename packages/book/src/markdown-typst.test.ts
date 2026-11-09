import { describe, expect, it } from 'vitest';
import { chapterToTypst } from './chapters.js';
import { escapeTypst, inline, markdownToTypst } from './markdown-typst.js';

describe('escapeTypst', () => {
  it('échappe les caractères spéciaux du markup Typst', () => {
    expect(escapeTypst('a # b $ c @ d <e>')).toBe(
      'a \\# b \\$ c \\@ d \\<e\\>',
    );
  });

  it("n'ouvre pas de commentaire avec « // »", () => {
    expect(escapeTypst('https://exemple.fr')).toBe('https:/\\/exemple.fr');
  });
});

describe('inline', () => {
  it('convertit gras, italique et lien', () => {
    expect(inline('un **gras** et _italique_')).toBe(
      'un #strong[gras] et #emph[italique]',
    );
    expect(inline('[site](https://a.fr)')).toBe('#link("https://a.fr")[site]');
  });

  it("ne prend pas un tiret bas dans un mot pour de l'italique", () => {
    expect(inline('snake_case_nom')).toBe('snake\\_case\\_nom');
  });
});

describe('markdownToTypst', () => {
  it('convertit titres, listes, citations et tableaux', () => {
    const typst = markdownToTypst(
      [
        '## Chiffres',
        '',
        '- un',
        '- deux',
        '',
        '> Source : X',
        '',
        '| Nom | Nombre |',
        '| --- | ------ |',
        '| A   | 1 234  |',
      ].join('\n'),
    );
    expect(typst).toContain('== Chiffres');
    expect(typst).toContain('- un\n- deux');
    expect(typst).toContain('#encadre[');
    expect(typst).toContain('align: (left, right)');
    expect(typst).toContain('[1 234]');
  });
});

describe('chapterToTypst', () => {
  const md = [
    '# 1. Titre',
    '',
    '> Brouillon. Source : X',
    '',
    'Texte repris par le chapitre.',
    '',
    '## Chiffres',
    '',
    'Un chiffre.',
    '',
    '## Précautions',
    '',
    '- Ne pas nommer.',
  ].join('\n');

  it('retire le titre et le texte d’ouverture, garde la source', () => {
    const typst = chapterToTypst(md);
    expect(typst).not.toContain('Titre');
    expect(typst).not.toContain('Texte repris');
    expect(typst).toContain('Brouillon');
    expect(typst).toContain('== Chiffres');
  });

  it('rend les sections de travail en notes, ou les omet', () => {
    expect(chapterToTypst(md)).toContain('#note-travail("Précautions")');
    const sans = chapterToTypst(md, { notes: false });
    expect(sans).not.toContain('note-travail("Précautions")');
    expect(sans).not.toContain('Ne pas nommer');
  });
});
