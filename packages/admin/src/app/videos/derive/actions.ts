'use server';

/**
 * Dérive des faits : shorts non publiés dont les chiffres figés avec le
 * script (ceux que la voix énonce) ne correspondent plus à la base, parce
 * que l'Assemblée a corrigé le scrutin après coup. Même contrôle que celui
 * qui bloque la publication, appliqué à tous les shorts d'un coup.
 */
import { inArray } from 'drizzle-orm';
import { createDb, videoShorts } from '@elupedia/shared';
import {
  factsDrift,
  type FactsDrift,
} from '@elupedia/shorts/src/facts-drift.js';
import { loadShortFacts } from '@elupedia/shorts/src/script-facts.js';
import type { StoredScript } from '@elupedia/shorts/src/generate-script.js';
import { auth } from '@/lib/auth';

const db = createDb();

export interface DriftRow {
  id: string;
  status: string;
  title: string | null;
  scriptAt: string;
  drift: FactsDrift[];
}

export async function listDrift(): Promise<DriftRow[]> {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!role || (role !== 'admin' && role !== 'moderator'))
    throw new Error('Forbidden');
  const rows = await db
    .select({
      id: videoShorts.id,
      status: videoShorts.status,
      script: videoShorts.script,
    })
    .from(videoShorts)
    .where(inArray(videoShorts.status, ['candidate', 'draft', 'approved']));
  const out: DriftRow[] = [];
  for (const r of rows) {
    const stored = r.script as StoredScript | null;
    if (!stored?.script) continue;
    const drift = factsDrift(stored.facts, await loadShortFacts(db, r.id));
    out.push({
      id: r.id,
      status: r.status,
      title: stored.script.title,
      scriptAt: stored.generatedAt,
      drift,
    });
  }
  return out.sort((a, b) => b.drift.length - a.drift.length);
}
