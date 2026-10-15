/**
 * Script temporaire — backfill des mandats de maires antérieurs à la
 * création de la base (22/08/2026).
 *
 * La base n'a jamais observé l'état du RNE avant cette date : les maires
 * réélus ou remplacés entre l'élection municipale de mars 2026 et
 * aujourd'hui n'ont donc aucune trace de leur mandat précédent (2020-2026).
 * On reconstruit cet historique à partir des versions passées du CSV RNE,
 * retrouvées via la Wayback Machine (la plus ancienne capture disponible
 * remonte à juillet 2025 — impossible de remonter avant).
 *
 * Le format du CSV a changé plusieurs fois sur la période observée
 * (dates DD/MM/YYYY puis ISO, codes parfois non paddés, champs parfois
 * entre guillemets) : le parsing ci-dessous est délibérément plus
 * tolérant que celui de l'ingestion courante (sources/rne-maires.ts).
 *
 * Pour chaque commune, on reconstruit la séquence des mandats distincts
 * observés à travers les snapshots, et on insère un mandat déjà clos pour
 * chaque segment sauf le dernier (le mandat en cours, déjà géré par
 * l'ingestion normale). Idempotent : une ligne déjà présente est simplement
 * ignorée (contrainte unique officialId+type+startDate).
 *
 * Usage: npx tsx --env-file=../../.env src/backfill-mayor-history.ts [--apply]
 *   (pas de script yarn ni de main-*.ts : script ponctuel, hors convention
 *   main/run du package)
 *
 * Par défaut le script tourne en dry-run. Passer --apply pour écrire en base.
 */
import { createDb, officials, mandates } from '@elupedia/shared';
import { logger } from './logger.js';

const RNE_RESOURCE_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503';
const CDX_API_URL = 'https://web.archive.org/cdx/search/cdx';
// Capture la date (YYYYMMDD) de publication dans l'URL statique data.gouv.fr
// vers laquelle redirige chaque capture Wayback.
const STATIC_URL_PATTERN =
  /static\.data\.gouv\.fr\/resources\/repertoire-national-des-elus-1\/(\d{8})-\d{6}\/elus-maires?-mai\.csv/;

// Une capture avec moins de maires que ça est un fichier tronqué/partiel.
const MIN_MAYORS_PER_SNAPSHOT = 1000;
// Pauses de politesse entre appels Wayback (résolution d'URL / téléchargement).
const DELAY_BETWEEN_CDX_LOOKUPS_MS = 500;
const DELAY_BETWEEN_SNAPSHOT_DOWNLOADS_MS = 1000;
// Nombre de mandats listés en dry-run.
const DRY_RUN_PREVIEW_LIMIT = 30;

interface HistoricalMaire {
  departmentName: string;
  communeName: string;
  lastName: string;
  firstName: string;
  birthDate: string;
  mandateStartDate: string;
  functionStartDate: string;
}

/** État du RNE à une date : maire par code commune (5 caractères). */
interface Snapshot {
  date: string;
  mayors: Map<string, HistoricalMaire>;
}

/** DD/MM/YYYY → YYYY-MM-DD ; toute autre forme (déjà ISO, vide) est rendue telle quelle. */
function toIsoDate(date: string): string {
  const match = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : date;
}

function stripQuotes(s: string): string {
  return s.trim().replace(/^"|"$/g, '');
}

// Colonnes du CSV RNE maires (séparateur « ; ») : 1 = département,
// 4 = code commune, 5 = nom commune, 6 = nom, 7 = prénom, 9 = naissance,
// 12 = début du mandat, 13 = début de la fonction.
function parseHistoricalCsvRow(line: string): HistoricalMaire | undefined {
  const cols = line.split(';').map(stripQuotes);
  if (cols.length < 14) return undefined;

  const communeCode = cols[4]?.padStart(5, '0');
  const lastName = cols[6];
  const firstName = cols[7];
  const birthDateRaw = cols[9];
  if (!communeCode || !lastName || !firstName || !birthDateRaw) {
    return undefined;
  }

  return {
    departmentName: cols[1] ?? '',
    communeName: cols[5] ?? '',
    lastName,
    firstName,
    birthDate: toIsoDate(birthDateRaw),
    mandateStartDate: toIsoDate(cols[12] ?? ''),
    functionStartDate: toIsoDate((cols[13] ?? '').replace(/\r$/, '')),
  };
}

function communeCodeOf(line: string): string | undefined {
  return line.split(';')[4]?.trim().padStart(5, '0');
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 5,
  delayMs = 3000,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, init);
      // Wayback/CDX renvoient parfois des 5xx transitoires sous charge —
      // ce n'est pas une exception, donc pas retenté sans ce check.
      if (response.status >= 500 && attempt < attempts - 1) {
        lastError = new Error(`HTTP ${response.status}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

/**
 * Résout, pour chaque capture Wayback du CSV RNE, l'URL statique
 * data.gouv.fr qu'elle référence. On sert ensuite le contenu depuis le
 * cache Wayback (id_) plutôt que l'URL statique en direct : data.gouv.fr
 * ne conserve pas indéfiniment les anciennes versions.
 */
async function discoverSnapshotUrls(): Promise<
  { date: string; fetchUrl: string }[]
> {
  const cdxUrl = `${CDX_API_URL}?url=${encodeURIComponent(RNE_RESOURCE_URL)}&output=text&fl=timestamp,digest&collapse=digest`;
  // L'API CDX de Wayback est particulièrement instable (5xx fréquents) —
  // plus de tentatives et un backoff plus long que pour les autres appels.
  const cdxResponse = await fetchWithRetry(cdxUrl, {}, 10, 8000);
  if (!cdxResponse.ok) {
    throw new Error(`CDX API error: ${cdxResponse.status}`);
  }
  const text = await cdxResponse.text();
  // Une ligne « timestamp digest » par capture au contenu distinct.
  const timestamps = text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(' ')[0]);
  logger.info(`CDX API: ${timestamps.length} captures trouvées`);

  // Plusieurs captures peuvent pointer vers la même version publiée : on
  // dédoublonne par date de publication (la dernière capture vue gagne).
  const byDate = new Map<string, string>();
  for (const timestamp of timestamps) {
    try {
      const redirect = await fetchWithRetry(
        `https://web.archive.org/web/${timestamp}id_/${RNE_RESOURCE_URL}`,
        { redirect: 'manual' },
      );
      const location = redirect.headers.get('location');
      const match = location?.match(STATIC_URL_PATTERN);
      if (match) {
        const dateDigits = match[1];
        const date = `${dateDigits.slice(0, 4)}-${dateDigits.slice(4, 6)}-${dateDigits.slice(6, 8)}`;
        byDate.set(date, location!);
      }
    } catch (error) {
      logger.warn(
        `  ${timestamp}: ${error instanceof Error ? error.message : String(error)} — skipped`,
      );
    }
    await new Promise((resolve) =>
      setTimeout(resolve, DELAY_BETWEEN_CDX_LOOKUPS_MS),
    );
  }

  return [...byDate.entries()]
    .map(([date, fetchUrl]) => ({ date, fetchUrl }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Télécharge et parse une version du CSV ; `null` si indisponible. */
async function fetchSnapshot(
  fetchUrl: string,
): Promise<Map<string, HistoricalMaire> | null> {
  try {
    const response = await fetchWithRetry(fetchUrl, {
      redirect: 'follow',
      headers: { 'Accept-Encoding': 'gzip, deflate' },
    });
    if (!response.ok) {
      logger.warn(`  HTTP ${response.status} — skipped`);
      return null;
    }
    const text = await response.text();
    const lines = text.split('\n');
    const mayors = new Map<string, HistoricalMaire>();
    // i = 1 : saute la ligne d'en-tête.
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const code = communeCodeOf(line);
      const maire = parseHistoricalCsvRow(line);
      if (code && maire) mayors.set(code, maire);
    }
    return mayors;
  } catch (error) {
    logger.warn(
      `  ${error instanceof Error ? error.message : String(error)} — skipped`,
    );
    return null;
  }
}

/** Identité d'une personne à travers les snapshots : nom, prénom, naissance. */
function maireKey(maire: HistoricalMaire): string {
  return `${maire.firstName.toLowerCase()}|${maire.lastName.toLowerCase()}|${maire.birthDate}`;
}

function slugify(firstName: string, lastName: string): string {
  return `${firstName}-${lastName}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Code SQLSTATE 23505 = unique_violation, parfois enfoui dans error.cause
// par drizzle.
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && (error as { code?: unknown }).code === '23505') {
    return true;
  }
  if ('cause' in error) {
    return isUniqueViolation((error as { cause?: unknown }).cause);
  }
  return false;
}

/** Un maire observé à la tête d'une commune à partir d'une date. */
interface Term {
  maire: HistoricalMaire;
  startDate: string;
}

interface PendingMandate {
  officialId: string;
  district: string;
  department: string;
  communeCode: string;
  startDate: string;
  endDate: string;
}

interface NewOfficial {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  slug: string;
}

const DRY_RUN = !process.argv.includes('--apply');
// Taille des INSERT groupés (limite de taille de requête du driver HTTP).
const INSERT_BATCH_SIZE = 300;

async function run() {
  logger.info('=== Backfill des mandats de maires (historique pré-DB) ===');
  if (DRY_RUN) logger.info('Mode DRY-RUN — passer --apply pour écrire en base');
  logger.info('');

  const urls = await discoverSnapshotUrls();
  logger.info(
    `${urls.length} versions historiques distinctes : ${urls.map((u) => u.date).join(', ')}\n`,
  );

  const snapshots: Snapshot[] = [];
  for (const { date, fetchUrl } of urls) {
    logger.info(`Téléchargement ${date}...`);
    const mayors = await fetchSnapshot(fetchUrl);
    if (mayors && mayors.size > MIN_MAYORS_PER_SNAPSHOT) {
      snapshots.push({ date, mayors });
      logger.info(`  ${mayors.size} maires`);
    }
    await new Promise((resolve) =>
      setTimeout(resolve, DELAY_BETWEEN_SNAPSHOT_DOWNLOADS_MS),
    );
  }

  if (snapshots.length < 2) {
    logger.info('\nPas assez de versions exploitables — abandon.');
    return;
  }

  const db = createDb();
  const allOfficials = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      birthDate: officials.birthDate,
      slug: officials.slug,
    })
    .from(officials);

  // Même clé que maireKey(), côté base.
  const officialByKey = new Map<string, string>();
  for (const official of allOfficials) {
    officialByKey.set(
      `${official.firstName.toLowerCase()}|${official.lastName.toLowerCase()}|${official.birthDate ?? ''}`,
      official.id,
    );
  }
  logger.info(
    `\n${officialByKey.size} officials chargés pour le rapprochement\n`,
  );

  // Slugs existants + ceux attribués pendant ce run, pour garantir l'unicité
  // des nouvelles fiches (suffixe -1, -2… en cas de collision).
  const slugSet = new Set(
    allOfficials
      .filter((official) => official.slug)
      .map((official) => official.slug!),
  );
  function uniqueSlug(base: string): string {
    if (!slugSet.has(base)) {
      slugSet.add(base);
      return base;
    }
    let suffix = 1;
    while (slugSet.has(`${base}-${suffix}`)) suffix++;
    const slug = `${base}-${suffix}`;
    slugSet.add(slug);
    return slug;
  }

  const communeCodes = new Set<string>();
  for (const snapshot of snapshots) {
    for (const code of snapshot.mayors.keys()) communeCodes.add(code);
  }

  const summary = { toInsert: 0, newOfficials: 0, badDates: 0 };
  const pending: PendingMandate[] = [];
  const newOfficials: NewOfficial[] = [];

  for (const communeCode of communeCodes) {
    // Séquence des maires successifs de la commune : un nouveau terme à
    // chaque changement de personne ou de date de prise de fonction.
    const terms: Term[] = [];
    for (const snapshot of snapshots) {
      const maire = snapshot.mayors.get(communeCode);
      if (!maire) continue;
      // functionStartDate (date à laquelle CETTE personne a pris la
      // fonction de maire) plutôt que mandateStartDate (date d'élection du
      // conseil municipal, inchangée lors d'un remplacement en cours de
      // mandat — ex. démission). Utiliser mandateStartDate en priorité
      // attribuait par erreur le mandat du prédécesseur au successeur.
      const startDate = maire.functionStartDate || maire.mandateStartDate;
      if (!startDate) continue;

      const last = terms[terms.length - 1];
      if (
        !last ||
        maireKey(last.maire) !== maireKey(maire) ||
        last.startDate !== startDate
      ) {
        terms.push({ maire, startDate });
      }
    }

    // Le dernier terme observé est censé être le mandat en cours, déjà
    // géré par l'ingestion normale — on ne backfill que les segments
    // intermédiaires (mandats déjà clos entre deux termes consécutifs).
    for (let i = 0; i < terms.length - 1; i++) {
      const term = terms[i];
      const next = terms[i + 1];

      // Plage vide ou inversée (dates incohérentes entre deux versions du
      // CSV) : on préfère ne rien insérer.
      if (term.startDate >= next.startDate) {
        summary.badDates++;
        continue;
      }

      const key = maireKey(term.maire);
      let officialId = officialByKey.get(key);
      if (!officialId) {
        officialId = crypto.randomUUID();
        const slug = uniqueSlug(
          slugify(term.maire.firstName, term.maire.lastName),
        );
        newOfficials.push({
          id: officialId,
          firstName: term.maire.firstName,
          lastName: term.maire.lastName,
          birthDate: term.maire.birthDate,
          slug,
        });
        officialByKey.set(key, officialId);
        summary.newOfficials++;
      }

      pending.push({
        officialId,
        district: term.maire.communeName,
        department: term.maire.departmentName,
        communeCode,
        startDate: term.startDate,
        endDate: next.startDate,
      });
      summary.toInsert++;
    }
  }

  logger.info(
    `${summary.toInsert} mandats à backfiller, ${summary.newOfficials} nouveaux officials à créer (maires non réélus, absents de la base), ${summary.badDates} dates incohérentes\n`,
  );

  if (DRY_RUN) {
    for (const mandate of pending.slice(0, DRY_RUN_PREVIEW_LIMIT)) {
      logger.info(
        `  [dry-run] ${mandate.district} (${mandate.communeCode}) : ${mandate.startDate} → ${mandate.endDate}`,
      );
    }
    if (pending.length > DRY_RUN_PREVIEW_LIMIT) {
      logger.info(`  … et ${pending.length - DRY_RUN_PREVIEW_LIMIT} de plus`);
    }
    return;
  }

  // Les fiches d'abord : les mandats les référencent (clé étrangère).

  let officialsInserted = 0;
  for (let start = 0; start < newOfficials.length; start += INSERT_BATCH_SIZE) {
    const batch = newOfficials.slice(start, start + INSERT_BATCH_SIZE);
    await db.insert(officials).values(batch);
    officialsInserted += batch.length;
    logger.info(
      `  officials: ${start + batch.length}/${newOfficials.length} créés`,
    );
  }

  let inserted = 0;
  let skipped = 0;
  for (let start = 0; start < pending.length; start += INSERT_BATCH_SIZE) {
    const batch = pending.slice(start, start + INSERT_BATCH_SIZE);
    try {
      await db.insert(mandates).values(
        batch.map((mandate) => ({
          officialId: mandate.officialId,
          type: 'maire',
          district: mandate.district,
          department: mandate.department,
          communeCode: mandate.communeCode,
          startDate: mandate.startDate,
          endDate: mandate.endDate,
        })),
      );
      inserted += batch.length;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Un doublon dans le lot : on retente ligne à ligne pour ne perdre
      // que les vraies collisions.
      for (const mandate of batch) {
        try {
          await db.insert(mandates).values({
            officialId: mandate.officialId,
            type: 'maire',
            district: mandate.district,
            department: mandate.department,
            communeCode: mandate.communeCode,
            startDate: mandate.startDate,
            endDate: mandate.endDate,
          });
          inserted++;
        } catch (rowError) {
          if (isUniqueViolation(rowError)) {
            skipped++;
          } else {
            throw rowError;
          }
        }
      }
    }
    logger.info(`  mandats: ${start + batch.length}/${pending.length} traités`);
  }

  logger.info(
    `\n=== Terminé : ${officialsInserted} officials créés, ${inserted} mandats insérés, ${skipped} déjà existants ===`,
  );
}

run().catch((error) => {
  logger.error(`Backfill failed: ${error}`);
  process.exit(1);
});
