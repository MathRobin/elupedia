import type { APIRoute } from 'astro';
import { renderOgImage } from '../../../lib/og.js';
import { createElement as h } from 'react';

export const prerender = false;

export const GET: APIRoute = async () => {
  const png = await renderOgImage(
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          fontFamily: 'Inter',
          gap: '24px',
        },
      },
      h(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: '72px',
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
            fontSize: '32px',
            color: '#94a3b8',
          },
        },
        'Encyclopédie ouverte des élus français',
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            marginTop: '20px',
            gap: '20px',
          },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              padding: '10px 24px',
              borderRadius: '12px',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              fontSize: '22px',
              color: '#818cf8',
            },
          },
          'Députés',
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              padding: '10px 24px',
              borderRadius: '12px',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              fontSize: '22px',
              color: '#818cf8',
            },
          },
          'Sénateurs',
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              padding: '10px 24px',
              borderRadius: '12px',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              fontSize: '22px',
              color: '#818cf8',
            },
          },
          'Maires',
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              padding: '10px 24px',
              borderRadius: '12px',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              fontSize: '22px',
              color: '#818cf8',
            },
          },
          'Votes',
        ),
      ),
    ),
  );

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control':
        'public, s-maxage=604800, stale-while-revalidate=2592000',
    },
  });
};
