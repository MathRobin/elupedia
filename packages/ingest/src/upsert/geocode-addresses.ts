import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { addresses } from '@elupedia/shared';
import { isNull, and, isNotNull, or, eq } from 'drizzle-orm';
import { geocodeAddress } from '../services/geocoder.js';
import { logger } from '../logger.js';

const BATCH_SIZE = 50;
const DELAY_MS = 200;

export async function geocodeAllAddresses(db: NeonHttpDatabase) {
  const rows = await db
    .select({
      id: addresses.id,
      street: addresses.street,
      postalCode: addresses.postalCode,
      city: addresses.city,
    })
    .from(addresses)
    .where(
      and(
        isNull(addresses.latitude),
        or(isNotNull(addresses.street), isNotNull(addresses.city)),
      ),
    );

  logger.info(`Geocoding: ${rows.length} addresses without coordinates`);

  let geocoded = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    logger.info(
      `  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)}`,
    );

    for (const row of batch) {
      const query = [row.street, row.postalCode, row.city]
        .filter(Boolean)
        .join(' ');
      if (!query) {
        failed++;
        continue;
      }

      const result = await geocodeAddress(query);
      if (result) {
        await db
          .update(addresses)
          .set({ latitude: result.latitude, longitude: result.longitude })
          .where(eq(addresses.id, row.id));
        geocoded++;
      } else {
        failed++;
      }

      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  logger.info(`Geocoding done: ${geocoded} geocoded, ${failed} failed/skipped`);
  return { geocoded, failed };
}
