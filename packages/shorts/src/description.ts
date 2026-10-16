import type { ShortFacts } from './script-facts.js';
import type { ShortScript } from './script-schema.js';

/**
 * Texte d'accompagnement de la vidéo (description YouTube, puis TikTok et
 * Instagram). Le résumé factuel vient du script ; tout le reste est construit
 * mécaniquement à partir des faits, pour que chaque vidéo renvoie vers la page
 * Elupedia du scrutin ET vers les sources officielles des chiffres : le
 * contenu doit pouvoir être vérifié par n'importe qui, sans passer par nous.
 * Même texte à la revue (`<out>/<id>/description.txt`) et à la publication.
 */

const YOUTUBE_DESCRIPTION_MAX = 5000;

export function buildDescription(
  facts: ShortFacts,
  script: ShortScript,
): string {
  const parts: string[] = [script.description.trim()];

  for (const b of facts.ballots) {
    const lines = [
      facts.ballots.length > 1 ? `Scrutin : ${b.title}` : null,
      `${b.chamber}, ${b.dateLabel}${b.result ? ` — texte ${b.result}` : ''} : ${b.counts.for} pour, ${b.counts.against} contre, ${b.counts.abstain} abstention(s), ${b.counts.notVoting} sur ${b.counts.seats} n'ont pas pris part au vote.`,
    ].filter((l): l is string => l !== null);
    parts.push(lines.join('\n'));
  }

  const sourceLines: string[] = ['Sources et vérification :'];
  for (const b of facts.ballots) {
    sourceLines.push(
      `• Le vote de chaque élu·e, scrutin par scrutin, sur Elupedia : ${b.url}`,
    );
    for (const src of b.sources)
      sourceLines.push(`• ${src.label} : ${src.url}`);
  }
  parts.push(sourceLines.join('\n'));

  parts.push(
    [
      'Elupedia est une encyclopédie ouverte des élus français : données officielles consolidées, aucun commentaire, code public sous licence AGPL-3.0.',
      'Données : Assemblée nationale et Sénat, licence ouverte. Une erreur ? Écrivez-nous, la correction sera publiée.',
    ].join('\n'),
  );

  const hashtags = script.hashtags.filter((h) => h.startsWith('#')).join(' ');
  if (hashtags) parts.push(hashtags);

  return parts.join('\n\n').slice(0, YOUTUBE_DESCRIPTION_MAX);
}
