/**
 * Initiateurs (auteurs) des dossiers législatifs de l'Assemblée nationale.
 *
 * Source : ZIP `Dossiers_Legislatifs.json.zip` de data.assemblee-nationale.fr
 * (XVIIe législature), un fichier JSON par dossier dans
 * `json/dossierParlementaire/<dossierRef>.json`. On n'en lit que les dossiers
 * demandés (`wanted`), et on n'extrait que `initiateur.acteurs.acteur[].acteurRef`
 * (identifiants AN « PAxxxx » des auteurs du texte).
 *
 * Pièges : l'archive entière (plusieurs dizaines de Mo) est téléchargée et
 * extraite dans un dossier temporaire même pour quelques dossiers ; `acteur`
 * est un objet ou un tableau selon le nombre d'auteurs (convention XML→JSON
 * de l'AN) ; un dossier illisible est sauté sans erreur.
 *
 * Appelé par run-an.ts (étape `votes`), consommé par upsert/ballot-proposers.ts.
 */
import { Readable } from 'node:stream';
import { Extract } from 'unzipper';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdir, readFile, mkdir, rm } from 'node:fs/promises';
import { logger } from '../logger.js';

export const DOSSIERS_URL =
  'https://data.assemblee-nationale.fr/static/openData/repository/17/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip';

/** Initiateurs (auteurs) des dossiers demandés : dossierRef → acteurRef[]. */
export async function fetchDossierInitiators(
  wanted: ReadonlySet<string>,
  fetchFn: typeof fetch = fetch,
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (wanted.size === 0) return result;

  const response = await fetchFn(DOSSIERS_URL);
  if (!response.ok) {
    throw new Error(`AN dossiers législatifs ZIP error: ${response.status}`);
  }
  const extractDir = join(tmpdir(), `an-dossiers-${Date.now()}`);
  await mkdir(extractDir, { recursive: true });
  try {
    const buffer = Buffer.from(await response.arrayBuffer());
    await new Promise<void>((resolve, reject) => {
      const extractor = Extract({ path: extractDir });
      extractor.on('close', resolve);
      extractor.on('error', reject);
      Readable.from(buffer).pipe(extractor);
    });
    const dir = join(extractDir, 'json', 'dossierParlementaire');
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return result;
    }
    for (const file of files) {
      const ref = file.replace(/\.json$/, '');
      if (!wanted.has(ref)) continue;
      try {
        const doc = JSON.parse(await readFile(join(dir, file), 'utf-8')) as {
          dossierParlementaire?: {
            initiateur?: {
              acteurs?: { acteur?: unknown } | null;
            } | null;
          };
        };
        const acteur = doc.dossierParlementaire?.initiateur?.acteurs?.acteur;
        const list = Array.isArray(acteur) ? acteur : acteur ? [acteur] : [];
        result.set(
          ref,
          list
            .map((a) => (a as { acteurRef?: string }).acteurRef)
            .filter((r): r is string => typeof r === 'string'),
        );
      } catch {
        continue;
      }
    }
    logger.info(
      `AN dossiers : ${result.size} dossier(s) retrouvé(s) sur ${wanted.size} demandé(s)`,
    );
    return result;
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }
}
