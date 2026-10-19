/**
 * Tests de personal-website-scraper.ts : extraction de liens, robots.txt et
 * enchaînement complet avec un fetch simulé.
 */
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

    it('ignores youtube links to a specific video (embed, watch, shorts) but keeps channel links', () => {
      const html = `
        <iframe src="x"></iframe>
        <a href="https://www.youtube.com/embed/dQw4w9WgXcQ">Vidéo embarquée</a>
        <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">Vidéo</a>
        <a href="https://youtube.com/shorts/abc123">Short</a>
        <a href="https://www.youtube.com/@depute123">Chaîne</a>
        <a href="https://www.youtube.com/channel/UCabc">Chaîne 2</a>
        <a href="https://www.youtube.com/c/depute123/videos">Onglet vidéos</a>
      `;
      const links = extractSocialLinks(html, 'https://depute.fr');
      expect(links.map((l) => l.url)).toEqual([
        'https://www.youtube.com/@depute123',
        'https://www.youtube.com/channel/UCabc',
        'https://www.youtube.com/c/depute123',
      ]);
    });

    it('drops youtube query strings and channel tabs, rejects search, playlist and root links', () => {
      const html = `
        <a href="https://youtube.com/@renepilato?si=I6Xngz1j">Chaîne avec tracking</a>
        <a href="https://www.youtube.com/channel/UCCaFw8qbWdrdU6MYYGYwH2w/featured">Onglet</a>
        <a href="http://www.youtube.com/villeanglet">URL historique</a>
        <a href="https://www.youtube.com/results?search_query=x">Recherche</a>
        <a href="https://youtube.com/playlist?list=PL123">Playlist</a>
        <a href="http://www.youtube.com">Racine</a>
        <a href="https://www.tiktok.com/@vincent_caure?lang=sv-SE">TikTok avec tracking</a>
        <a href="https://www.instagram.com/capdeviellecolette?hl=fr">Instagram avec tracking</a>
      `;
      const links = extractSocialLinks(html, 'https://depute.fr');
      expect(links.map((l) => l.url)).toEqual([
        'https://www.youtube.com/@renepilato',
        'https://www.youtube.com/channel/UCCaFw8qbWdrdU6MYYGYwH2w',
        'https://www.youtube.com/villeanglet',
        'https://www.tiktok.com/@vincent_caure',
        'https://www.instagram.com/capdeviellecolette',
      ]);
    });

    it('keeps only instagram and tiktok profile links, in canonical form', () => {
      const html = `
        <a href="https://www.instagram.com/p/C_qSg1csYyx/">Post</a>
        <a href="https://www.instagram.com/reel/DBeInAvN5IL/">Reel</a>
        <a href="https://www.instagram.com/explore/tags/martres/">Hashtag</a>
        <a href="https://www.instagram.com/stories/depute123/">Stories</a>
        <a href="https://instagram.com/depute.123">Profil sans www</a>
        <a href="https://www.instagram.com/depute.123/profilecard/">Carte de profil</a>
        <a href="https://www.tiktok.com/@depute123/video/7306194920213350401">Vidéo</a>
        <a href="https://www.tiktok.com/music/son-original-7592296610885798678?refer=embed">Musique</a>
        <a href="https://www.tiktok.com/tag/depute">Tag</a>
        <a href="https://www.tiktok.com/@depute123?lang=fr">Profil</a>
      `;
      const links = extractSocialLinks(html, 'https://depute.fr');
      expect(links).toEqual([
        { platform: 'instagram', url: 'https://www.instagram.com/depute.123' },
        { platform: 'tiktok', url: 'https://www.tiktok.com/@depute123' },
      ]);
    });

    it('returns empty array when no social links found', () => {
      const html =
        '<a href="/contact">Contact</a><a href="https://twitter.com/x">X</a>';
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
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
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
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/robots.txt')) return { ok: false };
        return { ok: false };
      });
      const links = await scrapePersonalWebsite('https://depute.fr', mockFetch);
      expect(links).toHaveLength(0);
    });
  });
});
