import { describe, it, expect, vi } from 'vitest';
import { fetchAddresses, DATASET_URL } from './an-adresses.js';
import AdmZip from 'adm-zip';

function makeActeurWithAddresses(uid: string, addresses: unknown[]): unknown {
  return {
    acteur: {
      uid: { '#text': uid },
      etatCivil: {
        ident: { civ: 'Mme', prenom: 'Marie', nom: 'Dupont' },
        infoNaissance: { dateNais: '1975-03-14' },
      },
      adresses: { adresse: addresses },
      mandats: {
        mandat: {
          uid: 'PM900001',
          typeOrgane: 'ASSEMBLEE',
          dateDebut: '2024-07-07',
          dateFin: null,
        },
      },
    },
  };
}

function buildZipBuffer(acteurs: { uid: string; data: unknown }[]): Buffer {
  const zip = new AdmZip();
  for (const a of acteurs) {
    zip.addFile(
      `json/acteur/${a.uid}.json`,
      Buffer.from(JSON.stringify(a.data)),
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

describe('AN adresses client', () => {
  it('extracts assembly and constituency addresses from acteur ZIP', async () => {
    const acteur = makeActeurWithAddresses('PA100001', [
      {
        uid: 'AD001',
        type: '0',
        typeLibelle: 'Adresse officielle',
        codePostal: '75355',
        ville: 'Paris 07 SP',
        numeroRue: '126',
        nomRue: "Rue de l'Université,",
      },
      {
        uid: 'AD002',
        type: '2',
        typeLibelle: 'Adresse publiée de circonscription',
        codePostal: '33150',
        ville: 'Cenon',
        numeroRue: '7',
        nomRue: 'Avenue Roger Schwob',
      },
      {
        uid: 'AD003',
        type: '11',
        typeLibelle: 'Téléphone',
        adresseDeRattachement: 'AD002',
        valElec: '07 88 44 06 75',
      },
      {
        uid: 'AD004',
        type: '15',
        typeLibelle: 'Mèl',
        valElec: 'marie.dupont@assemblee-nationale.fr',
      },
    ]);
    const zipBuffer = buildZipBuffer([{ uid: 'PA100001', data: acteur }]);
    const result = await fetchAddresses(mockFetch(zipBuffer));

    expect(result).toHaveLength(2);

    const assembly = result.find((a) => a.type === 'assembly_office');
    expect(assembly).toBeDefined();
    expect(assembly!.street).toBe("126 Rue de l'Université");
    expect(assembly!.postal_code).toBe('75355');
    expect(assembly!.city).toBe('Paris 07 SP');
    expect(assembly!.phone).toBeUndefined();
    expect(assembly!.email).toBe('marie.dupont@assemblee-nationale.fr');

    const circo = result.find((a) => a.type === 'constituency_office');
    expect(circo).toBeDefined();
    expect(circo!.street).toBe('7 Avenue Roger Schwob');
    expect(circo!.postal_code).toBe('33150');
    expect(circo!.city).toBe('Cenon');
    expect(circo!.phone).toBe('07 88 44 06 75');
    expect(circo!.email).toBe('marie.dupont@assemblee-nationale.fr');
  });

  it('calls the correct URL', async () => {
    const zipBuffer = buildZipBuffer([]);
    const fakeFetch = mockFetch(zipBuffer);
    await fetchAddresses(fakeFetch);
    expect(fakeFetch).toHaveBeenCalledWith(DATASET_URL);
  });

  it('throws on HTTP error', async () => {
    await expect(
      fetchAddresses(mockFetch(Buffer.alloc(0), 500)),
    ).rejects.toThrow('AN adresses API error: 500');
  });

  it('handles acteur without addresses', async () => {
    const acteur = {
      acteur: {
        uid: { '#text': 'PA100002' },
        etatCivil: {
          ident: { civ: 'M.', prenom: 'Jean', nom: 'Martin' },
          infoNaissance: { dateNais: '1980-01-01' },
        },
        mandats: {
          mandat: {
            uid: 'PM900002',
            typeOrgane: 'ASSEMBLEE',
            dateDebut: '2024-07-07',
            dateFin: null,
          },
        },
      },
    };
    const zipBuffer = buildZipBuffer([{ uid: 'PA100002', data: acteur }]);
    const result = await fetchAddresses(mockFetch(zipBuffer));
    expect(result).toHaveLength(0);
  });

  it('handles single address (not array)', async () => {
    const acteur = {
      acteur: {
        uid: { '#text': 'PA100003' },
        adresses: {
          adresse: {
            uid: 'AD010',
            type: '0',
            codePostal: '75001',
            ville: 'Paris',
            numeroRue: '1',
            nomRue: 'Rue Test',
          },
        },
        mandats: {
          mandat: {
            uid: 'PM900003',
            typeOrgane: 'ASSEMBLEE',
            dateDebut: '2024-07-07',
          },
        },
      },
    };
    const zipBuffer = buildZipBuffer([{ uid: 'PA100003', data: acteur }]);
    const result = await fetchAddresses(mockFetch(zipBuffer));
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('assembly_office');
  });

  it('strips trailing commas from street parts', async () => {
    const acteur = makeActeurWithAddresses('PA100004', [
      {
        uid: 'AD020',
        type: '2',
        numeroRue: '10,',
        nomRue: 'Rue de la Paix,',
        complementAdresse: 'Bât A,',
        codePostal: '75002',
        ville: 'Paris',
      },
    ]);
    const zipBuffer = buildZipBuffer([{ uid: 'PA100004', data: acteur }]);
    const result = await fetchAddresses(mockFetch(zipBuffer));
    expect(result[0].street).toBe('10 Rue de la Paix Bât A');
  });

  it('takes only first phone number when multiple are present', async () => {
    const acteur = makeActeurWithAddresses('PA100005', [
      {
        uid: 'AD040',
        type: '2',
        codePostal: '42170',
        ville: 'Saint-Just',
        numeroRue: '3',
        nomRue: 'Avenue Test',
      },
      {
        uid: 'AD041',
        type: '11',
        adresseDeRattachement: 'AD040',
        valElec: '04.77.92.09.15 (Firminy) / 04.77.51.78.74 (Saint-Just)',
      },
    ]);
    const zipBuffer = buildZipBuffer([{ uid: 'PA100005', data: acteur }]);
    const result = await fetchAddresses(mockFetch(zipBuffer));
    expect(result[0].phone).toBe('04.77.92.09.15 (Firminy)');
  });

  it('handles multiple deputies', async () => {
    const a1 = makeActeurWithAddresses('PA100001', [
      { uid: 'AD030', type: '0', codePostal: '75001', ville: 'Paris' },
    ]);
    const a2 = makeActeurWithAddresses('PA100002', [
      { uid: 'AD031', type: '2', codePostal: '13001', ville: 'Marseille' },
    ]);
    const zipBuffer = buildZipBuffer([
      { uid: 'PA100001', data: a1 },
      { uid: 'PA100002', data: a2 },
    ]);
    const result = await fetchAddresses(mockFetch(zipBuffer));
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id_an).sort()).toEqual(['PA100001', 'PA100002']);
  });
});
