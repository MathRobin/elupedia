import { describe, it, expect } from 'vitest';
import { buildDescription } from './description.js';
import { buildBallotFacts, officialSources } from './script-facts.js';
import type { ShortScript } from './script-schema.js';

const facts = {
  shortId: 's',
  ballots: [
    buildBallotFacts({
      id: 'b1',
      anId: 'scrutin-VTANR5L17V8611',
      dossierRef: 'DLR5L17N54847',
      title: "la proposition de résolution visant à refonder l'espace Schengen",
      date: '2026-10-08',
      type: 'scrutin public ordinaire',
      result: 'rejected',
      counts: { for: 141, against: 199, abstain: 5, absent: 2 },
      groups: [
        {
          groupName: 'Rassemblement National (RN)',
          memberCount: 574,
          position: 'for',
          votesFor: 118,
          votesAgainst: 0,
          votesAbstain: 0,
          votesAbsent: 0,
        },
      ],
    }),
  ],
};

const script: ShortScript = {
  title: 'Espace Schengen : le vote du 8 octobre 2026',
  scenes: [],
  description:
    "Le 8 octobre 2026, l'Assemblée nationale a rejeté une proposition de résolution sur l'espace Schengen.",
  hashtags: ['#Elupedia', '#Schengen'],
};

describe('officialSources', () => {
  it('links the AN scrutin page, the dossier and the open data', () => {
    const urls = officialSources({
      anId: 'scrutin-VTANR5L17V8611',
      dossierRef: 'DLR5L17N54847',
    }).map((s) => s.url);
    expect(urls).toEqual([
      'https://www.assemblee-nationale.fr/dyn/17/scrutins/8611',
      'https://www.assemblee-nationale.fr/dyn/17/dossiers/DLR5L17N54847',
      'https://data.assemblee-nationale.fr/travaux-parlementaires/votes',
    ]);
    expect(officialSources({ anId: 'scrutin-VTANR5L17V8611' })).toHaveLength(2);
  });

  it('links the Senate scrutin page and the session index', () => {
    const urls = officialSources({ anId: 'senat-scrutin-2025-340' }).map(
      (s) => s.url,
    );
    expect(urls).toEqual([
      'https://www.senat.fr/scrutin-public/2025/scr2025-340.html',
      'https://www.senat.fr/scrutin-public/scr2025.html',
    ]);
  });

  it('returns nothing for an unknown or europarl id', () => {
    expect(officialSources({ anId: 'europarl-vote-123' })).toEqual([]);
    expect(officialSources({ anId: null })).toEqual([]);
  });
});

describe('buildDescription', () => {
  const text = buildDescription(facts, script);

  it('starts with the factual summary and states the figures', () => {
    expect(text.startsWith(script.description)).toBe(true);
    expect(text).toContain(
      'Assemblée nationale, 8 octobre 2026 — texte rejeté : 141 pour, 199 contre, 5 abstention(s), 229 sur 574',
    );
  });

  it('links the Elupedia page and every official source', () => {
    expect(text).toContain('https://www.elupedia.fr/scrutins/b1');
    expect(text).toContain(
      'https://www.assemblee-nationale.fr/dyn/17/scrutins/8611',
    );
    expect(text).toContain(
      'https://www.assemblee-nationale.fr/dyn/17/dossiers/DLR5L17N54847',
    );
    expect(text).toContain('licence ouverte');
  });

  it('ends with the hashtags and stays within the YouTube limit', () => {
    expect(text.trimEnd().endsWith('#Elupedia #Schengen')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(5000);
  });
});
