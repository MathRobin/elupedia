/**
 * Upsert des coordonnées de mairie (adresse, téléphone, email, site web) des
 * maires, à partir de l'annuaire de l'administration DILA
 * (`sources/dila-mairies.ts`). Appelé par `run-maires.ts` (étape 2, après
 * `mayors.ts`).
 *
 * Tables écrites : `addresses` (type 'town_hall', clé (official_id, type))
 * et `external_links` (platform 'official_page', clé
 * (official_id, platform), status 'published', source 'official').
 * Le maire d'une commune est retrouvé par `mandates.commune_code` sur les
 * mandats de type 'maire' ; les communes sans maire en base sont comptées
 * en `skipped`.
 * Idempotent : l'adresse n'est réécrite que si un champ de contact a changé
 * (latitude/longitude posées par geocode-addresses.ts ne sont pas
 * touchées) ; le lien n'est réécrit que si l'URL a changé. Un site web
 * absent de la source ne supprime pas le lien existant.
 * Reprise : checkpoint fichier (`utils/checkpoint.ts`) sur le dernier code
 * commune traité, les mairies étant triées par code INSEE.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { mandates, addresses, externalLinks } from '@elupedia/shared';
import { eq, and, inArray } from 'drizzle-orm';
import type { MairieData } from '../sources/dila-mairies.js';
import { logger } from '../logger.js';
import {
  loadCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
} from '../utils/checkpoint.js';

const BATCH_SIZE = 200;
const CHECKPOINT_NAME = 'upsert-mayor-addresses';
// Taille max d'un INSERT multi-lignes.
const INSERT_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Upsert en base des adresses et sites web de mairie (écriture DB,
 * checkpoint fichier). Retourne created / updated (adresses), websites
 * (liens créés ou modifiés) et skipped (communes sans maire connu).
 */
export async function upsertMayorAddresses(
  db: NeonHttpDatabase,
  mairies: MairieData[],
) {
  const summary = { created: 0, updated: 0, websites: 0, skipped: 0 };

  const sorted = [...mairies].sort((a, b) =>
    a.communeCode.localeCompare(b.communeCode),
  );

  const checkpoint = loadCheckpoint(CHECKPOINT_NAME);
  let startIndex = 0;
  if (checkpoint) {
    startIndex = sorted.findIndex((mairie) => mairie.communeCode > checkpoint);
    if (startIndex === -1) startIndex = sorted.length;
    logger.info(
      `  Checkpoint found — resuming after "${checkpoint}" (skipping ${startIndex}/${sorted.length})`,
    );
  }

  const mayorMandates = await db
    .select({
      officialId: mandates.officialId,
      communeCode: mandates.communeCode,
    })
    .from(mandates)
    .where(eq(mandates.type, 'maire'));

  const officialByCommune = new Map<string, string>();
  for (const mandate of mayorMandates) {
    if (mandate.communeCode) {
      officialByCommune.set(mandate.communeCode, mandate.officialId);
    }
  }

  logger.info(`  Mayor mandates cache: ${officialByCommune.size} communes`);

  const totalBatches = Math.ceil((sorted.length - startIndex) / BATCH_SIZE);

  for (let start = startIndex; start < sorted.length; start += BATCH_SIZE) {
    const batch = sorted.slice(start, start + BATCH_SIZE);
    const batchNum = Math.floor((start - startIndex) / BATCH_SIZE) + 1;
    logger.info(
      `  Processing batch ${batchNum}/${totalBatches} (${batch.length} mairies)`,
    );

    const batchOfficialIds: string[] = [];
    for (const mairie of batch) {
      const officialId = officialByCommune.get(mairie.communeCode);
      if (!officialId) {
        summary.skipped++;
        continue;
      }
      batchOfficialIds.push(officialId);
    }

    // Existant chargé par lot (IN sur les officials du lot) plutôt que
    // table entière ou requête unitaire.
    const existingAddresses = batchOfficialIds.length
      ? await db
          .select()
          .from(addresses)
          .where(
            and(
              inArray(addresses.officialId, batchOfficialIds),
              eq(addresses.type, 'town_hall'),
            ),
          )
      : [];
    const addressByOfficialId = new Map(
      existingAddresses.map((address) => [address.officialId, address]),
    );

    const existingLinks = batchOfficialIds.length
      ? await db
          .select()
          .from(externalLinks)
          .where(
            and(
              inArray(externalLinks.officialId, batchOfficialIds),
              eq(externalLinks.platform, 'official_page'),
            ),
          )
      : [];
    const linkByOfficialId = new Map(
      existingLinks.map((link) => [link.officialId, link]),
    );

    const newAddressRows: (typeof addresses.$inferInsert)[] = [];
    const newLinkRows: (typeof externalLinks.$inferInsert)[] = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const mairie of batch) {
      const officialId = officialByCommune.get(mairie.communeCode);
      if (!officialId) continue;

      const existingAddress = addressByOfficialId.get(officialId);

      // `||` et non `??` pour rue/CP/ville : la source renvoie des chaînes
      // vides, stockées en NULL.
      if (!existingAddress) {
        newAddressRows.push({
          officialId,
          type: 'town_hall',
          street: mairie.street || null,
          postalCode: mairie.postalCode || null,
          city: mairie.city || null,
          phone: mairie.phone ?? null,
          email: mairie.email ?? null,
        });
        summary.created++;
      } else if (
        existingAddress.street !== (mairie.street || null) ||
        existingAddress.postalCode !== (mairie.postalCode || null) ||
        existingAddress.city !== (mairie.city || null) ||
        existingAddress.phone !== (mairie.phone ?? null) ||
        existingAddress.email !== (mairie.email ?? null)
      ) {
        await db
          .update(addresses)
          .set({
            street: mairie.street || null,
            postalCode: mairie.postalCode || null,
            city: mairie.city || null,
            phone: mairie.phone ?? null,
            email: mairie.email ?? null,
            updatedAt: new Date(),
          })
          .where(eq(addresses.id, existingAddress.id));
        summary.updated++;
      }

      if (mairie.website) {
        const existingLink = linkByOfficialId.get(officialId);

        if (!existingLink) {
          newLinkRows.push({
            officialId,
            platform: 'official_page',
            url: mairie.website,
            status: 'published',
            source: 'official',
            capturedAt: today,
          });
          summary.websites++;
        } else if (existingLink.url !== mairie.website) {
          await db
            .update(externalLinks)
            .set({
              url: mairie.website,
              capturedAt: today,
              updatedAt: new Date(),
            })
            .where(eq(externalLinks.id, existingLink.id));
          summary.websites++;
        }
      }
    }

    for (const rowChunk of chunk(newAddressRows, INSERT_CHUNK_SIZE)) {
      await db.insert(addresses).values(rowChunk);
    }
    for (const rowChunk of chunk(newLinkRows, INSERT_CHUNK_SIZE)) {
      await db.insert(externalLinks).values(rowChunk);
    }

    saveCheckpoint(CHECKPOINT_NAME, batch[batch.length - 1].communeCode);
  }

  clearCheckpoint(CHECKPOINT_NAME);

  logger.info(
    `Mayor addresses: ${summary.created} created, ${summary.updated} updated, ${summary.websites} websites, ${summary.skipped} skipped`,
  );
  return summary;
}
