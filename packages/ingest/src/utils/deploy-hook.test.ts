/** Tests de utils/deploy-hook.ts : décision pure et appel du hook avec fichiers temporaires. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { shouldTriggerRebuild, triggerSiteRebuild } from './deploy-hook.js';

const dir = import.meta.dirname;
const reportPath = resolve(dir, 'test-rebuild-report.json');
const statePath = resolve(dir, 'test-rebuild-state.json');
const report = (hasChanges: boolean) => ({
  hasChanges,
  totalCreated: hasChanges ? 1 : 0,
  totalUpdated: 0,
  totalErrors: 0,
  changedSources: hasChanges ? ['x'] : [],
});

afterEach(() => {
  for (const path of [reportPath, statePath]) {
    try {
      unlinkSync(path);
    } catch {
      // ignore
    }
  }
});

describe('shouldTriggerRebuild', () => {
  const now = new Date('2026-11-10T10:00:00Z');
  it('does nothing without changes, even with unreadable reports', () => {
    expect(shouldTriggerRebuild([null, report(false)], null, now)).toBe(
      'no_changes',
    );
  });
  it('triggers on changes when nothing was triggered recently', () => {
    expect(shouldTriggerRebuild([report(true)], null, now)).toBe('triggered');
    expect(
      shouldTriggerRebuild(
        [report(true)],
        new Date('2026-11-10T09:00:00Z'),
        now,
      ),
    ).toBe('triggered');
  });
  it('throttles when a trigger is more recent than the minimum interval', () => {
    expect(
      shouldTriggerRebuild(
        [report(true)],
        new Date('2026-11-10T09:50:00Z'),
        now,
      ),
    ).toBe('throttled');
  });
});

describe('triggerSiteRebuild', () => {
  it('posts to the hook and records the time', async () => {
    writeFileSync(reportPath, JSON.stringify(report(true)));
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    const outcome = await triggerSiteRebuild({
      reportFiles: [reportPath],
      hookUrl: 'https://api.vercel.com/v1/integrations/deploy/x/y',
      fetchFn: fetchFn as unknown as typeof fetch,
      stateFile: statePath,
      now: new Date('2026-11-10T10:00:00Z'),
    });
    expect(outcome).toBe('triggered');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.vercel.com/v1/integrations/deploy/x/y',
      { method: 'POST' },
    );
    expect(JSON.parse(readFileSync(statePath, 'utf-8'))).toEqual({
      lastTriggeredAt: '2026-11-10T10:00:00.000Z',
    });
  });

  it('skips without a hook URL and never throws on a network failure', async () => {
    writeFileSync(reportPath, JSON.stringify(report(true)));
    expect(
      await triggerSiteRebuild({
        reportFiles: [reportPath],
        hookUrl: undefined,
        stateFile: statePath,
      }),
    ).toBe('no_hook');
    const failing = vi.fn().mockRejectedValue(new Error('fetch failed'));
    expect(
      await triggerSiteRebuild({
        reportFiles: [reportPath],
        hookUrl: 'https://example.invalid/hook',
        fetchFn: failing as unknown as typeof fetch,
        stateFile: statePath,
      }),
    ).toBe('failed');
    expect(existsSync(statePath)).toBe(false);
  });
});
