/**
 * Upsert des adresses de contact des sénateurs (open data Sénat,
 * `sources/senat-adresses.ts`), appelé par `run-senat.ts` (`ingest:senat`).
 *
 * Table écrite : `addresses`.
 * Clé de rapprochement : official (via `officials.senat_id` = matricule) +
 * `type` d'adresse — une seule adresse par type et par élu.
 *
 * Idempotent : UPDATE seulement si un champ a changé, INSERT groupé sinon.
 * Les sénateurs sans fiche `officials` sont ignorés silencieusement.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, addresses } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { SenatAddressData } from '../sources/senat-adresses.js';
import { logger } from '../logger.js';

/**
 * Upsert des adresses sénatoriales. Écrit dans `addresses`. Retourne le
 * nombre de lignes créées et mises à jour.
 */
export async function upsertSenatAddresses(
  db: NeonHttpDatabase,
  addressList: SenatAddressData[],
) {
  const summary = { created: 0, updated: 0 };

  const allOfficials = await db
    .select({ id: officials.id, senatId: officials.senatId })
    .from(officials);
  const officialByMatricule = new Map<string, string>();
  for (const official of allOfficials) {
    if (official.senatId)
      officialByMatricule.set(official.senatId, official.id);
  }

  const allAddresses = await db.select().from(addresses);
  const existingByKey = new Map<string, typeof addresses.$inferSelect>();
  for (const address of allAddresses) {
    existingByKey.set(`${address.officialId}|${address.type}`, address);
  }

  const newRows: (typeof addresses.$inferInsert)[] = [];

  for (const addr of addressList) {
    const officialId = officialByMatricule.get(addr.matricule);
    if (!officialId) continue;

    const existing = existingByKey.get(`${officialId}|${addr.type}`);

    if (!existing) {
      newRows.push({
        officialId,
        type: addr.type,
        street: addr.street,
        postalCode: addr.postal_code,
        city: addr.city,
        phone: addr.phone,
        email: addr.email ?? null,
      });
      summary.created++;
    } else if (
      existing.street !== addr.street ||
      existing.postalCode !== addr.postal_code ||
      existing.city !== addr.city ||
      existing.phone !== addr.phone ||
      existing.email !== (addr.email ?? null)
    ) {
      await db
        .update(addresses)
        .set({
          street: addr.street,
          postalCode: addr.postal_code,
          city: addr.city,
          phone: addr.phone,
          email: addr.email ?? null,
          updatedAt: new Date(),
        })
        .where(eq(addresses.id, existing.id));
      summary.updated++;
    }
  }

  if (newRows.length > 0) {
    await db.insert(addresses).values(newRows);
  }

  logger.info(
    `Sénat addresses: ${summary.created} created, ${summary.updated} updated`,
  );
  return summary;
}
