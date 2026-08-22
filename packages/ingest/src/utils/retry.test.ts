import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './retry.js';

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
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const msg = String(args[0]);
      const match = msg.match(/retrying in (\d+)ms/);
      if (match) delays.push(Number(match[1]));
    };

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

    console.warn = originalWarn;

    expect(result).toBe('ok');
    expect(delays).toEqual([10, 20]);
  });

  it('logs warning on retry and error on final failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      callCount++;
      throw new Error('network down');
    });

    await expect(
      withRetry(fn, {
        maxAttempts: 2,
        baseDelayMs: 1,
        source: 'nosdeputes',
      }),
    ).rejects.toThrow('network down');

    expect(callCount).toBe(2);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('nosdeputes');
    expect(warnSpy.mock.calls[0][0]).toContain('attempt 1/2');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('failed after 2 attempts');

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
