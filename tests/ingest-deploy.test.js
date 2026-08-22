import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';

const root = resolve(import.meta.dirname, '..');
const workflow = readFileSync(
  resolve(root, '.github/workflows/ingest.yml'),
  'utf-8',
);
const parsed = load(workflow);

describe('Enchaînement ingestion → rebuild → déploiement (#80)', () => {
  it('deploy job exists', () => {
    expect(parsed.jobs.deploy).toBeDefined();
  });

  it('deploy job depends on ingest', () => {
    expect(parsed.jobs.deploy.needs).toBe('ingest');
  });

  it('deploy job runs only when has_changes is true', () => {
    expect(parsed.jobs.deploy.if).toContain('has_changes');
    expect(parsed.jobs.deploy.if).toContain("'true'");
  });

  it('deploy job uses Vercel CLI', () => {
    const steps = parsed.jobs.deploy.steps;
    const allRuns = steps.map((s) => s.run || '').join('\n');
    expect(allRuns).toContain('vercel');
  });

  it('deploy job passes DATABASE_URL for build', () => {
    const buildStep = parsed.jobs.deploy.steps.find((s) => s.name === 'Build');
    expect(buildStep).toBeDefined();
    expect(buildStep.env.DATABASE_URL).toContain('DATABASE_URL');
  });

  it('deploy job deploys with --prod flag', () => {
    const deployStep = parsed.jobs.deploy.steps.find((s) =>
      s.run?.includes('vercel deploy'),
    );
    expect(deployStep).toBeDefined();
    expect(deployStep.run).toContain('--prod');
  });

  it('deploy job uses VERCEL_TOKEN secret', () => {
    const steps = parsed.jobs.deploy.steps;
    const allRuns = steps.map((s) => s.run || '').join('\n');
    expect(allRuns).toContain('VERCEL_TOKEN');
  });
});
