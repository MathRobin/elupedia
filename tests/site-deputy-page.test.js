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
    expect(content).toContain('href="/"');
    expect(content).toContain('Retour');
  });

  it('uses BaseLayout with dynamic title', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('<BaseLayout');
    expect(content).toContain('title={fullName}');
  });

  it('homepage links to /elus/ path', () => {
    const indexPath = resolve(root, 'packages/site/src/pages/index.astro');
    const content = readFileSync(indexPath, 'utf-8');
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
    expect(content).toContain('desc(ballots.date)');
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

  it('translates interest types to French', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Participation en entreprise');
    expect(content).toContain('Fonction associative');
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

  it('shows summary when available', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('p.summary');
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

  it('queries external_links table', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('externalLinks');
    expect(content).toContain('linksByOfficial');
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

describe('Fiche élu — prédécesseur/successeur (#61)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('queries all mandates to find predecessors/successors', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('allMandates');
    expect(content).toContain('predecessorMap');
    expect(content).toContain('successorMap');
  });

  it('groups mandates by district and type', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('seatMap');
    expect(content).toContain('m.type');
    expect(content).toContain('m.district');
  });

  it('displays predecessor link when available', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('predecessor');
    expect(content).toContain('Prédécesseur');
    expect(content).toContain('predecessor.id');
  });

  it('displays successor link when available', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('successor');
    expect(content).toContain('Successeur');
    expect(content).toContain('successor.id');
  });

  it('links to /elus/ pages', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('/elus/${predecessor.id}');
    expect(content).toContain('/elus/${successor.id}');
  });
});
