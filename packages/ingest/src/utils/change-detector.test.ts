import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectChanges, writeChangeReport } from './change-detector.js';

const reportPath = resolve(import.meta.dirname, 'test-ingest-report.json');

afterEach(() => {
  try {
    unlinkSync(reportPath);
  } catch {
    // ignore
  }
});

describe('detectChanges', () => {
  it('reports no changes when all zeroes', () => {
    const report = detectChanges([
      { source: 'officials', created: 0, updated: 0 },
      { source: 'votes', created: 0, updated: 0 },
    ]);
    expect(report.hasChanges).toBe(false);
    expect(report.totalCreated).toBe(0);
    expect(report.totalUpdated).toBe(0);
    expect(report.changedSources).toEqual([]);
  });

  it('reports changes when creates exist', () => {
    const report = detectChanges([
      { source: 'officials', created: 5, updated: 0 },
      { source: 'votes', created: 0, updated: 0 },
    ]);
    expect(report.hasChanges).toBe(true);
    expect(report.totalCreated).toBe(5);
    expect(report.changedSources).toEqual(['officials']);
  });

  it('reports changes when updates exist', () => {
    const report = detectChanges([
      { source: 'officials', created: 0, updated: 3 },
      { source: 'votes', created: 2, updated: 1 },
    ]);
    expect(report.hasChanges).toBe(true);
    expect(report.totalCreated).toBe(2);
    expect(report.totalUpdated).toBe(4);
    expect(report.changedSources).toEqual(['officials', 'votes']);
  });

  it('counts errors', () => {
    const report = detectChanges([
      { source: 'officials', created: 0, updated: 0, error: 'timeout' },
      { source: 'votes', created: 0, updated: 0 },
    ]);
    expect(report.totalErrors).toBe(1);
  });
});

describe('writeChangeReport', () => {
  it('writes JSON report to file', () => {
    const report = {
      hasChanges: true,
      totalCreated: 5,
      totalUpdated: 3,
      totalErrors: 0,
      changedSources: ['officials'],
    };
    writeChangeReport(report, reportPath);
    const content = JSON.parse(readFileSync(reportPath, 'utf-8'));
    expect(content.hasChanges).toBe(true);
    expect(content.totalCreated).toBe(5);
  });
});
