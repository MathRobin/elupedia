import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { addresses } from '@elupedia/shared';
import { isNotNull, and } from 'drizzle-orm';
import { generateStaticMap, mapCacheKey } from '../services/static-map.js';
import { logger } from '../logger.js';

const BATCH_SIZE = 20;
const DELAY_MS = 250;

function getS3Config() {
  const bucket = process.env.MAPS_S3_BUCKET;
  const region = process.env.MAPS_S3_REGION ?? process.env.AWS_REGION;
  if (!bucket) throw new Error('MAPS_S3_BUCKET is required');
  if (!region) throw new Error('MAPS_S3_REGION or AWS_REGION is required');
  return { bucket, region };
}

async function existsOnS3(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function uploadMaps(db: NeonHttpDatabase) {
  const { bucket, region } = getS3Config();
  const s3 = new S3Client({ region });

  const rows = await db
    .select({
      id: addresses.id,
      latitude: addresses.latitude,
      longitude: addresses.longitude,
    })
    .from(addresses)
    .where(and(isNotNull(addresses.latitude), isNotNull(addresses.longitude)));

  logger.info(`Maps: ${rows.length} addresses with coordinates`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    logger.info(
      `  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)}`,
    );

    for (const row of batch) {
      const key = mapCacheKey({
        latitude: row.latitude!,
        longitude: row.longitude!,
        zoom: 13,
        width: 400,
        height: 200,
      });
      const s3Key = `maps/${key}.png`;

      if (await existsOnS3(s3, bucket, s3Key)) {
        skipped++;
        continue;
      }

      try {
        const buf = await generateStaticMap({
          latitude: row.latitude!,
          longitude: row.longitude!,
        });

        if (!buf) {
          failed++;
          continue;
        }

        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: s3Key,
            Body: buf,
            ContentType: 'image/png',
            CacheControl: 'public, max-age=31536000, immutable',
          }),
        );
        uploaded++;
      } catch (err) {
        logger.error(`  Failed for ${row.id}: ${err}`);
        failed++;
      }

      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  logger.info(
    `Maps done: ${uploaded} uploaded, ${skipped} skipped, ${failed} failed`,
  );
  return { uploaded, skipped, failed };
}
