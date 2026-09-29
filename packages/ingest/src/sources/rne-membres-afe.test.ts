import { describe, it, expect, vi } from 'vitest';
import { parseCsvRow, fetchRneMembresAfe } from './rne-membres-afe.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('parseCsvRow', () => {
  it('parses a standard RNE line (champs texte entre guillemets)', () => {
    const line =
      '1;"Canada";"DELLAPINA";"Olivier";"M";1975-09-17;54;"Employé administratif d\'entreprise";2021-12-06;;';
    const result = parseCsvRow(line);
    expect(result).toMatchObject({
      afeCode: '1',
      afeName: 'Canada',
      lastName: 'DELLAPINA',
      firstName: 'Olivier',
      gender: 'M',
      birthDate: '1975-09-17',
      mandateStartDate: '2021-12-06',
    });
  });

  it('parses a line with a président function (colonnes ignorées)', () => {
    const line =
      '2;"Etats-Unis d\'Amérique";"EPELBAUM";"Gérard";"M";1958-03-11;31;"Profession libérale";2021-12-06;"Président";2023-07-01';
    const result = parseCsvRow(line);
    expect(result).toMatchObject({
      afeName: "Etats-Unis d'Amérique",
      lastName: 'EPELBAUM',
      firstName: 'Gérard',
      gender: 'M',
      mandateStartDate: '2021-12-06',
    });
  });

  it('defaults gender to M when not F', () => {
    const line =
      '1;"Canada";"WATKINS";"Francine";"F";1949-12-03;23;"X";2021-12-06;;';
    expect(parseCsvRow(line)?.gender).toBe('F');
  });

  it('returns undefined for short lines', () => {
    expect(parseCsvRow('foo;bar')).toBeUndefined();
  });

  it('returns undefined for lines with missing required fields', () => {
    expect(
      parseCsvRow('1;"Canada";;;"M";;23;"X";2021-12-06;;'),
    ).toBeUndefined();
  });
});

describe('fetchRneMembresAfe', () => {
  it('parses CSV response and skips header', async () => {
    const csv = [
      '"Code de la circ. AFE";"Libellé la circ. AFE";"Nom de l\'élu";"Prénom de l\'élu";"Code sexe";"Date de naissance";"Code de la catégorie socio-professionnelle";"Libellé de la catégorie socio-professionnelle";"Date de début du mandat";"Libellé de la fonction";"Date de début de la fonction"',
      '1;"Canada";"DELLAPINA";"Olivier";"M";1975-09-17;54;"Employé administratif d\'entreprise";2021-12-06;;',
      '',
    ].join('\n');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(csv),
    }) as unknown as typeof fetch;

    const result = await fetchRneMembresAfe(mockFetch);
    expect(result).toHaveLength(1);
    expect(result[0].afeName).toBe('Canada');
  });

  it('throws on HTTP error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }) as unknown as typeof fetch;

    await expect(fetchRneMembresAfe(mockFetch)).rejects.toThrow(
      "RNE membres de l'Assemblée des Français de l'étranger error",
    );
  });
});
