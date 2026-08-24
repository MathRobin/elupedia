import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, addresses } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { SenatAddressData } from '../sources/senat-adresses.js';

export async function upsertSenatAddresses(
  db: NeonHttpDatabase,
  addressList: SenatAddressData[],
) {
  const summary = { created: 0, updated: 0 };

  for (const addr of addressList) {
    const [official] = await db
      .select()
      .from(officials)
      .where(eq(officials.senatId, addr.matricule))
      .limit(1);

    if (!official) continue;

    const existing = await db
      .select()
      .from(addresses)
      .where(
        and(
          eq(addresses.officialId, official.id),
          eq(addresses.type, addr.type),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(addresses).values({
        officialId: official.id,
        type: addr.type,
        street: addr.street,
        postalCode: addr.postal_code,
        city: addr.city,
        phone: addr.phone,
        email: addr.email ?? null,
      });
      summary.created++;
    } else {
      await db
        .update(addresses)
        .set({
          street: addr.street,
          postalCode: addr.postal_code,
          city: addr.city,
          phone: addr.phone,
          email: addr.email ?? null,
        })
        .where(eq(addresses.id, existing[0].id));
      summary.updated++;
    }
  }

  return summary;
}
