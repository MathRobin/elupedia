import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const siteDir = resolve(import.meta.dirname, '../packages/site/src');

describe('OG image generation (M20T1)', () => {
  describe('og.ts helper', () => {
    const ogLib = readFileSync(resolve(siteDir, 'lib/og.ts'), 'utf-8');

    it('exports renderOgImage function', () => {
      expect(ogLib).toContain('export async function renderOgImage');
    });

    it('uses satori and resvg', () => {
      expect(ogLib).toContain("from 'satori'");
      expect(ogLib).toContain("from '@resvg/resvg-js'");
    });

    it('renders at 1200x630', () => {
      expect(ogLib).toContain('width: 1200');
      expect(ogLib).toContain('height: 630');
    });

    it('uses Inter font', () => {
      expect(ogLib).toContain("name: 'Inter'");
    });
  });

  describe('OG endpoints', () => {
    it('official OG endpoint exists', () => {
      expect(
        existsSync(resolve(siteDir, 'pages/api/og/official/[slug].png.ts')),
      ).toBe(true);
    });

    it('scrutin OG endpoint exists', () => {
      expect(
        existsSync(resolve(siteDir, 'pages/api/og/scrutin/[id].png.ts')),
      ).toBe(true);
    });

    it('default OG endpoint exists', () => {
      expect(existsSync(resolve(siteDir, 'pages/api/og/default.png.ts'))).toBe(
        true,
      );
    });

    it('all OG endpoints have prerender = false', () => {
      for (const file of [
        'pages/api/og/official/[slug].png.ts',
        'pages/api/og/scrutin/[id].png.ts',
        'pages/api/og/default.png.ts',
      ]) {
        const src = readFileSync(resolve(siteDir, file), 'utf-8');
        expect(src).toContain('export const prerender = false');
      }
    });

    it('all OG endpoints set Cache-Control headers', () => {
      for (const file of [
        'pages/api/og/official/[slug].png.ts',
        'pages/api/og/scrutin/[id].png.ts',
        'pages/api/og/default.png.ts',
      ]) {
        const src = readFileSync(resolve(siteDir, file), 'utf-8');
        expect(src).toContain('Cache-Control');
        expect(src).toContain("'image/png'");
      }
    });
  });

  describe('meta tags integration', () => {
    const layout = readFileSync(
      resolve(siteDir, 'layouts/BaseLayout.astro'),
      'utf-8',
    );

    it('BaseLayout references dynamic OG default endpoint', () => {
      expect(layout).toContain('/api/og/default.png');
    });

    it('BaseLayout has all required OG tags', () => {
      expect(layout).toContain('og:title');
      expect(layout).toContain('og:description');
      expect(layout).toContain('og:url');
      expect(layout).toContain('og:type');
      expect(layout).toContain('og:image');
      expect(layout).toContain('og:locale');
      expect(layout).toContain('og:site_name');
    });

    it('BaseLayout has all required Twitter Card tags', () => {
      expect(layout).toContain('twitter:card');
      expect(layout).toContain('summary_large_image');
      expect(layout).toContain('twitter:title');
      expect(layout).toContain('twitter:description');
      expect(layout).toContain('twitter:image');
    });

    const eluPage = readFileSync(
      resolve(siteDir, 'pages/elus/[slug].astro'),
      'utf-8',
    );
    it('elus page uses dynamic OG image', () => {
      expect(eluPage).toContain('/api/og/official/');
    });

    const scrutinPage = readFileSync(
      resolve(siteDir, 'pages/scrutins/[id].astro'),
      'utf-8',
    );
    it('scrutins page uses dynamic OG image', () => {
      expect(scrutinPage).toContain('/api/og/scrutin/');
    });
  });
});
