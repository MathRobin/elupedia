'use server';

/**
 * Contrôles de cohérence métier (packages/ingest/src/check-coherence.ts :
 * mandats qui se recoupent, parrainages sans mandat couvrant, etc.), lancés
 * à la demande depuis l'admin. Lecture seule sur la base ; quelques requêtes
 * ensemblistes, de l'ordre de la dizaine de secondes.
 */
import { createDb } from '@elupedia/shared';
import { checkCoherence } from '@elupedia/ingest/src/check-coherence.js';
import { auth } from '@/lib/auth';

export interface CoherenceView {
  ranAt: string;
  durationMs: number;
  totalIssues: number;
  results: {
    key: string;
    description: string;
    count: number;
    truncated: boolean;
    samples: string[];
  }[];
}

export async function runCoherence(): Promise<CoherenceView> {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!role || (role !== 'admin' && role !== 'moderator'))
    throw new Error('Forbidden');
  const started = Date.now();
  const report = await checkCoherence(createDb());
  return {
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    totalIssues: report.totalIssues,
    results: report.results.map((r) => ({
      key: r.key,
      description: r.description,
      count: r.count,
      truncated: r.truncated,
      samples: r.samples,
    })),
  };
}
