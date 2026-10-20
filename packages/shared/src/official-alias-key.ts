import { normalizePersonName } from './person-name.js';

/**
 * Clé de rapprochement d'une personne par nom + prénom + date de naissance,
 * commune aux upserts RNE (`officialKey` dans packages/ingest/src/upsert/*)
 * et à la table `official_aliases`. Un alias enregistré sous cette clé
 * redirige l'ingestion vers la fiche cible.
 */
export function officialAliasKey(
  firstName: string,
  lastName: string,
  birthDate: string | null | undefined,
): string {
  return `${normalizePersonName(firstName)}|${normalizePersonName(lastName)}|${birthDate ?? ''}`;
}
