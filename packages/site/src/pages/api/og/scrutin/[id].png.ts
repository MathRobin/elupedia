/**
 * `GET /api/og/scrutin/{id}.png` : image Open Graph d'un scrutin — badge
 * Adopté/Rejeté, type de scrutin, titre (tronqué), date, barre de répartition
 * des votes et légende chiffrée. 404 (corps vide) si le scrutin n'existe pas.
 *
 * Référencée comme `og:image` par `pages/scrutins/[id].astro` et comme
 * `thumbnail_url` par `/api/oembed`. Rendu via `lib/og.ts` ; cache CDN 24 h,
 * stale 7 jours.
 *
 * Piège : « Adopté » est déduit de `pour > contre` sur les votes enregistrés,
 * pas d'un résultat officiel stocké en base.
 */
import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db.js';
import { ballots, votes } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import { renderOgImage } from '../../../../lib/og.js';
import { createElement as h } from 'react';

export const prerender = false;

/** Couleurs par position de vote, communes à la barre et à la légende. */
const VOTE_COLORS = {
  for: '#10b981',
  against: '#ef4444',
  abstain: '#f59e0b',
  absent: '#94a3b8',
} as const;

/** Au-delà, le titre déborderait du cadre : on coupe à 117 caractères + « … ». */
const TITLE_MAX_LENGTH = 120;
const TITLE_TRUNCATED_LENGTH = 117;

/** Entrée de légende : point coloré + libellé. */
function legendItem(color: string, label: string) {
  return h(
    'span',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color,
      },
    },
    h('span', {
      style: {
        display: 'flex',
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        backgroundColor: color,
      },
    }),
    label,
  );
}

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;
  const db = getDb();

  const [ballot] = await db
    .select({
      id: ballots.id,
      title: ballots.title,
      date: ballots.date,
      type: ballots.type,
    })
    .from(ballots)
    .where(eq(ballots.id, id!))
    .limit(1);

  if (!ballot) return new Response(null, { status: 404 });

  const voteRows = await db
    .select({ position: votes.position })
    .from(votes)
    .where(eq(votes.ballotId, ballot.id));

  // Les positions hors de ces quatre valeurs sont ignorées (mais comptent
  // dans `total`, donc dans les pourcentages).
  const counts = { for: 0, against: 0, abstain: 0, absent: 0 };
  for (const vote of voteRows) {
    const position = vote.position as keyof typeof counts;
    if (position in counts) counts[position]++;
  }
  const total = voteRows.length;
  const adopted = counts.for > counts.against;

  const dateFormatted = new Date(ballot.date).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Segments de la barre, dans l'ordre pour / contre / abstention / absent ;
  // les positions à zéro sont omises pour éviter des segments de largeur 0.
  const barSegments: { color: string; pct: number }[] = [];
  if (counts.for > 0)
    barSegments.push({
      color: VOTE_COLORS.for,
      pct: (counts.for / total) * 100,
    });
  if (counts.against > 0)
    barSegments.push({
      color: VOTE_COLORS.against,
      pct: (counts.against / total) * 100,
    });
  if (counts.abstain > 0)
    barSegments.push({
      color: VOTE_COLORS.abstain,
      pct: (counts.abstain / total) * 100,
    });
  if (counts.absent > 0)
    barSegments.push({
      color: VOTE_COLORS.absent,
      pct: (counts.absent / total) * 100,
    });

  const png = await renderOgImage(
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          padding: '60px',
          fontFamily: 'Inter',
          justifyContent: 'space-between',
        },
      },
      // Haut : badges, titre, date.
      h(
        'div',
        {
          style: { display: 'flex', flexDirection: 'column', gap: '20px' },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            },
          },
          h(
            'div',
            {
              style: {
                display: 'flex',
                padding: '8px 20px',
                borderRadius: '9999px',
                backgroundColor: adopted
                  ? 'rgba(16, 185, 129, 0.15)'
                  : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${adopted ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                fontSize: '22px',
                fontWeight: 700,
                color: adopted ? VOTE_COLORS.for : VOTE_COLORS.against,
              },
            },
            adopted ? 'Adopté' : 'Rejeté',
          ),
          h(
            'div',
            {
              style: {
                display: 'flex',
                padding: '8px 20px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                fontSize: '18px',
                color: '#818cf8',
              },
            },
            ballot.type,
          ),
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontSize: '40px',
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.3,
              maxHeight: '210px',
              overflow: 'hidden',
            },
          },
          ballot.title.length > TITLE_MAX_LENGTH
            ? ballot.title.slice(0, TITLE_TRUNCATED_LENGTH) + '…'
            : ballot.title,
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontSize: '22px',
              color: '#64748b',
            },
          },
          dateFormatted,
        ),
      ),
      // Bas : barre de répartition et légende.
      h(
        'div',
        {
          style: { display: 'flex', flexDirection: 'column', gap: '16px' },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              width: '100%',
              height: '16px',
              borderRadius: '9999px',
              overflow: 'hidden',
            },
          },
          ...barSegments.map((segment) =>
            h('div', {
              style: {
                width: `${segment.pct}%`,
                height: '100%',
                backgroundColor: segment.color,
              },
            }),
          ),
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              gap: '32px',
              fontSize: '20px',
            },
          },
          legendItem(VOTE_COLORS.for, `Pour ${counts.for}`),
          legendItem(VOTE_COLORS.against, `Contre ${counts.against}`),
          legendItem(VOTE_COLORS.abstain, `Abst. ${counts.abstain}`),
          // Les absents ne sont affichés que s'il y en a (scrutins du Sénat
          // sans liste d'absents, par exemple).
          counts.absent > 0
            ? legendItem(VOTE_COLORS.absent, `Abs. ${counts.absent}`)
            : null,
        ),
      ),
      // Signature en bas à droite.
      h(
        'div',
        {
          style: {
            display: 'flex',
            position: 'absolute',
            bottom: '40px',
            right: '60px',
            alignItems: 'center',
            gap: '12px',
          },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontSize: '24px',
              fontWeight: 700,
              color: '#6366f1',
            },
          },
          'Elupedia',
        ),
      ),
    ),
  );

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
};
