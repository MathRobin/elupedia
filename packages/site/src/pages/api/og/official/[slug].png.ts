import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db.js';
import { officials, mandates } from '@elupedia/shared';
import { eq, or } from 'drizzle-orm';
import { renderOgImage } from '../../../../lib/og.js';
import { createElement as h } from 'react';

export const prerender = false;

const MANDATE_LABELS: Record<string, string> = {
  depute: 'Député',
  senateur: 'Sénateur',
  maire: 'Maire',
  president: 'Président',
};

export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;
  const db = getDb();

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      slug!,
    );
  const filter = isUuid
    ? or(eq(officials.slug, slug!), eq(officials.id, slug!))
    : eq(officials.slug, slug!);

  const rows = await db
    .select({
      firstName: officials.firstName,
      lastName: officials.lastName,
      photoUrl: officials.s3PhotoUrl,
      fallbackPhoto: officials.photoUrl,
      mandateType: mandates.type,
      politicalGroup: mandates.politicalGroup,
      district: mandates.district,
      department: mandates.department,
      endDate: mandates.endDate,
    })
    .from(officials)
    .innerJoin(mandates, eq(mandates.officialId, officials.id))
    .where(filter)
    .limit(10);

  const row = rows.find((r) => !r.endDate) ?? rows[0];
  if (!row) return new Response(null, { status: 404 });

  const fullName = `${row.firstName} ${row.lastName}`;
  const mandate = MANDATE_LABELS[row.mandateType] ?? row.mandateType;
  const location = [row.district, row.department].filter(Boolean).join(' — ');
  const photo = row.photoUrl ?? row.fallbackPhoto;

  const png = await renderOgImage(
    h(
      'div',
      {
        style: {
          display: 'flex',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          padding: '60px',
          fontFamily: 'Inter',
        },
      },
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '48px',
            width: '100%',
          },
        },
        photo
          ? h('img', {
              src: photo,
              width: 240,
              height: 240,
              style: {
                borderRadius: '24px',
                objectFit: 'cover',
                border: '4px solid rgba(129, 140, 248, 0.6)',
              },
            })
          : h(
              'div',
              {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '240px',
                  height: '240px',
                  borderRadius: '24px',
                  backgroundColor: 'rgba(129, 140, 248, 0.15)',
                  border: '4px solid rgba(129, 140, 248, 0.6)',
                  fontSize: '80px',
                  fontWeight: 700,
                  color: '#818cf8',
                },
              },
              `${row.firstName[0]}${row.lastName[0]}`,
            ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              gap: '16px',
            },
          },
          h(
            'div',
            {
              style: {
                display: 'flex',
                fontSize: '48px',
                fontWeight: 700,
                color: '#ffffff',
                lineHeight: 1.2,
              },
            },
            fullName,
          ),
          h(
            'div',
            {
              style: {
                display: 'flex',
                fontSize: '28px',
                color: '#94a3b8',
              },
            },
            mandate,
          ),
          location
            ? h(
                'div',
                {
                  style: {
                    display: 'flex',
                    fontSize: '22px',
                    color: '#64748b',
                  },
                },
                location,
              )
            : null,
          row.politicalGroup
            ? h(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginTop: '8px',
                  },
                },
                h(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      padding: '6px 18px',
                      borderRadius: '9999px',
                      backgroundColor: 'rgba(129, 140, 248, 0.15)',
                      border: '1px solid rgba(129, 140, 248, 0.3)',
                      fontSize: '20px',
                      color: '#818cf8',
                    },
                  },
                  row.politicalGroup,
                ),
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
            left: '60px',
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
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontSize: '18px',
              color: '#475569',
            },
          },
          'Encyclopédie ouverte des élus français',
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
