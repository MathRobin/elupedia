import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const oembedPath = resolve(
  import.meta.dirname,
  '../packages/site/src/pages/api/oembed.ts',
);
const oembedSource = readFileSync(oembedPath, 'utf-8');

describe('oEmbed endpoint (M20T2)', () => {
  describe('structure', () => {
    it('exports GET and OPTIONS handlers', () => {
      expect(oembedSource).toContain('export const GET');
      expect(oembedSource).toContain('export const OPTIONS');
    });

    it('has prerender = false', () => {
      expect(oembedSource).toContain('export const prerender = false');
    });

    it('supports both json and xml formats', () => {
      expect(oembedSource).toContain("'json'");
      expect(oembedSource).toContain("'xml'");
      expect(oembedSource).toContain('text/xml');
      expect(oembedSource).toContain('application/json');
    });

    it('includes required oEmbed fields', () => {
      expect(oembedSource).toContain("version: '1.0'");
      expect(oembedSource).toContain("provider_name: 'Elupedia'");
      expect(oembedSource).toContain('provider_url');
      expect(oembedSource).toContain('thumbnail_url');
      expect(oembedSource).toContain('thumbnail_width');
      expect(oembedSource).toContain('thumbnail_height');
    });

    it('sets CORS headers', () => {
      expect(oembedSource).toContain('Access-Control-Allow-Origin');
      expect(oembedSource).toContain("'*'");
    });
  });

  describe('URL parsing', () => {
    it('recognizes /elus/ URLs', () => {
      expect(oembedSource).toContain('\\/elus\\/');
    });

    it('recognizes /scrutins/ URLs', () => {
      expect(oembedSource).toContain('\\/scrutins\\/');
    });

    it('returns 404 for unsupported URLs', () => {
      expect(oembedSource).toContain("'URL not supported'");
      expect(oembedSource).toContain('404');
    });

    it('returns 400 when url parameter is missing', () => {
      expect(oembedSource).toContain("'Missing url parameter'");
      expect(oembedSource).toContain('400');
    });
  });

  describe('response format', () => {
    it('uses type rich for embeddable content', () => {
      expect(oembedSource).toContain("type: 'rich'");
    });

    it('includes iframe HTML for embedding', () => {
      expect(oembedSource).toContain('<iframe');
      expect(oembedSource).toContain('frameborder');
    });

    it('xml response properly escapes content', () => {
      expect(oembedSource).toContain('&amp;');
      expect(oembedSource).toContain('&lt;');
      expect(oembedSource).toContain('&gt;');
    });
  });
});

describe('oEmbed discovery tags', () => {
  const eluPage = readFileSync(
    resolve(
      import.meta.dirname,
      '../packages/site/src/pages/elus/[slug].astro',
    ),
    'utf-8',
  );
  const scrutinPage = readFileSync(
    resolve(
      import.meta.dirname,
      '../packages/site/src/pages/scrutins/[id].astro',
    ),
    'utf-8',
  );

  it('elus page has oEmbed discovery link', () => {
    expect(eluPage).toContain('rel="alternate"');
    expect(eluPage).toContain('type="application/json+oembed"');
    expect(eluPage).toContain('/api/oembed?url=');
  });

  it('scrutins page has oEmbed discovery link', () => {
    expect(scrutinPage).toContain('rel="alternate"');
    expect(scrutinPage).toContain('type="application/json+oembed"');
    expect(scrutinPage).toContain('/api/oembed?url=');
  });
});
