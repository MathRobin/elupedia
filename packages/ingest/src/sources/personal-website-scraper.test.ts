import { describe, it, expect, vi } from 'vitest';
import {
  extractSocialLinks,
  checkRobotsTxt,
  scrapePersonalWebsite,
} from './personal-website-scraper.js';

describe('personal-website-scraper (#132)', () => {
  describe('extractSocialLinks', () => {
    it('extracts instagram, tiktok and youtube links', () => {
      const html = `
        <a href="https://www.instagram.com/depute123">Insta</a>
        <a href="https://www.tiktok.com/@depute123">TikTok</a>
        <a href="https://www.youtube.com/channel/abc">YouTube</a>
        <a href="https://twitter.com/depute123">Twitter</a>
      `;
      const links = extractSocialLinks(html, 'https://depute.fr');
      expect(links).toHaveLength(3);
      expect(links.map((l) => l.platform).sort()).toEqual([
        'instagram',
        'tiktok',
        'youtube',
      ]);
    });

    it('returns empty array when no social links found', () => {
      const html = '<a href="/contact">Contact</a><a href="https://twitter.com/x">X</a>';
      const links = extractSocialLinks(html, 'https://depute.fr');
      expect(links).toHaveLength(0);
    });

    it('deduplicates links', () => {
      const html = `
        <a href="https://instagram.com/test">1</a>
        <a href="https://instagram.com/test">2</a>
      `;
      const links = extractSocialLinks(html, 'https://depute.fr');
      expect(links).toHaveLength(1);
    });

    it('resolves relative URLs', () => {
      const html = '<a href="/redirect?to=https://youtube.com/c/test">YT</a>';
      const links = extractSocialLinks(html, 'https://depute.fr');
      expect(links).toHaveLength(0);
    });
  });

  describe('checkRobotsTxt', () => {
    it('allows scraping when robots.txt is missing', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false });
      const allowed = await checkRobotsTxt('https://depute.fr', mockFetch);
      expect(allowed).toBe(true);
    });

    it('blocks scraping when Disallow: / for *', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => 'User-agent: *\nDisallow: /',
      });
      const allowed = await checkRobotsTxt('https://depute.fr', mockFetch);
      expect(allowed).toBe(false);
    });

    it('blocks scraping when Disallow: / for ElupediaBot', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => 'User-agent: ElupediaBot\nDisallow: /',
      });
      const allowed = await checkRobotsTxt('https://depute.fr', mockFetch);
      expect(allowed).toBe(false);
    });

    it('allows scraping when only specific paths are disallowed', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => 'User-agent: *\nDisallow: /admin',
      });
      const allowed = await checkRobotsTxt('https://depute.fr', mockFetch);
      expect(allowed).toBe(true);
    });

    it('handles fetch errors gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('timeout'));
      const allowed = await checkRobotsTxt('https://depute.fr', mockFetch);
      expect(allowed).toBe(true);
    });
  });

  describe('scrapePersonalWebsite', () => {
    it('returns social links from a page', async () => {
      const mockFetch = vi
        .fn()
        .mockImplementation(async (url: string) => {
          if (url.endsWith('/robots.txt')) return { ok: false };
          return {
            ok: true,
            text: async () =>
              '<html><a href="https://instagram.com/test">IG</a></html>',
          };
        });
      const links = await scrapePersonalWebsite('https://depute.fr', mockFetch);
      expect(links).toHaveLength(1);
      expect(links[0].platform).toBe('instagram');
    });

    it('returns empty when robots.txt disallows', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => 'User-agent: *\nDisallow: /',
      });
      const links = await scrapePersonalWebsite('https://depute.fr', mockFetch);
      expect(links).toHaveLength(0);
    });

    it('returns empty when page fetch fails', async () => {
      const mockFetch = vi
        .fn()
        .mockImplementation(async (url: string) => {
          if (url.endsWith('/robots.txt')) return { ok: false };
          return { ok: false };
        });
      const links = await scrapePersonalWebsite('https://depute.fr', mockFetch);
      expect(links).toHaveLength(0);
    });
  });
});
