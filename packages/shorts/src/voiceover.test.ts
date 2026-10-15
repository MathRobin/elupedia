import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findFfTools, processRecording } from './audio.js';
import {
  findRecording,
  importRecordings,
  readingSheet,
  spokenScenes,
} from './voiceover.js';
import type { ShortScript } from './script-schema.js';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const script: ShortScript = {
  title: 'Titre',
  scenes: [
    {
      id: 's1',
      kind: 'hook',
      durationSec: 6,
      voiceover: 'Bonjour à tous. Voici le vote.',
      onScreenText: '',
      visual: 'title',
      lowerThird: null,
    },
    {
      id: 's2',
      kind: 'outro',
      durationSec: 5,
      voiceover: '',
      onScreenText: 'url',
      visual: 'source',
      lowerThird: null,
    },
    {
      id: 's3',
      kind: 'result',
      durationSec: 8,
      voiceover: 'Le texte est rejeté.',
      onScreenText: '',
      visual: 'hemicycle',
      lowerThird: null,
    },
  ],
  description: 'd',
  hashtags: ['#a', '#b', '#c'],
};

describe('reading sheet and file lookup', () => {
  it('lists only spoken scenes with target duration and word count', () => {
    expect(spokenScenes(script).map((s) => s.id)).toEqual(['s1', 's3']);
    const sheet = readingSheet('abc', script);
    expect(sheet).toContain('scene-s1 · 6 s prévues · 6 mots');
    expect(sheet).toContain('Le texte est rejeté.');
    expect(sheet).not.toContain('scene-s2');
  });

  it('finds recordings by scene id, any case and supported extension', () => {
    const files = ['Scene-S1.WAV', 'notes.txt', 'scene-s3.m4a', 'scene-s2.png'];
    expect(findRecording(files, 's1')).toBe('Scene-S1.WAV');
    expect(findRecording(files, 's3')).toBe('scene-s3.m4a');
    expect(findRecording(files, 's2')).toBeUndefined();
  });
});

/** Tonalité de 440 Hz de `tone` secondes, puis silence, via ffmpeg. */
function makeWav(file: string, parts: ('tone' | 'silence')[], sec = 1): void {
  const { ffmpeg } = findFfTools();
  const inputs = parts.flatMap((p) => [
    '-f',
    'lavfi',
    '-t',
    String(sec),
    '-i',
    p === 'tone'
      ? 'sine=frequency=440:sample_rate=44100'
      : 'anullsrc=r=44100:cl=mono',
  ]);
  const concat =
    parts.map((_, i) => `[${i}:a]`).join('') +
    `concat=n=${parts.length}:v=0:a=1`;
  execFileSync(ffmpeg, [
    '-y',
    '-loglevel',
    'error',
    ...inputs,
    '-filter_complex',
    concat,
    '-c:a',
    'pcm_s16le',
    file,
  ]);
}

describe('importRecordings (real ffmpeg)', () => {
  it('trims edge silence, normalises, and times the words of the script', async () => {
    const out = await mkdtemp(path.join(os.tmpdir(), 'voice-'));
    const rec = path.join(out, 'abc', 'recordings');
    await mkdir(rec, { recursive: true });
    // s1 : 1 s de silence, 1 s de parole, 0,6 s de pause, 1 s de parole, 1 s de silence.
    const { ffmpeg } = findFfTools();
    const mk = (kind: string, sec: number) => [
      '-f',
      'lavfi',
      '-t',
      String(sec),
      '-i',
      kind === 'tone'
        ? 'sine=frequency=440:sample_rate=44100'
        : 'anullsrc=r=44100:cl=mono',
    ];
    execFileSync(ffmpeg, [
      '-y',
      '-loglevel',
      'error',
      ...mk('s', 1),
      ...mk('tone', 1),
      ...mk('s', 0.6),
      ...mk('tone', 1),
      ...mk('s', 1),
      '-filter_complex',
      '[0:a][1:a][2:a][3:a][4:a]concat=n=5:v=0:a=1',
      '-c:a',
      'pcm_s16le',
      path.join(rec, 'scene-s1.wav'),
    ]);
    makeWav(path.join(rec, 'scene-s3.wav'), ['silence', 'tone', 'silence'], 1);

    const v = await importRecordings('abc', script, { outputDir: out });
    expect(v.provider).toBe('recorded');
    expect(v.scenes.map((s) => s.sceneId)).toEqual(['s1', 's3']);

    const s1 = v.scenes[0];
    // 1 + 0,6 + 1 s de parole + marges de 0,15 s de chaque côté ≈ 2,9 s.
    expect(s1.durationSec).toBeGreaterThan(2.7);
    expect(s1.durationSec).toBeLessThan(3.3);
    expect(s1.words.map((w) => w.word)).toEqual([
      'Bonjour',
      'à',
      'tous.',
      'Voici',
      'le',
      'vote.',
    ]);
    // La pause franche sépare les deux phrases : « Voici » démarre après la pause.
    expect(s1.words[2].end).toBeLessThan(1.3);
    expect(s1.words[3].start).toBeGreaterThan(1.6);
    expect(s1.file).toBe(path.join('abc', 'scene-s1.wav'));
  }, 60000);

  it('fails clearly when a take is missing or empty', async () => {
    const out = await mkdtemp(path.join(os.tmpdir(), 'voice-'));
    const rec = path.join(out, 'abc', 'recordings');
    await mkdir(rec, { recursive: true });
    await writeFile(path.join(rec, 'scene-s1.wav'), '');
    await expect(
      importRecordings('abc', script, { outputDir: out }),
    ).rejects.toThrow('prises manquantes dans');
    makeWav(path.join(rec, 'scene-s1.wav'), ['silence'], 2);
    makeWav(path.join(rec, 'scene-s3.wav'), ['tone'], 1);
    await expect(
      importRecordings('abc', script, { outputDir: out }),
    ).rejects.toThrow('presque pas de parole');
  }, 60000);
});

describe('processRecording', () => {
  it('is exported for direct use', () => {
    expect(typeof processRecording).toBe('function');
  });
});
