import { describe, it, expect, vi } from 'vitest';
import { parseCsvRow, fetchRneConseillersDep } from './rne-conseillers-dep.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('parseCsvRow', () => {
  it('parses a standard RNE line without a function', () => {
    const line =
      '01;Ain;0101;Ambérieu-En-Bugey;BRUNET;Joël;M;1955-05-02;74;Ancien cadre;2021-07-01;;';
    const result = parseCsvRow(line);
    expect(result).toMatchObject({
      departmentCode: '01',
      departmentName: 'Ain',
      cantonCode: '0101',
      cantonName: 'Ambérieu-En-Bugey',
      lastName: 'BRUNET',
      firstName: 'Joël',
      gender: 'M',
      birthDate: '1955-05-02',
      mandateStartDate: '2021-07-01',
      functionLabel: '',
    });
  });

  it('parses a line with a vice-president function', () => {
    const line =
      "01;Ain;0102;Attignat;FOURNIER;Clotilde;F;1966-09-01;35;Profession de l'information, des arts et des spectacles;2021-07-01;9ème Vice-président du conseil départemental;2021-07-01";
    const result = parseCsvRow(line);
    expect(result).toMatchObject({
      cantonCode: '0102',
      cantonName: 'Attignat',
      lastName: 'FOURNIER',
      firstName: 'Clotilde',
      gender: 'F',
      functionLabel: '9ème Vice-président du conseil départemental',
      functionStartDate: '2021-07-01',
    });
  });

  it('returns undefined for short lines', () => {
    expect(parseCsvRow('foo;bar')).toBeUndefined();
  });

  it('returns undefined for lines with missing required fields', () => {
    expect(parseCsvRow('01;Ain;;;;;M;;74;X;2021-07-01;;')).toBeUndefined();
  });
});

describe('fetchRneConseillersDep', () => {
  it('parses CSV response and skips header', async () => {
    const csv = [
      "Code du département;Libellé du département;Code du canton;Libellé du canton;Nom de l'élu;Prénom de l'élu;Code sexe;Date de naissance;Code CSP;Libellé CSP;Date de début du mandat;Libellé de la fonction;Date de début de la fonction",
      '01;Ain;0101;Ambérieu-En-Bugey;BRUNET;Joël;M;1955-05-02;74;Ancien cadre;2021-07-01;;',
      '',
    ].join('\n');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(csv),
    }) as unknown as typeof fetch;

    const result = await fetchRneConseillersDep(mockFetch);
    expect(result).toHaveLength(1);
    expect(result[0].cantonCode).toBe('0101');
  });

  it('throws on HTTP error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }) as unknown as typeof fetch;

    await expect(fetchRneConseillersDep(mockFetch)).rejects.toThrow(
      'RNE conseillers départementaux error',
    );
  });
});
