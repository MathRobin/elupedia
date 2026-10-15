/**
 * Copie sur S3 des photos officielles des élus (`officials.photo_url`,
 * hébergées par l'AN, le Sénat, le PE...), étape `photos` de `run.ts` et
 * script `ingest:photos` (`main-photos.ts`). Le site sert `s3_photo_url`
 * pour ne pas dépendre de la disponibilité des sites sources.
 *
 * Table écrite : `officials` (colonne `s3_photo_url` uniquement).
 * Objets S3 : `elus/pp/<official id>.jpg` dans MAPS_S3_BUCKET (bucket
 * partagé avec les cartes).
 *
 * Idempotent : une photo déjà sur S3 (HEAD) n'est pas re-téléchargée, mais
 * `s3_photo_url` est tout de même (ré)écrite pour rattraper une fiche dont
 * la colonne serait vide. Une photo source qui change n'est donc jamais
 * rafraîchie : il faut supprimer l'objet S3 pour la mettre à jour.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { officials } from '@elupedia/shared';
import { isNotNull, eq } from 'drizzle-orm';
import { logger } from '../logger.js';

/** Nombre de fiches par lot (sert uniquement au log d'avancement). */
const BATCH_SIZE = 20;
/** Pause entre deux téléchargements, pour ménager les sites sources. */
const DELAY_MS = 200;
/** En dessous de cette taille, le corps est une page d'erreur, pas une image. */
const MIN_PHOTO_BYTES = 100;

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

function s3Key(officialId: string): string {
  return `elus/pp/${officialId}.jpg`;
}

function s3PublicUrl(bucket: string, region: string, key: string): string {
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/**
 * Télécharge chaque photo source absente de S3, l'y dépose et renseigne
 * `officials.s3_photo_url`. Retourne envoyées / déjà présentes / échouées.
 */
export async function uploadPhotos(db: NeonHttpDatabase) {
  const { bucket, region } = getS3Config();
  const s3 = new S3Client({ region });

  const rows = await db
    .select({
      id: officials.id,
      photoUrl: officials.photoUrl,
    })
    .from(officials)
    .where(isNotNull(officials.photoUrl));

  logger.info(`Photos: ${rows.length} officials with a source photo`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    logger.info(
      `  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)}`,
    );

    for (const row of batch) {
      const key = s3Key(row.id);

      if (await existsOnS3(s3, bucket, key)) {
        const url = s3PublicUrl(bucket, region, key);
        await db
          .update(officials)
          .set({ s3PhotoUrl: url })
          .where(eq(officials.id, row.id));
        skipped++;
        continue;
      }

      try {
        const response = await fetch(row.photoUrl!, {
          headers: { 'User-Agent': 'Elupedia/1.0 (photo-sync)' },
          redirect: 'follow',
        });

        if (!response.ok) {
          logger.warn(
            `  HTTP ${response.status} for ${row.id}: ${row.photoUrl}`,
          );
          failed++;
          continue;
        }

        const contentType =
          response.headers.get('content-type') ?? 'image/jpeg';
        const photo = Buffer.from(await response.arrayBuffer());

        if (photo.length < MIN_PHOTO_BYTES) {
          logger.warn(`  Empty body for ${row.id}`);
          failed++;
          continue;
        }

        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: photo,
            ContentType: contentType,
            CacheControl: 'public, max-age=604800',
          }),
        );

        const url = s3PublicUrl(bucket, region, key);
        await db
          .update(officials)
          .set({ s3PhotoUrl: url, updatedAt: new Date() })
          .where(eq(officials.id, row.id));

        uploaded++;
      } catch (error) {
        logger.error(`  Failed for ${row.id}: ${error}`);
        failed++;
      }

      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  logger.info(
    `Photos done: ${uploaded} uploaded, ${skipped} already on S3, ${failed} failed`,
  );
  return { uploaded, skipped, failed };
}
