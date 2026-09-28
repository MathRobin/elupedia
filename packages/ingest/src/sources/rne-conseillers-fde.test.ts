import { describe, it, expect, vi } from 'vitest';
import { parseCsvRow, fetchRneConseillersFde } from './rne-conseillers-fde.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('parseCsvRow', () => {
  it('parses a standard RNE line (champs texte entre guillemets)', () => {
    const line =
      '1;"Canada";101;"Canada - 1re circonscription";"DELLAPINA";"Olivier";"M";1975-09-17;"PARIS10";54;"Employé administratif d\'entreprise";2021-05-31;;';
    const result = parseCsvRow(line);
    expect(result).toMatchObject({
      afeCode: '1',
      afeName: 'Canada',
      consularCode: '101',
      consularName: 'Canada - 1re circonscription',
      lastName: 'DELLAPINA',
      firstName: 'Olivier',
      gender: 'M',
      birthDate: '1975-09-17',
      mandateStartDate: '2021-05-31',
    });
  });

  it('parses a line with a président du conseil consulaire function (colonnes ignorées)', () => {
    const line =
      '1;"Canada";101;"Canada - 1re circonscription";"DELLAPINA";"Cindy";"F";1979-02-12;"Rouen";65;"Ouvrier qualifié de la manutention, du magasinage et du transport";2021-05-31;"Président du conseil consulaire";2022-10-24';
    const result = parseCsvRow(line);
    expect(result).toMatchObject({
      consularCode: '101',
      lastName: 'DELLAPINA',
      firstName: 'Cindy',
      gender: 'F',
      mandateStartDate: '2021-05-31',
    });
  });

  it('returns undefined for short lines', () => {
    expect(parseCsvRow('foo;bar')).toBeUndefined();
  });

  it('returns undefined for lines with missing required fields', () => {
    expect(
      parseCsvRow('1;"Canada";;;;;"M";;"Rouen";65;"X";2021-05-31;;'),
    ).toBeUndefined();
  });
});

describe('fetchRneConseillersFde', () => {
  it('parses CSV response and skips header', async () => {
    const csv = [
      '"Code de la circonscription AFE";"Libellé la circonscription AFE";"Code de la circonscription consulaire";"Libellé de la circonscription consulaire";"Nom de l\'élu";"Prénom de l\'élu";"Code sexe";"Date de naissance";"Lieu de naissance";"Code de la catégorie socio-professionnelle";"Libellé de la catégorie socio-professionnelle";"Date de début du mandat";"Libellé de la fonction";"Date de début de la fonction"',
      '1;"Canada";101;"Canada - 1re circonscription";"DELLAPINA";"Olivier";"M";1975-09-17;"PARIS10";54;"Employé administratif d\'entreprise";2021-05-31;;',
      '',
    ].join('\n');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(csv),
    }) as unknown as typeof fetch;

    const result = await fetchRneConseillersFde(mockFetch);
    expect(result).toHaveLength(1);
    expect(result[0].consularCode).toBe('101');
  });

  it('throws on HTTP error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }) as unknown as typeof fetch;

    await expect(fetchRneConseillersFde(mockFetch)).rejects.toThrow(
      "RNE conseillers des Français de l'étranger error",
    );
  });
});
