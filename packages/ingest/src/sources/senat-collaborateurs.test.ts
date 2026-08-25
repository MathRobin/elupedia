import { describe, it, expect, vi } from 'vitest';
import { fetchSenatCollaborateurs } from './senat-collaborateurs.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const HEADER =
  '"parlementaire","nom_parlementaire","prénom_parlementaire","sexe_parlementaire","collaborateur","nom_collaborateur","prénom_collaborateur","sexe_collaborateur","url_api_RC","url_institution","information complémentaire"';

function csvLine(
  nomParl: string,
  prenomParl: string,
  nomCollab: string,
  prenomCollab: string,
  slug: string,
): string {
  return `"${prenomParl} ${nomParl}","${nomParl}","${prenomParl}","H","M. ${nomCollab} ${prenomCollab}","${nomCollab}","${prenomCollab}","H","","https://www.senat.fr/senateur/${slug}.html",""`;
}

function mockFetch(body: string): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe('Sénat collaborateurs client', () => {
  it('parses CSV and groups by matricule extracted from URL', async () => {
    const csv = [
      HEADER,
      csvLine(
        'ALLIZARD',
        'Pascal',
        'OLIVIER',
        'Béatrice',
        'allizard_pascal14133k',
      ),
      csvLine(
        'ALLIZARD',
        'Pascal',
        'TOLINI',
        'Nicolas',
        'allizard_pascal14133k',
      ),
      csvLine(
        'ANGLARS',
        'Jean-Claude',
        'EHRHARD',
        'Thomas',
        'anglars_jean_claude20032t',
      ),
    ].join('\n');

    const result = await fetchSenatCollaborateurs(mockFetch(csv));

    expect(result).toHaveLength(2);

    const allizard = result.find((r) => r.matricule === '14133K');
    expect(allizard).toBeDefined();
    expect(allizard!.collaborateurs).toHaveLength(2);
    expect(allizard!.collaborateurs[0]).toEqual({
      prenom: 'Béatrice',
      nom: 'OLIVIER',
    });

    const anglars = result.find((r) => r.matricule === '20032T');
    expect(anglars).toBeDefined();
    expect(anglars!.collaborateurs).toHaveLength(1);
  });

  it('skips lines with invalid URL (no matricule)', async () => {
    const csv = [
      HEADER,
      '"Foo","FOO","Bar","H","M. X Y","X","Y","H","","https://example.com/no-match",""',
    ].join('\n');

    const result = await fetchSenatCollaborateurs(mockFetch(csv));
    expect(result).toHaveLength(0);
  });

  it('throws on HTTP error', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as unknown as typeof fetch;

    await expect(fetchSenatCollaborateurs(fakeFetch)).rejects.toThrow(
      'Sénat collaborateurs error: 500',
    );
  });
});
