/**
 * Point d'entrée CLI de l'ingestion des annuaires de groupes parlementaires
 * (tickets #276 et #277) : rapprochement puis écriture des liens en `pending`.
 *
 * Usage :
 *   yarn --cwd packages/ingest ingest:group-directories --dry-run   # plan seul
 *   yarn --cwd packages/ingest ingest:group-directories             # écrit en base
 *
 * Écrit dans external_links et data_provenance (sauf --dry-run). Lit les
 * sources activées de config/group-directories.ts. Code de sortie 1 si la
 * configuration est invalide.
 *
 * Appelle run-group-directories.ts avec les fetchs réels, la base via
 * drizzleLinkStore et loadGroupOfficialIndex.
 */
import { createDb } from '@elupedia/shared';
import {
  GROUP_DIRECTORY_SOURCES,
  getEnabledGroupDirectorySources,
  validateGroupDirectorySources,
} from './config/group-directories.js';
import { loadGroupOfficialIndex } from './group-directory-matching.js';
import { runGroupDirectories } from './run-group-directories.js';
import {
  fetchGroupMemberList,
  fetchPage,
} from './sources/group-directory-member-list.js';
import { drizzleLinkStore } from './upsert/group-directory-links.js';

const DELAY_MS = 3000;

const errors = validateGroupDirectorySources(GROUP_DIRECTORY_SOURCES);
if (errors.length > 0) {
  console.error(`Configuration invalide (${errors.length} erreur(s)) :`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const db = createDb();
const summaries = await runGroupDirectories(
  getEnabledGroupDirectorySources(GROUP_DIRECTORY_SOURCES),
  {
    fetchMemberList: fetchGroupMemberList,
    fetchPage,
    index: await loadGroupOfficialIndex(db),
    store: drizzleLinkStore(db),
    delayMs: DELAY_MS,
    today: new Date().toISOString().slice(0, 10),
    dryRun,
  },
);

console.log(dryRun ? 'Mode dry-run : aucune écriture.' : 'Écriture en base.');
for (const s of summaries) {
  const rate =
    s.entries === 0 ? 'n/a' : `${Math.round((s.resolved / s.entries) * 100)} %`;
  console.log(
    `${s.groupCode} : ${s.entries} entrée(s), ${s.resolved} rapprochée(s) ` +
      `(${s.exact} exact, ${s.probable} probable), taux ${rate}, ` +
      `${s.pagesFetched} fiche(s), ${s.linksFound} lien(s) trouvé(s)` +
      (dryRun
        ? `, ${s.wouldCreate} créé(s) en écriture`
        : `, ${s.created} créé(s), ${s.skipped} ignoré(s)`) +
      (s.error ? ` — ERREUR : ${s.error}` : ''),
  );
}

const failed = summaries.filter((s) => s.error !== null).length;
if (failed > 0) {
  console.error(`${failed} groupe(s) en erreur.`);
  process.exit(1);
}
