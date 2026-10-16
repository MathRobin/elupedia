/**
 * Lance `next` avec les variables du `.env` de la racine du monorepo
 * (DATABASE_URL, AUTH_SECRET…), comme les autres workspaces. `node --env-file`
 * ne convient pas : Next relance node en propageant les options dans
 * NODE_OPTIONS, où `--env-file` est interdit. Les variables déjà présentes
 * dans l'environnement ont priorité sur le fichier.
 *
 * Usage : node scripts/next.mjs dev --webpack --port 3001
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(here, '..', '..', '..', '.env');

let content = '';
try {
  content = readFileSync(envFile, 'utf8');
} catch {
  // pas de .env : on s'en remet à l'environnement courant
}
for (const line of content.split('\n')) {
  const m = line.match(
    /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/,
  );
  if (!m || m[1] in process.env) continue;
  let value = m[2];
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  process.env[m[1]] = value;
}

const require = createRequire(import.meta.url);
const nextBin = resolve(
  dirname(require.resolve('next/package.json')),
  'dist/bin/next',
);
const result = spawnSync(
  process.execPath,
  [nextBin, ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    cwd: resolve(here, '..'),
  },
);
process.exit(result.status ?? 1);
