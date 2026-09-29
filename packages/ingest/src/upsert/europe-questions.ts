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
// La limite documentée est 500 requêtes / 5 min, soit 600ms/requête en
// moyenne soutenue. Ce pipeline fait 1 requête liste + jusqu'à pageSize
// requêtes détail par page (bien plus que les autres étapes europe, qui
// restent sous la limite même à 150ms) : 700ms de marge évite le 429
// constaté en conditions réelles (29/09/2026) avec un délai trop court.
const RATE_LIMIT_DELAY_MS = 700;
// Après ce nombre d'échecs consécutifs sur le détail d'une question, on
// suppose un rate-limit ou une panne systémique côté API plutôt qu'un
// problème isolé à ce document : continuer à tenter les items suivants un
// par un ne ferait qu'aggraver la situation (cf. incident du 29/09/2026).
const MAX_CONSECUTIVE_FAILURES = 5;

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
  /** Surcharge RATE_LIMIT_DELAY_MS — utilisé par les tests pour ne pas attendre 700ms par requête simulée. */
  rateLimitDelayMs?: number;
}

export async function upsertEuropeQuestions(
  db: NeonHttpDatabase,
  opts: EuropeQuestionsOptions = {},
): Promise<EuropeQuestionsSummary> {
  // L'ingestion Parlement européen tourne une fois par semaine (Dagu,
  // dagu-dags/ingest-europe.yaml) : un budget trop bas mettrait des mois à
  // couvrir l'ensemble des questions du Parlement (pas de filtre serveur par
  // auteur, cf. sources/parlement-europeen-questions.ts). À 700ms/requête
  // (cf. RATE_LIMIT_DELAY_MS, revu à la hausse après un 429 constaté en
  // conditions réelles le 29/09/2026), 1500 documents scannés par run prend
  // ~20-25 min — compromis entre couverture raisonnable en quelques
  // semaines et durée d'exécution d'une tâche planifiée.
  const pageSize = opts.pageSize ?? 50;
  const maxPages = opts.maxPages ?? 30;
  const fetchFn = opts.fetchFn ?? fetch;
  const rateLimitDelayMs = opts.rateLimitDelayMs ?? RATE_LIMIT_DELAY_MS;

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

  // Ce run ne doit jamais faire remonter d'exception : `runStep` (côté
  // run-europe.ts) rejoue l'intégralité de la fonction en cas d'erreur, ce
  // qui reprendrait tout le parcours depuis l'offset chargé plus haut —
  // aggravant un rate-limit au lieu de s'en remettre. Toute panne
  // persistante est donc absorbée ici : on arrête proprement, on sauvegarde
  // la progression réelle (jamais au-delà de la page en échec), et on
  // retourne un résumé partiel plutôt que de lever.
  let consecutiveFailures = 0;
  let stoppedEarly = false;

  pageLoop: for (let page = 0; page < maxPages; page++) {
    let items;
    try {
      items = await fetchQuestionsListPage(offset, pageSize, fetchFn);
    } catch (error) {
      logger.warn(
        `  Échec de récupération de la liste à l'offset ${offset}, arrêt du run (reprise au même offset la prochaine fois) : ${error instanceof Error ? error.message : String(error)}`,
      );
      stoppedEarly = true;
      break;
    } finally {
      await sleep(rateLimitDelayMs);
    }
    if (items.length === 0) {
      summary.exhausted = true;
      break;
    }

    for (const item of items) {
      summary.scanned++;

      let detail;
      try {
        detail = await fetchQuestionDetail(item.identifier, fetchFn);
        consecutiveFailures = 0;
      } catch (error) {
        consecutiveFailures++;
        logger.warn(
          `  Échec de récupération de ${item.identifier}, ignorée (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}) : ${error instanceof Error ? error.message : String(error)}`,
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logger.warn(
            `  ${MAX_CONSECUTIVE_FAILURES} échecs consécutifs, arrêt du run (reprise à l'offset ${offset}) — probable rate-limit ou panne côté API`,
          );
          stoppedEarly = true;
          break pageLoop;
        }
        continue;
      } finally {
        await sleep(rateLimitDelayMs);
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

    // Atteint uniquement si la page a été traitée jusqu'au bout : les deux
    // arrêts anticipés ci-dessus sortent de la boucle avant cette ligne.
    offset += items.length;
  }

  summary.cursorEnd = summary.exhausted ? 0 : offset;
  await saveCursor(db, summary.cursorEnd);

  logger.info(
    `Parlement européen questions : ${summary.scanned} document(s) parcouru(s), ${summary.matched} avec un·e auteur·rice français·e, ${summary.created} créée(s), ${summary.skipped} déjà en base` +
      (summary.exhausted
        ? ' — fin du jeu de données atteinte, le curseur repart à 0'
        : stoppedEarly
          ? ` — arrêt anticipé, curseur à ${summary.cursorEnd} pour le prochain run`
          : ` — curseur à ${summary.cursorEnd} pour le prochain run`),
  );

  return summary;
}
