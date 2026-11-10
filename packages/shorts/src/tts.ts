/**
 * Synthèse vocale de la voix off (ElevenLabs). Produit, par scène, une prise
 * MP3 déposée dans `recordings/` exactement comme une prise enregistrée par
 * l'équipe, plus un fichier `.words.json` avec l'horodatage de chaque mot
 * (endpoint « with-timestamps », qui renvoie l'audio et le début/fin de chaque
 * caractère). L'import des prises (voiceover.ts) reprend ensuite la chaîne
 * habituelle (recadrage, normalisation) et préfère ces horodatages exacts à
 * l'estimation par pauses.
 *
 * Appelants : `voiceover generate` (main-voiceover.ts), `make` (main-make.ts),
 * étape `voiceover-shorts` du DAG ingest-votes. Variables : ELEVENLABS_API_KEY,
 * ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL_ID (optionnelle). Sans clé ni voix,
 * `elevenLabsFromEnv` renvoie null et la voix reste à enregistrer à la main.
 */
import type { WordTiming } from './words.js';

export interface TtsResult {
  /** Audio MP3. */
  audio: Buffer;
  words: WordTiming[];
  /** Fin du dernier caractère prononcé, en secondes. */
  durationSec: number;
}

export interface TtsProvider {
  readonly name: string;
  readonly voiceId: string;
  readonly modelId: string;
  synthesize(text: string): Promise<TtsResult>;
}

export interface CharacterAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/**
 * Regroupe l'horodatage par caractère en mots (séparés par des blancs). La
 * ponctuation reste accrochée au mot qu'elle suit.
 */
export function charactersToWords(a: CharacterAlignment): WordTiming[] {
  const words: WordTiming[] = [];
  let current = '';
  let start = 0;
  let end = 0;
  const flush = () => {
    if (current.length > 0) words.push({ word: current, start, end });
    current = '';
  };
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i];
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (current.length === 0) start = a.character_start_times_seconds[i];
    current += ch;
    end = a.character_end_times_seconds[i];
  }
  flush();
  return words;
}

export interface ElevenLabsOptions {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  /** Débit : 0.7 à 1.2, 1 = normal. Légèrement ralenti pour un ton posé. */
  speed?: number;
  fetchFn?: typeof fetch;
}

export const ELEVENLABS_DEFAULT_MODEL = 'eleven_multilingual_v2';
/** Débit par défaut, légèrement ralenti pour un ton posé. */
export const ELEVENLABS_DEFAULT_SPEED = 0.95;
const SPEED_MIN = 0.7;
const SPEED_MAX = 1.2;

/** `ELEVENLABS_SPEED` lue et bornée à ce qu'accepte l'API ; défaut si absente ou invalide. */
export function parseSpeed(raw: string | undefined): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return ELEVENLABS_DEFAULT_SPEED;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, n));
}
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

export function createElevenLabsProvider(o: ElevenLabsOptions): TtsProvider {
  const modelId = o.modelId ?? ELEVENLABS_DEFAULT_MODEL;
  const fetchFn = o.fetchFn ?? fetch;
  return {
    name: 'elevenlabs',
    voiceId: o.voiceId,
    modelId,
    async synthesize(text) {
      const url = `${ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(o.voiceId)}/with-timestamps?output_format=mp3_44100_128`;
      const res = await fetchFn(url, {
        method: 'POST',
        headers: {
          'xi-api-key': o.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          language_code: 'fr',
          voice_settings: {
            stability: 0.6,
            similarity_boost: 0.8,
            style: 0.0,
            use_speaker_boost: true,
            speed: o.speed ?? ELEVENLABS_DEFAULT_SPEED,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `ElevenLabs HTTP ${res.status} : ${body.slice(0, 300)}`,
        );
      }
      const data = (await res.json()) as {
        audio_base64: string;
        alignment: CharacterAlignment | null;
        normalized_alignment: CharacterAlignment | null;
      };
      const alignment = data.alignment ?? data.normalized_alignment;
      if (!alignment) throw new Error('ElevenLabs : alignement absent');
      const words = charactersToWords(alignment);
      return {
        audio: Buffer.from(data.audio_base64, 'base64'),
        words,
        durationSec: words.length > 0 ? words[words.length - 1].end : 0,
      };
    },
  };
}

/** Fournisseur ElevenLabs d'après l'environnement, null si clé ou voix absente. */
export function elevenLabsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TtsProvider | null {
  if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) return null;
  return createElevenLabsProvider({
    apiKey: env.ELEVENLABS_API_KEY,
    voiceId: env.ELEVENLABS_VOICE_ID,
    modelId: env.ELEVENLABS_MODEL_ID || undefined,
    speed: parseSpeed(env.ELEVENLABS_SPEED),
  });
}
