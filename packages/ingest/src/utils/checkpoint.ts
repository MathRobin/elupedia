import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CHECKPOINT_DIR = join(homedir(), '.elupedia', 'checkpoints');

function filePath(name: string): string {
  return join(CHECKPOINT_DIR, `${name}.json`);
}

export function loadCheckpoint(name: string): string | null {
  try {
    const raw = readFileSync(filePath(name), 'utf-8');
    const data = JSON.parse(raw) as { lastKey: string };
    return data.lastKey ?? null;
  } catch {
    return null;
  }
}

export function saveCheckpoint(name: string, lastKey: string): void {
  mkdirSync(CHECKPOINT_DIR, { recursive: true });
  writeFileSync(filePath(name), JSON.stringify({ lastKey }));
}

export function clearCheckpoint(name: string): void {
  try {
    unlinkSync(filePath(name));
  } catch {
    // already gone
  }
}
