import { describe, it, expect, vi } from 'vitest';
import { parseCsvRow, fetchRneConseillersArr } from './rne-conseillers-arr.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('parseCsvRow', () => {
  it('parses a standard RNE line without a function', () => {
    const line =
      '13;Bouches-Du-Rhône;13055;Marseille;Marseille Secteur 1;AMICO;Patrick;M;1955-08-25;74;Ancien cadre;2026-03-22;;';
    const result = parseCsvRow(line);
    expect(result).toMatchObject({
      departmentCode: '13',
      departmentName: 'Bouches-Du-Rhône',
      communeCode: '13055',
      communeName: 'Marseille',
      sectorLabel: 'Marseille Secteur 1',
      lastName: 'AMICO',
      firstName: 'Patrick',
      gender: 'M',
      birthDate: '1955-08-25',
      mandateStartDate: '2026-03-22',
      functionLabel: '',
    });
  });

  it('parses a line for the "maire d\'arrondissement" function', () => {
    const line =
      "13;Bouches-Du-Rhône;13055;Marseille;Marseille Secteur 1;CAMARD;Sophie;F;1972-12-09;37;Cadre administratif et commercial d'entreprise;2026-03-22;Maire d'arrondissement;2026-04-05";
    const result = parseCsvRow(line);
    expect(result).toMatchObject({
      lastName: 'CAMARD',
      firstName: 'Sophie',
      functionLabel: "Maire d'arrondissement",
      functionStartDate: '2026-04-05',
    });
  });

  it('returns undefined for short lines', () => {
    expect(parseCsvRow('foo;bar')).toBeUndefined();
  });

  it('returns undefined for lines with missing required fields', () => {
    expect(
      parseCsvRow('13;Bouches-Du-Rhône;;;;;;M;;74;X;2026-03-22;;'),
    ).toBeUndefined();
  });
});

describe('fetchRneConseillersArr', () => {
  it('parses CSV response and skips header', async () => {
    const csv = [
      "Code du département;Libellé du département;Code de la commune;Libellé de la commune;Libellé du secteur;Nom de l'élu;Prénom de l'élu;Code sexe;Date de naissance;Code CSP;Libellé CSP;Date de début du mandat;Libellé de la fonction;Date de début de la fonction",
      '13;Bouches-Du-Rhône;13055;Marseille;Marseille Secteur 1;AMICO;Patrick;M;1955-08-25;74;Ancien cadre;2026-03-22;;',
      '',
    ].join('\n');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(csv),
    }) as unknown as typeof fetch;

    const result = await fetchRneConseillersArr(mockFetch);
    expect(result).toHaveLength(1);
    expect(result[0].sectorLabel).toBe('Marseille Secteur 1');
  });

  it('throws on HTTP error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }) as unknown as typeof fetch;

    await expect(fetchRneConseillersArr(mockFetch)).rejects.toThrow(
      "RNE conseillers d'arrondissement error",
    );
  });
});
