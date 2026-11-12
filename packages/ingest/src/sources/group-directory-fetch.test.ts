/**
 * Tests des nouvelles tentatives de fetchWithRetry (ticket #276, correctif
 * après le dry-run : « fetch failed » sur plusieurs groupes). fetch simulé,
 * délais nuls ; aucun réseau.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { fetchWithRetry } from './group-directory-member-list.js';

function okResponse(body: string) {
  return { ok: true, status: 200, text: async () => body };
}

function statusResponse(status: number) {
  return { ok: false, status, text: async () => '' };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchWithRetry', () => {
  it('réessaie une erreur réseau puis renvoie le contenu', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(okResponse('liste'));
    vi.stubGlobal('fetch', fetchMock);

    const html = await fetchWithRetry('https://example.test/a', {}, [0, 0]);

    expect(html).toBe('liste');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('réessaie un 503 puis un 429', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(503))
      .mockResolvedValueOnce(statusResponse(429))
      .mockResolvedValueOnce(okResponse('ok'));
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchWithRetry('https://example.test/a', {}, [0, 0])).toBe(
      'ok',
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('ne réessaie pas un 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue(statusResponse(404));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchWithRetry('https://example.test/a', {}, [0, 0]),
    ).rejects.toThrow('HTTP 404');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('abandonne après le nombre de tentatives prévu et lève la dernière erreur', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchWithRetry('https://example.test/a', {}, [0, 0]),
    ).rejects.toThrow('fetch failed');
    // 1 tentative + 2 nouvelles tentatives.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
