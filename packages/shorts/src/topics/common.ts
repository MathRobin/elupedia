import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import {
  groupAcronym,
  spokenGroupName,
  type ChartBar,
  type ShortFacts,
} from '../script-facts.js';
import type { Scene, ShortScript } from '../script-schema.js';
import { MAX_WORDS_PER_SEC, countWords } from '../script-validate.js';

/**
 * Socle des shorts « thème » : contrat d'un thème (chargement des lignes
 * depuis la base, construction pure des faits, script de gabarit) et
 * utilitaires de formatage partagés. Un thème = un module dans `topics/`,
 * enregistré dans `topics/index.ts`, lancé par `main-topic.ts`.
 *
 * Piège : tout nombre écrit dans un gabarit doit exister dans les faits
 * (`numbers`, barres, libellés, date), sinon le validateur rejette le script.
 */

export interface TopicDefinition<Rows> {
  key: string;
  /** Une ligne, pour l'aide du CLI. */
  summary: string;
  load(db: NeonHttpDatabase): Promise<Rows>;
  build(shortId: string, rows: Rows): ShortFacts;
  script(facts: ShortFacts): ShortScript;
}

export const NON_INSCRITS = /non[ -]inscrit/i;

/** Nombre maximal de barres d'un graphique (même limite que `remotion/scenes.tsx`). */
export const MAX_CHART_BARS = 12;

export const NUMBER_WORDS = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
];

/** « 11 463 » (espace insécable, que le validateur et les sous-titres acceptent). */
export function formatInt(n: number): string {
  return Math.round(n)
    .toLocaleString('fr-FR')
    .replace(/\u202f/g, '\u00a0');
}

/** « 3,6 » ; à voix haute, « 3 » plutôt que « 3,0 ». */
export function formatDecimal(v: number, decimals = 1, spoken = false): string {
  const s = v.toFixed(decimals).replace('.', ',');
  return spoken ? s.replace(/,0+$/, '') : s;
}

/** Nom d'un groupe à voix haute : nom complet (ou sigle prononçable), « & » dit « et ». */
export function spokenGroup(name: string): string {
  return spokenGroupName(name).replace(/\s*&\s*/g, ' et ');
}

/** Barre d'un groupe parlementaire : sigle à l'écran, nom complet à la voix, couleur du groupe. */
export function groupBar(
  name: string,
  value: number,
  count: number | null,
): ChartBar {
  return {
    label: groupAcronym(name) ?? name,
    spokenLabel: spokenGroup(name),
    value,
    group: name,
    count,
  };
}

/** Ordre alphabétique du libellé affiché, sans accent ni casse. */
export function sortBars(bars: ChartBar[]): ChartBar[] {
  return [...bars].sort((a, b) =>
    a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }),
  );
}

/** Durée d'une scène d'après son texte, au débit de lecture retenu, bornée pour un short. */
export function durationFor(voiceover: string, min = 3): number {
  return Math.min(
    15,
    Math.max(min, Math.ceil(countWords(voiceover) / (MAX_WORDS_PER_SEC - 0.1))),
  );
}

export type SceneDraft = Omit<Scene, 'durationSec'>;

export function withDurations(drafts: SceneDraft[]): Scene[] {
  return drafts.map((s) => ({ ...s, durationSec: durationFor(s.voiceover) }));
}

/** Barres triées par valeur, la plus haute d'abord. */
export function byValueDesc(bars: ChartBar[]): ChartBar[] {
  return [...bars].sort((a, b) => b.value - a.value);
}

/** Arrondi à `decimals` décimales (évite les flottants bavards dans les faits). */
export function round(v: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}
