import {
  PRONOUNCEABLE_ACRONYMS,
  groupAcronym,
  type ShortFacts,
} from './script-facts.js';
import type { ShortScript } from './script-schema.js';

/**
 * Garde-fous mécaniques sur le script généré. Le modèle n'est pas cru sur
 * parole : tout chiffre doit exister dans les faits, le ton doit rester
 * descriptif, la durée doit tenir dans un short.
 */

export const MIN_TOTAL_SEC = 35;
export const MAX_TOTAL_SEC = 60;
/**
 * Débit de lecture maximal (mots/seconde) : celui de la voix réelle (débit
 * 0.95, environ 2,6 mots/s), sans quoi la voix déborde la durée prévue et la
 * vidéo dépasse la minute.
 */
export const MAX_WORDS_PER_SEC = 2.6;
export const MAX_TITLE_LENGTH = 70;

/**
 * Vocabulaire évaluatif proscrit. Volontairement court et explicable : on ne
 * cherche pas l'exhaustivité, seulement à bloquer les dérapages les plus nets.
 * Comparaison sans accents ni casse, sur le mot entier.
 */
export const BANNED_WORDS = [
  'scandaleux',
  'scandaleuse',
  'scandale',
  'honteux',
  'honteuse',
  'historique',
  'courageux',
  'courageuse',
  'lache',
  'lachete',
  'victoire',
  'defaite',
  'camouflet',
  'gifle',
  'claque',
  'humiliation',
  'triomphe',
  'desastre',
  'catastrophe',
  'fiasco',
  'seisme',
  'choquant',
  'choquante',
  'inacceptable',
  'enfin',
  'helas',
  'heureusement',
  'malheureusement',
  'evidemment',
  'incroyable',
  'incroyablement',
  'dangereux',
  'dangereuse',
] as const;

export interface ValidationIssue {
  code:
    | 'unknown_number'
    | 'banned_word'
    | 'too_short'
    | 'too_long'
    | 'too_fast'
    | 'title_too_long'
    | 'duplicate_scene_id'
    | 'unknown_person'
    | 'missing_result'
    | 'spoken_acronym'
    | 'bloc_not_unanimous'
    | 'missing_source';
  message: string;
}

export function normalizeWord(w: string): string {
  // Décomposition NFD puis suppression des marques combinantes (accents).
  return w.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function extractNumbers(text: string): number[] {
  // Les URL (page Elupedia du scrutin) contiennent des identifiants, pas des
  // chiffres à vérifier.
  const withoutUrls = text.replace(/https?:\/\/\S+/g, ' ');
  // "1 234" (espace ou espace insécable comme séparateur de milliers) → 1234
  // `\s` couvre les espaces Unicode (insécable U+00A0, fine U+202F).
  const normalized = withoutUrls.replace(/(\d)\s(?=\d{3}\b)/g, '$1');
  return (normalized.match(/\d+/g) ?? []).map((n) => Number.parseInt(n, 10));
}

/** Tous les entiers qu'un script a le droit de citer. */
export function allowedNumbers(facts: ShortFacts): Set<number> {
  const allowed = new Set<number>();
  for (const b of facts.ballots) {
    for (const n of extractNumbers(b.title)) allowed.add(n);
    for (const n of extractNumbers(b.dateLabel)) allowed.add(n);
    for (const n of Object.values(b.counts)) allowed.add(n);
    for (const n of Object.values(b.percentOfExpressed)) allowed.add(n);
    allowed.add(b.participationPercent);
    for (const g of b.groups) {
      if (g.memberCount !== null) allowed.add(g.memberCount);
      allowed.add(g.for);
      allowed.add(g.against);
      allowed.add(g.abstain);
      allowed.add(g.absent);
    }
    if (b.mostDividedGroup) {
      allowed.add(Math.round(b.mostDividedGroup.minorityShare * 100));
    }
  }
  return allowed;
}

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

export function validateScript(
  script: ShortScript,
  facts: ShortFacts,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const allowed = allowedNumbers(facts);
  const banned = new Set<string>(BANNED_WORDS);

  const total = script.scenes.reduce((s, sc) => s + sc.durationSec, 0);
  if (total < MIN_TOTAL_SEC) {
    issues.push({
      code: 'too_short',
      message: `Durée totale ${total} s, minimum ${MIN_TOTAL_SEC} s`,
    });
  }
  if (total > MAX_TOTAL_SEC) {
    issues.push({
      code: 'too_long',
      message: `Durée totale ${total} s, maximum ${MAX_TOTAL_SEC} s`,
    });
  }

  if (script.title.length > MAX_TITLE_LENGTH) {
    issues.push({
      code: 'title_too_long',
      message: `Titre de ${script.title.length} caractères, maximum ${MAX_TITLE_LENGTH}`,
    });
  }

  const seenIds = new Set<string>();
  for (const scene of script.scenes) {
    if (seenIds.has(scene.id)) {
      issues.push({
        code: 'duplicate_scene_id',
        message: `Identifiant de scène dupliqué : ${scene.id}`,
      });
    }
    seenIds.add(scene.id);

    const words = countWords(scene.voiceover);
    if (words > MAX_WORDS_PER_SEC * scene.durationSec) {
      issues.push({
        code: 'too_fast',
        message: `Scène ${scene.id} : ${words} mots en ${scene.durationSec} s (max ${MAX_WORDS_PER_SEC} mots/s)`,
      });
    }

    if (scene.lowerThird) {
      const known = new Set(
        facts.ballots.flatMap((b) => [
          ...b.proposers.map((p) => p.name),
          ...b.groups.map((g) => g.name),
        ]),
      );
      if (!known.has(scene.lowerThird.name)) {
        issues.push({
          code: 'unknown_person',
          message: `Scène ${scene.id} : le bandeau « ${scene.lowerThird.name} » ne correspond à aucun auteur ni groupe des données`,
        });
      }
    }

    for (const field of ['voiceover', 'onScreenText'] as const) {
      const text = scene[field];
      for (const n of extractNumbers(text)) {
        if (!allowed.has(n)) {
          issues.push({
            code: 'unknown_number',
            message: `Scène ${scene.id} (${field}) : le nombre ${n} n'existe pas dans les données`,
          });
        }
      }
      for (const raw of text.split(/[^\p{L}\p{N}'’-]+/u)) {
        const w = normalizeWord(raw);
        if (banned.has(w)) {
          issues.push({
            code: 'banned_word',
            message: `Scène ${scene.id} (${field}) : mot évaluatif proscrit « ${raw} »`,
          });
        }
      }
    }
  }

  for (const n of extractNumbers(script.title)) {
    if (!allowed.has(n)) {
      issues.push({
        code: 'unknown_number',
        message: `Titre : le nombre ${n} n'existe pas dans les données`,
      });
    }
  }
  for (const raw of script.title.split(/[^\p{L}\p{N}'’-]+/u)) {
    if (banned.has(normalizeWord(raw))) {
      issues.push({
        code: 'banned_word',
        message: `Titre : mot évaluatif proscrit « ${raw} »`,
      });
    }
  }

  // Le résultat officiel est toujours énoncé en toutes lettres.
  const spoken = normalizeWord(script.scenes.map((s) => s.voiceover).join(' '));
  for (const result of new Set(facts.ballots.map((b) => b.result))) {
    if (!result) continue;
    const stem = normalizeWord(result.slice(0, -1)); // adopte / rejete
    if (!new RegExp(`\\b${stem}e?s?\\b`).test(spoken)) {
      issues.push({
        code: 'missing_result',
        message: `La voix doit énoncer le résultat du scrutin (« ${result} »)`,
      });
    }
  }

  // Les sigles de groupes sont pour l'écran : à voix haute, le nom complet.
  for (const scene of script.scenes) {
    for (const b of facts.ballots) {
      for (const g of b.groups) {
        const acronym = groupAcronym(g.name);
        if (!acronym || PRONOUNCEABLE_ACRONYMS.includes(acronym)) continue;
        const escaped = acronym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(
          `(?<![\\p{L}\\p{N}-])${escaped}(?![\\p{L}\\p{N}-])`,
          'u',
        );
        if (re.test(scene.voiceover)) {
          issues.push({
            code: 'spoken_acronym',
            message: `Scène ${scene.id} : le sigle « ${acronym} » est prononcé, dire « ${g.spokenName} »`,
          });
        }
      }
    }
  }

  // « La gauche » / « La droite » : seulement si tous les groupes de ce côté
  // ont voté pareil (faits.blocs). Pas de généralisation au cas par cas.
  for (const scene of script.scenes) {
    const text = normalizeWord(scene.voiceover);
    for (const [side, word] of [
      ['left', 'gauche'],
      ['right', 'droite'],
    ] as const) {
      // « La Droite Républicaine » est un groupe, pas le bloc.
      const re = new RegExp(`\\bla ${word}\\b(?! republicaine)`);
      if (!re.test(text)) continue;
      const ok = facts.ballots.every(
        (b) => b.blocs[side]?.unanimousPosition != null,
      );
      if (!ok) {
        issues.push({
          code: 'bloc_not_unanimous',
          message: `Scène ${scene.id} : « la ${word} » n'est employé que si tous les groupes de ce côté ont voté pareil, ce n'est pas le cas dans les données`,
        });
      }
    }
  }

  // La description est publiée telle quelle : mêmes règles que la voix.
  for (const n of extractNumbers(script.description)) {
    if (!allowed.has(n)) {
      issues.push({
        code: 'unknown_number',
        message: `Description : le nombre ${n} n'existe pas dans les données`,
      });
    }
  }
  for (const raw of script.description.split(/[^\p{L}\p{N}'’-]+/u)) {
    if (banned.has(normalizeWord(raw))) {
      issues.push({
        code: 'banned_word',
        message: `Description : mot évaluatif proscrit « ${raw} »`,
      });
    }
  }

  const hasSourceScene = script.scenes.some((s) => s.visual === 'source');
  if (!hasSourceScene) {
    issues.push({
      code: 'missing_source',
      message: 'Le script doit se terminer par une scène « source »',
    });
  }

  return issues;
}
