import { describe, it, expect, vi } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { withRetry } from './retry.js';
import { logger } from '../logger.js';

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { source: 'test' });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, {
      source: 'test',
      baseDelayMs: 1,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max attempts', async () => {
    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      callCount++;
      throw new Error('always fails');
    });

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, source: 'test' }),
    ).rejects.toThrow('always fails');

    expect(callCount).toBe(3);
  });

  it('uses exponential backoff delays', async () => {
    const delays: number[] = [];
    vi.mocked(logger.warn).mockImplementation((msg: unknown) => {
      const match = String(msg).match(/retrying in (\d+)ms/);
      if (match) delays.push(Number(match[1]));
    });

    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) throw new Error('fail');
      return 'ok';
    });

    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      source: 'test',
    });

    expect(result).toBe('ok');
    expect(delays).toEqual([10, 20]);
  });

  it('logs warning on retry and error on final failure', async () => {
    vi.mocked(logger.warn).mockClear();
    vi.mocked(logger.error).mockClear();

    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      callCount++;
      throw new Error('network down');
    });

    await expect(
      withRetry(fn, {
        maxAttempts: 2,
        baseDelayMs: 1,
        source: 'assemblee-nationale',
      }),
    ).rejects.toThrow('network down');

    expect(callCount).toBe(2);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.warn).mock.calls[0][0]).toContain(
      'assemblee-nationale',
    );
    expect(vi.mocked(logger.warn).mock.calls[0][0]).toContain('attempt 1/2');

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.error).mock.calls[0][0]).toContain(
      'failed after 2 attempts',
    );
  });
});
