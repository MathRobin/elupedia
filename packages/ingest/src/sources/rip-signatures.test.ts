import { describe, it, expect, vi } from 'vitest';
import { fetchRipSignatures, type RipProposition } from './rip-signatures.js';

const HTML_AN = `<!DOCTYPE html>
<html><body>
<p>PROPOSITION DE LOI visant à affirmer le caractère de service public national,
présentée par Mesdames et Messieurs
Jean‑Félix ACQUAVIVA, Maurice ANTISTE, Clémentine AUTAIN, Joël AVIRAGNET,
députés et sénateurs.</p>
</body></html>`;

const HTML_SENAT = `<!DOCTYPE html>
<html><body>
<p>présentée par Mesdames et Messieurs
Mme Nadège ABOMANGOLI, MM. Jean‑Félix ACQUAVIVA, M. Laurent ALEXANDRE,
députés et sénateurs.</p>
</body></html>`;

const PROP: RipProposition = {
  year: 2019,
  subject: 'Aéroports de Paris (ADP)',
  url: 'https://example.com/rip.html',
  sourceDecision: 'https://example.com/decision',
};

describe('fetchRipSignatures', () => {
  it('parses AN HTML with Prénom NOM format', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(HTML_AN),
    });

    const rows = await fetchRipSignatures(PROP, mockFetch as never);

    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      firstName: 'Jean‑Félix',
      lastName: 'ACQUAVIVA',
      subject: 'Aéroports de Paris (ADP)',
      year: 2019,
    });
    expect(rows[2]).toEqual({
      firstName: 'Clémentine',
      lastName: 'AUTAIN',
      subject: 'Aéroports de Paris (ADP)',
      year: 2019,
    });
  });

  it('strips title prefixes (Mme, M., MM.)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(HTML_SENAT),
    });

    const rows = await fetchRipSignatures(PROP, mockFetch as never);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      firstName: 'Nadège',
      lastName: 'ABOMANGOLI',
      subject: 'Aéroports de Paris (ADP)',
      year: 2019,
    });
    expect(rows[2]).toEqual({
      firstName: 'Laurent',
      lastName: 'ALEXANDRE',
      subject: 'Aéroports de Paris (ADP)',
      year: 2019,
    });
  });

  it('throws on fetch error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(fetchRipSignatures(PROP, mockFetch as never)).rejects.toThrow(
      'RIP fetch error: 500 Internal Server Error',
    );
  });
});
