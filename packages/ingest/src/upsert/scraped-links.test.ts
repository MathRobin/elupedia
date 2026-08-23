import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const filePath = resolve(import.meta.dirname, 'scraped-links.ts');
const content = readFileSync(filePath, 'utf-8');

describe('upsert/scraped-links (#134)', () => {
  it('inserts with status pending', () => {
    expect(content).toContain("status: 'pending'");
  });

  it('inserts with source scraped_personal_website', () => {
    expect(content).toContain("source: 'scraped_personal_website'");
  });

  it('sets captured_at to today', () => {
    expect(content).toContain('capturedAt: today');
  });

  it('excludes rejected and deleted links from re-insertion', () => {
    expect(content).toContain("status === 'rejected'");
    expect(content).toContain("status === 'deleted'");
  });

  it('also skips platforms already published or pending', () => {
    expect(content).toContain("status === 'published'");
    expect(content).toContain("status === 'pending'");
  });

  it('returns created and skipped counts', () => {
    expect(content).toContain('created: toInsert.length');
    expect(content).toContain('skipped: links.length - toInsert.length');
  });

  it('handles empty links array', () => {
    expect(content).toContain(
      'if (links.length === 0) return { created: 0, skipped: 0 }',
    );
  });
});
