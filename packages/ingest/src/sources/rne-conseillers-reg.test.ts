import { describe, it, expect, vi } from 'vitest';
import { parseCsvRow, fetchRneConseillersReg } from './rne-conseillers-reg.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('parseCsvRow', () => {
  it('parses a standard RNE line without a function', () => {
    const line =
      "01;Guadeloupe;971;Guadeloupe;ARMOUGOM;Betty Véronique;F;1965-07-09;23;Chef d'entreprise de 10 salariés ou plus;2021-07-02;;";
    const result = parseCsvRow(line);
    expect(result).toMatchObject({
      regionCode: '01',
      regionName: 'Guadeloupe',
      sectionCode: '971',
      sectionName: 'Guadeloupe',
      lastName: 'ARMOUGOM',
      firstName: 'Betty Véronique',
      gender: 'F',
      birthDate: '1965-07-09',
      mandateStartDate: '2021-07-02',
      functionLabel: '',
    });
  });

  it('parses a metropolitan region line with a department-level section', () => {
    const line =
      '84;Auvergne-Rhône-Alpes;69M;Métropole de Lyon;NOM;Prenom;M;1970-01-01;33;Cadre;2021-07-02;Président du conseil régional;2021-07-02';
    const result = parseCsvRow(line);
    expect(result).toMatchObject({
      regionCode: '84',
      regionName: 'Auvergne-Rhône-Alpes',
      sectionCode: '69M',
      sectionName: 'Métropole de Lyon',
      functionLabel: 'Président du conseil régional',
      functionStartDate: '2021-07-02',
    });
  });

  it('returns undefined for short lines', () => {
    expect(parseCsvRow('foo;bar')).toBeUndefined();
  });

  it('returns undefined for lines with missing required fields', () => {
    expect(
      parseCsvRow('01;Guadeloupe;;;;;M;;23;X;2021-07-02;;'),
    ).toBeUndefined();
  });
});

describe('fetchRneConseillersReg', () => {
  it('parses CSV response and skips header', async () => {
    const csv = [
      "Code de la région;Libellé de la région;Code de la section départementale;Libellé de la section départementale;Nom de l'élu;Prénom de l'élu;Code sexe;Date de naissance;Code CSP;Libellé CSP;Date de début du mandat;Libellé de la fonction;Date de début de la fonction",
      "01;Guadeloupe;971;Guadeloupe;ARMOUGOM;Betty Véronique;F;1965-07-09;23;Chef d'entreprise de 10 salariés ou plus;2021-07-02;;",
      '',
    ].join('\n');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(csv),
    }) as unknown as typeof fetch;

    const result = await fetchRneConseillersReg(mockFetch);
    expect(result).toHaveLength(1);
    expect(result[0].sectionCode).toBe('971');
  });

  it('throws on HTTP error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }) as unknown as typeof fetch;

    await expect(fetchRneConseillersReg(mockFetch)).rejects.toThrow(
      'RNE conseillers régionaux error',
    );
  });
});
