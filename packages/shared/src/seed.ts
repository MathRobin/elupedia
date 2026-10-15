/**
 * Script de peuplement d'une base de développement vide (`yarn db:seed` à
 * la racine, via tsx avec `.env`).
 *
 * Insère trois député·es fictif·ves avec un mandat et une affiliation
 * chacun·e, pour avoir de quoi afficher sur le site sans lancer
 * l'ingestion. Aucune donnée réelle : identifiants AN `PA10000x` et photos
 * example.com inventés.
 *
 * Pièges : non idempotent (`officials.an_id` est unique, un second run
 * échoue) ; les noms Dupont/Martin/Leroy sont vérifiés par
 * `tests/migration-seed.test.js`.
 */
import { createDb } from './db.js';
import { officials } from './schema/officials.js';
import { mandates } from './schema/mandates.js';
import { affiliations } from './schema/affiliations.js';

async function seed() {
  const db = createDb();

  console.log('Seeding officials...');
  const [dupont, martin, leroy] = await db
    .insert(officials)
    .values([
      {
        firstName: 'Marie',
        lastName: 'Dupont',
        anId: 'PA100001',
        birthDate: '1975-03-14',
        photoUrl: 'https://example.com/photos/dupont.jpg',
      },
      {
        firstName: 'Jean',
        lastName: 'Martin',
        anId: 'PA100002',
        birthDate: '1968-11-22',
        photoUrl: 'https://example.com/photos/martin.jpg',
      },
      {
        firstName: 'Sophie',
        lastName: 'Leroy',
        anId: 'PA100003',
        birthDate: '1982-07-05',
        photoUrl: 'https://example.com/photos/leroy.jpg',
      },
    ])
    .returning();

  console.log('Seeding mandates...');
  await db.insert(mandates).values([
    {
      officialId: dupont!.id,
      type: 'depute',
      district: '3e circonscription',
      department: 'Gironde',
      startDate: '2022-06-19',
      politicalGroup: 'Renaissance',
    },
    {
      officialId: martin!.id,
      type: 'depute',
      district: '1re circonscription',
      department: 'Rhône',
      startDate: '2022-06-19',
      politicalGroup: 'LFI-NUPES',
    },
    {
      officialId: leroy!.id,
      type: 'depute',
      district: '5e circonscription',
      department: 'Paris',
      startDate: '2022-06-19',
      politicalGroup: 'Les Républicains',
    },
  ]);

  console.log('Seeding affiliations...');
  await db.insert(affiliations).values([
    {
      officialId: dupont!.id,
      partyOrGroup: 'Renaissance',
      startDate: '2022-06-19',
    },
    {
      officialId: martin!.id,
      partyOrGroup: 'La France Insoumise',
      startDate: '2022-06-19',
    },
    {
      officialId: leroy!.id,
      partyOrGroup: 'Les Républicains',
      startDate: '2022-06-19',
    },
  ]);

  console.log('Seed complete.');
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
