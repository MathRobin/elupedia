import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, addresses } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { SenatAddressData } from '../sources/senat-adresses.js';

export async function upsertSenatAddresses(
  db: NeonHttpDatabase,
  addressList: SenatAddressData[],
) {
  const summary = { created: 0, updated: 0 };

  const allOfficials = await db
    .select({ id: officials.id, senatId: officials.senatId })
    .from(officials);
  const officialByMatricule = new Map<string, string>();
  for (const o of allOfficials) {
    if (o.senatId) officialByMatricule.set(o.senatId, o.id);
  }

  const allAddresses = await db.select().from(addresses);
  const existingByKey = new Map<string, typeof addresses.$inferSelect>();
  for (const a of allAddresses) {
    existingByKey.set(`${a.officialId}|${a.type}`, a);
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

  return summary;
}
