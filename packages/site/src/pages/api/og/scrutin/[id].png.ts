import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db.js';
import { ballots, votes } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import { renderOgImage } from '../../../../lib/og.js';
import { createElement as h } from 'react';

export const prerender = false;

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

  const counts = { for: 0, against: 0, abstain: 0, absent: 0 };
  for (const v of voteRows) {
    const pos = v.position as keyof typeof counts;
    if (pos in counts) counts[pos]++;
  }
  const total = voteRows.length;
  const adopted = counts.for > counts.against;

  const dateFormatted = new Date(ballot.date).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const barSegments: { color: string; pct: number }[] = [];
  if (counts.for > 0)
    barSegments.push({ color: '#10b981', pct: (counts.for / total) * 100 });
  if (counts.against > 0)
    barSegments.push({ color: '#ef4444', pct: (counts.against / total) * 100 });
  if (counts.abstain > 0)
    barSegments.push({ color: '#f59e0b', pct: (counts.abstain / total) * 100 });
  if (counts.absent > 0)
    barSegments.push({ color: '#94a3b8', pct: (counts.absent / total) * 100 });

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
                color: adopted ? '#10b981' : '#ef4444',
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
          ballot.title.length > 120
            ? ballot.title.slice(0, 117) + '…'
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
          ...barSegments.map((seg) =>
            h('div', {
              style: {
                width: `${seg.pct}%`,
                height: '100%',
                backgroundColor: seg.color,
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
          h(
            'span',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#10b981',
              },
            },
            h('span', {
              style: {
                display: 'flex',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
              },
            }),
            `Pour ${counts.for}`,
          ),
          h(
            'span',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#ef4444',
              },
            },
            h('span', {
              style: {
                display: 'flex',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#ef4444',
              },
            }),
            `Contre ${counts.against}`,
          ),
          h(
            'span',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#f59e0b',
              },
            },
            h('span', {
              style: {
                display: 'flex',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#f59e0b',
              },
            }),
            `Abst. ${counts.abstain}`,
          ),
          counts.absent > 0
            ? h(
                'span',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#94a3b8',
                  },
                },
                h('span', {
                  style: {
                    display: 'flex',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: '#94a3b8',
                  },
                }),
                `Abs. ${counts.absent}`,
              )
            : null,
        ),
      ),
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
