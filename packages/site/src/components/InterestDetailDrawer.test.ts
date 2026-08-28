import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const componentPath = resolve(import.meta.dirname, 'InterestDetailDrawer.tsx');
const source = readFileSync(componentPath, 'utf-8');

describe('InterestDetailDrawer', () => {
  it('exports a default function component', async () => {
    const mod = await import('./InterestDetailDrawer.js');
    expect(typeof mod.default).toBe('function');
  });

  it('exports InterestDetail type with expected fields', () => {
    expect(source).toContain('entityName');
    expect(source).toContain('declarantComment');
    expect(source).toContain('ownershipDetail');
    expect(source).toContain('annualAmount');
    expect(source).toContain('amountYear');
    expect(source).toContain('amountIsNet');
    expect(source).toContain('sourceDocumentUrl');
    expect(source).toContain('declarationSnapshots');
  });

  it('handles Escape key to close', () => {
    expect(source).toContain("e.key === 'Escape'");
  });

  it('listens to open-interest-detail custom event', () => {
    expect(source).toContain('open-interest-detail');
  });

  it('shows declarant comment section when present', () => {
    expect(source).toContain('Commentaire du déclarant');
  });

  it('shows ownership detail section when present', () => {
    expect(source).toContain('Détail de participation');
  });

  it('shows annual amount section when present', () => {
    expect(source).toContain('Montant annuel déclaré');
  });

  it('shows link to HATVP source document', () => {
    expect(source).toContain('Voir la déclaration sur hatvp.fr');
  });

  it('shows declaration history timeline', () => {
    expect(source).toContain('Historique des déclarations');
    expect(source).toContain('Déclaration initiale');
    expect(source).toContain('Modification');
  });

  it('does not render empty sections for absent fields', () => {
    expect(source).toContain('interest.declarantComment &&');
    expect(source).toContain('interest.ownershipDetail &&');
    expect(source).toContain('interest.annualAmount &&');
    expect(source).toContain('interest.sourceDocumentUrl &&');
    expect(source).toContain('interest.declarationSnapshots.length > 0');
  });
});
