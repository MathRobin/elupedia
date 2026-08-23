import { describe, it, expect, vi } from 'vitest';
import { fetchCollaborateurs, DATASET_URL } from './an-collaborateurs.js';

const CSV_CONTENT = [
  '"Identifiant du député","Nom du député","Prénom du député","Nom du collaborateur","Prénom du collaborateur"',
  '"PA100001","Dupont","Marie","Bernard","Alice"',
  '"PA100001","Dupont","Marie","Charrier","Bob"',
  '"PA100002","Martin","Jean","Duval","Claire"',
].join('\n');

function mockFetch(text: string, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    text: () => Promise.resolve(text),
  }) as unknown as typeof fetch;
}

describe('AN collaborateurs client', () => {
  it('parses CSV and groups by deputy', async () => {
    const result = await fetchCollaborateurs(mockFetch(CSV_CONTENT));

    expect(result).toHaveLength(2);

    const dep1 = result.find((d) => d.id_an === 'PA100001');
    expect(dep1).toBeDefined();
    expect(dep1!.collaborateurs).toHaveLength(2);
    expect(dep1!.collaborateurs[0]).toEqual({
      prenom: 'Alice',
      nom: 'Bernard',
    });
    expect(dep1!.collaborateurs[1]).toEqual({ prenom: 'Bob', nom: 'Charrier' });

    const dep2 = result.find((d) => d.id_an === 'PA100002');
    expect(dep2).toBeDefined();
    expect(dep2!.collaborateurs).toHaveLength(1);
    expect(dep2!.collaborateurs[0]).toEqual({
      prenom: 'Claire',
      nom: 'Duval',
    });
  });

  it('calls the correct URL', async () => {
    const fakeFetch = mockFetch(CSV_CONTENT);
    await fetchCollaborateurs(fakeFetch);
    expect(fakeFetch).toHaveBeenCalledWith(DATASET_URL);
  });

  it('throws on HTTP error', async () => {
    await expect(fetchCollaborateurs(mockFetch('', 404))).rejects.toThrow(
      'AN collaborateurs API error: 404',
    );
  });

  it('returns empty array for header-only CSV', async () => {
    const headerOnly =
      '"Identifiant du député","Nom du député","Prénom du député","Nom du collaborateur","Prénom du collaborateur"';
    const result = await fetchCollaborateurs(mockFetch(headerOnly));
    expect(result).toEqual([]);
  });

  it('skips lines with missing fields', async () => {
    const csv = [
      '"Identifiant du député","Nom du député","Prénom du député","Nom du collaborateur","Prénom du collaborateur"',
      '"PA100001","Dupont","Marie"',
      '"PA100001","Dupont","Marie","Bernard","Alice"',
    ].join('\n');
    const result = await fetchCollaborateurs(mockFetch(csv));
    expect(result).toHaveLength(1);
    expect(result[0].collaborateurs).toHaveLength(1);
  });

  it('handles quoted fields with commas', async () => {
    const csv = [
      '"Identifiant du député","Nom du député","Prénom du député","Nom du collaborateur","Prénom du collaborateur"',
      '"PA100001","Du,pont","Marie","Ber,nard","Ali,ce"',
    ].join('\n');
    const result = await fetchCollaborateurs(mockFetch(csv));
    expect(result[0].collaborateurs[0]).toEqual({
      prenom: 'Ali,ce',
      nom: 'Ber,nard',
    });
  });

  it('handles escaped double quotes', async () => {
    const csv = [
      '"Identifiant du député","Nom du député","Prénom du député","Nom du collaborateur","Prénom du collaborateur"',
      '"PA100001","Dupont","Marie","O""Brien","Jean"',
    ].join('\n');
    const result = await fetchCollaborateurs(mockFetch(csv));
    expect(result[0].collaborateurs[0].nom).toBe('O"Brien');
  });
});
