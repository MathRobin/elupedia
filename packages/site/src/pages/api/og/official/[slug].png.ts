/**
 * `GET /api/og/official/{slug}.png` : image Open Graph d'une fiche élu —
 * photo (ou initiales), nom, libellé du mandat, circonscription/département
 * et groupe politique. `slug` peut aussi être l'UUID de l'élu (fiches sans
 * slug). 404 (corps vide) si l'élu n'existe pas ou n'a aucun mandat.
 *
 * Référencée comme `og:image` par `pages/elus/[slug]/index.astro`, comme
 * `thumbnail_url` par `/api/oembed`, et montrée en exemple sur `/integrer`.
 * Rendu via `lib/og.ts` ; cache CDN 24 h, stale 7 jours.
 */
import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db.js';
import { officials, mandates, MANDATE_TYPE_LABELS } from '@elupedia/shared';
import { eq, or } from 'drizzle-orm';
import { renderOgImage } from '../../../../lib/og.js';
import { createElement as h } from 'react';

export const prerender = false;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Côté du carré photo / initiales, en px dans l'image 1200×630. */
const PHOTO_SIZE = 240;

export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;
  const db = getDb();

  // Même logique que /api/oembed : on ne compare à `officials.id` que si la
  // valeur a la forme d'un UUID, sinon Postgres rejetterait la requête.
  const isUuid = UUID_PATTERN.test(slug!);
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

  // Une ligne par mandat : on décrit l'élu par son mandat en cours, à défaut
  // par le premier mandat renvoyé.
  const row = rows.find((r) => !r.endDate) ?? rows[0];
  if (!row) return new Response(null, { status: 404 });

  const fullName = `${row.firstName} ${row.lastName}`;
  const mandate = MANDATE_TYPE_LABELS[row.mandateType] ?? row.mandateType;
  const location = [row.district, row.department].filter(Boolean).join(' — ');
  // La copie S3 est préférée : l'URL source (site de l'AN, du Sénat…) peut
  // être lente ou bloquer satori.
  const photo = row.photoUrl ?? row.fallbackPhoto;

  const photoOrInitials = photo
    ? h('img', {
        src: photo,
        width: PHOTO_SIZE,
        height: PHOTO_SIZE,
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
            width: `${PHOTO_SIZE}px`,
            height: `${PHOTO_SIZE}px`,
            borderRadius: '24px',
            backgroundColor: 'rgba(129, 140, 248, 0.15)',
            border: '4px solid rgba(129, 140, 248, 0.6)',
            fontSize: '80px',
            fontWeight: 700,
            color: '#818cf8',
          },
        },
        `${row.firstName[0]}${row.lastName[0]}`,
      );

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
        photoOrInitials,
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
      // Signature en bas à gauche.
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
