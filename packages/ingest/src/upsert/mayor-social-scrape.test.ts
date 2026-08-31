import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@elupedia/shared', () => ({
  createDb: vi.fn(),
  externalLinks: {},
  mandates: {},
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../sources/personal-website-scraper.js', () => ({
  scrapePersonalWebsite: vi.fn(),
}));

vi.mock('./scraped-links.js', () => ({
  upsertScrapedLinks: vi.fn(),
}));

import {
  scrapeMayorWebsites,
  selectMayorWebsites,
} from './mayor-social-scrape.js';
import { scrapePersonalWebsite } from '../sources/personal-website-scraper.js';
import { upsertScrapedLinks } from './scraped-links.js';

const mockExecute = vi.fn();
const mockDb = { execute: mockExecute } as unknown as Parameters<
  typeof scrapeMayorWebsites
>[0];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('selectMayorWebsites', () => {
  it('returns candidates from DB', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        { official_id: 'uuid-1', website_url: 'https://mairie-example.fr' },
        { official_id: 'uuid-2', website_url: 'https://autre-mairie.fr' },
      ],
    });

    const result = await selectMayorWebsites(mockDb);
    expect(result).toEqual([
      { officialId: 'uuid-1', websiteUrl: 'https://mairie-example.fr' },
      { officialId: 'uuid-2', websiteUrl: 'https://autre-mairie.fr' },
    ]);
  });
});

describe('scrapeMayorWebsites', () => {
  it('scrapes websites and upserts detected links', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        { official_id: 'uuid-1', website_url: 'https://mairie-example.fr' },
      ],
    });

    vi.mocked(scrapePersonalWebsite).mockResolvedValue([
      { platform: 'instagram', url: 'https://instagram.com/mairie' },
    ]);
    vi.mocked(upsertScrapedLinks).mockResolvedValue({ created: 1, skipped: 0 });

    const result = await scrapeMayorWebsites(mockDb);

    expect(scrapePersonalWebsite).toHaveBeenCalledWith(
      'https://mairie-example.fr',
      globalThis.fetch,
    );
    expect(upsertScrapedLinks).toHaveBeenCalledWith(mockDb, 'uuid-1', [
      { platform: 'instagram', url: 'https://instagram.com/mairie' },
    ]);
    expect(result).toEqual({ created: 1, skipped: 0, errors: 0 });
  });

  it('counts errors without stopping', async () => {
    mockExecute.mockResolvedValue({
      rows: [{ official_id: 'uuid-1', website_url: 'https://broken.fr' }],
    });

    vi.mocked(scrapePersonalWebsite).mockRejectedValue(new Error('timeout'));

    const result = await scrapeMayorWebsites(mockDb);

    expect(result).toEqual({ created: 0, skipped: 0, errors: 1 });
  });

  it('handles empty candidate list', async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    const result = await scrapeMayorWebsites(mockDb);

    expect(result).toEqual({ created: 0, skipped: 0, errors: 0 });
    expect(scrapePersonalWebsite).not.toHaveBeenCalled();
  });
});
