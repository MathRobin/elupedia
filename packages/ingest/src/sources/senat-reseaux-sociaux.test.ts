import { describe, it, expect, vi } from 'vitest';
import { fetchSenatSocialLinks } from './senat-reseaux-sociaux.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeFetch(
  senateurs: Record<string, unknown>[],
  profileHtml?: string,
): typeof fetch {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('api-senat/senateurs.json')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(senateurs),
      });
    }
    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve(profileHtml ?? '<html></html>'),
    });
  }) as unknown as typeof fetch;
}

describe('fetchSenatSocialLinks', () => {
  it('extracts twitter and facebook from API', async () => {
    const senateurs = [
      {
        matricule: '11072N',
        twitter: 'TMohamedSoilihi',
        facebook: '100003090871052',
      },
    ];

    const result = await fetchSenatSocialLinks(makeFetch(senateurs));

    const twitter = result.find((r) => r.platform === 'twitter');
    expect(twitter).toMatchObject({
      matricule: '11072N',
      url: 'https://twitter.com/TMohamedSoilihi',
    });

    const fb = result.find((r) => r.platform === 'facebook');
    expect(fb).toMatchObject({
      matricule: '11072N',
      url: 'https://www.facebook.com/100003090871052',
    });
  });

  it('handles full facebook URLs', async () => {
    const senateurs = [
      { matricule: '21075K', facebook: 'https://www.facebook.com/margate77' },
    ];

    const result = await fetchSenatSocialLinks(makeFetch(senateurs));
    expect(result[0].url).toBe('https://www.facebook.com/margate77');
  });

  it('strips @ from twitter handles', async () => {
    const senateurs = [{ matricule: '11072N', twitter: '@handle' }];

    const result = await fetchSenatSocialLinks(makeFetch(senateurs));
    expect(result[0].url).toBe('https://twitter.com/handle');
  });

  it('scrapes personal website from profile page', async () => {
    const senateurs = [
      { matricule: '11065P', url: '/senateur/dantec_ronan11065p.html' },
    ];
    const html = `
      <ul>
        <li><a href="http://ronandantec.eelv.fr/" title="Sur Site perso.">Sur Site perso.</a></li>
      </ul>
    `;

    const result = await fetchSenatSocialLinks(makeFetch(senateurs, html));
    const site = result.find((r) => r.platform === 'personal_website');
    expect(site).toMatchObject({
      matricule: '11065P',
      url: 'http://ronandantec.eelv.fr/',
    });
  });

  it('skips senators without social links', async () => {
    const senateurs = [{ matricule: '21460Q' }];

    const result = await fetchSenatSocialLinks(makeFetch(senateurs));
    expect(result).toHaveLength(0);
  });

  it('throws on API error', async () => {
    const failFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    }) as unknown as typeof fetch;

    await expect(fetchSenatSocialLinks(failFetch)).rejects.toThrow(
      'Sénat API senateurs error',
    );
  });
});
