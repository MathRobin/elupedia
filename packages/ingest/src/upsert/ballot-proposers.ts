import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import {
  ballots,
  mandates,
  officials,
  type BallotProposer,
} from '@elupedia/shared';
import { logger } from '../logger.js';

type Mandate = {
  startDate: string;
  endDate: string | null;
  group: string | null;
};

/** Groupe du mandat de député en cours, sinon du plus récent. */
export function pickGroup(list: Mandate[]): string | null {
  const ongoing = list.find((m) => m.endDate === null);
  const latest = [...list].sort((a, b) =>
    b.startDate.localeCompare(a.startDate),
  )[0];
  return (ongoing ?? latest)?.group ?? null;
}

/**
 * Résout les auteurs des textes soumis au vote : pour chaque scrutin ayant un
 * dossier législatif et pas encore d'auteurs, lit l'initiateur du dossier et
 * le rapproche des fiches élus par identifiant AN. Un dossier sans initiateur
 * donne `[]` (traité, rien à afficher) ; des initiateurs introuvables parmi
 * les fiches laissent `null` pour une prochaine passe.
 */
export async function upsertBallotProposers(
  db: NeonHttpDatabase,
  fetchInitiators: (
    refs: ReadonlySet<string>,
  ) => Promise<Map<string, string[]>>,
): Promise<{ updated: number; unresolved: number }> {
  const pending = await db
    .select({ id: ballots.id, dossierRef: ballots.dossierRef })
    .from(ballots)
    .where(and(isNotNull(ballots.dossierRef), isNull(ballots.proposers)));
  if (pending.length === 0) return { updated: 0, unresolved: 0 };

  const refs = new Set(pending.map((b) => b.dossierRef as string));
  const initiators = await fetchInitiators(refs);

  const anIds = [...new Set([...initiators.values()].flat())];
  const people =
    anIds.length === 0
      ? []
      : await db
          .select({
            id: officials.id,
            anId: officials.anId,
            firstName: officials.firstName,
            lastName: officials.lastName,
          })
          .from(officials)
          .where(inArray(officials.anId, anIds));
  const byAnId = new Map(people.map((p) => [p.anId as string, p]));

  const mandateRows =
    people.length === 0
      ? []
      : await db
          .select({
            officialId: mandates.officialId,
            startDate: mandates.startDate,
            endDate: mandates.endDate,
            group: mandates.politicalGroup,
          })
          .from(mandates)
          .where(
            and(
              eq(mandates.type, 'depute'),
              inArray(
                mandates.officialId,
                people.map((p) => p.id),
              ),
            ),
          );

  let updated = 0;
  let unresolved = 0;
  for (const ballot of pending) {
    const acteurs = initiators.get(ballot.dossierRef as string);
    if (acteurs === undefined) continue; // dossier introuvable dans la source
    const resolved: BallotProposer[] = [];
    for (const ref of acteurs) {
      const person = byAnId.get(ref);
      if (!person) continue;
      resolved.push({
        officialId: person.id,
        name: `${person.firstName} ${person.lastName}`,
        group: pickGroup(mandateRows.filter((m) => m.officialId === person.id)),
      });
    }
    if (acteurs.length > 0 && resolved.length === 0) {
      unresolved++;
      continue;
    }
    await db
      .update(ballots)
      .set({ proposers: resolved, updatedAt: new Date() })
      .where(eq(ballots.id, ballot.id));
    updated++;
  }
  logger.info(
    `Auteurs de textes : ${updated} scrutin(s) mis à jour, ${unresolved} non résolu(s)`,
  );
  return { updated, unresolved };
}
