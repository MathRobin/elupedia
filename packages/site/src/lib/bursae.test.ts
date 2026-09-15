import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildOembedUrl,
  parseOembed,
  fetchBursaeEmbed,
  clearBursaeCache,
} from './bursae.js';

const VALID_PAYLOAD = {
  type: 'rich',
  version: '1.0',
  title: 'Bordeaux — Finances communales | Bursae',
  author_name: 'Bordeaux',
  provider_name: 'Bursae',
  provider_url: 'https://bursae.fr',
  html: '<iframe src="https://bursae.fr/collectivite/bordeaux" width="600" height="400" frameborder="0" allowfullscreen></iframe>',
  width: 600,
  height: 400,
  code_insee: '33063',
};

function okResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as unknown as Response;
}

function errorResponse(status: number) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: 'nope' }),
  } as unknown as Response;
}

describe('buildOembedUrl', () => {
  it('asks for the INSEE form of the page, not the name slug', () => {
    const url = buildOembedUrl('33063');
    // L'origine appelée est surchargeable (BURSAE_ORIGIN) : on vérifie le
    // chemin et la cible, pas l'hôte.
    expect(url).toContain('/api/oembed');
    expect(url).toContain(
      encodeURIComponent('https://bursae.fr/collectivite/insee/33063'),
    );
    expect(url).toContain('format=json');
  });
});

describe('parseOembed', () => {
  it('maps a valid payload', () => {
    const embed = parseOembed(VALID_PAYLOAD);
    expect(embed).not.toBeNull();
    expect(embed!.title).toBe('Bordeaux — Finances communales | Bursae');
    expect(embed!.codeInsee).toBe('33063');
    expect(embed!.pageUrl).toBe('https://bursae.fr/collectivite/bordeaux');
    expect(embed!.width).toBe(600);
  });

  it('rejects a non-rich type', () => {
    expect(parseOembed({ ...VALID_PAYLOAD, type: 'photo' })).toBeNull();
  });

  it('rejects html without an iframe', () => {
    expect(parseOembed({ ...VALID_PAYLOAD, html: '<p>rien</p>' })).toBeNull();
  });

  it('rejects anything that is not an object', () => {
    expect(parseOembed(null)).toBeNull();
    expect(parseOembed('texte')).toBeNull();
  });

  it('tolerates a payload without code_insee', () => {
    const without = { ...VALID_PAYLOAD };
    delete (without as Partial<typeof VALID_PAYLOAD>).code_insee;
    const embed = parseOembed(without);
    expect(embed).not.toBeNull();
    expect(embed!.codeInsee).toBeNull();
  });
});

describe('fetchBursaeEmbed', () => {
  beforeEach(() => clearBursaeCache());

  it('returns the embed for a covered commune', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse(VALID_PAYLOAD));
    const embed = await fetchBursaeEmbed('33063', fetchFn as typeof fetch);
    expect(embed?.codeInsee).toBe('33063');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed commune code without calling Bursae', async () => {
    const fetchFn = vi.fn();
    expect(await fetchBursaeEmbed('7500', fetchFn as typeof fetch)).toBeNull();
    expect(await fetchBursaeEmbed('', fetchFn as typeof fetch)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns null when the commune is outside Bursae coverage', async () => {
    const fetchFn = vi.fn().mockResolvedValue(errorResponse(404));
    expect(await fetchBursaeEmbed('75056', fetchFn as typeof fetch)).toBeNull();
  });

  it('returns null on an ambiguous slug response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(errorResponse(409));
    expect(await fetchBursaeEmbed('21544', fetchFn as typeof fetch)).toBeNull();
  });

  it('returns null when Bursae is unreachable', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await fetchBursaeEmbed('33063', fetchFn as typeof fetch)).toBeNull();
  });

  it('returns null when the request times out', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('timeout'), { name: 'TimeoutError' }),
      );
    expect(await fetchBursaeEmbed('33063', fetchFn as typeof fetch)).toBeNull();
  });

  it('returns null on a malformed payload', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({ type: 'link' }));
    expect(await fetchBursaeEmbed('33063', fetchFn as typeof fetch)).toBeNull();
  });

  it('sends an abort signal so a slow Bursae cannot stall the render', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse(VALID_PAYLOAD));
    await fetchBursaeEmbed('33063', fetchFn as typeof fetch);
    expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('serves a second call from cache', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse(VALID_PAYLOAD));
    await fetchBursaeEmbed('33063', fetchFn as typeof fetch);
    await fetchBursaeEmbed('33063', fetchFn as typeof fetch);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('caches an absence too, so a miss is not retried on every render', async () => {
    const fetchFn = vi.fn().mockResolvedValue(errorResponse(404));
    await fetchBursaeEmbed('75056', fetchFn as typeof fetch);
    await fetchBursaeEmbed('75056', fetchFn as typeof fetch);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('caches per commune', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse(VALID_PAYLOAD));
    await fetchBursaeEmbed('33063', fetchFn as typeof fetch);
    await fetchBursaeEmbed('33281', fetchFn as typeof fetch);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('logs a contract break when Bursae answers 200 with an unreadable payload', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = vi.fn().mockResolvedValue(okResponse({ type: 'link' }));

    await fetchBursaeEmbed('33063', fetchFn as typeof fetch);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('contrat');
    expect(spy.mock.calls[0][0]).toContain('33063');
    spy.mockRestore();
  });

  it('logs an outage on a 5xx but stays silent on a 404', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await fetchBursaeEmbed(
      '33063',
      vi.fn().mockResolvedValue(errorResponse(503)) as typeof fetch,
    );
    expect(warn.mock.calls[0][0]).toContain('indisponible');

    warn.mockClear();
    await fetchBursaeEmbed(
      '75056',
      vi.fn().mockResolvedValue(errorResponse(404)) as typeof fetch,
    );
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('tells a timeout apart from another network failure in the logs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await fetchBursaeEmbed(
      '33063',
      vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
        ) as typeof fetch,
    );
    expect(warn.mock.calls[0][0]).toContain('timeout');

    warn.mockClear();
    await fetchBursaeEmbed(
      '33281',
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as typeof fetch,
    );
    expect(warn.mock.calls[0][0]).toContain('réseau');

    warn.mockRestore();
  });

  it('treats the commune code case-insensitively for Corsican codes', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse(VALID_PAYLOAD));
    await fetchBursaeEmbed('2a004', fetchFn as typeof fetch);
    await fetchBursaeEmbed('2A004', fetchFn as typeof fetch);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toContain('2A004');
  });
});
