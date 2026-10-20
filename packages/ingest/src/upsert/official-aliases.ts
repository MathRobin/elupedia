import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officialAliases } from '@elupedia/shared';
import { logger } from '../logger.js';

/**
 * Alias de fiches élus pour les upserts qui rapprochent par clé
 * nom + prénom + date de naissance (RNE). Chargés une fois par ingestion et
 * ajoutés à l'index des fiches : une ligne source dont la clé est un alias
 * est rattachée à la fiche cible au lieu de créer un doublon.
 *
 * Un alias l'emporte sur une fiche existante de même clé : cette fiche est
 * alors un doublon recréé avant l'alias (à fusionner), et on ne veut pas
 * continuer à l'alimenter. Le cas est signalé dans le journal.
 */
export async function loadOfficialAliases(
  db: NeonHttpDatabase,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      aliasKey: officialAliases.aliasKey,
      officialId: officialAliases.officialId,
    })
    .from(officialAliases);
  return new Map(rows.map((r) => [r.aliasKey, r.officialId]));
}

/**
 * Applique les alias à l'index clé → fiche d'un upsert. `resolve` fabrique la
 * valeur d'index pour la fiche cible (les upserts stockent soit l'id, soit
 * `{ id, slug }`) ; une cible absente de la base est ignorée.
 */
export function applyOfficialAliases<V>(
  index: Map<string, V>,
  aliases: Map<string, string>,
  resolve: (officialId: string) => V | undefined,
): number {
  let applied = 0;
  for (const [key, officialId] of aliases) {
    const target = resolve(officialId);
    if (target === undefined) {
      logger.warn(
        `  Alias ${key} : fiche cible ${officialId} introuvable, ignoré`,
      );
      continue;
    }
    if (index.has(key)) {
      logger.warn(
        `  Alias ${key} : une fiche porte déjà cette clé (doublon à fusionner), l'alias l'emporte`,
      );
    }
    index.set(key, target);
    applied++;
  }
  return applied;
}
