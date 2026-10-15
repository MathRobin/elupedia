import type { WordTiming } from './words.js';

/**
 * Logique pure (sans ffmpeg) de traitement des enregistrements : lecture de la
 * sortie de `silencedetect`, recadrage, et horodatage des mots du script sur
 * l'audio enregistré, pour les sous-titres.
 */

export interface Silence {
  start: number;
  /** null : le silence dure jusqu'à la fin du fichier. */
  end: number | null;
}

export function parseSilences(stderr: string): Silence[] {
  const silences: Silence[] = [];
  for (const line of stderr.split('\n')) {
    const start = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (start) {
      silences.push({ start: Math.max(0, Number(start[1])), end: null });
      continue;
    }
    const end = line.match(/silence_end:\s*(-?[\d.]+)/);
    if (end && silences.length > 0) {
      silences[silences.length - 1].end = Number(end[1]);
    }
  }
  return silences;
}

export interface SpeechSpan {
  start: number;
  end: number;
}

/** Début et fin de la parole : on retire le silence de tête et de queue. */
export function speechSpan(silences: Silence[], duration: number): SpeechSpan {
  const EPS = 0.05;
  let start = 0;
  let end = duration;
  const first = silences[0];
  if (first && first.start <= EPS && first.end !== null) start = first.end;
  const last = silences[silences.length - 1];
  if (last && (last.end === null || last.end >= duration - EPS)) {
    if (last.start > start) end = last.start;
  }
  return { start, end: Math.max(end, start) };
}

/** Pauses franches à l'intérieur de la parole (entre deux phrases). */
export function internalPauses(
  silences: Silence[],
  span: SpeechSpan,
  minSec = 0.25,
): { start: number; end: number }[] {
  return silences
    .filter(
      (s): s is { start: number; end: number } =>
        s.end !== null &&
        s.start > span.start + 0.05 &&
        s.end < span.end - 0.05 &&
        s.end - s.start >= minSec,
    )
    .map((s) => ({ start: s.start, end: s.end }));
}

const SENTENCE_END = /[.!?;:]$/;

function weight(word: string): number {
  return word.replace(/[^\p{L}\p{N}]/gu, '').length + 1;
}

/**
 * Horodate les mots du script sur l'enregistrement. Si le nombre de pauses
 * franches détectées correspond au nombre de coupures de phrases du script,
 * chaque phrase est calée entre deux pauses ; sinon, répartition
 * proportionnelle à la longueur des mots sur toute la parole, avec un petit
 * temps mort après chaque fin de phrase. Estimation, pas une transcription :
 * suffisante pour des sous-titres groupés en lignes de quelques mots.
 */
export function alignWords(
  text: string,
  span: SpeechSpan,
  pauses: { start: number; end: number }[],
): WordTiming[] {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const segments: string[][] = [];
  let current: string[] = [];
  for (const w of words) {
    current.push(w);
    if (SENTENCE_END.test(w)) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length > 0) segments.push(current);

  const spread = (
    list: string[],
    from: number,
    to: number,
    gapAfterSentence: number,
  ): WordTiming[] => {
    const weights = list.map(weight);
    const gaps = list.map((w, i) =>
      SENTENCE_END.test(w) && i < list.length - 1 ? gapAfterSentence : 0,
    );
    const total = weights.reduce((a, b) => a + b, 0);
    const gapTotal = gaps.reduce((a, b) => a + b, 0);
    const speaking = Math.max(0, to - from - gapTotal);
    let t = from;
    return list.map((word, i) => {
      const dur = (weights[i] / total) * speaking;
      const out = { word, start: t, end: t + dur * 0.92 };
      t += dur + gaps[i];
      return out;
    });
  };

  if (segments.length > 1 && pauses.length === segments.length - 1) {
    const out: WordTiming[] = [];
    segments.forEach((seg, i) => {
      const from = i === 0 ? span.start : pauses[i - 1].end;
      const to = i === segments.length - 1 ? span.end : pauses[i].start;
      out.push(...spread(seg, from, to, 0));
    });
    return out;
  }
  return spread(words, span.start, span.end, 0.25);
}
