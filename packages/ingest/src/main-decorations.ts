/**
 * Point d'entrée CLI de l'ingestion des décorations (Légion d'honneur, Ordre
 * national du Mérite, Médaille militaire) depuis la base Léonore.
 *
 * Commande : `yarn --cwd packages/ingest ingest:decorations`
 *
 * Exception à la convention main/run du package : la logique est ici, sans
 * `run-decorations.ts` (script ancien, jamais découpé). Stratégie : Léonore
 * ne se cherche que par nom de famille, on fait donc une recherche par nom
 * distinct (et non par élu), puis on ne garde que les fiches dont le nom
 * correspond exactement et dont le prénom commence par celui d'un élu
 * portant ce nom. Les fiches retenues sont rattachées par
 * upsert/decorations.ts uniquement si la date de naissance publique de la
 * fiche est identique à celle de l'élu (voir decoration-match.ts) ; les
 * autres sont conservées sans official. Rattrapage d'anciens rattachements
 * à un nom seul : `reconcile:decorations`.
 */
import { createDb } from '@elupedia/shared';
import { officials } from '@elupedia/shared';
import { logger } from './logger.js';
import {
  reportFromCounts,
  writeChangeReport,
} from './utils/change-detector.js';
import {
  searchDecorations,
  fetchFicheDetail,
} from './sources/legion-honneur.js';
import {
  officialIndexKey,
  upsertDecorations,
  type OfficialCandidate,
} from './upsert/decorations.js';

// Pause entre deux recherches Léonore, pour ne pas saturer le service.
const DELAY_BETWEEN_SEARCHES_MS = 50;
// Fréquence (en nombre de noms traités) des lignes de progression.
const PROGRESS_LOG_EVERY = 200;

/** Forme comparable d'un nom : sans accents, minuscule, espaces/tirets unifiés. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim();
}

async function main() {
  const db = createDb();

  const allOfficials = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      birthDate: officials.birthDate,
    })
    .from(officials);

  logger.info(`${allOfficials.length} officials to look up`);

  // Regroupement par nom normalisé : une seule recherche Léonore par nom.
  const byLastName = new Map<string, typeof allOfficials>();
  for (const official of allOfficials) {
    const key = normalize(official.lastName);
    const list = byLastName.get(key) ?? [];
    list.push(official);
    byLastName.set(key, list);
  }

  logger.info(`${byLastName.size} unique last names`);

  // Index « nom|date de naissance » → fiches, consommé par upsertDecorations
  // pour le rattachement (les élus sans date de naissance n'y figurent pas).
  const officialIndex = new Map<string, OfficialCandidate[]>();
  for (const official of allOfficials) {
    if (!official.birthDate) continue;
    const key = officialIndexKey(official.lastName, official.birthDate);
    const list = officialIndex.get(key) ?? [];
    list.push({ id: official.id, firstName: official.firstName });
    officialIndex.set(key, list);
  }

  let searched = 0;
  let found = 0;
  let totalDecorations = 0;

  let errors = 0;

  for (const [normalizedLastName, officialsWithThisName] of byLastName) {
    try {
      const { results } = await searchDecorations(
        officialsWithThisName[0].lastName,
      );

      const firstNames = new Set(
        officialsWithThisName.map((official) => normalize(official.firstName)),
      );

      const batch: Parameters<typeof upsertDecorations>[1] = [];

      for (const searchResult of results) {
        // La recherche Léonore est floue : pré-filtre sur l'intitulé avant
        // de payer un appel détail par fiche.
        const resultName = normalize(searchResult.intitule);
        if (!resultName.startsWith(normalizedLastName)) continue;

        const detail = await fetchFicheDetail(searchResult.refUnique);
        if (!detail || detail.decorations.length === 0) continue;

        const detailLast = normalize(detail.lastName);
        if (detailLast !== normalizedLastName) continue;

        // Les fiches Léonore portent souvent tous les prénoms d'état civil
        // (« Jean Pierre Marie ») : on compare sur le premier prénom de l'élu
        // en préfixe. Un prénom vide des deux côtés est accepté.
        const detailFirst = normalize(detail.firstName ?? '');
        const matched = [...firstNames].some((firstName) => {
          if (!firstName || !detailFirst) return !firstName && !detailFirst;
          return detailFirst.startsWith(firstName.split(' ')[0]);
        });
        if (!matched) continue;

        batch.push(detail);
        found++;
        totalDecorations += detail.decorations.length;
      }

      if (batch.length > 0) {
        await upsertDecorations(db, batch, officialIndex);
      }
    } catch (error) {
      errors++;
      logger.warn(
        `  Error for "${officialsWithThisName[0].lastName}": ${error}`,
      );
    }

    searched++;
    if (searched % PROGRESS_LOG_EVERY === 0) {
      logger.info(
        `  Progress: ${searched}/${byLastName.size} names, ${found} matched, ${totalDecorations} decorations`,
      );
    }

    await new Promise((resolve) =>
      setTimeout(resolve, DELAY_BETWEEN_SEARCHES_MS),
    );
  }

  logger.info(
    `Done: ${found} officials matched, ${totalDecorations} decorations, ${errors} errors`,
  );
  return { found, totalDecorations, errors };
}

main()
  .then(({ found, totalDecorations, errors }) => {
    // Date et résultat du dernier run, lus par l'admin (page Ingestions) :
    // created = décorations trouvées, updated = élus rapprochés.
    writeChangeReport(
      reportFromCounts('decorations', {
        created: totalDecorations,
        updated: found,
        errors,
      }),
      'ingest-report-decorations.json',
    );
    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Decorations ingestion failed: ${error}`);
    process.exit(1);
  });
