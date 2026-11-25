// Contrôle des migrations Drizzle, lancé avant db:migrate (vercel.json) et via `yarn db:check`.
// Rôle : vérifie la cohérence entre drizzle/meta/_journal.json, les fichiers .sql, la chaîne des
// snapshots (prevId) et, avec --db, le registre drizzle.__drizzle_migrations de la base cible.
// Source : le dossier drizzle/ et DATABASE_URL (lecture seule).
// Pièges : le migrator de drizzle saute en silence toute entrée du journal dont `when` est <= au
// plus grand created_at déjà appliqué, et ne vérifie pas les hashes. D'où les contrôles de `when`
// et de présence au registre. Les exceptions connues sont listées ci-dessous : les retirer quand
// le journal ou la base sont corrigés.
// Appelants : vercel.json (buildCommand), package.json (db:check), tests/migrations-guard.test.js.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

// Entrées dont `when` est inférieur à une entrée précédente (horodatage saisi à la main).
export const LEGACY_NON_MONOTONIC = new Set([
  '0010_interests_enrichment',
  '0011_declaration_snapshots',
]);
// Fichiers modifiés après application : le hash du registre prod ne correspond plus au fichier.
export const LEGACY_HASH_MISMATCH = new Set(['0019_early_crusher_hogan']);

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

// Lit le dossier drizzle/ : journal, noms des .sql, snapshots (id, prevId) et hashes des fichiers.
export function loadMigrationFiles(root = ROOT) {
  const drizzleDir = resolve(root, 'drizzle');
  const journal = JSON.parse(
    readFileSync(resolve(drizzleDir, 'meta/_journal.json'), 'utf-8'),
  ).entries;
  const sqlTags = readdirSync(drizzleDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.slice(0, -'.sql'.length));
  const snapshots = {};
  const hashes = {};
  for (const entry of journal) {
    const snapPath = resolve(
      drizzleDir,
      'meta',
      `${String(entry.idx).padStart(4, '0')}_snapshot.json`,
    );
    if (existsSync(snapPath)) {
      const snap = JSON.parse(readFileSync(snapPath, 'utf-8'));
      snapshots[entry.idx] = { id: snap.id, prevId: snap.prevId };
    }
    const sqlPath = resolve(drizzleDir, `${entry.tag}.sql`);
    if (existsSync(sqlPath)) {
      hashes[entry.tag] = sha256(readFileSync(sqlPath, 'utf-8'));
    }
  }
  return { journal, sqlTags, snapshots, hashes };
}

// Contrôles sans base : journal, fichiers, snapshots, ordre des `when`.
export function validateFiles({ journal, sqlTags, snapshots }) {
  const errors = [];
  const tags = new Set(sqlTags);
  const journalTags = new Set();
  let maxWhen = -Infinity;

  journal.forEach((entry, i) => {
    if (journalTags.has(entry.tag)) {
      errors.push(`${entry.tag} : tag en double dans le journal`);
    }
    journalTags.add(entry.tag);

    if (entry.idx !== i) {
      errors.push(`${entry.tag} : idx ${entry.idx} à la position ${i}`);
    }
    if (!tags.has(entry.tag)) {
      errors.push(`${entry.tag} : fichier .sql absent`);
    }
    if (!Number.isInteger(entry.when) || entry.when <= 0) {
      errors.push(`${entry.tag} : when invalide (${entry.when})`);
    }

    const snap = snapshots[entry.idx];
    if (!snap) {
      errors.push(`${entry.tag} : snapshot absent`);
    } else {
      const expectedPrev =
        i === 0 ? ZERO_UUID : snapshots[journal[i - 1].idx]?.id;
      if (snap.prevId !== expectedPrev) {
        errors.push(
          `${entry.tag} : prevId du snapshot ne pointe pas sur le précédent`,
        );
      }
    }

    if (!LEGACY_NON_MONOTONIC.has(entry.tag) && entry.when <= maxWhen) {
      errors.push(
        `${entry.tag} : when ${entry.when} <= plus grand when précédent (${maxWhen}), le migrator la sautera en prod`,
      );
    }
    maxWhen = Math.max(maxWhen, entry.when);
  });

  for (const tag of tags) {
    if (!journalTags.has(tag)) {
      errors.push(`${tag}.sql : absent du journal`);
    }
  }
  return errors;
}

// Contrôles contre le registre de la base : `rows` = lignes de drizzle.__drizzle_migrations.
export function validateRegistry({ journal, rows, hashes }) {
  const errors = [];
  const applied = new Map(rows.map((r) => [String(r.created_at), r.hash]));
  const maxApplied = Math.max(
    -Infinity,
    ...rows.map((r) => Number(r.created_at)),
  );

  for (const entry of journal) {
    const hash = applied.get(String(entry.when));
    if (hash === undefined) {
      if (entry.when <= maxApplied) {
        errors.push(
          `${entry.tag} : absente du registre alors qu'une entrée plus récente est appliquée, le migrator la sautera`,
        );
      }
      continue;
    }
    if (hash !== hashes[entry.tag] && !LEGACY_HASH_MISMATCH.has(entry.tag)) {
      errors.push(`${entry.tag} : hash du registre différent du fichier .sql`);
    }
  }

  const journalWhens = new Set(journal.map((e) => String(e.when)));
  for (const row of rows) {
    if (!journalWhens.has(String(row.created_at))) {
      errors.push(
        `registre : created_at ${row.created_at} absent du journal (migration retirée ou renommée)`,
      );
    }
  }
  return errors;
}

async function main() {
  const files = loadMigrationFiles();
  const errors = validateFiles(files);

  if (process.argv.includes('--db')) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      errors.push('DATABASE_URL absente : contrôle du registre impossible');
    } else {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(url);
      const [{ t }] =
        await sql`SELECT to_regclass('drizzle.__drizzle_migrations')::text AS t`;
      if (t === null) {
        console.log(
          'Registre absent (base vierge) : contrôle du registre ignoré.',
        );
      } else {
        const rows =
          await sql`SELECT created_at, hash FROM drizzle.__drizzle_migrations`;
        errors.push(
          ...validateRegistry({
            journal: files.journal,
            rows,
            hashes: files.hashes,
          }),
        );
      }
    }
  }

  if (errors.length > 0) {
    console.error(`Contrôle des migrations : ${errors.length} erreur(s)`);
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }
  console.log(`Contrôle des migrations : OK (${files.journal.length} entrées)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
