import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, addresses } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { AddressData } from '../sources/an-adresses.js';
import { writeProvenanceBatch } from './provenance.js';
import { logger } from '../logger.js';

const SOURCE_NAME = 'Assemblée nationale - Open Data';
const LEGAL_BASIS =
  'Coordonnées publiques de bureau parlementaire (art. L311-1 CRPA)';

export async function upsertAddresses(
  db: NeonHttpDatabase,
  addressList: AddressData[],
) {
  const summary = { created: 0, updated: 0 };

  const allOfficials = await db
    .select({ id: officials.id, anId: officials.anId })
    .from(officials);
  const officialByAnId = new Map<string, string>();
  for (const o of allOfficials) {
    if (o.anId) officialByAnId.set(o.anId, o.id);
  }

  const allAddresses = await db.select().from(addresses);
  const existingByKey = new Map<string, typeof addresses.$inferSelect>();
  for (const a of allAddresses) {
    existingByKey.set(`${a.officialId}|${a.type}`, a);
  }

  const newRows: (typeof addresses.$inferInsert)[] = [];
  const provenanceItems: Parameters<typeof writeProvenanceBatch>[1] = [];

  for (const addr of addressList) {
    const officialId = officialByAnId.get(addr.id_an);
    if (!officialId) continue;

    const existing = existingByKey.get(`${officialId}|${addr.type}`);

    if (!existing) {
      newRows.push({
        officialId,
        type: addr.type,
        street: addr.street ?? null,
        postalCode: addr.postal_code ?? null,
        city: addr.city ?? null,
        phone: addr.phone ?? null,
        email: addr.email ?? null,
      });
      summary.created++;
    } else if (
      existing.street !== (addr.street ?? null) ||
      existing.postalCode !== (addr.postal_code ?? null) ||
      existing.city !== (addr.city ?? null) ||
      existing.phone !== (addr.phone ?? null) ||
      existing.email !== (addr.email ?? null)
    ) {
      await db
        .update(addresses)
        .set({
          street: addr.street ?? null,
          postalCode: addr.postal_code ?? null,
          city: addr.city ?? null,
          phone: addr.phone ?? null,
          email: addr.email ?? null,
          updatedAt: new Date(),
        })
        .where(eq(addresses.id, existing.id));
      summary.updated++;
    }

    provenanceItems.push({
      sourceTable: 'addresses',
      sourceRecordId: `${addr.id_an}:${addr.type}`,
      sourceName: SOURCE_NAME,
      sourceUrl: `https://www.assemblee-nationale.fr/dyn/deputes/${addr.id_an}`,
      legalBasis: LEGAL_BASIS,
      rawData: addr,
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
