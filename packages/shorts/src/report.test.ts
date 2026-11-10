import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  REPORTS_DIR,
  reportFile,
  shortsReport,
  writeShortsFailureReport,
  writeShortsReport,
} from './report.js';

describe('shortsReport', () => {
  it('counts processed shorts as created and failures as errors', () => {
    expect(shortsReport('publish', { done: 2, failed: 1 })).toEqual({
      hasChanges: true,
      totalCreated: 2,
      totalUpdated: 0,
      totalErrors: 1,
      changedSources: ['shorts-publish'],
    });
    expect(shortsReport('render', { done: 0, failed: 0 }).hasChanges).toBe(
      false,
    );
  });

  it('writes next to the ingestion reports read by the admin', () => {
    expect(REPORTS_DIR.endsWith(path.join('packages', 'ingest'))).toBe(true);
    expect(path.basename(reportFile('voiceover'))).toBe(
      'ingest-report-shorts-voiceover.json',
    );
  });
});

describe('writeShortsReport / writeShortsFailureReport', () => {
  it('keeps the run report when the command fails afterwards', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'shorts-report-'));
    writeShortsReport('script', { done: 3, failed: 1 }, dir);
    writeShortsFailureReport('script', dir);
    const r = JSON.parse(await readFile(reportFile('script', dir), 'utf8'));
    expect(r.totalCreated).toBe(3);
    expect(r.totalErrors).toBe(1);
  });

  it('records one error when the command fails before any run report', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'shorts-report-'));
    writeShortsFailureReport('select', dir);
    const r = JSON.parse(await readFile(reportFile('select', dir), 'utf8'));
    expect(r).toMatchObject({ totalCreated: 0, totalErrors: 1 });
  });

  it('never throws on an unwritable directory', () => {
    expect(() =>
      writeShortsReport('render', { done: 1, failed: 0 }, '/nonexistent/x'),
    ).not.toThrow();
  });
});
