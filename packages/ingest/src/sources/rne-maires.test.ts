import { describe, it, expect, vi } from 'vitest';
import { parseCsvRow, fetchRneMaires } from './rne-maires.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('parseCsvRow', () => {
  it('parses a standard RNE line', () => {
    const line =
      "01;Ain;;;01001;L'Abergement-Clémenciat;EVALET TAPONAT;Line;F;1967-07-22;38;Ingénieur;2026-03-15;2026-03-23";
    const result = parseCsvRow(line);
    expect(result).toMatchObject({
      departmentCode: '01',
      departmentName: 'Ain',
      communeCode: '01001',
      communeName: "L'Abergement-Clémenciat",
      lastName: 'EVALET TAPONAT',
      firstName: 'Line',
      gender: 'F',
      birthDate: '1967-07-22',
      mandateStartDate: '2026-03-15',
      functionStartDate: '2026-03-23',
    });
  });

  it('returns undefined for short lines', () => {
    expect(parseCsvRow('foo;bar')).toBeUndefined();
  });

  it('returns undefined for lines with missing required fields', () => {
    expect(
      parseCsvRow('01;Ain;;;01001;;EVALET;Line;F;;38;X;2026-03-15;2026-03-23'),
    ).toBeUndefined();
  });

  it('parses male gender', () => {
    const line =
      '75;Paris;;;75056;Paris;GRÉGOIRE;Emmanuel;M;1977-12-24;37;Cadre;2026-03-22;2026-03-29';
    const result = parseCsvRow(line);
    expect(result?.gender).toBe('M');
    expect(result?.communeCode).toBe('75056');
  });
});

describe('fetchRneMaires', () => {
  it('parses CSV response and skips header', async () => {
    const csv = [
      'Code du département;Libellé;CSP;LCSP;Code commune;Libellé commune;Nom;Prénom;Sexe;Date naissance;CSP;LCSP;Début mandat;Début fonction',
      '01;Ain;;;01001;Ville;NOM;Prenom;M;1970-01-01;38;X;2026-03-15;2026-03-20',
      '',
    ].join('\n');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(csv),
    }) as unknown as typeof fetch;

    const result = await fetchRneMaires(mockFetch);
    expect(result).toHaveLength(1);
    expect(result[0].communeCode).toBe('01001');
  });

  it('throws on HTTP error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }) as unknown as typeof fetch;

    await expect(fetchRneMaires(mockFetch)).rejects.toThrow('RNE maires error');
  });
});
