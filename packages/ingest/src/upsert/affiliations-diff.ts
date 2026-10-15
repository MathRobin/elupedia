/**
 * Met à jour l'historique d'appartenance des députés à leur groupe
 * parlementaire (table `affiliations`, kind 'group') à partir de la liste
 * courante fournie par l'open data AN. Appelé par `run-an.ts`.
 *
 * Tables écrites : `affiliations` (+ `data_provenance`).
 * Clé de rapprochement : official (via `officials.an_id`) + affiliation
 * active (end_date NULL) dont `party_or_group` == groupe source.
 * Logique de diff : si le groupe courant du député a déjà une affiliation
 * active, rien n'est écrit ; sinon toutes ses affiliations de groupe actives
 * sont clôturées à la date du jour et une nouvelle est ouverte à la date du
 * jour. Idempotent d'un run à l'autre tant que le groupe ne change pas.
 * Piège : les dates de début/fin sont celles du run, pas celles du
 * changement réel de groupe (la source ne les fournit pas) — la précision
 * dépend donc de la fréquence d'ingestion. L'historique n'est jamais
 * réécrit, seulement clôturé.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, affiliations } from '@elupedia/shared';
import { eq, isNull, and } from 'drizzle-orm';
import { writeProvenanceBatch } from './provenance.js';
import { logger } from '../logger.js';

export interface AffiliationData {
  slug: string;
  id_an?: string;
  /** Sigle du groupe parlementaire (prioritaire). */
  groupe_sigle?: string;
  /** Parti de rattachement financier, utilisé à défaut de groupe. */
  parti_ratt_financier?: string;
}

const SOURCE_NAME = 'Assemblée nationale - Open Data';
const LEGAL_BASIS =
  "Données publiques d'appartenance à un groupe parlementaire (art. L311-1 CRPA)";

/**
 * Compare le groupe courant de chaque député à ses affiliations actives et
 * clôture / crée ce qu'il faut (écriture DB). Retourne les compteurs
 * created / ended / unchanged.
 */
export async function diffAffiliations(
  db: NeonHttpDatabase,
  deputeAffiliations: AffiliationData[],
) {
  const today = new Date().toISOString().split('T')[0];
  const summary = { created: 0, ended: 0, unchanged: 0 };

  const allOfficials = await db
    .select({ id: officials.id, anId: officials.anId })
    .from(officials);
  const officialByAnId = new Map<string, string>();
  for (const official of allOfficials) {
    if (official.anId) officialByAnId.set(official.anId, official.id);
  }

  // Seules les affiliations de groupe (kind 'group') entrent dans le diff :
  // les eurodéputés ont d'autres kinds, gérés ailleurs.
  const activeAffiliations = await db
    .select()
    .from(affiliations)
    .where(and(eq(affiliations.kind, 'group'), isNull(affiliations.endDate)));
  const activeByOfficialId = new Map<
    string,
    (typeof affiliations.$inferSelect)[]
  >();
  for (const affiliation of activeAffiliations) {
    const list = activeByOfficialId.get(affiliation.officialId) ?? [];
    list.push(affiliation);
    activeByOfficialId.set(affiliation.officialId, list);
  }

  const newRows: (typeof affiliations.$inferInsert)[] = [];
  const provenanceItems: Parameters<typeof writeProvenanceBatch>[1] = [];

  for (const depute of deputeAffiliations) {
    const anId = depute.id_an;
    if (!anId) continue;

    const group = depute.groupe_sigle ?? depute.parti_ratt_financier;
    if (!group) continue;

    const officialId = officialByAnId.get(anId);
    if (!officialId) continue;

    const currentAffiliations = activeByOfficialId.get(officialId) ?? [];
    const activeGroup = currentAffiliations.find(
      (affiliation) => affiliation.partyOrGroup === group,
    );

    if (activeGroup) {
      summary.unchanged++;
    } else {
      for (const affiliation of currentAffiliations) {
        await db
          .update(affiliations)
          .set({ endDate: today, updatedAt: new Date() })
          .where(eq(affiliations.id, affiliation.id));
        summary.ended++;
      }

      // `kind` n'est pas renseigné : la colonne vaut 'group' par défaut.
      newRows.push({
        officialId,
        partyOrGroup: group,
        startDate: today,
      });
      summary.created++;
    }

    provenanceItems.push({
      sourceTable: 'affiliations',
      sourceRecordId: `${anId}:${group}`,
      sourceName: SOURCE_NAME,
      sourceUrl: `https://www.assemblee-nationale.fr/dyn/deputes/${anId}`,
      legalBasis: LEGAL_BASIS,
      rawData: depute,
    });
  }

  if (newRows.length > 0) {
    await db.insert(affiliations).values(newRows);
  }

  await writeProvenanceBatch(db, provenanceItems);

  logger.info(
    `Affiliations: ${summary.created} created, ${summary.ended} ended, ${summary.unchanged} unchanged`,
  );
  return summary;
}
