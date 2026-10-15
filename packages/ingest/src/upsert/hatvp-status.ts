/**
 * Marque les élus soumis à déclaration HATVP dont la déclaration est déposée
 * mais pas encore publiée (`officials.hatvp_status = 'pending'`), en
 * interrogeant le site de la HATVP élu par élu
 * (`sources/hatvp-status.ts`). Appelé par `run.ts` et `run-hatvp-status.ts`.
 *
 * Table écrite : `officials`, colonne `hatvp_status` uniquement.
 * Périmètre vérifié : députés et sénateurs en mandat actif, plus les maires
 * en mandat actif des communes d'au moins 20 000 habitants (seuil légal de
 * la loi 2013-907 ; population lue dans le fichier INSEE des communes,
 * téléchargé à chaque run). Les élus ayant déjà des lignes `interests`
 * (déclaration publiée) ne sont pas vérifiés.
 * Idempotent : 'pending' est posé quand la HATVP signale un dépôt sans
 * publication, puis effacé (NULL) dès que des intérêts existent en base.
 * Le statut n'est jamais mis à 'none' : un élu sans dépôt reste à NULL.
 * Une vérification HATVP en erreur est comptée en `skipped` sans
 * interrompre le run ; les requêtes DB amont/aval sont protégées par
 * withRetry (voir commentaires).
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates, interests } from '@elupedia/shared';
import { eq, isNull, sql, inArray, and } from 'drizzle-orm';

import { logger } from '../logger.js';
import { checkHatvpStatus } from '../sources/hatvp-status.js';
import { withRetry, describeError } from '../utils/retry.js';

// Pause entre deux vérifications sur le site de la HATVP.
const DELAY_MS = 1500;
// Fichier INSEE « Populations légales » (millésime figé par son identifiant).
const COMMUNES_20K_URL =
  'https://www.insee.fr/fr/statistiques/fichier/8680726/ensemble.zip';
// Seuil de population au-delà duquel un maire est soumis à déclaration
// HATVP (loi n°2013-907).
const BIG_COMMUNE_POPULATION_THRESHOLD = 20000;
// Colonnes du CSV donnees_communes (séparateur ';') : code commune et
// population municipale.
const INSEE_COM_COLUMN = 6;
const INSEE_PMUN_COLUMN = 8;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Télécharge le ZIP INSEE et renvoie les codes INSEE des communes dont la
// population municipale atteint le seuil.
async function fetchCommunesOver20k(
  fetchFn: typeof fetch = fetch,
): Promise<Set<string>> {
  const { default: unzipper } = await import('unzipper');

  const response = await fetchFn(COMMUNES_20K_URL);
  if (!response.ok)
    throw new Error(`INSEE download failed: ${response.status}`);

  const codes = new Set<string>();

  const directory = await unzipper.Open.buffer(
    Buffer.from(await response.arrayBuffer()),
  );
  const communesFile = directory.files.find((file) =>
    file.path.includes('donnees_communes'),
  );
  if (!communesFile) throw new Error('donnees_communes.csv not found in ZIP');

  const content = (await communesFile.buffer()).toString('utf-8');
  const lines = content.split('\n');

  // Ligne 0 = en-tête.
  for (let i = 1; i < lines.length; i++) {
    const columns = lines[i].split(';');
    const code = columns[INSEE_COM_COLUMN];
    const population = parseInt(columns[INSEE_PMUN_COLUMN], 10);
    if (code && population >= BIG_COMMUNE_POPULATION_THRESHOLD) {
      codes.add(code);
    }
  }

  logger.info(`INSEE: ${codes.size} communes with 20k+ population`);
  return codes;
}

interface OfficialToCheck {
  id: string;
  firstName: string;
  lastName: string;
}

/**
 * Vérifie le statut HATVP des élus du périmètre et met à jour
 * `officials.hatvp_status` (appels réseau INSEE + HATVP, écriture DB).
 * Retourne checked (vérifiés sans erreur), pending (marqués) et skipped
 * (sans dépôt ou en erreur).
 */
export async function upsertHatvpStatuses(
  db: NeonHttpDatabase,
  fetchFn: typeof fetch = fetch,
) {
  const summary = { checked: 0, pending: 0, skipped: 0 };

  const bigCommuneCodes = await fetchCommunesOver20k(fetchFn);

  // Ces requêtes amont tournent avant toute boucle coûteuse (vérifications
  // HATVP au rythme d'une toutes les 1.5s) : les retenter individuellement
  // sur un blip isolé du driver Neon HTTP évite de faire échouer puis
  // rejouer (via le withRetry de runStep) toute la fonction — re-téléchargeant
  // le ZIP INSEE et perdant la progression déjà faite sur les vérifications
  // HATVP (constaté en conditions réelles le 02/10/2026, même famille de
  // problème que les incidents senat-activite/senateurs des 30/09 et
  // 01/10/2026).
  const officialsWithInterests = await withRetry(
    () =>
      db.selectDistinct({ officialId: interests.officialId }).from(interests),
    { source: 'hatvp-status interests' },
  );
  const hasInterests = new Set(
    officialsWithInterests.map((row) => row.officialId),
  );

  const parlementaires = await withRetry(
    () =>
      db
        .select({
          id: officials.id,
          firstName: officials.firstName,
          lastName: officials.lastName,
        })
        .from(officials)
        .innerJoin(mandates, eq(mandates.officialId, officials.id))
        .where(
          and(
            isNull(mandates.endDate),
            inArray(mandates.type, ['depute', 'senateur']),
          ),
        ),
    { source: 'hatvp-status parlementaires' },
  );

  const maires = await withRetry(
    () =>
      db
        .select({
          id: officials.id,
          firstName: officials.firstName,
          lastName: officials.lastName,
          communeCode: mandates.communeCode,
        })
        .from(officials)
        .innerJoin(mandates, eq(mandates.officialId, officials.id))
        .where(and(isNull(mandates.endDate), eq(mandates.type, 'maire'))),
    { source: 'hatvp-status maires' },
  );

  const bigMaires = maires.filter(
    (mayor) => mayor.communeCode && bigCommuneCodes.has(mayor.communeCode),
  );

  logger.info(
    `Candidates: ${parlementaires.length} parlementaires + ${bigMaires.length} maires (communes >20k)`,
  );

  // Dédoublonnage (un élu peut cumuler plusieurs mandats du périmètre) et
  // exclusion des élus dont la déclaration est déjà publiée.
  const seen = new Set<string>();
  const toCheck: OfficialToCheck[] = [];

  for (const official of [...parlementaires, ...bigMaires]) {
    if (seen.has(official.id) || hasInterests.has(official.id)) continue;
    seen.add(official.id);
    toCheck.push({
      id: official.id,
      firstName: official.firstName,
      lastName: official.lastName,
    });
  }

  logger.info(
    `${toCheck.length} officials without published interests to check`,
  );

  for (let i = 0; i < toCheck.length; i++) {
    const official = toCheck[i];
    logger.info(
      `  [${i + 1}/${toCheck.length}] ${official.firstName} ${official.lastName}`,
    );

    try {
      const status = await checkHatvpStatus(
        official.firstName,
        official.lastName,
        fetchFn,
      );

      if (status === 'pending') {
        await db
          .update(officials)
          .set({ hatvpStatus: 'pending', updatedAt: new Date() })
          .where(eq(officials.id, official.id));
        summary.pending++;
        logger.info(`    → pending (déposée, publication à venir)`);
      } else {
        summary.skipped++;
      }
      summary.checked++;
    } catch (error) {
      logger.warn(`    → error: ${describeError(error)}`);
      summary.skipped++;
    }

    if (i < toCheck.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Efface le statut 'pending' des élus dont les intérêts sont désormais
  // publiés. Protégée par retry comme les requêtes amont : elle arrive après
  // la boucle de vérification (potentiellement longue, 1.5s/élu), un blip
  // isolé ici ne doit pas forcer à tout rejouer depuis le début.
  await withRetry(
    () =>
      db
        .update(officials)
        .set({ hatvpStatus: null, updatedAt: new Date() })
        .where(
          and(
            eq(officials.hatvpStatus, 'pending'),
            sql`${officials.id} IN (SELECT DISTINCT official_id FROM interests)`,
          ),
        ),
    { source: 'hatvp-status clear-pending' },
  );

  logger.info(
    `HATVP status: ${summary.checked} checked, ${summary.pending} pending, ${summary.skipped} skipped`,
  );
  return summary;
}
