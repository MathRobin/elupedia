/** Tests de tts.ts : regroupement des caractères en mots, appel ElevenLabs simulé, lecture de l'environnement. */
import { describe, it, expect, vi } from 'vitest';
import {
  charactersToWords,
  createElevenLabsProvider,
  elevenLabsFromEnv,
  parseSpeed,
} from './tts.js';

describe('charactersToWords', () => {
  it('groups characters into words, punctuation attached to the preceding word', () => {
    const chars = 'Oui, non.'.split('');
    const words = charactersToWords({
      characters: chars,
      character_start_times_seconds: chars.map((_, i) => i * 0.1),
      character_end_times_seconds: chars.map((_, i) => (i + 1) * 0.1),
    });
    expect(words).toEqual([
      { word: 'Oui,', start: 0, end: 0.4 },
      { word: 'non.', start: 0.5, end: 0.9 },
    ]);
  });
});

describe('createElevenLabsProvider', () => {
  it('posts the text with the voice settings and decodes audio and timings', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        audio_base64: Buffer.from('mp3').toString('base64'),
        alignment: {
          characters: ['O', 'k'],
          character_start_times_seconds: [0, 0.2],
          character_end_times_seconds: [0.2, 0.4],
        },
        normalized_alignment: null,
      }),
    });
    const provider = createElevenLabsProvider({
      apiKey: 'k',
      voiceId: 'v 1',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const result = await provider.synthesize('Ok');
    expect(result.audio.toString()).toBe('mp3');
    expect(result.words).toEqual([{ word: 'Ok', start: 0, end: 0.4 }]);
    expect(result.durationSec).toBe(0.4);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('/text-to-speech/v%201/with-timestamps');
    expect(init.headers['xi-api-key']).toBe('k');
    expect(JSON.parse(init.body)).toMatchObject({
      text: 'Ok',
      model_id: 'eleven_multilingual_v2',
      language_code: 'fr',
    });
  });

  it('reports HTTP errors with the response body', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'bad key',
    });
    const provider = createElevenLabsProvider({
      apiKey: 'k',
      voiceId: 'v',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(provider.synthesize('x')).rejects.toThrow(
      'ElevenLabs HTTP 401 : bad key',
    );
  });
});

describe('elevenLabsFromEnv', () => {
  it('returns null without key or voice, a provider otherwise', () => {
    expect(elevenLabsFromEnv({})).toBeNull();
    expect(elevenLabsFromEnv({ ELEVENLABS_API_KEY: 'k' })).toBeNull();
    const p = elevenLabsFromEnv({
      ELEVENLABS_API_KEY: 'k',
      ELEVENLABS_VOICE_ID: 'v',
      ELEVENLABS_MODEL_ID: 'eleven_flash_v2_5',
    });
    expect(p?.voiceId).toBe('v');
    expect(p?.modelId).toBe('eleven_flash_v2_5');
  });
});

describe('parseSpeed', () => {
  it('defaults to 0.95 and clamps to the API range', () => {
    expect(parseSpeed(undefined)).toBe(0.95);
    expect(parseSpeed('')).toBe(0.95);
    expect(parseSpeed('vite')).toBe(0.95);
    expect(parseSpeed('1')).toBe(1);
    expect(parseSpeed('1.05')).toBe(1.05);
    expect(parseSpeed('2')).toBe(1.2);
    expect(parseSpeed('0.1')).toBe(0.7);
  });
});
