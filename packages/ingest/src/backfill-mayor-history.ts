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
 *
 * Par défaut le script tourne en dry-run. Passer --apply pour écrire en base.
 */
import { createDb, officials, mandates } from '@elupedia/shared';
import { logger } from './logger.js';

const RNE_RESOURCE_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503';
const CDX_API_URL = 'https://web.archive.org/cdx/search/cdx';
const STATIC_URL_PATTERN =
  /static\.data\.gouv\.fr\/resources\/repertoire-national-des-elus-1\/(\d{8})-\d{6}\/elus-maires?-mai\.csv/;

interface HistoricalMaire {
  departmentName: string;
  communeName: string;
  lastName: string;
  firstName: string;
  birthDate: string;
  mandateStartDate: string;
  functionStartDate: string;
}

interface Snapshot {
  date: string;
  mayors: Map<string, HistoricalMaire>;
}

function toIsoDate(d: string): string {
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : d;
}

function stripQuotes(s: string): string {
  return s.trim().replace(/^"|"$/g, '');
}

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
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      // Wayback/CDX renvoient parfois des 5xx transitoires sous charge —
      // ce n'est pas une exception, donc pas retenté sans ce check.
      if (res.status >= 500 && i < attempts - 1) {
        lastError = new Error(`HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      return res;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, delayMs));
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
  const res = await fetchWithRetry(cdxUrl, {}, 10, 8000);
  if (!res.ok) throw new Error(`CDX API error: ${res.status}`);
  const text = await res.text();
  const timestamps = text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(' ')[0]);
  logger.info(`CDX API: ${timestamps.length} captures trouvées`);

  const byDate = new Map<string, string>();
  for (const ts of timestamps) {
    try {
      const res = await fetchWithRetry(
        `https://web.archive.org/web/${ts}id_/${RNE_RESOURCE_URL}`,
        { redirect: 'manual' },
      );
      const location = res.headers.get('location');
      const match = location?.match(STATIC_URL_PATTERN);
      if (match) {
        const d = match[1];
        const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        byDate.set(date, location!);
      }
    } catch (e) {
      logger.warn(
        `  ${ts}: ${e instanceof Error ? e.message : String(e)} — skipped`,
      );
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return [...byDate.entries()]
    .map(([date, fetchUrl]) => ({ date, fetchUrl }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchSnapshot(
  fetchUrl: string,
): Promise<Map<string, HistoricalMaire> | null> {
  try {
    const res = await fetchWithRetry(fetchUrl, {
      redirect: 'follow',
      headers: { 'Accept-Encoding': 'gzip, deflate' },
    });
    if (!res.ok) {
      logger.warn(`  HTTP ${res.status} — skipped`);
      return null;
    }
    const text = await res.text();
    const lines = text.split('\n');
    const mayors = new Map<string, HistoricalMaire>();
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const code = communeCodeOf(line);
      const maire = parseHistoricalCsvRow(line);
      if (code && maire) mayors.set(code, maire);
    }
    return mayors;
  } catch (e) {
    logger.warn(`  ${e instanceof Error ? e.message : String(e)} — skipped`);
    return null;
  }
}

function maireKey(m: HistoricalMaire): string {
  return `${m.firstName.toLowerCase()}|${m.lastName.toLowerCase()}|${m.birthDate}`;
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
    if (mayors && mayors.size > 1000) {
      snapshots.push({ date, mayors });
      logger.info(`  ${mayors.size} maires`);
    }
    await new Promise((r) => setTimeout(r, 1000));
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

  const officialByKey = new Map<string, string>();
  for (const o of allOfficials) {
    officialByKey.set(
      `${o.firstName.toLowerCase()}|${o.lastName.toLowerCase()}|${o.birthDate ?? ''}`,
      o.id,
    );
  }
  logger.info(
    `\n${officialByKey.size} officials chargés pour le rapprochement\n`,
  );

  const slugSet = new Set(
    allOfficials.filter((o) => o.slug).map((o) => o.slug!),
  );
  function uniqueSlug(base: string): string {
    if (!slugSet.has(base)) {
      slugSet.add(base);
      return base;
    }
    let i = 1;
    while (slugSet.has(`${base}-${i}`)) i++;
    const s = `${base}-${i}`;
    slugSet.add(s);
    return s;
  }

  const communeCodes = new Set<string>();
  for (const s of snapshots) {
    for (const code of s.mayors.keys()) communeCodes.add(code);
  }

  const summary = { toInsert: 0, newOfficials: 0, badDates: 0 };
  const pending: PendingMandate[] = [];
  const newOfficials: NewOfficial[] = [];

  for (const communeCode of communeCodes) {
    const terms: Term[] = [];
    for (const snapshot of snapshots) {
      const maire = snapshot.mayors.get(communeCode);
      if (!maire) continue;
      const startDate = maire.mandateStartDate || maire.functionStartDate;
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
    for (const p of pending.slice(0, 30)) {
      logger.info(
        `  [dry-run] ${p.district} (${p.communeCode}) : ${p.startDate} → ${p.endDate}`,
      );
    }
    if (pending.length > 30) {
      logger.info(`  … et ${pending.length - 30} de plus`);
    }
    return;
  }

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
        batch.map((p) => ({
          officialId: p.officialId,
          type: 'maire',
          district: p.district,
          department: p.department,
          communeCode: p.communeCode,
          startDate: p.startDate,
          endDate: p.endDate,
        })),
      );
      inserted += batch.length;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Un doublon dans le lot : on retente ligne à ligne pour ne perdre
      // que les vraies collisions.
      for (const p of batch) {
        try {
          await db.insert(mandates).values({
            officialId: p.officialId,
            type: 'maire',
            district: p.district,
            department: p.department,
            communeCode: p.communeCode,
            startDate: p.startDate,
            endDate: p.endDate,
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

run().catch((e) => {
  logger.error(`Backfill failed: ${e}`);
  process.exit(1);
});
