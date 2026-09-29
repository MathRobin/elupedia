import { describe, it, expect, vi } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { parseDepartementResultPage } =
  await import('./senat-resultats-2026.js');

function elusList(entries: { name: string; nuance: string }[]): string {
  return `<div class="senators-list">
    <h2 class="senators-title bold">Sénateurs élus</h2>
    <ul class="row gapy-4">
      ${entries
        .map(
          (e) => `<li class="col-md-6"><div class="senator-item">
        <div class="senator-infos">
          <p class="senator-name"><span class="label">${e.name}</span></p>
          <span class="senator-group">${e.nuance}</span>
        </div>
      </div></li>`,
        )
        .join('\n')}
    </ul>
  </div>`;
}

function header(sieges: number, electeurs: string): string {
  return `<span class="district-name mb-1">Gironde</span>
  <div class="district-header">
    <ul>
      <li class="district-number"><div><span class="district-count">${sieges}</span> sièges pourvus</div></li>
      <li class="district-number"><div><span class="district-count">${electeurs}</span> électeurs sénatoriaux</div></li>
    </ul>
  </div>`;
}

describe('parseDepartementResultPage — scrutin proportionnel', () => {
  const html = `<html><body>
    ${header(2, '3 743')}
    ${elusList([
      { name: 'Nathalie DELATTRE', nuance: "Liste d'union au centre" },
      { name: 'Edwige DIAZ', nuance: 'Rassemblement National' },
    ])}
    <table class="table table-bordered district-listing">
      <tbody>
        <tr class="elected">
          <td class="candidates-party">Rassemblement National</td>
          <td class="candidates-names">
            <div class="candidates-names-inner">
              <button class="candidates-list-toggle"><span class="label">AU SERVICE DE LA GIRONDE</span></button>
              <span class="vote-pin elected">Élu(s)</span>
            </div>
            <ol class="candidates-list">
              <li class="elected">Edwige DIAZ</li>
              <li class="">Jimmy BOURLIEUX</li>
            </ol>
          </td>
          <td class="text-center middle"><div class="candidates-vote"><span>709</span><span>/</span><span>19 %</span></div></td>
          <td class="text-center middle">1</td>
        </tr>
        <tr class="elected">
          <td class="candidates-party">Liste d'union au centre</td>
          <td class="candidates-names">
            <div class="candidates-names-inner">
              <button class="candidates-list-toggle"><span class="label">RESOLUMENT GIRONDINS</span></button>
              <span class="vote-pin elected">Élu(s)</span>
            </div>
            <ol class="candidates-list">
              <li class="elected">Nathalie DELATTRE (sortant)</li>
              <li class="">Jacques BREILLAT</li>
            </ol>
          </td>
          <td class="text-center middle"><div class="candidates-vote"><span>1254</span><span>/</span><span>34 %</span></div></td>
          <td class="text-center middle">1</td>
        </tr>
      </tbody>
    </table>
  </body></html>`;

  it('extracts the elected senators list', () => {
    const result = parseDepartementResultPage(html, '33');
    expect(result?.elus).toEqual([
      {
        nom: 'DELATTRE',
        prenom: 'Nathalie',
        nuance: "Liste d'union au centre",
      },
      { nom: 'DIAZ', prenom: 'Edwige', nuance: 'Rassemblement National' },
    ]);
  });

  it('detects the proportionnel scrutin type from the table class', () => {
    const result = parseDepartementResultPage(html, '33');
    expect(result?.scrutinType).toBe('proportionnel');
  });

  it('attributes the list vote count and elected flag per candidate', () => {
    const result = parseDepartementResultPage(html, '33');
    expect(result?.rounds).toHaveLength(1);
    const candidates = result!.rounds[0].candidates;
    expect(candidates).toHaveLength(4);

    const diaz = candidates.find((c) => c.nom === 'DIAZ');
    expect(diaz).toMatchObject({
      prenom: 'Edwige',
      liste: 'AU SERVICE DE LA GIRONDE',
      voix: 709,
      ratioExprimes: 19,
      elected: true,
    });

    const bourlieux = candidates.find((c) => c.nom === 'BOURLIEUX');
    expect(bourlieux).toMatchObject({ voix: 709, elected: false });

    // Le suffixe "(sortant)" est retiré du nom mais ne doit pas empêcher le
    // rattachement des voix/élu de la liste.
    const delattre = candidates.find((c) => c.nom === 'DELATTRE');
    expect(delattre).toMatchObject({ elected: true, voix: 1254 });
  });

  it('reads sieges and electeurs from the district header', () => {
    const result = parseDepartementResultPage(html, '33');
    expect(result?.siegesAPourvoir).toBe(2);
    expect(result?.electeursSenatoriaux).toBe(3743);
  });
});

describe('parseDepartementResultPage — scrutin majoritaire, un seul tour', () => {
  const html = `<html><body>
    ${header(2, '761')}
    ${elusList([
      { name: 'Pascal COSTE', nuance: 'Les Républicains' },
      { name: 'Julien BOUNIE', nuance: 'Les Républicains' },
    ])}
    <table class="table table-bordered district-simple">
      <tbody>
        <tr class="">
          <td class="candidates-party">Rassemblement National</td>
          <td><div class="candidates-names-inner">Valéry ELOPHE</div></td>
          <td class="text-center middle"><div class="candidates-vote"><span>46</span><span>/</span><span>6 %</span></div></td>
        </tr>
        <tr class="elected">
          <td class="candidates-party">Les Républicains</td>
          <td><div class="candidates-names-inner">Pascal COSTE<span class="vote-pin elected">Élu</span></div></td>
          <td class="text-center middle"><div class="candidates-vote"><span>551</span><span>/</span><span>74 %</span></div></td>
        </tr>
      </tbody>
    </table>
  </body></html>`;

  it('has a single round with per-candidate votes', () => {
    const result = parseDepartementResultPage(html, '19');
    expect(result?.scrutinType).toBe('majoritaire');
    expect(result?.rounds).toEqual([
      {
        round: 1,
        candidates: [
          {
            nom: 'ELOPHE',
            prenom: 'Valéry',
            nuance: 'Rassemblement National',
            liste: null,
            voix: 46,
            ratioExprimes: 6,
            elected: false,
          },
          {
            nom: 'COSTE',
            prenom: 'Pascal',
            nuance: 'Les Républicains',
            liste: null,
            voix: 551,
            ratioExprimes: 74,
            elected: true,
          },
        ],
      },
    ]);
  });
});

describe('parseDepartementResultPage — scrutin majoritaire, second tour', () => {
  const html = `<html><body>
    ${header(2, '577')}
    ${elusList([
      { name: 'Rodolphe ALEXANDRE', nuance: 'Divers gauche' },
      { name: 'Ryan PERSAUD', nuance: 'Divers' },
    ])}
    <table class="table table-bordered district-simple">
      <tbody>
        <tr class="elected">
          <td class="candidates-party">Divers gauche</td>
          <td><div class="candidates-names-inner">Rodolphe ALEXANDRE<span class="vote-pin elected">Élu</span></div></td>
          <td class="text-center middle"><div class="candidates-vote"><span>351</span><span>/</span><span>63 %</span></div></td>
          <td class="text-center middle"><div class="candidates-vote"></div></td>
        </tr>
        <tr class="elected">
          <td class="candidates-party">Divers</td>
          <td><div class="candidates-names-inner">Ryan PERSAUD<span class="vote-pin elected">Élu</span></div></td>
          <td class="text-center middle"><div class="candidates-vote"><span>198</span><span>/</span><span>35 %</span></div></td>
          <td class="text-center middle"><div class="candidates-vote"><span>240</span><span>/</span><span>44 %</span></div></td>
        </tr>
        <tr class="">
          <td class="candidates-party">Divers gauche</td>
          <td><div class="candidates-names-inner">Patrick LECANTE</div></td>
          <td class="text-center middle"><div class="candidates-vote"><span>101</span><span>/</span><span>18 %</span></div></td>
          <td class="text-center middle"><div class="candidates-vote"><span>98</span><span>/</span><span>18 %</span></div></td>
        </tr>
      </tbody>
    </table>
  </body></html>`;

  it('splits candidates into two rounds and attributes election to the last round they contested', () => {
    const result = parseDepartementResultPage(html, '973');
    expect(result?.rounds).toHaveLength(2);

    const round1 = result!.rounds.find((r) => r.round === 1)!;
    const alexandreR1 = round1.candidates.find((c) => c.nom === 'ALEXANDRE');
    expect(alexandreR1).toMatchObject({ voix: 351, elected: true });
    const persaudR1 = round1.candidates.find((c) => c.nom === 'PERSAUD');
    expect(persaudR1).toMatchObject({ voix: 198, elected: false });

    const round2 = result!.rounds.find((r) => r.round === 2)!;
    expect(
      round2.candidates.find((c) => c.nom === 'ALEXANDRE'),
    ).toBeUndefined();
    const persaudR2 = round2.candidates.find((c) => c.nom === 'PERSAUD');
    expect(persaudR2).toMatchObject({ voix: 240, elected: true });
    const lecanteR2 = round2.candidates.find((c) => c.nom === 'LECANTE');
    expect(lecanteR2).toMatchObject({ voix: 98, elected: false });
  });
});

describe('parseDepartementResultPage — petite circonscription (Corse, COM)', () => {
  // Régression : la Corse, les COM (Saint-Barthélemy, Saint-Martin,
  // Wallis-et-Futuna), la Polynésie française et les Français établis
  // hors de France rendent ".candidates-vote" en texte brut ("293 / 64%",
  // sans <span> ni espace avant le %) et affichent "1 siège pourvu" au
  // singulier — deux variantes qui faisaient disparaître silencieusement
  // tous les résultats de ces circonscriptions.
  const html = `<html><body>
    <span class="district-name mb-1">Corse-du-Sud</span>
    <div class="district-header">
      <ul>
        <li class="district-number"><div><span class="district-count">1</span> siège pourvu</div></li>
        <li class="district-number"><div><span class="district-count">465</span> électeurs sénatoriaux</div></li>
      </ul>
    </div>
    ${elusList([{ name: 'Jean-Jacques PANUNZI', nuance: 'Les Républicains' }])}
    <table class="table table-bordered district-simple">
      <tbody>
        <tr class="elected">
          <td class="candidates-party">Les Républicains</td>
          <td><div class="candidates-names-inner">Jean-Jacques PANUNZI (sortant)<span class="vote-pin elected">Élu</span></div></td>
          <td class="text-center middle"><div class="candidates-vote">293 / 64%</div></td>
        </tr>
        <tr class="">
          <td class="candidates-party">Divers</td>
          <td><div class="candidates-names-inner">René PERES</div></td>
          <td class="text-center middle"><div class="candidates-vote">4 / 0%</div></td>
        </tr>
      </tbody>
    </table>
  </body></html>`;

  it('reads the singular "siège pourvu" header', () => {
    const result = parseDepartementResultPage(html, '2A');
    expect(result?.siegesAPourvoir).toBe(1);
    expect(result?.electeursSenatoriaux).toBe(465);
  });

  it('parses votes and percentages from the plain-text vote cell', () => {
    const result = parseDepartementResultPage(html, '2A');
    expect(result?.rounds).toEqual([
      {
        round: 1,
        candidates: [
          {
            nom: 'PANUNZI',
            prenom: 'Jean-Jacques',
            nuance: 'Les Républicains',
            liste: null,
            voix: 293,
            ratioExprimes: 64,
            elected: true,
          },
          {
            nom: 'PERES',
            prenom: 'René',
            nuance: 'Divers',
            liste: null,
            voix: 4,
            ratioExprimes: 0,
            elected: false,
          },
        ],
      },
    ]);
  });
});

describe('parseDepartementResultPage — pas encore dépouillé', () => {
  it('returns null when there is no "Sénateurs élus" list', () => {
    const html = `<html><body>${header(2, '100')}</body></html>`;
    expect(parseDepartementResultPage(html, '33')).toBeNull();
  });
});
