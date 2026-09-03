import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('Fiche élu (#53)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('[slug].astro exists', () => {
    expect(existsSync(pagePath)).toBe(true);
  });

  it('exports getStaticPaths', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('export async function getStaticPaths');
  });

  it('queries officials with active mandates', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('officials');
    expect(content).toContain('mandates');
    expect(content).toContain('isNull(mandates.endDate)');
  });

  it('displays identity (name, photo, birth date)', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('deputy.firstName');
    expect(content).toContain('deputy.lastName');
    expect(content).toContain('deputy.photoUrl');
    expect(content).toContain('deputy.birthDate');
  });

  it('displays current mandate details', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('deputy.mandateType');
    expect(content).toContain('deputy.district');
    expect(content).toContain('deputy.politicalGroup');
    expect(content).toContain('deputy.startDate');
  });

  it('has a back link to the homepage', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('href="/elus"');
    expect(content).toContain('Retour');
  });

  it('uses BaseLayout with dynamic title', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('<BaseLayout');
    expect(content).toContain('title={fullName}');
  });

  it('homepage links to /elus/ path', () => {
    const listPath = resolve(
      root,
      'packages/site/src/components/OfficialsList.tsx',
    );
    const content = readFileSync(listPath, 'utf-8');
    expect(content).toContain('/elus/');
  });
});

describe('Fiche élu — section votes (#54)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('queries votes and ballots', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('votes');
    expect(content).toContain('ballots');
  });

  it('sorts votes by date descending', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('ballotDate.localeCompare');
  });

  it('displays vote history table', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('<table');
    expect(content).toContain('v.ballotTitle');
    expect(content).toContain('v.ballotDate');
    expect(content).toContain('v.position');
  });

  it('translates vote positions to French', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain("for: 'Pour'");
    expect(content).toContain("against: 'Contre'");
    expect(content).toContain("abstain: 'Abstention'");
    expect(content).toContain("absent: 'Absent'");
  });

  it('handles empty votes list', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Aucun vote enregistré');
  });

  it('has color-coded position badges', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('positionColors');
    expect(content).toContain('text-green-700');
    expect(content).toContain('text-red-700');
  });

  it('links ballot title to scrutin detail page', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('/scrutins/${v.ballotId}');
    expect(content).toContain('v.ballotId');
  });
});

describe('Fiche élu — section affiliations (#55)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('queries affiliations table', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('affiliations');
    expect(content).toContain('affiliationsByOfficial');
  });

  it('sorts affiliations by date descending', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('desc(affiliations.startDate)');
  });

  it('displays party/group name and date range', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('a.partyOrGroup');
    expect(content).toContain('a.startDate');
    expect(content).toContain('a.endDate');
  });

  it('shows "en cours" for active affiliations', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('en cours');
  });

  it('handles empty affiliations list', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Aucune affiliation enregistrée');
  });
});

describe('Fiche élu — section collaborateurs (#56)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('queries staffers table', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('staffers');
    expect(content).toContain('staffersByOfficial');
  });

  it('displays staffer name and dates', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('s.firstName');
    expect(content).toContain('s.lastName');
    expect(content).toContain('s.startDate');
  });

  it('shows active/inactive badges', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('actif');
    expect(content).toContain('inactif');
  });

  it('handles empty staffers list', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Aucun collaborateur enregistré');
  });
});

describe('Fiche élu — section participations (#57)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('queries interests table', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('interests');
    expect(content).toContain('interestsByOfficial');
  });

  it('displays entity name and declared date', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('i.entityName');
    expect(content).toContain('i.declaredDate');
  });

  it('translates interest categories to French', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Participations financières');
    expect(content).toContain('Activités bénévoles');
  });

  it('shows role description when available', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('i.roleDescription');
  });

  it('handles empty interests list', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Aucun intérêt déclaré');
  });
});

describe('Fiche élu — section presse (#58)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('queries press_mentions table', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('pressMentions');
    expect(content).toContain('pressByOfficial');
  });

  it('displays article title as link to source', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('p.sourceUrl');
    expect(content).toContain('p.title');
    expect(content).toContain('target="_blank"');
    expect(content).toContain('rel="noopener noreferrer"');
  });

  it('shows source name and published date', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('p.sourceName');
    expect(content).toContain('p.publishedDate');
  });

  it('handles empty press list', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Aucune mention presse enregistrée');
  });
});

describe('Fiche élu — section adresses (#59)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('queries addresses table', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('addresses');
    expect(content).toContain('addressesByOfficial');
  });

  it('translates address types to French', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Permanence');
    expect(content).toContain('Bureau AN');
  });

  it('displays address details', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('addr.street');
    expect(content).toContain('addr.postalCode');
    expect(content).toContain('addr.city');
  });

  it('shows phone and email as clickable links', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('tel:');
    expect(content).toContain('mailto:');
    expect(content).toContain('addr.phone');
    expect(content).toContain('addr.email');
  });

  it('handles empty addresses list', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Aucune adresse enregistrée');
  });
});

describe('Fiche élu — section liens extérieurs (#60)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('queries external_links table filtered by published status', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('externalLinks');
    expect(content).toContain('linksByOfficial');
    expect(content).toContain("eq(externalLinks.status, 'published')");
  });

  it('has platform labels for all supported platforms', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('X (Twitter)');
    expect(content).toContain('Facebook');
    expect(content).toContain('Instagram');
    expect(content).toContain('YouTube');
    expect(content).toContain('TikTok');
    expect(content).toContain('MaDada.fr');
    expect(content).toContain('Wikipédia');
  });

  it('renders links as external with noopener', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('l.url');
    expect(content).toContain('target="_blank"');
    expect(content).toContain('noopener noreferrer');
  });

  it('displays platform label for each link', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('platformLabels[l.platform]');
  });

  it('handles empty links list', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Aucun lien externe enregistré');
  });
});

describe('Fiche élu — activité parlementaire (#62)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('queries parliamentary_activity table', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('parliamentaryActivity');
    expect(content).toContain('activitiesByOfficial');
  });

  it('translates activity types to French', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Question écrite');
    expect(content).toContain('Question orale');
    expect(content).toContain('Amendement');
    expect(content).toContain('Rapport');
  });

  it('displays activity table with date, type, title, status', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('act.date');
    expect(content).toContain('act.type');
    expect(content).toContain('act.title');
    expect(content).toContain('act.status');
  });

  it('shows amendment status with colored badges', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('statusLabels');
    expect(content).toContain('statusColors');
    expect(content).toContain('Adopté');
    expect(content).toContain('Rejeté');
    expect(content).toContain('Retiré');
  });

  it('handles empty activities list', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Aucune activité parlementaire enregistrée');
  });
});

describe('Fiche élu — commissions & groupes (#63)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('queries committees table', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('committees');
    expect(content).toContain('committeesByOfficial');
  });

  it('translates committee types to French', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('committeeTypeLabels');
    expect(content).toContain('Commission permanente');
    expect(content).toContain('Commission spéciale');
    expect(content).toContain('Délégation');
    expect(content).toContain("Groupe d'études");
    expect(content).toContain("Groupe d'amitié");
  });

  it('displays committee name and type badge', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('c.name');
    expect(content).toContain('c.type');
  });

  it('shows date range with "en cours" for active', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('c.startDate');
    expect(content).toContain('c.endDate');
    expect(content).toContain('en cours');
  });

  it('handles empty committees list', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Aucune commission enregistrée');
  });
});

describe('Fiche élu — historique électoral (#64)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('queries electoral_results table', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('electoralResults');
    expect(content).toContain('electoralByOfficial');
  });

  it('displays election table with date, type, round, score, opponents', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('er.electionDate');
    expect(content).toContain('er.electionType');
    expect(content).toContain('er.round');
    expect(content).toContain('er.scorePercent');
    expect(content).toContain('er.opponentCount');
  });

  it('translates round numbers to French', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('roundLabels');
    expect(content).toContain('1er tour');
    expect(content).toContain('2nd tour');
  });

  it('formats score as percentage', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('scorePercent.toFixed(1)');
  });

  it('handles empty electoral results list', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Aucun résultat électoral enregistré');
  });
});

describe('Fiche élu — InterestDetailDrawer integration (#181)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('imports InterestDetailDrawer component', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('import InterestDetailDrawer from');
  });

  it('renders InterestDetailDrawer with client:idle', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('<InterestDetailDrawer client:idle');
  });

  it('makes interest items clickable with data attribute', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('data-interest-detail');
    expect(content).toContain('cursor-pointer');
  });

  it('dispatches open-interest-detail custom event on click', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('open-interest-detail');
    expect(content).toContain('interestDetail');
  });

  it('queries enriched interest fields', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('interests.declarantComment');
    expect(content).toContain('interests.ownershipDetail');
    expect(content).toContain('interests.annualAmount');
    expect(content).toContain('interests.sourceDocumentUrl');
  });

  it('queries declaration_snapshots table', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('declarationSnapshots');
    expect(content).toContain('snapshotsByOfficial');
  });

  it('passes deputySnapshots in props', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('deputySnapshots');
  });
});

describe('Fiche élu — attribution des sources inline', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('shows source attribution with retrieval date per section', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('fmtRetrieval(sectionDates.');
    expect(content).toContain('dernière récupération le');
  });

  it('does not contain provenance modals', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).not.toContain('an-provenance-modal');
    expect(content).not.toContain('liens-provenance-modal');
    expect(content).not.toContain('setupModal');
  });
});

describe('Fiche élu — indicateur dernière mise à jour (#67)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('computes lastUpdated from updatedAt timestamps', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('lastUpdated');
    expect(content).toContain('item.updatedAt');
  });

  it('includes lastUpdated in props', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('lastUpdated: Date');
    expect(content).toContain('lastUpdated,');
  });

  it('displays last updated indicator', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Dernière mise à jour le');
    expect(content).toContain('lastUpdated');
  });
});
