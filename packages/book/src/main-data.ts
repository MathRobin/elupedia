import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createDb } from '@elupedia/shared';
import {
  buildAgeTable,
  buildCampaignTable,
  buildDirectory,
  buildGroupTable,
  buildSenate2026Summary,
  buildSenateNuanceTable,
  buildSponsorshipsTable,
  type Directory,
  type Table,
} from './facts.js';
import {
  loadCampaignAccounts,
  loadDeputiesAge,
  loadDirectory,
  loadSenate2026,
  loadSenate2026Nuances,
  loadSponsorships,
  loadStaffersByGroup,
  loadWrittenQuestionsByGroup,
} from './queries.js';

/**
 * CLI : lit la base (lecture seule) et écrit `out/data.json`, les tableaux
 * du livre déjà formatés, que le gabarit Typst (`typst/main.typ`) affiche.
 *
 * Usage : yarn --cwd packages/book data [--out <fichier>]
 * Le fichier porte la date de génération (`asOf`) : c'est la date de gel des
 * données à rappeler en tête du livre.
 */

const DEFAULT_OUT = 'out/data.json';

export interface BookData {
  asOf: string;
  tables: Record<string, Table>;
  directory: Directory;
}

export async function buildBookData(): Promise<BookData> {
  const db = createDb();
  const [
    sponsorships,
    campaigns,
    staffers,
    questions,
    age,
    directory,
    senate,
    senateNuances,
  ] = await Promise.all([
    loadSponsorships(db),
    loadCampaignAccounts(db),
    loadStaffersByGroup(db),
    loadWrittenQuestionsByGroup(db),
    loadDeputiesAge(db),
    loadDirectory(db),
    loadSenate2026(db),
    loadSenate2026Nuances(db),
  ]);
  return {
    asOf: new Date().toISOString().slice(0, 10),
    tables: {
      parrainages: buildSponsorshipsTable(sponsorships),
      comptes: buildCampaignTable(campaigns),
      collaborateurs: buildGroupTable(staffers, 'Collaborateurs'),
      questions: buildGroupTable(questions, 'Questions écrites'),
      age: buildAgeTable(age),
      senatoriales: buildSenate2026Summary(senate),
      senatorialesNuances: buildSenateNuanceTable(senateNuances),
    },
    directory: buildDirectory(directory),
  };
}

export async function writeBookData(out: string): Promise<BookData> {
  const data = await buildBookData();
  const path = resolve(out);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return data;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { out: { type: 'string', default: DEFAULT_OUT } },
  });
  const data = await writeBookData(values.out!);
  console.log(
    `data.json écrit (${Object.keys(data.tables).length} tableaux, annuaire de ${data.directory.deputes.rows.length + data.directory.senateurs.rows.length + data.directory.eurodeputes.rows.length} parlementaires, données au ${data.asOf})`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
