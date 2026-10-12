import type { Scene, ShortScript } from '../script-schema.js';
import type { StoredVoiceover, VoiceoverScene } from '../voiceover.js';
import type { WordTiming } from '../tts.js';
import { politicalGroupRank } from '@elupedia/shared/src/political-group-order.js';

/**
 * Découpage temporel du short : une entrée par scène, en frames. La durée
 * d'une scène est le max entre la durée prévue par le script et la durée de
 * sa voix off (plus une respiration), pour ne jamais couper la parole.
 */

export const SCENE_TAIL_SEC = 0.5;

export interface TimelineScene {
  scene: Scene;
  from: number;
  durationInFrames: number;
  audio: VoiceoverScene | null;
}

export interface Timeline {
  fps: number;
  scenes: TimelineScene[];
  totalFrames: number;
}

export function buildTimeline(
  script: ShortScript,
  voiceover: StoredVoiceover | null,
  fps: number,
): Timeline {
  const audioById = new Map(
    (voiceover?.scenes ?? []).map((s) => [s.sceneId, s]),
  );
  let from = 0;
  const scenes: TimelineScene[] = script.scenes.map((scene) => {
    const audio = audioById.get(scene.id) ?? null;
    const seconds = Math.max(
      scene.durationSec,
      audio ? audio.durationSec + SCENE_TAIL_SEC : 0,
    );
    const durationInFrames = Math.max(1, Math.ceil(seconds * fps));
    const entry = { scene, from, durationInFrames, audio };
    from += durationInFrames;
    return entry;
  });
  return { fps, scenes, totalFrames: from };
}

export interface SubtitleChunk {
  words: WordTiming[];
  start: number;
  end: number;
}

export const SUBTITLE_MAX_CHARS = 30;
/** Temps d'affichage conservé après le dernier mot d'un groupe. */
const CHUNK_TAIL_SEC = 0.25;

/**
 * Regroupe les mots en lignes courtes lisibles d'un coup d'œil. Une ligne se
 * termine quand elle atteint la longueur maximale ou sur une ponctuation
 * forte, pour suivre le rythme des phrases.
 */
export function chunkWords(
  words: WordTiming[],
  maxChars = SUBTITLE_MAX_CHARS,
): SubtitleChunk[] {
  const chunks: SubtitleChunk[] = [];
  let current: WordTiming[] = [];
  let length = 0;
  const flush = () => {
    if (current.length === 0) return;
    chunks.push({
      words: current,
      start: current[0].start,
      end: current[current.length - 1].end + CHUNK_TAIL_SEC,
    });
    current = [];
    length = 0;
  };
  for (const w of words) {
    const extra = w.word.length + (current.length > 0 ? 1 : 0);
    if (current.length > 0 && length + extra > maxChars) flush();
    current.push(w);
    length += extra;
    if (/[.!?;:]$/.test(w.word)) flush();
  }
  flush();
  // Pas de trou entre deux groupes consécutifs : le suivant commence quand
  // le précédent finit, sauf vraie pause.
  for (let i = 0; i < chunks.length - 1; i++) {
    if (chunks[i].end > chunks[i + 1].start)
      chunks[i].end = chunks[i + 1].start;
  }
  return chunks;
}

export function activeChunk(
  chunks: SubtitleChunk[],
  t: number,
): SubtitleChunk | null {
  return chunks.find((c) => t >= c.start && t < c.end) ?? null;
}

export type SeatPosition = 'for' | 'against' | 'abstain' | 'absent';

/**
 * Suite de positions pour N sièges : pour, abstention, puis en gris tous ceux
 * qui n'ont pas pris part au vote (non-votants déclarés et sièges restants,
 * l'AN ne listant pas les absents), puis contre. Les gris au milieu séparent
 * visuellement les pour (gauche) des contre (droite).
 */
export function assignSeats(
  counts: { for: number; against: number; abstain: number; absent: number },
  totalSeats: number,
): SeatPosition[] {
  const take = (pos: SeatPosition, n: number) =>
    Array.from({ length: Math.max(0, n) }, () => pos);
  const forN = Math.min(counts.for, totalSeats);
  const abstainN = Math.min(counts.abstain, totalSeats - forN);
  const againstN = Math.min(counts.against, totalSeats - forN - abstainN);
  const greyN = totalSeats - forN - abstainN - againstN;
  return [
    ...take('for', forN),
    ...take('abstain', abstainN),
    ...take('absent', greyN),
    ...take('against', againstN),
  ];
}

/**
 * Colore un hémicycle générique de gauche à droite (pour à gauche, contre à
 * droite, comme la convention des graphiques de scrutin) : les sièges sont
 * attribués par angle croissant autour du podium, pas dans l'ordre des
 * rangées, sinon on obtient des anneaux concentriques.
 */
export function assignSeatsByAngle(
  counts: { for: number; against: number; abstain: number; absent: number },
  seats: readonly (readonly [number, number])[],
): SeatPosition[] {
  const sequence = assignSeats(counts, seats.length);
  const byAngle = seats
    .map(([x, y], i) => ({ i, angle: Math.atan2(y, x) }))
    // π (gauche) → 0 (droite)
    .sort((a, b) => b.angle - a.angle);
  const positions: SeatPosition[] = new Array(seats.length);
  byAngle.forEach((seat, k) => {
    positions[seat.i] = sequence[k];
  });
  return positions;
}

export interface GroupSeatCounts {
  name: string;
  memberCount: number | null;
  for: number;
  against: number;
  abstain: number;
}

/**
 * Hémicycle « en salle » : chaque groupe occupe un bloc, de gauche à droite
 * selon son placement politique (`politicalGroupRank`), et chaque siège du
 * bloc prend la couleur du vote de son occupant — pour, abstention, puis en
 * gris les membres n'ayant pas pris part au vote, puis contre. La division
 * d'un groupe se lit ainsi dans son propre bloc. Sans effectifs de groupe
 * (Sénat), se rabattre sur `assignSeatsByAngle`.
 */
export function assignSeatsByGroup(
  groups: readonly GroupSeatCounts[],
  seats: readonly (readonly [number, number])[],
): SeatPosition[] {
  const ordered = [...groups]
    .filter((g) => (g.memberCount ?? 0) > 0)
    .sort(
      (a, b) =>
        politicalGroupRank(a.name) - politicalGroupRank(b.name) ||
        a.name.localeCompare(b.name, 'fr'),
    );
  const sequence: SeatPosition[] = [];
  for (const g of ordered) {
    const members = g.memberCount ?? 0;
    const forN = Math.min(g.for, members);
    const abstainN = Math.min(g.abstain, members - forN);
    const againstN = Math.min(g.against, members - forN - abstainN);
    const greyN = members - forN - abstainN - againstN;
    sequence.push(
      ...Array.from({ length: forN }, (): SeatPosition => 'for'),
      ...Array.from({ length: abstainN }, (): SeatPosition => 'abstain'),
      ...Array.from({ length: greyN }, (): SeatPosition => 'absent'),
      ...Array.from({ length: againstN }, (): SeatPosition => 'against'),
    );
  }
  while (sequence.length < seats.length) sequence.push('absent');
  const byAngle = seats
    .map(([x, y], i) => ({ i, angle: Math.atan2(y, x) }))
    .sort((a, b) => b.angle - a.angle);
  const positions: SeatPosition[] = new Array(seats.length);
  byAngle.forEach((seat, k) => {
    positions[seat.i] = sequence[k];
  });
  return positions;
}

/** Débit de lecture retenu pour estimer des sous-titres sans voix off. */
export const ESTIMATED_WORDS_PER_SEC = 2.6;

/**
 * Horodatage estimé des mots d'un texte, quand aucune voix off n'existe
 * (démo, clés TTS absentes) : débit constant, pause un peu plus longue après
 * une ponctuation forte. Les sous-titres restent affichables, sans audio.
 */
export function estimateWordTimings(
  text: string,
  startSec = 0.3,
  wordsPerSec = ESTIMATED_WORDS_PER_SEC,
): WordTiming[] {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const step = 1 / wordsPerSec;
  let t = startSec;
  return words.map((word) => {
    const start = t;
    const end = start + step * 0.85;
    t += step + (/[.!?;:]$/.test(word) ? 0.35 : 0);
    return { word, start, end };
  });
}
