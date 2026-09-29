import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import {
  officials,
  parliamentaryActivity,
  dataProvenance,
} from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import {
  fetchQuestionsListPage,
  fetchQuestionDetail,
} from '../sources/parlement-europeen-questions.js';
import { logger } from '../logger.js';

const CURSOR_SOURCE_TABLE = 'europarl_questions_cursor';
const CURSOR_RECORD_ID = 'cursor';
const SOURCE_NAME = 'Parlement européen - Open Data API';
const LEGAL_BASIS = 'Licence CC BY 4.0 - data.europarl.europa.eu';
const RATE_LIMIT_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pas de filtre serveur par auteur ni de total exposé par l'API (vérifié en
// conditions réelles) : le seul mode d'accès est un parcours paginé de la
// liste complète des questions, avec récupération du détail de chacune pour
// en connaître l'auteur. Le curseur (offset) est persisté dans
// data_provenance pour reprendre où le run précédent s'est arrêté plutôt que
// de tout re-parcourir à chaque exécution — même logique que les séances
// europarl de M24T4, à plus grande échelle. Une fois la fin du jeu de
// données atteinte, le curseur repart à 0 pour détecter les nouvelles
// questions publiées depuis.
async function loadCursor(db: NeonHttpDatabase): Promise<number> {
  const [row] = await db
    .select({ rawData: dataProvenance.rawData })
    .from(dataProvenance)
    .where(
      and(
        eq(dataProvenance.sourceTable, CURSOR_SOURCE_TABLE),
        eq(dataProvenance.sourceRecordId, CURSOR_RECORD_ID),
      ),
    )
    .limit(1);
  const raw = row?.rawData as { offset?: number } | null;
  return raw?.offset ?? 0;
}

async function saveCursor(db: NeonHttpDatabase, offset: number): Promise<void> {
  await db
    .delete(dataProvenance)
    .where(
      and(
        eq(dataProvenance.sourceTable, CURSOR_SOURCE_TABLE),
        eq(dataProvenance.sourceRecordId, CURSOR_RECORD_ID),
      ),
    );
  await db.insert(dataProvenance).values({
    sourceTable: CURSOR_SOURCE_TABLE,
    sourceRecordId: CURSOR_RECORD_ID,
    sourceName: SOURCE_NAME,
    sourceUrl: 'https://data.europarl.europa.eu/api/v2/parliamentary-questions',
    legalBasis: LEGAL_BASIS,
    rawData: { offset },
    fetchedAt: new Date(),
  });
}

export interface EuropeQuestionsSummary {
  scanned: number;
  matched: number;
  created: number;
  skipped: number;
  cursorEnd: number;
  exhausted: boolean;
}

export interface EuropeQuestionsOptions {
  pageSize?: number;
  maxPages?: number;
  fetchFn?: typeof fetch;
}

export async function upsertEuropeQuestions(
  db: NeonHttpDatabase,
  opts: EuropeQuestionsOptions = {},
): Promise<EuropeQuestionsSummary> {
  // L'ingestion Parlement européen tourne une fois par semaine (Dagu,
  // dagu-dags/ingest-europe.yaml) : un budget trop bas mettrait des mois à
  // couvrir l'ensemble des questions du Parlement (pas de filtre serveur par
  // auteur, cf. sources/parlement-europeen-questions.ts). 3000 documents
  // scannés par run est un compromis entre couverture raisonnable en
  // quelques semaines et durée d'exécution d'une tâche planifiée.
  const pageSize = opts.pageSize ?? 50;
  const maxPages = opts.maxPages ?? 60;
  const fetchFn = opts.fetchFn ?? fetch;

  const officialRows = await db
    .select({ id: officials.id, europarlId: officials.europarlId })
    .from(officials);
  const officialByPersonId = new Map<string, string>();
  for (const o of officialRows) {
    if (o.europarlId) officialByPersonId.set(`person/${o.europarlId}`, o.id);
  }

  const summary: EuropeQuestionsSummary = {
    scanned: 0,
    matched: 0,
    created: 0,
    skipped: 0,
    cursorEnd: 0,
    exhausted: false,
  };

  // Lues une seule fois (comme pour conseillers-fde/membres-afe) plutôt
  // qu'une requête par question : le volume par run (jusqu'à pageSize *
  // maxPages) rendrait une vérification d'existence par item coûteuse pour
  // un gain nul, la table entière des activités europarl restant petite face
  // au nombre d'officials.
  const existingEuroparlActivities = await db
    .select({
      officialId: parliamentaryActivity.officialId,
      title: parliamentaryActivity.title,
      date: parliamentaryActivity.date,
    })
    .from(parliamentaryActivity)
    .where(eq(parliamentaryActivity.source, 'europarl'));
  const existingKeys = new Set(
    existingEuroparlActivities.map(
      (a) => `${a.officialId}|${a.title}|${a.date}`,
    ),
  );

  let offset = await loadCursor(db);
  logger.info(
    `  Reprise du parcours des questions parlementaires PE à l'offset ${offset}`,
  );

  for (let page = 0; page < maxPages; page++) {
    const items = await fetchQuestionsListPage(offset, pageSize, fetchFn);
    await sleep(RATE_LIMIT_DELAY_MS);
    if (items.length === 0) {
      summary.exhausted = true;
      break;
    }

    for (const item of items) {
      summary.scanned++;

      let detail;
      try {
        detail = await fetchQuestionDetail(item.identifier, fetchFn);
      } catch (error) {
        logger.warn(
          `  Échec de récupération de ${item.identifier}, ignorée : ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      } finally {
        await sleep(RATE_LIMIT_DELAY_MS);
      }
      if (!detail) continue;

      const matchedOfficialIds = detail.authorPersonIds
        .map((pid) => officialByPersonId.get(pid))
        .filter((id): id is string => !!id);

      if (matchedOfficialIds.length === 0) continue;
      summary.matched++;

      for (const officialId of matchedOfficialIds) {
        const key = `${officialId}|${detail.title}|${detail.date}`;
        if (existingKeys.has(key)) {
          summary.skipped++;
          continue;
        }
        existingKeys.add(key);

        await db.insert(parliamentaryActivity).values({
          officialId,
          type: detail.type,
          source: 'europarl',
          title: detail.title,
          date: detail.date,
          responseDate: detail.responseDate,
          governmentComments: detail.addressee,
          sourceUrl: detail.sourceUrl,
        });
        summary.created++;
      }
    }

    offset += items.length;
  }

  summary.cursorEnd = summary.exhausted ? 0 : offset;
  await saveCursor(db, summary.cursorEnd);

  logger.info(
    `Parlement européen questions : ${summary.scanned} document(s) parcouru(s), ${summary.matched} avec un·e auteur·rice français·e, ${summary.created} créée(s), ${summary.skipped} déjà en base` +
      (summary.exhausted
        ? ' — fin du jeu de données atteinte, le curseur repart à 0'
        : ` — curseur à ${summary.cursorEnd} pour le prochain run`),
  );

  return summary;
}
