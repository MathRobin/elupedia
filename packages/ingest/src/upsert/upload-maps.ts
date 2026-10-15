/**
 * Génération et envoi sur S3 des cartes statiques des permanences
 * (`services/static-map.ts`), étape `maps` de `run.ts`.
 *
 * Aucune table écrite : lit `addresses` (lignes géocodées) et écrit des PNG
 * sous `maps/<clé>.png` dans le bucket MAPS_S3_BUCKET. La clé est dérivée
 * des coordonnées + paramètres de rendu (`mapCacheKey`), donc deux adresses
 * au même point partagent la même image. Le site reconstruit l'URL à partir
 * de la même clé.
 *
 * Idempotent : une image déjà présente sur S3 (HEAD) n'est jamais régénérée
 * ni écrasée (objets `immutable`). Un délai entre deux rendus ménage le
 * fournisseur de tuiles.
 */
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

/** Nombre d'adresses par lot (sert uniquement au log d'avancement). */
const BATCH_SIZE = 20;
/** Pause entre deux rendus, pour ne pas saturer le fournisseur de tuiles. */
const DELAY_MS = 250;

/**
 * Paramètres de rendu : doivent rester identiques aux STATIC_MAP_* du site
 * (pages/elus/[slug]/index.astro) qui recalcule la même clé MD5, et aux
 * défauts de generateStaticMap (cache disque local).
 */
const MAP_ZOOM = 13;
const MAP_WIDTH = 400;
const MAP_HEIGHT = 200;

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

/**
 * Génère et envoie sur S3 la carte de chaque adresse géocodée absente du
 * bucket. Lit `addresses`, n'écrit rien en base. Retourne envoyées /
 * déjà présentes / échouées.
 */
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
        zoom: MAP_ZOOM,
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
      });
      const s3Key = `maps/${key}.png`;

      if (await existsOnS3(s3, bucket, s3Key)) {
        skipped++;
        continue;
      }

      try {
        const png = await generateStaticMap({
          latitude: row.latitude!,
          longitude: row.longitude!,
        });

        if (!png) {
          failed++;
          continue;
        }

        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: s3Key,
            Body: png,
            ContentType: 'image/png',
            CacheControl: 'public, max-age=31536000, immutable',
          }),
        );
        uploaded++;
      } catch (error) {
        logger.error(`  Failed for ${row.id}: ${error}`);
        failed++;
      }

      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  logger.info(
    `Maps done: ${uploaded} uploaded, ${skipped} skipped, ${failed} failed`,
  );
  return { uploaded, skipped, failed };
}
