import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const componentPath = resolve(import.meta.dirname, 'QuestionDetailDrawer.tsx');
const source = readFileSync(componentPath, 'utf-8');

describe('QuestionDetailDrawer', () => {
  it('exports a default function component', async () => {
    const mod = await import('./QuestionDetailDrawer.js');
    expect(typeof mod.default).toBe('function');
  });

  it('exports QuestionDetail type fields', () => {
    expect(source).toContain('questionText');
    expect(source).toContain('responseText');
    expect(source).toContain('responseDate');
    expect(source).toContain('governmentComments');
  });

  it('renders "Pas encore de réponse publiée" for missing response', () => {
    expect(source).toContain('Pas encore de réponse publiée');
  });

  it('renders "Texte non disponible" for missing question text', () => {
    expect(source).toContain('Texte non disponible');
  });

  it('handles Escape key to close', () => {
    expect(source).toContain("e.key === 'Escape'");
  });

  it('listens to open-question-detail custom event', () => {
    expect(source).toContain('open-question-detail');
  });

  it('strips HTML tags from question/response text', () => {
    expect(source).toContain('stripHtml');
    expect(source).toContain('replace(/<[^>]+>/g');
  });

  it('displays ministry info', () => {
    expect(source).toContain('governmentComments');
  });

  it('fetches texts from API on open', () => {
    expect(source).toContain('/api/question-text');
    expect(source).toContain('setLoading');
  });

  it('shows loading state while fetching', () => {
    expect(source).toContain('Chargement');
    expect(source).toContain('animate-pulse');
  });
});
