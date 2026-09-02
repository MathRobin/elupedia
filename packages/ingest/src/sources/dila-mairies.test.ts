import { describe, it, expect, vi } from 'vitest';
import { fetchDilaMairies } from './dila-mairies.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    code_insee_commune: '01001',
    adresse:
      '[{"type_adresse":"Adresse","numero_voie":"1 rue de la Mairie","code_postal":"01400","nom_commune":"Ville"}]',
    telephone: '[{"valeur":"04 74 00 00 00","description":""}]',
    adresse_courriel: 'mairie@ville.fr',
    site_internet: '[{"valeur":"https://www.ville.fr","libelle":""}]',
    pivot: '[{"type_service_local":"mairie","code_insee_commune":["01001"]}]',
    ...overrides,
  };
}

function makeFetch(records: Record<string, unknown>[], total?: number) {
  return vi.fn().mockImplementation((url: string) => {
    const hasRecords = url.includes('%2201%22') || url.includes('"01"');
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          total_count: hasRecords ? (total ?? records.length) : 0,
          results: hasRecords ? records : [],
        }),
    });
  }) as unknown as typeof fetch;
}

describe('fetchDilaMairies', () => {
  it('parses address, phone, email and website', async () => {
    const result = await fetchDilaMairies(makeFetch([makeRecord()]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      communeCode: '01001',
      street: '1 rue de la Mairie',
      postalCode: '01400',
      city: 'Ville',
      phone: '04 74 00 00 00',
      email: 'mairie@ville.fr',
      website: 'https://www.ville.fr',
    });
  });

  it('handles missing optional fields', async () => {
    const record = makeRecord({
      telephone: null,
      adresse_courriel: null,
      site_internet: null,
    });
    const result = await fetchDilaMairies(makeFetch([record]));
    expect(result[0].phone).toBeUndefined();
    expect(result[0].email).toBeUndefined();
    expect(result[0].website).toBeUndefined();
  });

  it('falls back to pivot for commune code', async () => {
    const record = makeRecord({ code_insee_commune: null });
    const result = await fetchDilaMairies(makeFetch([record]));
    expect(result[0].communeCode).toBe('01001');
  });

  it('skips records without commune code', async () => {
    const record = makeRecord({
      code_insee_commune: null,
      pivot: null,
    });
    const result = await fetchDilaMairies(makeFetch([record]));
    expect(result).toHaveLength(0);
  });

  it('throws on API error', async () => {
    const failFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }) as unknown as typeof fetch;

    await expect(fetchDilaMairies(failFetch)).rejects.toThrow('DILA API error');
  });
});
