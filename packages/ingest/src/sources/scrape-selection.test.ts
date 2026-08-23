import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const filePath = resolve(import.meta.dirname, 'scrape-selection.ts');

describe('scrape-selection (#133)', () => {
  const content = readFileSync(filePath, 'utf-8');

  it('filters on personal_website platform', () => {
    expect(content).toContain("platform = 'personal_website'");
  });

  it('filters on status published', () => {
    expect(content).toContain("status = 'published'");
  });

  it('checks for missing social platforms', () => {
    expect(content).toContain("platform = 'instagram'");
    expect(content).toContain("platform = 'tiktok'");
    expect(content).toContain("platform = 'youtube'");
  });

  it('orders by captured_at ASC NULLS FIRST', () => {
    expect(content).toContain('captured_at ASC NULLS FIRST');
  });

  it('limits to 50 results', () => {
    expect(content).toContain('BATCH_SIZE = 50');
    expect(content).toContain('LIMIT');
  });

  it('exports updateLastScrapedAt function', () => {
    expect(content).toContain('export async function updateLastScrapedAt');
  });

  it('exports ScrapeCandidate type', () => {
    expect(content).toContain('export interface ScrapeCandidate');
  });
});
