import { describe, it, expect, vi } from 'vitest';
import {
  fetchRneConseillersEpci,
  parseCsvRow,
  splitCsvLine,
} from './rne-conseillers-epci.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const HEADER =
  "Code du département;Libellé du département;Code de la collectivité à statut particulier;Libellé de la collectivité à statut particulier;N° SIREN;Libellé de l'EPCI;Code de la commune de rattachement;Libellé de la commune de rattachement;Nom de l'élu;Prénom de l'élu;Code sexe;Date de naissance;Code de la catégorie socio-professionnelle;Libellé de la catégorie socio-professionnelle;Date de début du mandat;Libellé de la fonction;Date de début de la fonction";

const VP =
  "01;Ain;;;200029999;Cc Rives De L'Ain-Pays Du Cerdon;01056;Boyeux-Saint-Jérôme;TURPIN;Juvénal;M;1973-12-23;37;Cadre administratif et commercial d'entreprise;2026-03-15;5eme Vice-président du conseil communautaire;2026-03-22";
const SIMPLE =
  '23;Creuse;;;200067544;"Cc ""Creuse Confluence""";23009;Auge;MAUME;Patrick;M;1961-07-13;71;Ancien agriculteur exploitant;2026-03-15;;';

describe('splitCsvLine', () => {
  it('keeps plain fields and empty trailing fields', () => {
    expect(splitCsvLine('a;b;;')).toEqual(['a', 'b', '', '']);
  });

  it('unquotes fields, with doubled quotes as literal quotes and ; inside', () => {
    expect(splitCsvLine('1;"Cc ""X"""; "a;b" ;2')).toEqual([
      '1',
      'Cc "X"',
      ' a;b ',
      '2',
    ]);
  });
});

describe('parseCsvRow', () => {
  it('parses a vice-president with a later function date than the seat', () => {
    expect(parseCsvRow(VP)).toEqual({
      departmentCode: '01',
      departmentName: 'Ain',
      epciSiren: '200029999',
      epciName: "Cc Rives De L'Ain-Pays Du Cerdon",
      communeCode: '01056',
      communeName: 'Boyeux-Saint-Jérôme',
      lastName: 'TURPIN',
      firstName: 'Juvénal',
      gender: 'M',
      birthDate: '1973-12-23',
      mandateStartDate: '2026-03-15',
      functionLabel: '5eme Vice-président du conseil communautaire',
      functionStartDate: '2026-03-22',
    });
  });

  it('parses a plain councillor and an EPCI label containing quotes', () => {
    const r = parseCsvRow(SIMPLE)!;
    expect(r.epciName).toBe('Cc "Creuse Confluence"');
    expect(r.functionLabel).toBe('');
    expect(r.functionStartDate).toBe('');
  });

  it('falls back on the special collectivity when the department is empty', () => {
    const line =
      '2A;;ZZ;Collectivité de Corse;200000001;Ca Ajaccien;2A004;Ajaccio;DUPONT;Marie;F;1970-01-01;1;x;2026-03-15;;';
    const r = parseCsvRow(line)!;
    expect(r.departmentName).toBe('Collectivité de Corse');
    expect(r.gender).toBe('F');
  });

  it('tolerates CRLF line endings', () => {
    expect(parseCsvRow(`${SIMPLE}\r`)?.functionStartDate).toBe('');
  });

  it('rejects short lines and rows missing a key field', () => {
    expect(parseCsvRow('01;Ain;;;')).toBeUndefined();
    expect(parseCsvRow(VP.replace('1973-12-23', ''))).toBeUndefined();
    expect(parseCsvRow(VP.replace('200029999', ''))).toBeUndefined();
  });
});

describe('fetchRneConseillersEpci', () => {
  it('skips the header and counts rejected rows', async () => {
    const body = [HEADER, VP, '', 'ligne;cassée', SIMPLE].join('\n');
    const fetchFn = vi.fn(async () => new Response(body, { status: 200 }));
    const rows = await fetchRneConseillersEpci(
      fetchFn as unknown as typeof fetch,
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].epciName).toBe('Cc "Creuse Confluence"');
  });

  it('throws on an HTTP error', async () => {
    const fetchFn = vi.fn(
      async () => new Response('', { status: 503, statusText: 'Unavailable' }),
    );
    await expect(
      fetchRneConseillersEpci(fetchFn as unknown as typeof fetch),
    ).rejects.toThrow('503');
  });
});
