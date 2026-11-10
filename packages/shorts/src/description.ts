import type { ShortFacts } from './script-facts.js';
import type { ShortScript } from './script-schema.js';

/**
 * Texte d'accompagnement de la vidéo (description YouTube, puis TikTok et
 * Instagram). Le résumé factuel vient du script ; tout le reste est construit
 * mécaniquement à partir des faits, pour que chaque vidéo renvoie vers la page
 * Elupedia du scrutin ET vers les sources officielles des chiffres : le
 * contenu doit pouvoir être vérifié par n'importe qui, sans passer par nous.
 * Même texte à la revue (`<out>/<id>/description.txt`) et à la publication.
 * Mention de fabrication obligatoire (script par IA ou gabarit, voix de synthèse
 * ou enregistrée) : le spectateur doit le savoir sans chercher ; YouTube reçoit
 * en plus le flag `containsSyntheticMedia` (youtube.ts).
 * Piège : les faits sont figés dans `video_shorts.script` au moment du script ;
 * ceux écrits avant la mi-octobre 2026 n'ont pas de `sources`, d'où les
 * `?? []` (le lien Elupedia, lui, est toujours présent).
 */

const YOUTUBE_DESCRIPTION_MAX = 5000;

export interface DescriptionOptions {
  /** Voix de synthèse (ElevenLabs) plutôt qu'enregistrée par l'équipe. */
  syntheticVoice?: boolean;
}

/** Vrai pour une voix synthétisée ; faux pour une prise enregistrée, un rendu muet (`estimated`) ou sans voix. */
export function isSyntheticVoice(
  voiceover: { provider: string } | null | undefined,
): boolean {
  return (
    !!voiceover &&
    voiceover.provider !== 'recorded' &&
    voiceover.provider !== 'estimated'
  );
}

/** Comment la vidéo a été fabriquée, en une phrase. */
export function productionNotice(
  facts: ShortFacts,
  options: DescriptionOptions = {},
): string {
  const script = facts.topic
    ? 'script rempli automatiquement à partir des chiffres officiels'
    : 'script rédigé par une intelligence artificielle à partir des seuls chiffres officiels';
  const voice = options.syntheticVoice
    ? 'voix de synthèse'
    : 'voix enregistrée par l’équipe';
  return `Vidéo produite automatiquement : ${script}, ${voice}. Chaque vidéo est relue par une personne avant publication.`;
}

export function buildDescription(
  facts: ShortFacts,
  script: ShortScript,
  options: DescriptionOptions = {},
): string {
  const parts: string[] = [script.description.trim()];

  for (const b of facts.ballots) {
    const lines = [
      facts.ballots.length > 1 ? `Scrutin : ${b.title}` : null,
      `${b.chamber}, ${b.dateLabel}${b.result ? ` — texte ${b.result}` : ''} : ${b.counts.for} pour, ${b.counts.against} contre, ${b.counts.abstain} abstention(s), ${b.counts.notVoting} sur ${b.counts.seats} n'ont pas pris part au vote.`,
    ].filter((l): l is string => l !== null);
    parts.push(lines.join('\n'));
  }

  if (facts.topic) {
    parts.push(
      `Données : ${facts.topic.dataSourceLabel}, ${facts.topic.dateLabel} (données publiques, licence ouverte).`,
    );
  }

  const sourceLines: string[] = ['Sources et vérification :'];
  if (facts.topic) {
    sourceLines.push(`• ${facts.topic.elupediaLabel} : ${facts.topic.url}`);
    for (const src of facts.topic.sources ?? [])
      sourceLines.push(`• ${src.label} : ${src.url}`);
  }
  for (const b of facts.ballots) {
    sourceLines.push(
      `• Le vote de chaque élu·e, scrutin par scrutin, sur Elupedia : ${b.url}`,
    );
    for (const src of b.sources ?? [])
      sourceLines.push(`• ${src.label} : ${src.url}`);
  }
  parts.push(sourceLines.join('\n'));

  parts.push(
    [
      productionNotice(facts, options),
      'Elupedia est une encyclopédie ouverte des élus français : données officielles consolidées, aucun commentaire, code public sous licence AGPL-3.0.',
      'Données : Assemblée nationale et Sénat, licence ouverte. Une erreur ? Écrivez-nous, la correction sera publiée.',
    ].join('\n'),
  );

  const hashtags = script.hashtags.filter((h) => h.startsWith('#')).join(' ');
  if (hashtags) parts.push(hashtags);

  return parts.join('\n\n').slice(0, YOUTUBE_DESCRIPTION_MAX);
}
