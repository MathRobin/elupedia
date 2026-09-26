import { describe, it, expect, vi } from 'vitest';
import {
  parseCsvRow,
  fetchRneMembresAssemblee,
} from './rne-membres-assemblee.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('parseCsvRow', () => {
  it('parses a single-assembly collectivité (no circonscription)', () => {
    const line =
      ";;;;975;Saint-Pierre-Et-Miquelon;;;;;BRIAND;Bernard;M;1974-07-05;42;Professeur des écoles, instituteur et assimilé;2017-03-19;Président de l'assemblée;2020-10-13";
    const result = parseCsvRow(line);
    expect(result).toMatchObject({
      collectiviteCode: '975',
      collectiviteName: 'Saint-Pierre-Et-Miquelon',
      circonscriptionCode: '',
      circonscriptionName: '',
      lastName: 'BRIAND',
      firstName: 'Bernard',
      gender: 'M',
      birthDate: '1974-07-05',
      mandateStartDate: '2017-03-19',
      functionLabel: "Président de l'assemblée",
      functionStartDate: '2020-10-13',
    });
  });

  it('parses a Métropole de Lyon line with a circonscription', () => {
    const line =
      "84;Auvergne-Rhône-Alpes;69;Rhône;69M;Métropole De Lyon;;;69001;Lones Et Coteaux;ARAUJO;Olivier;M;1980-07-10;37;Cadre administratif et commercial d'entreprise;2026-03-23;Vice-président de l'assemblée;2026-03-26";
    const result = parseCsvRow(line);
    expect(result).toMatchObject({
      regionName: 'Auvergne-Rhône-Alpes',
      departmentName: 'Rhône',
      collectiviteName: 'Métropole De Lyon',
      circonscriptionCode: '69001',
      circonscriptionName: 'Lones Et Coteaux',
      lastName: 'ARAUJO',
      firstName: 'Olivier',
    });
  });

  it('returns undefined for short lines', () => {
    expect(parseCsvRow('foo;bar')).toBeUndefined();
  });

  it('returns undefined for lines with missing required fields', () => {
    expect(parseCsvRow(';;;;;;;;;;;;M;;42;X;2017-03-19;;')).toBeUndefined();
  });
});

describe('fetchRneMembresAssemblee', () => {
  it('parses CSV response and skips header', async () => {
    const csv = [
      "Code de la région;Libellé de la région;Code du département;Libellé du  département;Code de la collectivité à statut particulier;Libellé de la collectivité à statut particulier;Code de la section - collectivité à statut particulier;Libellé de la section - collectivité à statut particulier;Code de la circonscription métropolitaine;Libellé de la circonscription métropolitaine;Nom de l'élu;Prénom de l'élu;Code sexe;Date de naissance;Code CSP;Libellé CSP;Date de début du mandat;Libellé de la fonction;Date de début de la fonction",
      ';;;;975;Saint-Pierre-Et-Miquelon;;;;;BRIAND;Bernard;M;1974-07-05;42;X;2017-03-19;;',
      '',
    ].join('\n');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(csv),
    }) as unknown as typeof fetch;

    const result = await fetchRneMembresAssemblee(mockFetch);
    expect(result).toHaveLength(1);
    expect(result[0].collectiviteName).toBe('Saint-Pierre-Et-Miquelon');
  });

  it('throws on HTTP error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }) as unknown as typeof fetch;

    await expect(fetchRneMembresAssemblee(mockFetch)).rejects.toThrow(
      'RNE membres assemblée error',
    );
  });
});
