import { describe, it, expect } from 'vitest';
import { buildDescription } from '../description.js';
import { validateScript } from '../script-validate.js';
import {
  buildStaffersFacts,
  formatMean,
  staffersScript,
  type DeputyStaffCount,
} from './staffers.js';

const deputies: DeputyStaffCount[] = [
  ...Array.from({ length: 4 }, () => ({
    politicalGroup: 'Rassemblement National (RN)',
    staffers: 3,
  })),
  { politicalGroup: 'Rassemblement National (RN)', staffers: 7 },
  ...Array.from({ length: 3 }, () => ({
    politicalGroup: 'Horizons & Indépendants (HOR)',
    staffers: 3,
  })),
  { politicalGroup: 'Horizons & Indépendants (HOR)', staffers: 0 },
  {
    politicalGroup: 'La France insoumise - Nouveau Front Populaire (LFI-NFP)',
    staffers: 4,
  },
  {
    politicalGroup: 'La France insoumise - Nouveau Front Populaire (LFI-NFP)',
    staffers: 5,
  },
  { politicalGroup: 'Les Démocrates (Dem)', staffers: 4 },
  { politicalGroup: 'Non inscrit (NI)', staffers: 2 },
  { politicalGroup: null, staffers: 1 },
];

const facts = buildStaffersFacts('short-1', deputies, '2026-10-15');
const topic = facts.topic!;

describe('buildStaffersFacts', () => {
  it('counts every deputy in the totals, non-inscrits included', () => {
    expect(topic.numbers.deputies).toBe(14);
    expect(topic.numbers.staffers).toBe(3 * 4 + 7 + 9 + 0 + 4 + 5 + 4 + 2 + 1);
    expect(topic.dateLabel).toBe('15 octobre 2026');
  });

  it('builds the distribution with a « 6 et plus » bar', () => {
    const bars = topic.charts[0]!.bars.map((b) => [b.label, b.value]);
    expect(bars).toEqual([
      ['0', 1],
      ['1', 1],
      ['2', 1],
      ['3', 7],
      ['4', 2],
      ['5', 1],
      ['6 et plus', 1],
    ]);
  });

  it('averages by group, alphabetical by acronym, without non-inscrits', () => {
    const bars = topic.charts[1]!.bars;
    expect(bars.map((b) => b.label)).toEqual(['Dem', 'HOR', 'LFI-NFP', 'RN']);
    expect(bars.find((b) => b.label === 'HOR')).toMatchObject({
      value: 2.25,
      count: 4,
      spokenLabel: 'Horizons et Indépendants',
      group: 'Horizons & Indépendants (HOR)',
    });
    expect(bars.find((b) => b.label === 'RN')?.value).toBe(3.8);
    expect(bars.find((b) => b.label === 'LFI-NFP')?.spokenLabel).toBe(
      'LFI-NFP',
    );
  });
});

describe('staffersScript', () => {
  const script = staffersScript(facts);

  it('passes the same validation as a generated script', () => {
    expect(validateScript(script, facts)).toEqual([]);
  });

  it('fits a short and ends on the source scene', () => {
    const total = script.scenes.reduce((s, sc) => s + sc.durationSec, 0);
    expect(total).toBeGreaterThanOrEqual(35);
    expect(total).toBeLessThanOrEqual(60);
    expect(script.scenes.at(-1)?.visual).toBe('source');
    expect(script.scenes.filter((s) => s.visual === 'chart')).toHaveLength(2);
    expect(script.scenes.map((s) => s.chart)).toEqual([
      null,
      null,
      'staffers-per-deputy',
      'mean-by-group',
      null,
    ]);
  });

  it('speaks the credit, the cap and the extremes by group', () => {
    const voice = script.scenes.map((s) => s.voiceover).join(' ');
    expect(voice).toContain('11 463 euros bruts par mois');
    expect(voice).toContain('cinq collaborateurs');
    expect(voice).toContain('Le plus souvent trois : 7 députés');
    expect(voice).toContain('1 en déclarent six ou plus');
    expect(voice).toContain(
      'de 2,3 collaborateurs pour Horizons et Indépendants à 4,5 pour LFI-NFP',
    );
    expect(voice).not.toMatch(/\bHOR\b|\bDem\b|\bRN\b/);
  });

  it('describes the video with the Elupedia link and every source', () => {
    const text = buildDescription(facts, script);
    expect(text).toContain('https://www.elupedia.fr/elus');
    for (const s of topic.sources) expect(text).toContain(s.url);
    expect(text).toContain('Assemblée nationale, 15 octobre 2026');
  });
});

describe('formatMean', () => {
  it('uses a comma and drops a trailing ,0 when spoken', () => {
    expect(formatMean(3.03)).toBe('3,0');
    expect(formatMean(3.03, true)).toBe('3');
    expect(formatMean(4.07, true)).toBe('4,1');
  });
});
