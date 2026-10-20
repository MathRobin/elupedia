import { describe, it, expect } from 'vitest';
import { buildDescription } from '../description.js';
import { validateScript } from '../script-validate.js';
import type { ShortFacts } from '../script-facts.js';
import type { ShortScript } from '../script-schema.js';
import { TOPICS } from './index.js';
import {
  buildWrittenQuestionsFacts,
  writtenQuestionsScript,
} from './written-questions.js';
import {
  buildSponsorshipsFacts,
  categoryOf,
  splitCandidateName,
  sponsorshipsScript,
} from './sponsorships-2022.js';
import {
  ageAt,
  buildDeputiesAgeFacts,
  deputiesAgeScript,
} from './deputies-age.js';
import {
  buildCampaignAccountsFacts,
  campaignAccountsScript,
  labelNames,
} from './campaign-accounts-2024.js';

const RN = 'Rassemblement National (RN)';
const HOR = 'Horizons & Indépendants (HOR)';
const LFI = 'La France insoumise - Nouveau Front Populaire (LFI-NFP)';
const NI = 'Non inscrit (NI)';

/** Ce que tout short « thème » doit respecter, quel que soit le thème. */
function expectSound(facts: ShortFacts, script: ShortScript) {
  expect(validateScript(script, facts)).toEqual([]);
  const total = script.scenes.reduce((s, sc) => s + sc.durationSec, 0);
  expect(total).toBeGreaterThanOrEqual(35);
  expect(total).toBeLessThanOrEqual(60);
  expect(script.scenes.at(-1)?.visual).toBe('source');
  expect(script.scenes.filter((s) => s.visual === 'chart')).toHaveLength(2);
  const text = buildDescription(facts, script);
  expect(text).toContain(facts.topic!.url);
  for (const s of facts.topic!.sources) expect(text).toContain(s.url);
}

describe('registre des thèmes', () => {
  it('expose chaque thème sous sa clé', () => {
    expect(Object.keys(TOPICS).sort()).toEqual([
      'age-deputes',
      'comptes-campagne-2024',
      'parrainages-2022',
      'questions-ecrites',
      'staffers',
    ]);
    for (const [key, t] of Object.entries(TOPICS)) expect(t.key).toBe(key);
  });
});

describe('questions-ecrites', () => {
  const facts = buildWrittenQuestionsFacts('s', {
    deputies: [
      { politicalGroup: RN, questions: 0, answered: 0 },
      { politicalGroup: RN, questions: 12, answered: 6 },
      { politicalGroup: RN, questions: 30, answered: 24 },
      { politicalGroup: HOR, questions: 5, answered: 5 },
      { politicalGroup: HOR, questions: 60, answered: 20 },
      { politicalGroup: LFI, questions: 120, answered: 60 },
      { politicalGroup: NI, questions: 3, answered: 0 },
    ],
    medianDelayDays: 126,
    asOf: '2026-10-12',
  });
  const script = writtenQuestionsScript(facts);

  it('counts questions, answers and the distribution buckets', () => {
    expect(facts.topic!.numbers).toMatchObject({
      deputies: 7,
      questions: 230,
      answered: 115,
      answeredPercent: 50,
      zero: 1,
      capPerSession: 52,
    });
    expect(facts.topic!.charts[0]!.bars.map((b) => b.value)).toEqual([
      1, 2, 2, 1, 1,
    ]);
  });

  it('gives the answered share by group, alphabetical, without non-inscrits', () => {
    const bars = facts.topic!.charts[1]!.bars;
    expect(bars.map((b) => [b.label, b.value, b.count])).toEqual([
      ['HOR', 38, 65],
      ['LFI-NFP', 50, 120],
      ['RN', 71, 42],
    ]);
  });

  it('validates and speaks the rules and the extremes', () => {
    expectSound(facts, script);
    const voice = script.scenes.map((s) => s.voiceover).join(' ');
    expect(voice).toContain('deux mois');
    expect(voice).toContain('52 questions');
    expect(voice).toContain(
      'de 38 % pour Horizons et Indépendants à 71 % pour Rassemblement National',
    );
  });
});

describe('parrainages-2022', () => {
  it('maps sponsor functions to categories', () => {
    expect(categoryOf("Maire déléguée d'une commune associée")).toBe('Maires');
    expect(categoryOf('Conseillère départementale')).toBe(
      'Conseillers départementaux',
    );
    expect(categoryOf('Représentante française au Parlement européen')).toBe(
      'Parlementaires',
    );
    expect(categoryOf('Présidente du conseil consulaire')).toBe(
      "Élus des Français de l'étranger",
    );
    expect(categoryOf("Président d'un EPCI à fiscalité propre")).toBe(
      'Autres élus',
    );
  });

  it('splits and title-cases candidate names', () => {
    expect(splitCandidateName('PÉCRESSE Valérie')).toEqual({
      last: 'Pécresse',
      full: 'Valérie Pécresse',
    });
    expect(splitCandidateName('LE PEN Marine')).toEqual({
      last: 'Le Pen',
      full: 'Marine Le Pen',
    });
    expect(splitCandidateName('DUPONT-AIGNAN Nicolas').last).toBe(
      'Dupont-Aignan',
    );
    expect(splitCandidateName('SMATI  Rafik').full).toBe('Rafik Smati');
  });

  const facts = buildSponsorshipsFacts('s', {
    functions: [
      { rawFunction: 'Maire', n: 700 },
      { rawFunction: 'Conseiller départemental', n: 200 },
      { rawFunction: 'Député', n: 100 },
      { rawFunction: 'Conseiller de Paris', n: 50 },
    ],
    candidates: [
      { candidateName: 'PÉCRESSE Valérie', n: 600 },
      { candidateName: 'ARTHAUD Nathalie', n: 510 },
      { candidateName: 'TAUBIRA Christiane', n: 274 },
    ],
    asOf: '2022-03-07',
  });
  const script = sponsorshipsScript(facts);

  it('keeps only qualified candidates, alphabetical, and the mayors share', () => {
    expect(facts.topic!.charts[1]!.bars.map((b) => b.label)).toEqual([
      'Arthaud',
      'Pécresse',
    ]);
    expect(facts.topic!.charts[0]!.bars[0]).toMatchObject({
      label: 'Maires',
      value: 700,
    });
    expect(facts.topic!.numbers).toMatchObject({
      inBase: 1050,
      mayors: 700,
      mayorsPercent: 67,
      qualified: 2,
    });
  });

  it('validates and cites the official totals', () => {
    expectSound(facts, script);
    const voice = script.scenes.map((s) => s.voiceover).join(' ');
    expect(voice).toContain('13 427 parrainages');
    expect(voice).toContain('Deux candidats ont franchi la barre des 500');
    expect(voice).toContain(
      'de 510 parrainages pour Nathalie Arthaud à 600 pour Valérie Pécresse',
    );
  });
});

describe('age-deputes', () => {
  it('computes full years at a date', () => {
    expect(ageAt('1990-10-20', '2026-10-19')).toBe(35);
    expect(ageAt('1990-10-19', '2026-10-19')).toBe(36);
  });

  const facts = buildDeputiesAgeFacts('s', {
    deputies: [
      { politicalGroup: RN, birthDate: '2000-01-01' },
      { politicalGroup: RN, birthDate: '1980-01-01' },
      { politicalGroup: HOR, birthDate: '1960-01-01' },
      { politicalGroup: HOR, birthDate: '1950-01-01' },
      { politicalGroup: NI, birthDate: '1970-01-01' },
    ],
    asOf: '2026-06-01',
  });
  const script = deputiesAgeScript(facts);

  it('buckets ages and averages by group', () => {
    expect(facts.topic!.numbers).toMatchObject({
      deputies: 5,
      youngest: 26,
      oldest: 76,
      meanAge: 54,
    });
    expect(facts.topic!.charts[0]!.bars.map((b) => b.value)).toEqual([
      1, 0, 1, 1, 1, 1,
    ]);
    expect(facts.topic!.charts[1]!.bars.map((b) => [b.label, b.value])).toEqual(
      [
        ['HOR', 71],
        ['RN', 36],
      ],
    );
  });

  it('validates and speaks the range', () => {
    expectSound(facts, script);
    const voice = script.scenes.map((s) => s.voiceover).join(' ');
    expect(voice).toContain('18 ans pour être candidat');
    expect(voice).toContain(
      'de 36 ans pour Rassemblement National à 71 ans pour Horizons et Indépendants',
    );
  });
});

describe('comptes-campagne-2024', () => {
  it('shortens labels for the screen and the voice', () => {
    expect(labelNames('Ensemble ! (Majorité présidentielle)')).toEqual({
      short: 'Ensemble !',
      spoken: 'Ensemble, majorité présidentielle',
    });
    expect(labelNames('Union de la gauche')).toEqual({
      short: 'Union de la gauche',
      spoken: 'Union de la gauche',
    });
  });

  const many = (label: string, expenses: number | null, n = 100) =>
    Array.from({ length: n }, () => ({
      politicalLabel: label,
      expensesRetained: expenses,
      reimbursement: expenses ? expenses / 2 : 0,
    }));
  const facts = buildCampaignAccountsFacts('s', {
    accounts: [
      ...many('Union de la gauche', 20000),
      ...many('Rassemblement National', 8000),
      ...many('Extrême gauche', 100),
      ...many('Divers', null, 50),
      {
        politicalLabel: 'Divers',
        expensesRetained: 60000,
        reimbursement: 30000,
      },
    ],
    asOf: '2026-10-19',
  });
  const script = campaignAccountsScript(facts);

  it('derives median, totals and buckets from retained expenses', () => {
    expect(facts.topic!.numbers).toMatchObject({
      electionYear: 2024,
      accounts: 351,
      withExpenses: 301,
      reimbursed: 301,
      medianExpenses: 8000,
      maxExpenses: 60000,
      totalExpensesMillions: 2.9,
      totalReimbursementMillions: 1.4,
    });
    expect(facts.topic!.charts[0]!.bars.map((b) => b.value)).toEqual([
      100, 100, 100, 0, 1,
    ]);
    expect(
      facts.topic!.charts[1]!.bars.map((b) => [b.label, b.value, b.count]),
    ).toEqual([
      ['Extrême gauche', 100, 100],
      ['Rassemblement National', 8000, 100],
      ['Union de la gauche', 20000, 100],
    ]);
  });

  it('validates, including « la gauche » in a label and the decimal rules', () => {
    expectSound(facts, script);
    const voice = script.scenes.map((s) => s.voiceover).join(' ');
    expect(voice).toContain(
      '38 000 euros par candidat, plus 0,15 euro par habitant',
    );
    expect(voice).toContain('47,5 % du plafond');
    expect(voice).toContain('pour Union de la gauche');
  });
});
