import { describe, it, expect, vi } from 'vitest';
import { buildBallotFacts, type ShortFacts } from './script-facts.js';
import type { ShortScript } from './script-schema.js';
import { generateScript, type ModelCall } from './generate-script.js';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const facts: ShortFacts = {
  shortId: 'short-1',
  ballots: [
    buildBallotFacts({
      id: 'b1',
      anId: 'senat-scrutin-2026-12',
      title: "sur l'ensemble du projet de loi agricole",
      date: '2026-10-07',
      type: 'ordinaire',
      result: 'rejected',
      counts: { for: 120, against: 200, abstain: 5, absent: 23 },
      groups: [],
    }),
  ],
};

const good: ShortScript = {
  title: 'Loi agricole : le Sénat rejette le texte',
  scenes: [
    {
      id: 's1',
      kind: 'hook',
      durationSec: 6,
      voiceover:
        'Le 7 octobre 2026, le Sénat a voté sur le projet de loi agricole.',
      onScreenText: '',
      visual: 'title',
      lowerThird: null,
    },
    {
      id: 's2',
      kind: 'context',
      durationSec: 8,
      voiceover: "Le scrutin portait sur l'ensemble du texte.",
      onScreenText: '',
      visual: 'title',
      lowerThird: null,
    },
    {
      id: 's3',
      kind: 'result',
      durationSec: 12,
      voiceover:
        'Le texte est rejeté : 120 voix pour, 200 contre, 5 abstentions.',
      onScreenText: '120 / 200',
      visual: 'hemicycle',
      lowerThird: null,
    },
    {
      id: 's4',
      kind: 'outro',
      durationSec: 10,
      voiceover: 'Le vote de chaque sénateur est consultable sur Elupedia.',
      onScreenText: 'https://www.elupedia.fr/scrutins/b1',
      visual: 'source',
      lowerThird: null,
    },
  ],
  description: 'Source : Elupedia — https://www.elupedia.fr/scrutins/b1',
  hashtags: ['#Elupedia', '#Sénat', '#Agriculture'],
};

function call(
  responses: (ShortScript | null)[],
  stopReason = 'end_turn',
): ModelCall & { calls: number } {
  let i = 0;
  const fn = (async () => {
    const script = responses[i++] ?? null;
    fn.calls = i;
    return {
      script,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(script),
          citations: null,
        },
      ],
      stopReason,
      usage: { inputTokens: 100, outputTokens: 50 },
    };
  }) as ModelCall & { calls: number };
  fn.calls = 0;
  return fn;
}

describe('generateScript', () => {
  it('returns a validated script on the first attempt', async () => {
    const outcome = await generateScript(facts, call([good]), 'test-model');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.attempts).toBe(1);
      expect(outcome.result.usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
      });
    }
  });

  it('retries once with the validation issues, then succeeds', async () => {
    const bad: ShortScript = {
      ...good,
      scenes: good.scenes.map((s) =>
        s.id === 's3'
          ? { ...s, voiceover: 'Un rejet historique : 999 voix contre.' }
          : s,
      ),
    };
    const fn = call([bad, good]);
    const outcome = await generateScript(facts, fn, 'test-model');
    expect(outcome.ok).toBe(true);
    expect(fn.calls).toBe(2);
    if (outcome.ok) expect(outcome.result.attempts).toBe(2);
  });

  it('gives up after the maximum number of attempts', async () => {
    const bad: ShortScript = { ...good, title: 'Un vote scandaleux' };
    const outcome = await generateScript(facts, call([bad, bad]), 'test-model');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.attempts).toBe(2);
      expect(outcome.issues[0].code).toBe('banned_word');
    }
  });

  it('stops on a refusal without retrying', async () => {
    const fn = call([null], 'refusal');
    const outcome = await generateScript(facts, fn, 'test-model');
    expect(outcome.ok).toBe(false);
    expect(fn.calls).toBe(1);
    if (!outcome.ok) expect(outcome.reason).toContain('refus');
  });
});
