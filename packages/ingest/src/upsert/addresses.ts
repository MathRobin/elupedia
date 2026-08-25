import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, addresses } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { AddressData } from '../sources/an-adresses.js';
import { writeProvenance } from './provenance.js';

const SOURCE_NAME = 'Assemblée nationale - Open Data';
const LEGAL_BASIS =
  'Coordonnées publiques de bureau parlementaire (art. L311-1 CRPA)';

export async function upsertAddresses(
  db: NeonHttpDatabase,
  addressList: AddressData[],
) {
  const summary = { created: 0, updated: 0 };

  for (const addr of addressList) {
    const [official] = await db
      .select()
      .from(officials)
      .where(eq(officials.anId, addr.id_an))
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
        street: addr.street ?? null,
        postalCode: addr.postal_code ?? null,
        city: addr.city ?? null,
        phone: addr.phone ?? null,
        email: addr.email ?? null,
      });
      summary.created++;
    } else {
      await db
        .update(addresses)
        .set({
          street: addr.street ?? null,
          postalCode: addr.postal_code ?? null,
          city: addr.city ?? null,
          phone: addr.phone ?? null,
          email: addr.email ?? null,
        })
        .where(eq(addresses.id, existing[0].id));
      summary.updated++;
    }

    await writeProvenance(db, {
      sourceTable: 'addresses',
      sourceRecordId: `${addr.id_an}:${addr.type}`,
      sourceName: SOURCE_NAME,
      sourceUrl: `https://www.assemblee-nationale.fr/dyn/deputes/${addr.id_an}`,
      legalBasis: LEGAL_BASIS,
      rawData: addr,
    });
  }

  return summary;
}
