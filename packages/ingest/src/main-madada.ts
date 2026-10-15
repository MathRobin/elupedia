/**
 * Point d'entrée CLI de l'ingestion MaDada (madada.fr) : transparence des
 * communes face aux demandes d'accès aux documents administratifs.
 *
 * Commande : `yarn --cwd packages/ingest ingest:madada`
 *
 * Exception à la convention main/run du package : la logique est ici, sans
 * `run-madada.ts`. Deux étapes :
 *   1. statistiques agrégées par commune (une requête MaDada par commune
 *      ayant un maire en base) → table commune_transparency ;
 *   2. demandes individuelles datées, pour les communes connues de MaDada.
 * L'étape 1 est longue : son résultat est mis en cache dans
 * packages/ingest/madada-cache.json, relu tel quel si le script est relancé
 * après un plantage de l'étape 2, et supprimé en fin de run réussi.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDb, mandates, communeTransparency } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import { logger } from './logger.js';
import { fetchMadadaStats, type MadadaBody } from './sources/madada.js';
import { upsertCommuneTransparency } from './upsert/commune-transparency.js';
import { fetchMadadaRequests } from './sources/madada-requests.js';
import { upsertMadadaRequests } from './upsert/madada-requests.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Cache de l'étape 1, à la racine du package (hors src/), cf. en-tête.
const CACHE_PATH = path.resolve(__dirname, '../madada-cache.json');
// Fréquence (en nombre de communes traitées) des lignes de progression.
const PROGRESS_LOG_EVERY = 50;

async function main() {
  const db = createDb();

  logger.info('=== Ingestion Madada started ===\n');

  let stats: Map<string, MadadaBody>;

  if (fs.existsSync(CACHE_PATH)) {
    logger.info(`Loading cached data from ${CACHE_PATH}`);
    // Sérialisé en liste d'entrées [code commune, stats] (Map non JSON-able).
    const cachedEntries = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')) as [
      string,
      MadadaBody,
    ][];
    stats = new Map(cachedEntries);
    logger.info(`Loaded ${stats.size} entries from cache`);
  } else {
    const communes = await db
      .selectDistinct({
        communeCode: mandates.communeCode,
        communeName: mandates.district,
      })
      .from(mandates)
      .where(eq(mandates.type, 'maire'));

    // mandates.district porte le nom de la commune pour les mandats de maire.
    const communesWithCodeAndName = communes.filter(
      (commune): commune is { communeCode: string; communeName: string } =>
        commune.communeCode != null && commune.communeName != null,
    );

    logger.info(
      `Found ${communesWithCodeAndName.length} distinct communes with maires`,
    );

    stats = await fetchMadadaStats(communesWithCodeAndName);

    fs.writeFileSync(CACHE_PATH, JSON.stringify([...stats.entries()]));
    logger.info(`Cached ${stats.size} entries to ${CACHE_PATH}`);
  }

  const result = await upsertCommuneTransparency(db, stats);
  logger.info(
    `Step 1: ${result.created} commune transparency records upserted`,
  );

  // Step 2: fetch individual requests with dates for communes that have MaDaDa data
  logger.info('\n--- Step 2: individual requests ---');
  const communesOnMadada = await db
    .select({
      communeCode: communeTransparency.communeCode,
      madadaUrlName: communeTransparency.madadaUrlName,
    })
    .from(communeTransparency);

  logger.info(`  ${communesOnMadada.length} communes with MaDaDa data`);
  let totalRequests = 0;
  let errors = 0;

  for (let i = 0; i < communesOnMadada.length; i++) {
    const { communeCode, madadaUrlName } = communesOnMadada[i];
    try {
      const requests = await fetchMadadaRequests(madadaUrlName);
      if (requests.length > 0) {
        await upsertMadadaRequests(db, communeCode, requests);
        totalRequests += requests.length;
      }
    } catch (error) {
      // Une commune en erreur ne bloque pas les suivantes.
      errors++;
      logger.warn(`  Error for ${madadaUrlName}: ${error}`);
    }

    if ((i + 1) % PROGRESS_LOG_EVERY === 0) {
      logger.info(
        `  Progress: ${i + 1}/${communesOnMadada.length} (${totalRequests} requests)`,
      );
    }
  }

  logger.info(
    `Step 2: ${totalRequests} individual requests upserted (${errors} errors)`,
  );

  // Run complet : le cache n'a plus de raison d'être (il serait réutilisé
  // tel quel au prochain lancement, avec des stats périmées).
  if (fs.existsSync(CACHE_PATH)) fs.unlinkSync(CACHE_PATH);
}

main().catch((err) => {
  // `${err}`/String(err) n'affiche que le message de premier niveau — la
  // vraie cause (souvent un timeout réseau côté driver Neon) est perdue
  // quand elle est portée par err.cause.
  logger.error(err?.stack ?? String(err));
  if (err?.cause) {
    logger.error(`Cause: ${err.cause?.stack ?? err.cause}`);
  }
  process.exit(1);
});
