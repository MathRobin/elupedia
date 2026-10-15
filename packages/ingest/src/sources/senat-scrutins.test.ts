// Tests de senat-scrutins : parsing de l'index HTML (dates en toutes lettres,
// entités &deg;/&nbsp;), mapping des codes de vote et chargement des JSON.
import { describe, it, expect, vi } from 'vitest';
import {
  parseScrutinsIndex,
  fetchSenatScrutins,
  mapSenatVotePosition,
} from './senat-scrutins.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const sampleHtml = `
<html><body>
<h3>21 juillet 2026</h3>
<ul>
<li><a href="2025/scr2025-340.html">Scrutin N°340</a> : sur l'ensemble du projet de loi agricole. Adoption</li>
<li><a href="2025/scr2025-339.html">Scrutin N°339</a> : sur l'amendement n°1. Rejet</li>
</ul>
<h3>9 juillet 2026</h3>
<ul>
<li><a href="2025/scr2025-335.html">Scrutin N°335</a> : sur l'ensemble du texte. Adoption</li>
</ul>
</body></html>
`;

describe('parseScrutinsIndex', () => {
  it('extracts scrutins with dates', () => {
    const result = parseScrutinsIndex(sampleHtml, '2025');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      session: '2025',
      number: 340,
      title: "sur l'ensemble du projet de loi agricole",
      date: '2026-07-21',
      result: 'Adoption',
    });
    expect(result[1].number).toBe(339);
    expect(result[1].result).toBe('Rejet');
    expect(result[2].date).toBe('2026-07-09');
  });

  it('parses the real structure: multi-line title, dossier link, badge result', () => {
    const html = `<ol class="list-group">
<li class="list-group-item">
<div class="list-group-subtitle">21 juillet 2026</div>
<p class="my-2">
<a href="2025/scr2025-340.html">Scrutin N&deg;340</a>&nbsp;: sur l'ensemble du
projet de loi d'urgence pour la protection et la souverainet&eacute; agricoles -
<a href="/dossier-legislatif/pjl25-689.html">consulter le dossier
l&eacute;gislatif</a>.
<span class="badge rounded-pill text-bg-success">Adoption</span>
</p>
<p class="my-2">
<a href="2025/scr2025-339.html">Scrutin N&deg;339</a>&nbsp;: sur l'amendement n&deg;12.
<span class="badge rounded-pill text-bg-danger">Rejet</span>
</p>
</li>
<li class="list-group-item">
<div class="list-group-subtitle">9 juillet 2026</div>
<p class="my-2">
<a href="2025/scr2025-335.html">Scrutin N&deg;335</a>&nbsp;: sur l'ensemble du texte.
<span class="badge rounded-pill text-bg-success">Adoption</span>
</p>
</li>
</ol>`;
    const result = parseScrutinsIndex(html, '2025');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      session: '2025',
      number: 340,
      title:
        "sur l'ensemble du projet de loi d'urgence pour la protection et la souveraineté agricoles",
      date: '2026-07-21',
      result: 'Adoption',
    });
    expect(result[1].title).toBe("sur l'amendement n°12");
    expect(result[1].result).toBe('Rejet');
    expect(result[2].date).toBe('2026-07-09');
  });

  it('ignores a date quoted inside a scrutin title', () => {
    const html = `<div class="list-group-subtitle">3 octobre 2025</div>
<p><a href="2025/scr2025-1.html">Scrutin N&deg;1</a>&nbsp;: sur la motion tendant à reporter le scrutin pour permettre la mise en œuvre de l'accord du 12 juillet 2025.
<span class="badge">Rejet</span></p>`;
    const result = parseScrutinsIndex(html, '2025');
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2025-10-03');
    expect(result[0].result).toBe('Rejet');
  });

  it('returns empty for HTML without scrutins', () => {
    expect(parseScrutinsIndex('<html></html>', '2025')).toHaveLength(0);
  });
});

describe('mapSenatVotePosition', () => {
  it('maps codes to positions', () => {
    expect(mapSenatVotePosition('p')).toBe('for');
    expect(mapSenatVotePosition('c')).toBe('against');
    expect(mapSenatVotePosition('a')).toBe('abstain');
    expect(mapSenatVotePosition('n')).toBe('absent');
    expect(mapSenatVotePosition('x')).toBe('absent');
  });
});

describe('fetchSenatScrutins', () => {
  it('fetches index then individual scrutin votes', async () => {
    const mockFetch = vi.fn((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('scr2025.html')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(sampleHtml),
        });
      }
      if (urlStr.includes('.json')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              votes: [
                { matricule: '14001A', vote: 'p', siege: 1 },
                { matricule: '14002B', vote: 'c', siege: 2 },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    const result = await fetchSenatScrutins('2025', mockFetch);
    expect(result).toHaveLength(3);
    expect(result[0].votes).toHaveLength(2);
    expect(result[0].votes[0]).toEqual({ matricule: '14001A', position: 'p' });
  });

  it('throws on index HTTP error', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as unknown as typeof fetch;
    await expect(fetchSenatScrutins('2025', fakeFetch)).rejects.toThrow(
      'Sénat scrutins index error: 500',
    );
  });

  it('skips scrutins with failed JSON fetch', async () => {
    const mockFetch = vi.fn((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('scr2025.html')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(sampleHtml),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
    }) as unknown as typeof fetch;

    const result = await fetchSenatScrutins('2025', mockFetch);
    expect(result).toHaveLength(0);
  });
});
