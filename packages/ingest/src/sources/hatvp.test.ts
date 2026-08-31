import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import { fetchDeclarations, InterestItemSchema } from './hatvp.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function buildXml(declarations: string[]): string {
  return `<?xml version="1.0" encoding="utf-8"?>\n<declarations>\n${declarations.join('\n')}\n</declarations>`;
}

function deputeDeclaration(
  nom: string,
  prenom: string,
  opts: {
    dateDepot?: string;
    participations?: { nomSociete: string; nombreParts?: string }[];
    fonctions?: { nomSociete: string; activite?: string }[];
    activitesPro?: {
      description: string;
      employeur?: string;
      dateDebut?: string;
      dateFin?: string;
    }[];
    activitesConsultant?: {
      description: string;
      nomEmployeur?: string;
      dateDebut?: string;
      dateFin?: string;
    }[];
    participationsDirigeant?: {
      nomSociete: string;
      activite?: string;
      dateDebut?: string;
      dateFin?: string;
    }[];
    mandatsElectifs?: {
      descriptionMandat: string;
      dateDebut?: string;
      dateFin?: string;
    }[];
  } = {},
): string {
  const {
    dateDepot = '01/06/2023 10:00:00',
    participations = [],
    fonctions = [],
    activitesPro = [],
    activitesConsultant = [],
    participationsDirigeant = [],
    mandatsElectifs = [],
  } = opts;

  const partItems = participations
    .map(
      (p) =>
        `<items><motif><id>CREATION</id></motif><nomSociete>${p.nomSociete}</nomSociete>${p.nombreParts ? `<nombreParts>${p.nombreParts}</nombreParts>` : ''}</items>`,
    )
    .join('');

  const fonctItems = fonctions
    .map(
      (f) =>
        `<items><motif><id>CREATION</id></motif><nomSociete>${f.nomSociete}</nomSociete>${f.activite ? `<activite>${f.activite}</activite>` : ''}</items>`,
    )
    .join('');

  const actProItems = activitesPro
    .map(
      (a) =>
        `<items><motif><id>CREATION</id></motif><description>${a.description}</description>${a.employeur ? `<employeur>${a.employeur}</employeur>` : ''}${a.dateDebut ? `<dateDebut>${a.dateDebut}</dateDebut>` : ''}${a.dateFin ? `<dateFin>${a.dateFin}</dateFin>` : ''}</items>`,
    )
    .join('');

  const actConsultItems = activitesConsultant
    .map(
      (c) =>
        `<items><motif><id>CREATION</id></motif><description>${c.description}</description>${c.nomEmployeur ? `<nomEmployeur>${c.nomEmployeur}</nomEmployeur>` : ''}${c.dateDebut ? `<dateDebut>${c.dateDebut}</dateDebut>` : ''}${c.dateFin ? `<dateFin>${c.dateFin}</dateFin>` : ''}</items>`,
    )
    .join('');

  const partDirItems = participationsDirigeant
    .map(
      (d) =>
        `<items><motif><id>CREATION</id></motif><nomSociete>${d.nomSociete}</nomSociete>${d.activite ? `<activite>${d.activite}</activite>` : ''}${d.dateDebut ? `<dateDebut>${d.dateDebut}</dateDebut>` : ''}${d.dateFin ? `<dateFin>${d.dateFin}</dateFin>` : ''}</items>`,
    )
    .join('');

  const mandatItems = [
    '<items><descriptionMandat>DEPUTE</descriptionMandat></items>',
    ...mandatsElectifs.map(
      (m) =>
        `<items><descriptionMandat>${m.descriptionMandat}</descriptionMandat>${m.dateDebut ? `<dateDebut>${m.dateDebut}</dateDebut>` : ''}${m.dateFin ? `<dateFin>${m.dateFin}</dateFin>` : ''}</items>`,
    ),
  ].join('');

  return `<declaration>
    <dateDepot>${dateDepot}</dateDepot>
    <participationFinanciereDto><items>${partItems}</items><neant>${participations.length === 0}</neant></participationFinanciereDto>
    <fonctionBenevoleDto><items>${fonctItems}</items><neant>${fonctions.length === 0}</neant></fonctionBenevoleDto>
    <activProfCinqDerniereDto><items>${actProItems}</items><neant>${activitesPro.length === 0}</neant></activProfCinqDerniereDto>
    <activConsultantDto><items>${actConsultItems}</items><neant>${activitesConsultant.length === 0}</neant></activConsultantDto>
    <participationDirigeantDto><items>${partDirItems}</items><neant>${participationsDirigeant.length === 0}</neant></participationDirigeantDto>
    <mandatElectifDto><items>${mandatItems}</items></mandatElectifDto>
    <general><declarant><nom>${nom}</nom><prenom>${prenom}</prenom></declarant></general>
  </declaration>`;
}

function nonParlementaireDeclaration(): string {
  return `<declaration>
    <dateDepot>01/01/2023 10:00:00</dateDepot>
    <participationFinanciereDto><items><items><nomSociete>SomeCompany</nomSociete></items></items></participationFinanciereDto>
    <fonctionBenevoleDto><neant>true</neant></fonctionBenevoleDto>
    <mandatElectifDto><items><items><descriptionMandat>MAIRE</descriptionMandat></items></items></mandatElectifDto>
    <general><declarant><nom>MARTIN</nom><prenom>JEAN</prenom></declarant></general>
  </declaration>`;
}

function mockFetch(xml: string, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Internal Server Error',
    body: Readable.toWeb(Readable.from(Buffer.from(xml))),
  }) as unknown as typeof fetch;
}

describe('HATVP client', () => {
  it('parses parliamentary declarations from XML stream', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        participations: [{ nomSociete: 'Acme Corp', nombreParts: '10' }],
        fonctions: [
          {
            nomSociete: 'Association Citoyenne',
            activite: 'Présidente',
          },
        ],
      }),
    ]);

    const declarations = await fetchDeclarations(mockFetch(xml));

    expect(declarations).toHaveLength(1);
    expect(declarations[0].nom).toBe('DUPONT');
    expect(declarations[0].prenom).toBe('Marie');
    expect(declarations[0].interests).toHaveLength(2);
    expect(declarations[0].interests[0]).toMatchObject({
      category: 'financial_participation',
      type: 'company_share',
      entity_name: 'Acme Corp',
      role_description: '10 parts',
      declared_date: '2023-06-01',
    });
    expect(declarations[0].interests[0].full).toBeDefined();
    expect(declarations[0].interests[0].full!.nomSociete).toBe('Acme Corp');
    expect(declarations[0].interests[0].full!.nombreParts).toBe('10');
    expect(declarations[0].interests[1]).toMatchObject({
      category: 'voluntary_activity',
      type: 'nonprofit_role',
      entity_name: 'Association Citoyenne',
      role_description: 'Présidente',
      declared_date: '2023-06-01',
    });
    expect(declarations[0].interests[1].full).toBeDefined();
    expect(declarations[0].interests[1].full!.nomSociete).toBe(
      'Association Citoyenne',
    );
  });

  it('skips non-parliamentary declarations', async () => {
    const xml = buildXml([nonParlementaireDeclaration()]);
    const declarations = await fetchDeclarations(mockFetch(xml));
    expect(declarations).toHaveLength(0);
  });

  it('skips declarations without interests', async () => {
    const xml = buildXml([deputeDeclaration('DUPONT', 'MARIE')]);
    const declarations = await fetchDeclarations(mockFetch(xml));
    expect(declarations).toHaveLength(0);
  });

  it('handles senators (SÉNATEUR)', async () => {
    const xml = buildXml([
      `<declaration>
        <dateDepot>15/03/2024 09:00:00</dateDepot>
        <participationFinanciereDto><items><items><nomSociete>BigCo</nomSociete></items></items></participationFinanciereDto>
        <fonctionBenevoleDto><neant>true</neant></fonctionBenevoleDto>
        <mandatElectifDto><items><items><descriptionMandat>SÉNATEUR</descriptionMandat></items></items></mandatElectifDto>
        <general><declarant><nom>MARTIN</nom><prenom>PIERRE</prenom></declarant></general>
      </declaration>`,
    ]);

    const declarations = await fetchDeclarations(mockFetch(xml));
    expect(declarations).toHaveLength(1);
    expect(declarations[0].nom).toBe('MARTIN');
  });

  it('handles senators (SÉNATRICE)', async () => {
    const xml = buildXml([
      `<declaration>
        <dateDepot>15/03/2024 09:00:00</dateDepot>
        <participationFinanciereDto><items><items><nomSociete>SomeCo</nomSociete></items></items></participationFinanciereDto>
        <fonctionBenevoleDto><neant>true</neant></fonctionBenevoleDto>
        <mandatElectifDto><items><items><descriptionMandat>SÉNATRICE</descriptionMandat></items></items></mandatElectifDto>
        <general><declarant><nom>DUVAL</nom><prenom>CLAIRE</prenom></declarant></general>
      </declaration>`,
    ]);

    const declarations = await fetchDeclarations(mockFetch(xml));
    expect(declarations).toHaveLength(1);
    expect(declarations[0].nom).toBe('DUVAL');
    expect(declarations[0].prenom).toBe('Claire');
  });

  it('throws on HTTP error', async () => {
    const fakeFetch = mockFetch('', 500);
    await expect(fetchDeclarations(fakeFetch)).rejects.toThrow(
      'HATVP API error: 500',
    );
  });

  it('validates InterestItemSchema', () => {
    expect(
      InterestItemSchema.safeParse({
        category: 'financial_participation',
        type: 'company_share',
        entity_name: 'Acme Corp',
        declared_date: '2023-01-01',
      }).success,
    ).toBe(true);
  });

  it('parses professional activities', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        activitesPro: [
          {
            description: 'Avocat',
            employeur: 'Cabinet Dupont',
            dateDebut: '01/2018',
            dateFin: '06/2022',
          },
        ],
      }),
    ]);

    const declarations = await fetchDeclarations(mockFetch(xml));

    expect(declarations).toHaveLength(1);
    expect(declarations[0].interests).toHaveLength(1);
    expect(declarations[0].interests[0]).toMatchObject({
      category: 'professional_activity',
      type: 'professional_activity',
      entity_name: 'Cabinet Dupont',
      role_description: 'Avocat',
      declared_date: '2023-06-01',
      start_date: '2018-01-01',
      end_date: '2022-06-01',
    });
  });

  it('uses description as entity_name when no employeur', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        activitesPro: [
          {
            description: 'Professeur des écoles',
            dateDebut: '09/2015',
          },
        ],
      }),
    ]);

    const declarations = await fetchDeclarations(mockFetch(xml));

    expect(declarations[0].interests[0]).toMatchObject({
      category: 'professional_activity',
      entity_name: 'Professeur des écoles',
      role_description: undefined,
    });
    expect(declarations[0].interests[0].end_date).toBeUndefined();
  });

  it('parses consulting activities', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        activitesConsultant: [
          {
            description: 'consultant réseaux sociaux',
            nomEmployeur: 'autoentreprise',
            dateDebut: '09/2017',
            dateFin: '12/2017',
          },
        ],
      }),
    ]);

    const declarations = await fetchDeclarations(mockFetch(xml));

    expect(declarations).toHaveLength(1);
    expect(declarations[0].interests).toHaveLength(1);
    expect(declarations[0].interests[0]).toMatchObject({
      category: 'consulting_activity',
      type: 'consulting_activity',
      entity_name: 'autoentreprise',
      role_description: 'consultant réseaux sociaux',
      declared_date: '2023-06-01',
      start_date: '2017-09-01',
      end_date: '2017-12-01',
    });
  });

  it('uses description as entity_name when no nomEmployeur for consulting', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        activitesConsultant: [
          {
            description: 'Conseil en stratégie',
            dateDebut: '01/2020',
          },
        ],
      }),
    ]);

    const declarations = await fetchDeclarations(mockFetch(xml));

    expect(declarations[0].interests[0]).toMatchObject({
      category: 'consulting_activity',
      entity_name: 'Conseil en stratégie',
      role_description: undefined,
    });
    expect(declarations[0].interests[0].end_date).toBeUndefined();
  });

  it('parses governing body memberships', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        participationsDirigeant: [
          {
            nomSociete: 'SDIS 01',
            activite: 'Président',
            dateDebut: '04/2015',
            dateFin: '07/2017',
          },
        ],
      }),
    ]);

    const declarations = await fetchDeclarations(mockFetch(xml));

    expect(declarations).toHaveLength(1);
    expect(declarations[0].interests).toHaveLength(1);
    expect(declarations[0].interests[0]).toMatchObject({
      category: 'governing_body_membership',
      type: 'governing_body_membership',
      entity_name: 'SDIS 01',
      role_description: 'Président',
      declared_date: '2023-06-01',
      start_date: '2015-04-01',
      end_date: '2017-07-01',
    });
  });

  it('parses governing body without activite', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        participationsDirigeant: [
          {
            nomSociete: 'Association XYZ',
            dateDebut: '01/2020',
          },
        ],
      }),
    ]);

    const declarations = await fetchDeclarations(mockFetch(xml));

    expect(declarations[0].interests[0]).toMatchObject({
      category: 'governing_body_membership',
      entity_name: 'Association XYZ',
      role_description: undefined,
    });
    expect(declarations[0].interests[0].end_date).toBeUndefined();
  });

  it('parses non-parliamentary elected functions', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        mandatsElectifs: [
          {
            descriptionMandat: 'PRESIDENT DU DEPARTEMENT 01',
            dateDebut: '04/2015',
            dateFin: '07/2017',
          },
        ],
      }),
    ]);

    const declarations = await fetchDeclarations(mockFetch(xml));

    expect(declarations).toHaveLength(1);
    expect(declarations[0].interests).toHaveLength(1);
    expect(declarations[0].interests[0]).toMatchObject({
      category: 'elected_function',
      type: 'elected_function',
      entity_name: 'PRESIDENT DU DEPARTEMENT 01',
      declared_date: '2023-06-01',
      start_date: '2015-04-01',
      end_date: '2017-07-01',
    });
  });

  it('excludes parliamentary mandats from elected functions', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        participations: [{ nomSociete: 'Acme' }],
        mandatsElectifs: [
          { descriptionMandat: 'Conseiller municipal de Lyon' },
        ],
      }),
    ]);

    const declarations = await fetchDeclarations(mockFetch(xml));

    expect(declarations).toHaveLength(1);
    const categories = declarations[0].interests.map((i) => i.category);
    expect(categories).toContain('elected_function');
    expect(categories).toContain('financial_participation');
    const elected = declarations[0].interests.find(
      (i) => i.category === 'elected_function',
    );
    expect(elected!.entity_name).toBe('Conseiller municipal de Lyon');
  });

  it('parses declarant comment from participation', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        participations: [{ nomSociete: 'Acme Corp', nombreParts: '10' }],
      }),
    ]);
    const xmlWithComment = xml.replace(
      '<nombreParts>10</nombreParts>',
      '<nombreParts>10</nombreParts><commentaire>Héritage familial</commentaire>',
    );
    const declarations = await fetchDeclarations(mockFetch(xmlWithComment));
    expect(declarations[0].interests[0].declarant_comment).toBe(
      'Héritage familial',
    );
  });

  it('parses ownership detail with percentage', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        participations: [{ nomSociete: 'Acme Corp' }],
      }),
    ]);
    const xmlWithPct = xml.replace(
      '</nomSociete>',
      '</nomSociete><pourcentageCapital>25</pourcentageCapital>',
    );
    const declarations = await fetchDeclarations(mockFetch(xmlWithPct));
    expect(declarations[0].interests[0].ownership_detail).toBe(
      '25% du capital',
    );
  });

  it('parses amount fields from professional activity', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        activitesPro: [
          {
            description: 'Avocat',
            employeur: 'Cabinet X',
            dateDebut: '01/2020',
          },
        ],
      }),
    ]);
    const xmlWithAmount = xml.replace(
      '</employeur>',
      '</employeur><remuneration>50000</remuneration><anneeRemuneration>2022</anneeRemuneration><netBrut>net</netBrut>',
    );
    const declarations = await fetchDeclarations(mockFetch(xmlWithAmount));
    const item = declarations[0].interests[0];
    expect(item.annual_amount).toBe('50000');
    expect(item.amount_year).toBe(2022);
    expect(item.amount_is_net).toBe(true);
  });

  it('handles brut amount indicator', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        activitesConsultant: [
          {
            description: 'Conseil',
            nomEmployeur: 'Corp',
            dateDebut: '01/2020',
          },
        ],
      }),
    ]);
    const xmlWithBrut = xml.replace(
      '</nomEmployeur>',
      '</nomEmployeur><remuneration>30000</remuneration><netBrut>brut</netBrut>',
    );
    const declarations = await fetchDeclarations(mockFetch(xmlWithBrut));
    const item = declarations[0].interests[0];
    expect(item.annual_amount).toBe('30000');
    expect(item.amount_is_net).toBe(false);
  });

  it('omits new fields when absent in XML', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        participations: [{ nomSociete: 'Acme Corp' }],
      }),
    ]);
    const declarations = await fetchDeclarations(mockFetch(xml));
    const item = declarations[0].interests[0];
    expect(item.declarant_comment).toBeUndefined();
    expect(item.ownership_detail).toBeUndefined();
    expect(item.annual_amount).toBeUndefined();
    expect(item.amount_year).toBeUndefined();
    expect(item.amount_is_net).toBeUndefined();
  });

  it('parses initial declaration type', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        participations: [{ nomSociete: 'Acme' }],
      }),
    ]);
    const xmlWithType = xml.replace(
      '<dateDepot>',
      '<typeDeclaration>DIA</typeDeclaration><dateDepot>',
    );
    const declarations = await fetchDeclarations(mockFetch(xmlWithType));
    expect(declarations[0].declaration_type).toBe('initial');
  });

  it('parses modification declaration type', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        participations: [{ nomSociete: 'Acme' }],
      }),
    ]);
    const xmlWithType = xml.replace(
      '<dateDepot>',
      '<typeDeclaration>DMIA</typeDeclaration><dateDepot>',
    );
    const declarations = await fetchDeclarations(mockFetch(xmlWithType));
    expect(declarations[0].declaration_type).toBe('modification');
  });

  it('detects multiple declarations for same official', async () => {
    const xml = buildXml([
      deputeDeclaration('DUPONT', 'MARIE', {
        dateDepot: '01/06/2022 10:00:00',
        participations: [{ nomSociete: 'Corp A' }],
      }),
      deputeDeclaration('DUPONT', 'MARIE', {
        dateDepot: '15/01/2024 10:00:00',
        participations: [{ nomSociete: 'Corp B' }],
      }),
    ]);
    const declarations = await fetchDeclarations(mockFetch(xml));
    const dupont = declarations.filter((d) => d.nom === 'DUPONT');
    expect(dupont.length).toBe(2);
    expect(dupont[0].date_depot).not.toBe(dupont[1].date_depot);
  });

  it('rejects invalid category', () => {
    expect(
      InterestItemSchema.safeParse({
        category: 'invalid',
        type: 'company_share',
        entity_name: 'X',
        declared_date: '2023-01-01',
      }).success,
    ).toBe(false);
  });
});
