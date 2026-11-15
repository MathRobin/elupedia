/**
 * Choix du thème d'un short « thème » de repli, pour le DAG `ingest-votes`.
 *
 * Le DAG veut une vidéo par jour. `select` sait déjà descendre son seuil
 * (select-candidates.ts), mais une fenêtre sans aucun scrutin exploitable
 * — congés parlementaires, semaine de circonscription — ne lui laisse rien à
 * retenir. Le DAG enchaîne alors sur `topic --auto --if-none-today`, qui crée
 * un short « thème » sans scrutin (main-topic.ts).
 *
 * Deux décisions sont prises ici :
 * - quel thème : celui qui n'a jamais servi, sinon le moins récemment servi,
 *   pour que la rotation ne repasse pas deux jours de suite sur le même ;
 * - faut-il en créer un : non si un short existe déjà pour la journée, sinon
 *   le DAG en empilerait un chaque fois qu'il est relancé à la main.
 *
 * Les shorts « thème » portent `score_details = {kind:'topic', topic:<clé>}`
 * (main-topic.ts) : c'est la seule trace du thème employé, d'où la lecture par
 * `score_details->>'topic'`.
 *
 * Appelants : main-topic.ts.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { gte, sql } from 'drizzle-orm';
import { videoShorts } from '@elupedia/shared';

/**
 * Thème à produire : jamais utilisé d'abord (dans l'ordre du registre), sinon
 * le plus anciennement utilisé. `null` si le registre est vide.
 */
export function pickTopicKey(
  keys: string[],
  lastUsed: Map<string, string>,
): string | null {
  const jamais = keys.find((k) => !lastUsed.has(k));
  if (jamais !== undefined) return jamais;
  return (
    [...keys].sort((a, b) =>
      (lastUsed.get(a) ?? '').localeCompare(lastUsed.get(b) ?? ''),
    )[0] ?? null
  );
}

/** Dernière utilisation de chaque thème (ISO), lue dans `score_details`. */
export async function loadTopicLastUse(
  db: NeonHttpDatabase,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      topic: sql<string>`${videoShorts.scoreDetails}->>'topic'`,
      lastUsed: sql<string>`max(${videoShorts.createdAt})::text`,
    })
    .from(videoShorts)
    .where(sql`${videoShorts.scoreDetails}->>'topic' is not null`)
    .groupBy(sql`${videoShorts.scoreDetails}->>'topic'`);
  return new Map(rows.map((r) => [r.topic, r.lastUsed]));
}

/** Nombre de shorts créés depuis `since` (toutes origines, tous statuts). */
export async function countShortsCreatedSince(
  db: NeonHttpDatabase,
  since: Date,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(videoShorts)
    .where(gte(videoShorts.createdAt, since));
  return row?.n ?? 0;
}

/** Minuit du jour de `now`, en heure locale de la machine d'ingestion. */
export function startOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}
