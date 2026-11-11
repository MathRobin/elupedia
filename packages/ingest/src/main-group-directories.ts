/**
 * Affichage de debug de la configuration des annuaires de groupes (ticket
 * #274) : valide `GROUP_DIRECTORY_SOURCES` puis liste les sources activées.
 * Lecture seule, aucun réseau.
 *
 * Usage : yarn --cwd packages/ingest debug:group-directories
 * Code de sortie 1 si la configuration est invalide.
 *
 * Appelle config/group-directories.ts.
 */
import {
  GROUP_DIRECTORY_SOURCES,
  getEnabledGroupDirectorySources,
  validateGroupDirectorySources,
} from './config/group-directories.js';

const errors = validateGroupDirectorySources(GROUP_DIRECTORY_SOURCES);
if (errors.length > 0) {
  console.error(`Configuration invalide (${errors.length} erreur(s)) :`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const enabled = getEnabledGroupDirectorySources(GROUP_DIRECTORY_SOURCES);
const disabledCount = GROUP_DIRECTORY_SOURCES.length - enabled.length;

console.log(
  `${GROUP_DIRECTORY_SOURCES.length} source(s) configurée(s), ` +
    `${enabled.length} activée(s), ${disabledCount} désactivée(s).`,
);

if (enabled.length === 0) {
  console.log(
    'Aucune source activée (tableau du ticket #273 non reporté dans la config).',
  );
}

for (const source of enabled) {
  console.log(
    `- ${source.groupCode} · ${source.groupName} · ${source.listUrl}` +
      (source.followsToDetailPage
        ? ' (liens sur la fiche)'
        : ' (liens sur la liste)'),
  );
}
