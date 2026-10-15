/**
 * Upsert des adresses de bureau des députés (permanence en circonscription,
 * bureau à l'Assemblée) à partir de l'open data AN (`sources/an-adresses.ts`).
 * Appelé par `run-an.ts`.
 *
 * Tables écrites : `addresses`, plus `data_provenance` (une ligne par
 * adresse source, via writeProvenanceBatch).
 * Clé de rapprochement : (official_id, type). L'official est retrouvé par
 * `officials.an_id` ; les députés inconnus en base sont ignorés.
 * Idempotent : une ligne existante n'est réécrite que si l'un des champs de
 * contact (rue, CP, ville, téléphone, email) a changé.
 * Jamais écrasé : latitude/longitude, posées par `geocode-addresses.ts` —
 * l'update ci-dessous ne touche pas ces colonnes.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, addresses } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { AddressData } from '../sources/an-adresses.js';
import { writeProvenanceBatch } from './provenance.js';
import { logger } from '../logger.js';

const SOURCE_NAME = 'Assemblée nationale - Open Data';
const LEGAL_BASIS =
  'Coordonnées publiques de bureau parlementaire (art. L311-1 CRPA)';

/**
 * Insère ou met à jour les adresses AN en base (écriture DB) et enregistre
 * la provenance de chaque adresse source. Retourne le nombre de lignes
 * créées / mises à jour.
 */
export async function upsertAddresses(
  db: NeonHttpDatabase,
  addressList: AddressData[],
) {
  const summary = { created: 0, updated: 0 };

  const allOfficials = await db
    .select({ id: officials.id, anId: officials.anId })
    .from(officials);
  const officialByAnId = new Map<string, string>();
  for (const official of allOfficials) {
    if (official.anId) officialByAnId.set(official.anId, official.id);
  }

  // Table entière chargée une fois : quelques milliers de lignes, moins
  // coûteux qu'un SELECT par adresse source.
  const allAddresses = await db.select().from(addresses);
  const existingByKey = new Map<string, typeof addresses.$inferSelect>();
  for (const existingAddress of allAddresses) {
    existingByKey.set(
      `${existingAddress.officialId}|${existingAddress.type}`,
      existingAddress,
    );
  }

  const newRows: (typeof addresses.$inferInsert)[] = [];
  const provenanceItems: Parameters<typeof writeProvenanceBatch>[1] = [];

  for (const sourceAddress of addressList) {
    const officialId = officialByAnId.get(sourceAddress.id_an);
    if (!officialId) continue;

    const existing = existingByKey.get(`${officialId}|${sourceAddress.type}`);

    if (!existing) {
      newRows.push({
        officialId,
        type: sourceAddress.type,
        street: sourceAddress.street ?? null,
        postalCode: sourceAddress.postal_code ?? null,
        city: sourceAddress.city ?? null,
        phone: sourceAddress.phone ?? null,
        email: sourceAddress.email ?? null,
      });
      summary.created++;
    } else if (
      existing.street !== (sourceAddress.street ?? null) ||
      existing.postalCode !== (sourceAddress.postal_code ?? null) ||
      existing.city !== (sourceAddress.city ?? null) ||
      existing.phone !== (sourceAddress.phone ?? null) ||
      existing.email !== (sourceAddress.email ?? null)
    ) {
      await db
        .update(addresses)
        .set({
          street: sourceAddress.street ?? null,
          postalCode: sourceAddress.postal_code ?? null,
          city: sourceAddress.city ?? null,
          phone: sourceAddress.phone ?? null,
          email: sourceAddress.email ?? null,
          updatedAt: new Date(),
        })
        .where(eq(addresses.id, existing.id));
      summary.updated++;
    }

    provenanceItems.push({
      sourceTable: 'addresses',
      sourceRecordId: `${sourceAddress.id_an}:${sourceAddress.type}`,
      sourceName: SOURCE_NAME,
      sourceUrl: `https://www.assemblee-nationale.fr/dyn/deputes/${sourceAddress.id_an}`,
      legalBasis: LEGAL_BASIS,
      rawData: sourceAddress,
    });
  }

  if (newRows.length > 0) {
    await db.insert(addresses).values(newRows);
  }

  await writeProvenanceBatch(db, provenanceItems);

  logger.info(
    `AN addresses: ${summary.created} created, ${summary.updated} updated`,
  );
  return summary;
}
