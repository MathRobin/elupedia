/**
 * Points de reprise pour les étapes longues (ingestion RNE des maires,
 * adresses DILA — voir upsert/mayors.ts et upsert/mayor-addresses.ts) : la
 * dernière clé traitée est persistée dans ~/.elupedia/checkpoints/<nom>.json,
 * et l'étape reprend après cette clé si elle est relancée après une
 * interruption. À l'étape de supprimer son checkpoint une fois terminée,
 * sinon le run suivant repartirait du milieu.
 *
 * Stockage dans le HOME de l'utilisateur (pas dans le dépôt) : survit à un
 * `git clean`, mais pas à un changement de machine.
 */
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CHECKPOINT_DIR = join(homedir(), '.elupedia', 'checkpoints');

function filePath(name: string): string {
  return join(CHECKPOINT_DIR, `${name}.json`);
}

/** Dernière clé sauvegardée pour `name`, ou `null` (absent ou illisible). */
export function loadCheckpoint(name: string): string | null {
  try {
    const raw = readFileSync(filePath(name), 'utf-8');
    const data = JSON.parse(raw) as { lastKey: string };
    return data.lastKey ?? null;
  } catch {
    return null;
  }
}

/** Enregistre la dernière clé traitée (écrase la précédente). */
export function saveCheckpoint(name: string, lastKey: string): void {
  mkdirSync(CHECKPOINT_DIR, { recursive: true });
  writeFileSync(filePath(name), JSON.stringify({ lastKey }));
}

/** Supprime le checkpoint ; sans erreur s'il n'existe pas. */
export function clearCheckpoint(name: string): void {
  try {
    unlinkSync(filePath(name));
  } catch {
    // déjà absent
  }
}
