import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  charactersToWords,
  createElevenLabsProvider,
  type TtsProvider,
} from './tts.js';
import { synthesizeScript } from './voiceover.js';
import type { ShortScript } from './script-schema.js';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('charactersToWords', () => {
  it('groups character timings into words, punctuation attached', () => {
    const chars = 'Le 8, oui.'.split('');
    const starts = chars.map((_, i) => i * 0.1);
    const ends = chars.map((_, i) => i * 0.1 + 0.1);
    const words = charactersToWords({
      characters: chars,
      character_start_times_seconds: starts,
      character_end_times_seconds: ends,
    });
    expect(words.map((w) => w.word)).toEqual(['Le', '8,', 'oui.']);
    expect(words[0]).toEqual({ word: 'Le', start: 0, end: 0.2 });
    expect(words[2].start).toBeCloseTo(0.6);
    expect(words[2].end).toBeCloseTo(1.0);
  });

  it('returns no words for an empty alignment', () => {
    expect(
      charactersToWords({
        characters: [],
        character_start_times_seconds: [],
        character_end_times_seconds: [],
      }),
    ).toEqual([]);
  });
});

describe('createElevenLabsProvider', () => {
  it('calls the with-timestamps endpoint and decodes the response', async () => {
    const fetchFn = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        expect(String(url)).toBe(
          'https://api.elevenlabs.io/v1/text-to-speech/voice-1/with-timestamps?output_format=mp3_44100_128',
        );
        const body = JSON.parse(String(init?.body));
        expect(body.model_id).toBe('eleven_multilingual_v2');
        expect(body.language_code).toBe('fr');
        expect((init?.headers as Record<string, string>)['xi-api-key']).toBe(
          'k',
        );
        return new Response(
          JSON.stringify({
            audio_base64: Buffer.from('mp3').toString('base64'),
            alignment: {
              characters: ['O', 'k'],
              character_start_times_seconds: [0, 0.1],
              character_end_times_seconds: [0.1, 0.3],
            },
            normalized_alignment: null,
          }),
          { status: 200 },
        );
      },
    );
    const provider = createElevenLabsProvider({
      apiKey: 'k',
      voiceId: 'voice-1',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const r = await provider.synthesize('Ok');
    expect(r.audio.toString()).toBe('mp3');
    expect(r.words).toEqual([{ word: 'Ok', start: 0, end: 0.3 }]);
    expect(r.durationSec).toBe(0.3);
  });

  it('throws with the HTTP status on failure', async () => {
    const provider = createElevenLabsProvider({
      apiKey: 'k',
      voiceId: 'v',
      fetchFn: (async () =>
        new Response('quota', { status: 429 })) as unknown as typeof fetch,
    });
    await expect(provider.synthesize('x')).rejects.toThrow('HTTP 429');
  });
});

describe('synthesizeScript', () => {
  const script: ShortScript = {
    title: 't',
    scenes: [
      {
        id: 's1',
        kind: 'hook',
        durationSec: 5,
        voiceover: 'Bonjour à tous.',
        onScreenText: '',
        visual: 'title',
        lowerThird: null,
      },
      {
        id: 's2',
        kind: 'outro',
        durationSec: 5,
        voiceover: '   ',
        onScreenText: 'url',
        visual: 'source',
        lowerThird: null,
      },
      {
        id: 's3',
        kind: 'result',
        durationSec: 2,
        voiceover: 'Trop long pour deux secondes.',
        onScreenText: '',
        visual: 'hemicycle',
        lowerThird: null,
      },
    ],
    description: 'd',
    hashtags: ['#a', '#b', '#c'],
  };

  const fake: TtsProvider = {
    name: 'fake',
    voiceId: 'v',
    modelId: 'm',
    async synthesize(text) {
      const words = text
        .split(' ')
        .map((w, i) => ({ word: w, start: i, end: i + 0.9 }));
      return { audio: Buffer.from(text), words, durationSec: words.length };
    },
  };

  it('writes one file per spoken scene and records timings', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'shorts-'));
    const v = await synthesizeScript('short-1', script, fake, dir);
    expect(v.provider).toBe('fake');
    expect(v.scenes.map((s) => s.sceneId)).toEqual(['s1', 's3']);
    expect(v.scenes[0].file).toBe(path.join('short-1', 'scene-s1.mp3'));
    expect(v.scenes[0].durationSec).toBe(3);
    expect(v.scenes[0].words).toHaveLength(3);
    const content = await readFile(path.join(dir, v.scenes[0].file), 'utf8');
    expect(content).toBe('Bonjour à tous.');
    await expect(
      stat(path.join(dir, 'short-1', 'scene-s2.mp3')),
    ).rejects.toThrow();
  });
});
