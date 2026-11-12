/**
 * Debug du rapprochement des annuaires de groupes (ticket #276) : pour chaque
 * source activée, télécharge la page de liste, extrait les noms et affiche le
 * taux de rapprochement avec les fiches de la base.
 *
 * Lecture seule : réseau (pages publiques de l'Assemblée, une requête par
 * groupe, délai entre requêtes) et base (SELECT). N'écrit rien.
 *
 * Usage : yarn --cwd packages/ingest debug:group-directories:match
 * Affiche les entrées non résolues (nom + raison) pour le tri manuel.
 *
 * Appelle config/group-directories.ts, sources/group-directory-member-list.ts
 * (liste des membres via le bloc AJAX), sources/group-directory-social-links.ts
 * (extraction des noms) et group-directory-matching.ts.
 */
import { createDb } from '@elupedia/shared';
import {
  getEnabledGroupDirectorySources,
  GROUP_DIRECTORY_SOURCES,
} from './config/group-directories.js';
import { extractSocialLinks } from './sources/group-directory-social-links.js';
import { fetchGroupMemberList } from './sources/group-directory-member-list.js';
import {
  loadGroupOfficialIndex,
  matchOfficial,
} from './group-directory-matching.js';

const DELAY_MS = 3000;

const db = createDb();
const index = await loadGroupOfficialIndex(db);
const sources = getEnabledGroupDirectorySources(GROUP_DIRECTORY_SOURCES);

let totalEntries = 0;
let totalResolved = 0;

for (const [position, source] of sources.entries()) {
  if (position > 0) await new Promise((r) => setTimeout(r, DELAY_MS));

  console.log(`\n== ${source.groupCode} · ${source.groupName}`);
  let html: string;
  try {
    html = await fetchGroupMemberList(source.listUrl);
  } catch (error) {
    console.log(`  échec du téléchargement : ${(error as Error).message}`);
    continue;
  }

  const members = extractSocialLinks(html, source);
  const unresolved: string[] = [];
  let resolved = 0;
  let exact = 0;
  let probable = 0;

  for (const member of members) {
    if (member.name === null) {
      unresolved.push('(nom introuvable, sélecteur à revoir)');
      continue;
    }
    const result = matchOfficial(
      { name: member.name, groupCode: source.groupCode },
      index,
    );
    if (result.officialId) {
      resolved++;
      if (result.confidence === 'exact') exact++;
      else probable++;
    } else {
      unresolved.push(`${member.name} — ${result.reason}`);
    }
  }

  const rate =
    members.length === 0
      ? 'n/a'
      : `${Math.round((resolved / members.length) * 100)} %`;
  console.log(
    `  ${members.length} entrée(s), ${resolved} rapprochée(s) ` +
      `(${exact} exact, ${probable} probable), taux ${rate}`,
  );
  for (const line of unresolved) console.log(`  non résolu : ${line}`);

  totalEntries += members.length;
  totalResolved += resolved;
}

const globalRate =
  totalEntries === 0
    ? 'n/a'
    : `${Math.round((totalResolved / totalEntries) * 100)} %`;
console.log(
  `\nTotal : ${totalEntries} entrée(s), ${totalResolved} rapprochée(s), taux ${globalRate}`,
);
