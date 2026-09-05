import { describe, it, expect, vi } from 'vitest';
import { fetchDeputes, DATASET_URL } from './assemblee-nationale.js';
import AdmZip from 'adm-zip';

function makeActeurJson(
  uid: string,
  prenom: string,
  nom: string,
  opts: {
    dateNais?: string;
    departement?: string;
    numDepartement?: string;
    numCirco?: string;
    legislature?: string;
    dateDebut?: string;
    dateFin?: string | null;
    gpOrganeRef?: string;
    civ?: string;
  } = {},
) {
  const {
    dateNais = '1975-03-14',
    departement = 'Gironde',
    numDepartement = '33',
    numCirco = '3',
    legislature = '17',
    dateDebut = '2024-07-07',
    dateFin = null,
    gpOrganeRef = 'PO800001',
    civ = 'Mme',
  } = opts;

  return {
    acteur: {
      '@xmlns': 'http://schemas.assemblee-nationale.fr/referentiel',
      uid: {
        '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        '@xsi:type': 'IdActeur_type',
        '#text': uid,
      },
      etatCivil: {
        ident: { civ, prenom, nom, alpha: nom, trigramme: 'XXX' },
        infoNaissance: {
          dateNais,
          villeNais: 'Bordeaux',
          depNais: departement,
          paysNais: 'France',
        },
        dateDeces: {
          '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
          '@xsi:nil': 'true',
        },
      },
      mandats: {
        mandat: [
          {
            uid: 'PM900001',
            acteurRef: uid,
            legislature,
            typeOrgane: 'ASSEMBLEE',
            dateDebut,
            datePublication: null,
            dateFin,
            preseance: '50',
            nominPrincipale: '1',
            infosQualite: {
              codeQualite: 'membre',
              libQualite: 'membre',
              libQualiteSex: 'membre',
            },
            organes: { organeRef: 'PO838901' },
            election: {
              lieu: {
                region: 'Nouvelle-Aquitaine',
                regionType: 'Métropolitain',
                departement,
                numDepartement,
                numCirco,
              },
              causeMandat: 'élections générales',
              refCirconscription: 'PO839001',
            },
          },
          {
            uid: 'PM900002',
            acteurRef: uid,
            legislature,
            typeOrgane: 'GP',
            dateDebut,
            datePublication: dateDebut,
            dateFin: null,
            preseance: '20',
            nominPrincipale: '1',
            infosQualite: {
              codeQualite: 'Membre',
              libQualite: 'Membre',
              libQualiteSex: 'Membre',
            },
            organes: { organeRef: gpOrganeRef },
          },
        ],
      },
    },
  };
}

function makeOrganeJson(uid: string, libelleAbrege: string, libelle?: string) {
  return {
    organe: {
      '@xmlns': 'http://schemas.assemblee-nationale.fr/referentiel',
      uid,
      codeType: 'GP',
      libelle: libelle ?? libelleAbrege,
      libelleEdition: libelleAbrege,
      libelleAbrege,
      libelleAbrev: libelleAbrege,
      viMoDe: { dateDebut: '2024-07-01', dateAgrement: null, dateFin: null },
      organeParent: null,
      regime: '5ème République',
      legislature: '17',
    },
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

describe('Assemblée nationale client', () => {
  it('fetches and parses deputies from ZIP archive', async () => {
    const acteur = makeActeurJson('PA100001', 'Marie', 'Dupont');
    const organe = makeOrganeJson('PO800001', 'RE', 'Renaissance');
    const zipBuffer = buildZipBuffer(
      [{ uid: 'PA100001', data: acteur }],
      [{ uid: 'PO800001', data: organe }],
    );

    const fakeFetch = mockFetch(zipBuffer);
    const deputes = await fetchDeputes(fakeFetch);

    expect(deputes).toHaveLength(1);
    expect(deputes[0].id_an).toBe('PA100001');
    expect(deputes[0].nom).toBe('Dupont');
    expect(deputes[0].prenom).toBe('Marie');
    expect(deputes[0].sexe).toBe('F');
    expect(deputes[0].date_naissance).toBe('1975-03-14');
    expect(deputes[0].nom_circo).toBe('Gironde');
    expect(deputes[0].num_deptmt).toBe('33');
    expect(deputes[0].num_circo).toBe(3);
    expect(deputes[0].groupe_sigle).toBe('Renaissance (RE)');
    expect(deputes[0].slug).toBe('marie-dupont');
    expect(deputes[0].photo_url).toContain('100001.jpg');
  });

  it('handles male deputy (M. → H)', async () => {
    const acteur = makeActeurJson('PA100002', 'Jean', 'Martin', { civ: 'M.' });
    const organe = makeOrganeJson('PO800001', 'LFI-NFP');
    const zipBuffer = buildZipBuffer(
      [{ uid: 'PA100002', data: acteur }],
      [{ uid: 'PO800001', data: organe }],
    );

    const deputes = await fetchDeputes(mockFetch(zipBuffer));

    expect(deputes[0].sexe).toBe('H');
  });

  it('handles deputy with ended mandate', async () => {
    const acteur = makeActeurJson('PA100003', 'Anne', 'Duval', {
      dateFin: '2024-12-01',
    });
    const organe = makeOrganeJson('PO800001', 'RE');
    const zipBuffer = buildZipBuffer(
      [{ uid: 'PA100003', data: acteur }],
      [{ uid: 'PO800001', data: organe }],
    );

    const deputes = await fetchDeputes(mockFetch(zipBuffer));

    expect(deputes).toHaveLength(1);
    expect(deputes[0].mandat_fin).toBe('2024-12-01');
  });

  it('includes senators', async () => {
    const acteur = {
      acteur: {
        '@xmlns': 'http://schemas.assemblee-nationale.fr/referentiel',
        uid: { '#text': 'PA999999' },
        etatCivil: {
          ident: { civ: 'M.', prenom: 'Fake', nom: 'Senator' },
          infoNaissance: { dateNais: '1960-01-01' },
        },
        mandats: {
          mandat: {
            uid: 'PM999999',
            legislature: '17',
            typeOrgane: 'SENAT',
            dateDebut: '2024-01-01',
            dateFin: null,
          },
        },
      },
    };
    const zipBuffer = buildZipBuffer([{ uid: 'PA999999', data: acteur }], []);

    const deputes = await fetchDeputes(mockFetch(zipBuffer));
    expect(deputes).toHaveLength(1);
    expect(deputes[0].mandat_type).toBe('senateur');
    expect(deputes[0].photo_url).toBeUndefined();
  });

  it('skips actors without parliamentary mandate', async () => {
    const acteur = {
      acteur: {
        '@xmlns': 'http://schemas.assemblee-nationale.fr/referentiel',
        uid: { '#text': 'PA999999' },
        etatCivil: {
          ident: { civ: 'M.', prenom: 'Fake', nom: 'Ministre' },
          infoNaissance: { dateNais: '1960-01-01' },
        },
        mandats: {
          mandat: {
            uid: 'PM999999',
            legislature: '17',
            typeOrgane: 'GOUVERNEMENT',
            dateDebut: '2024-01-01',
            dateFin: null,
          },
        },
      },
    };
    const zipBuffer = buildZipBuffer([{ uid: 'PA999999', data: acteur }], []);

    const deputes = await fetchDeputes(mockFetch(zipBuffer));
    expect(deputes).toHaveLength(0);
  });

  it('handles multiple deputies', async () => {
    const a1 = makeActeurJson('PA100001', 'Marie', 'Dupont');
    const a2 = makeActeurJson('PA100002', 'Jean', 'Martin', {
      civ: 'M.',
      departement: 'Paris',
      numDepartement: '75',
      numCirco: '1',
    });
    const organe = makeOrganeJson('PO800001', 'RE');
    const zipBuffer = buildZipBuffer(
      [
        { uid: 'PA100001', data: a1 },
        { uid: 'PA100002', data: a2 },
      ],
      [{ uid: 'PO800001', data: organe }],
    );

    const deputes = await fetchDeputes(mockFetch(zipBuffer));
    expect(deputes).toHaveLength(2);
  });

  it('throws on HTTP error', async () => {
    const fakeFetch = mockFetch(Buffer.alloc(0), 500);
    await expect(fetchDeputes(fakeFetch)).rejects.toThrow(
      'Assemblée nationale API error: 500',
    );
  });

  it('calls the correct URL', async () => {
    const zipBuffer = buildZipBuffer([], []);
    const fakeFetch = mockFetch(zipBuffer);
    await fetchDeputes(fakeFetch);
    expect(fakeFetch).toHaveBeenCalledWith(DATASET_URL);
  });

  it('generates correct photo URL from AN id', async () => {
    const acteur = makeActeurJson('PA607193', 'Sophie', 'Errante');
    const organe = makeOrganeJson('PO800001', 'NI');
    const zipBuffer = buildZipBuffer(
      [{ uid: 'PA607193', data: acteur }],
      [{ uid: 'PO800001', data: organe }],
    );

    const deputes = await fetchDeputes(mockFetch(zipBuffer));
    expect(deputes[0].photo_url).toBe(
      'https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/607193.jpg',
    );
  });

  it('generates correct slug with accented characters', async () => {
    const acteur = makeActeurJson('PA100010', 'Hélène', 'Lévy-Müller');
    const organe = makeOrganeJson('PO800001', 'RE');
    const zipBuffer = buildZipBuffer(
      [{ uid: 'PA100010', data: acteur }],
      [{ uid: 'PO800001', data: organe }],
    );

    const deputes = await fetchDeputes(mockFetch(zipBuffer));
    expect(deputes[0].slug).toBe('helene-levy-muller');
  });
});
