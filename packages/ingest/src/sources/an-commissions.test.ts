import { describe, it, expect, vi } from 'vitest';
import { fetchCommittees, CommitteeItemSchema } from './an-commissions.js';
import { DATASET_URL } from './assemblee-nationale.js';
import AdmZip from 'adm-zip';

function makeActeurJson(
  uid: string,
  mandats: {
    typeOrgane: string;
    dateDebut: string;
    dateFin?: string | null;
    organeRef?: string;
  }[],
) {
  return {
    acteur: {
      uid: { '#text': uid },
      etatCivil: {
        ident: { civ: 'Mme', prenom: 'Marie', nom: 'Dupont' },
        infoNaissance: { dateNais: '1975-03-14' },
      },
      mandats: {
        mandat: mandats.map((m, i) => ({
          uid: `PM${i}`,
          typeOrgane: m.typeOrgane,
          dateDebut: m.dateDebut,
          dateFin: m.dateFin ?? null,
          organes: m.organeRef ? { organeRef: m.organeRef } : null,
        })),
      },
    },
  };
}

function makeOrganeJson(
  uid: string,
  codeType: string,
  libelle: string,
  libelleAbrege?: string,
) {
  return {
    organe: { uid, codeType, libelle, libelleAbrege: libelleAbrege ?? null },
  };
}

function buildZipBuffer(
  acteurs: { uid: string; data: unknown }[],
  organes: { uid: string; data: unknown }[],
): Buffer {
  const zip = new AdmZip();
  for (const a of acteurs) {
    zip.addFile(
      `json/acteur/${a.uid}.json`,
      Buffer.from(JSON.stringify(a.data)),
    );
  }
  for (const o of organes) {
    zip.addFile(
      `json/organe/${o.uid}.json`,
      Buffer.from(JSON.stringify(o.data)),
    );
  }
  return zip.toBuffer();
}

function mockFetch(buffer: Buffer, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Internal Server Error',
    arrayBuffer: () =>
      Promise.resolve(
        buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ),
      ),
  }) as unknown as typeof fetch;
}

describe('AN commissions client', () => {
  it('extracts committee memberships from ZIP archive', async () => {
    const organe = makeOrganeJson(
      'PO500001',
      'COMPER',
      'Commission des finances, de l’économie générale et du contrôle budgétaire',
      'Finances',
    );
    const acteur = makeActeurJson('PA100001', [
      {
        typeOrgane: 'COMPER',
        dateDebut: '2022-07-01',
        organeRef: 'PO500001',
      },
    ]);
    const zipBuffer = buildZipBuffer(
      [{ uid: 'PA100001', data: acteur }],
      [{ uid: 'PO500001', data: organe }],
    );

    const result = await fetchCommittees(mockFetch(zipBuffer));

    expect(result).toHaveLength(1);
    expect(result[0].id_an).toBe('PA100001');
    expect(result[0].committees).toHaveLength(1);
    expect(result[0].committees[0]).toEqual({
      name: 'Commission des finances, de l’économie générale et du contrôle budgétaire (Finances)',
      type: 'standing_committee',
      start_date: '2022-07-01',
      end_date: undefined,
    });
  });

  it('maps all committee organe types', async () => {
    const organes = [
      makeOrganeJson('PO1', 'COMPER', 'Commission permanente'),
      makeOrganeJson('PO2', 'COMSPST', 'Commission spéciale'),
      makeOrganeJson('PO3', 'DELEG', 'Délégation parlementaire'),
      makeOrganeJson('PO4', 'GE', "Groupe d'études"),
      makeOrganeJson('PO5', 'GA', "Groupe d'amitié France-Japon"),
    ];
    const acteur = makeActeurJson('PA100001', [
      { typeOrgane: 'COMPER', dateDebut: '2022-07-01', organeRef: 'PO1' },
      { typeOrgane: 'COMSPST', dateDebut: '2023-01-01', organeRef: 'PO2' },
      { typeOrgane: 'DELEG', dateDebut: '2023-02-01', organeRef: 'PO3' },
      { typeOrgane: 'GE', dateDebut: '2023-03-01', organeRef: 'PO4' },
      {
        typeOrgane: 'GA',
        dateDebut: '2023-04-01',
        dateFin: '2024-06-30',
        organeRef: 'PO5',
      },
    ]);
    const zipBuffer = buildZipBuffer(
      [{ uid: 'PA100001', data: acteur }],
      organes.map((o) => ({ uid: o.organe.uid, data: o })),
    );

    const result = await fetchCommittees(mockFetch(zipBuffer));
    const types = result[0].committees.map((c) => c.type);

    expect(types).toEqual([
      'standing_committee',
      'special_committee',
      'delegation',
      'study_group',
      'friendship_group',
    ]);
    expect(result[0].committees[4].end_date).toBe('2024-06-30');
  });

  it('ignores non-committee organes (GP, ASSEMBLEE)', async () => {
    const organes = [
      makeOrganeJson('PO1', 'GP', 'Renaissance'),
      makeOrganeJson('PO2', 'ASSEMBLEE', 'Assemblée nationale'),
    ];
    const acteur = makeActeurJson('PA100001', [
      { typeOrgane: 'GP', dateDebut: '2022-07-01', organeRef: 'PO1' },
      { typeOrgane: 'ASSEMBLEE', dateDebut: '2022-07-01', organeRef: 'PO2' },
    ]);
    const zipBuffer = buildZipBuffer(
      [{ uid: 'PA100001', data: acteur }],
      organes.map((o) => ({ uid: o.organe.uid, data: o })),
    );

    const result = await fetchCommittees(mockFetch(zipBuffer));
    expect(result).toHaveLength(0);
  });

  it('skips acteurs with no committee mandats', async () => {
    const acteur = makeActeurJson('PA100001', [
      { typeOrgane: 'GP', dateDebut: '2022-07-01' },
    ]);
    const zipBuffer = buildZipBuffer([{ uid: 'PA100001', data: acteur }], []);

    const result = await fetchCommittees(mockFetch(zipBuffer));
    expect(result).toHaveLength(0);
  });

  it('throws on HTTP error', async () => {
    const fakeFetch = mockFetch(Buffer.alloc(0), 500);
    await expect(fetchCommittees(fakeFetch)).rejects.toThrow(
      'AN commissions API error: 500',
    );
  });

  it('calls the correct URL', async () => {
    const zipBuffer = buildZipBuffer([], []);
    const fakeFetch = mockFetch(zipBuffer);
    await fetchCommittees(fakeFetch);
    expect(fakeFetch).toHaveBeenCalledWith(DATASET_URL);
  });

  it('validates CommitteeItemSchema', () => {
    expect(
      CommitteeItemSchema.safeParse({
        name: 'Commission des finances',
        type: 'standing_committee',
        start_date: '2022-07-01',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid type in CommitteeItemSchema', () => {
    expect(
      CommitteeItemSchema.safeParse({
        name: 'Test',
        type: 'invalid_committee',
        start_date: '2024-01-01',
      }).success,
    ).toBe(false);
  });
});
