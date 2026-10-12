import type { ShortFacts } from '../script-facts.js';
import type { ShortScript } from '../script-schema.js';
import type { StoredVoiceover } from '../voiceover.js';

/**
 * Props de la composition, sérialisables en JSON (passées au bundle). Alias de
 * type et non interface : Remotion attend un `Record<string, unknown>`.
 */
export type ShortProps = {
  facts: ShortFacts;
  script: ShortScript;
  voiceover: StoredVoiceover | null;
  /** Images de b-roll (chemins relatifs au dossier public du rendu). */
  broll: string[];
};

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
