/**
 * Activité parlementaire des sénateurs : questions écrites et orales, avec la
 * réponse du gouvernement quand elle existe.
 *
 * Source : data.senat.fr publie un dump PostgreSQL (`questions.zip` →
 * `questions.sql`, ~530 000 questions). On ne charge pas le dump en base : le
 * fichier est lu ligne à ligne et seuls les blocs `COPY tam_questions` et
 * `COPY tam_reponses` sont exploités. Format COPY texte : une ligne par
 * enregistrement, colonnes séparées par des tabulations dans l'ordre de
 * QUESTION_FIELDS / REPONSE_FIELDS, `\N` pour NULL, bloc terminé par `\.`.
 *
 * Le ZIP (plusieurs dizaines de Mo) est extrait dans un dossier temporaire
 * supprimé en fin de traitement, même en cas d'erreur. Seules les natures
 * listées dans NATURE_MAP sont conservées ; les autres sont ignorées sans log.
 *
 * Appelé par run-senat.ts, consommé par upsert/senat-parliamentary-activity.ts.
 * parseQuestionRow / parseReponseRow sont exportés pour les tests.
 */
import { Readable } from 'node:stream';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import * as readline from 'node:readline';
import { Extract } from 'unzipper';

import { logger } from '../logger.js';
import type { ActivityItem } from './an-activite.js';

export const QUESTIONS_ZIP_URL =
  'https://data.senat.fr/data/questions/questions.zip';

export interface SenateurActivity {
  matricule: string;
  activities: ActivityItem[];
}

/** Marqueur NULL du format COPY texte de PostgreSQL. */
const SQL_NULL = '\\N';

/**
 * Code `natquecod` du Sénat → type d'activité Elupedia. QE = question écrite ;
 * QOSD / QOAD / QG / QC / QOAE = variantes de questions orales (avec débat,
 * au gouvernement, cribles, européennes), toutes rangées en « oral_question ».
 */
const NATURE_MAP: Record<string, ActivityItem['type']> = {
  QE: 'written_question',
  QOSD: 'oral_question',
  QOAD: 'oral_question',
  QG: 'oral_question',
  QC: 'oral_question',
  QOAE: 'oral_question',
};

interface RawQuestion {
  id: number;
  matricule: string;
  nature: string;
  titre: string;
  /** Date de dépôt au JO, format « AAAA-MM-JJ HH:MM:SS ». */
  date: string;
  rubrique: string;
  questionText: string;
  /** Ministère destinataire (libellé). */
  mindepotlib: string;
  /** Référence publique (ex. SEQ780402185), base de l'URL senat.fr. */
  sourceRef: string;
  questionNumber: number | undefined;
}

interface RawReponse {
  /** Id de la question répondue (clé de jointure avec RawQuestion.id). */
  idque: number;
  datejorep: string;
  txtrep: string;
  minreplib: string;
}

/** « AAAA-MM-JJ HH:MM:SS » → « AAAA-MM-JJ » ; vide si absent ou NULL. */
function parseDate(raw: string): string {
  if (!raw || raw === SQL_NULL) return '';
  return raw.split(' ')[0];
}

/** Découpe une ligne COPY (tabulations) en objet nommé selon `fields` ; les colonnes manquantes en fin de ligne restent absentes. */
function parseTsvLine(line: string, fields: string[]): Record<string, string> {
  const parts = line.split('\t');
  const record: Record<string, string> = {};
  for (let i = 0; i < fields.length && i < parts.length; i++) {
    record[fields[i]] = parts[i];
  }
  return record;
}

/** Colonnes de la table tam_questions, dans l'ordre du dump. */
const QUESTION_FIELDS = [
  'id',
  'sorquecod',
  'matricule',
  'natquecod',
  'legislature',
  'etaquecod',
  'uuid',
  'numero',
  'reference',
  'titre',
  'version',
  'datecloture',
  'delaijours',
  'nom',
  'prenom',
  'nomtechnique',
  'codequalite',
  'cirnum',
  'circonscription',
  'groupe',
  'rubrique',
  'datejodepot',
  'mindepotid',
  'mindepotlib',
  'datejotran',
  'mintranid',
  'mintranlib',
  'minreplib1',
  'minrepid1',
  'delaijoursrep1',
  'datejorep1',
  'datesynctam',
  'natqueord',
  'repub',
  'uuidtransori',
  'dattransori',
  'uuidtrans',
  'dattrans',
  'uuidquerappelee',
  'refquerappelee',
  'daterappel',
  'txtque',
  'themes',
  'renvoi1',
  'renvoi2',
  'renvoi3',
  'datesignal',
  'pagejodepot',
  'pageerr',
  'dateerr',
  'ratgrp',
  'thecrible',
  'txterrque',
  'tranisreattr',
  'compub',
  'dateseance',
  'rang',
  'caduque_redeposee',
];

/** Colonnes de la table tam_reponses, dans l'ordre du dump. */
const REPONSE_FIELDS = [
  'idque',
  'datejorep',
  'txtrep',
  'delaijoursrep',
  'minrepid',
  'minreplib',
  'pagejorep',
  'urlrep',
  'errpage',
  'errdate',
  'idrepunique',
  'txterrrep',
];

/**
 * Télécharge le dump des questions, le parse et regroupe les activités par
 * matricule de sénateur. Appel réseau + écriture dans un dossier temporaire
 * (nettoyé en `finally`). Lève une erreur si le téléchargement échoue.
 */
export async function fetchSenatActivities(
  fetchFn: typeof fetch = fetch,
): Promise<SenateurActivity[]> {
  const response = await fetchFn(QUESTIONS_ZIP_URL);
  if (!response.ok) {
    throw new Error(
      `Sénat questions download failed: ${response.status} ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const zipBuffer = Buffer.from(arrayBuffer);

  const extractDir = join(tmpdir(), `senat-questions-${Date.now()}`);
  const zipPath = join(extractDir, 'questions.zip');

  try {
    await mkdir(extractDir, { recursive: true });
    await writeFile(zipPath, zipBuffer);

    await new Promise<void>((resolve, reject) => {
      const extractor = Extract({ path: extractDir });
      extractor.on('close', resolve);
      extractor.on('error', reject);
      Readable.from(zipBuffer).pipe(extractor);
    });

    const sqlPath = join(extractDir, 'questions.sql');

    const questions = new Map<number, RawQuestion>();
    const reponses = new Map<number, RawReponse>();

    await parseSqlDump(sqlPath, questions, reponses);

    logger.info(
      `Sénat questions: ${questions.size} questions, ${reponses.size} réponses`,
    );

    const byMatricule = new Map<string, ActivityItem[]>();

    for (const [id, question] of questions) {
      const type = NATURE_MAP[question.nature];
      if (!type) continue;

      const date = parseDate(question.date);
      if (!date) continue;

      const reponse = reponses.get(id);

      const item: ActivityItem = {
        type,
        title: question.titre || 'Question sans titre',
        date,
        questionText: question.questionText || undefined,
        responseText: reponse?.txtrep || undefined,
        responseDate: reponse
          ? parseDate(reponse.datejorep) || undefined
          : undefined,
        ministry: question.mindepotlib || undefined,
        sourceUrl: `https://www.senat.fr/questions/base/${question.sourceRef}.html`,
        rubrique: question.rubrique || undefined,
        questionNumber: question.questionNumber,
      };

      let list = byMatricule.get(question.matricule);
      if (!list) {
        list = [];
        byMatricule.set(question.matricule, list);
      }
      list.push(item);
    }

    const result: SenateurActivity[] = [];
    for (const [matricule, activities] of byMatricule) {
      result.push({ matricule, activities });
    }

    logger.info(
      `Sénat questions: ${result.length} sénateurs avec activité parlementaire`,
    );
    return result;
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }
}

/**
 * Lit le dump SQL en streaming et remplit les deux maps (clé = id de
 * question). Seules les sections `COPY tam_questions` et `COPY tam_reponses`
 * sont lues ; tout le reste du dump (schéma, autres tables) est sauté.
 */
async function parseSqlDump(
  sqlPath: string,
  questions: Map<number, RawQuestion>,
  reponses: Map<number, RawReponse>,
): Promise<void> {
  const stream = createReadStream(sqlPath, { encoding: 'utf-8' });
  const lineReader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let currentSection: 'questions' | 'reponses' | null = null;

  for await (const line of lineReader) {
    if (line.startsWith('COPY tam_questions ')) {
      currentSection = 'questions';
      continue;
    }
    if (line.startsWith('COPY tam_reponses ')) {
      currentSection = 'reponses';
      continue;
    }
    // `\.` seul sur une ligne termine un bloc COPY.
    if (line === '\\.') {
      currentSection = null;
      continue;
    }

    if (currentSection === 'questions') {
      const question = parseQuestionRow(line);
      if (question) questions.set(question.id, question);
    } else if (currentSection === 'reponses') {
      const reponse = parseReponseRow(line);
      if (reponse) reponses.set(reponse.idque, reponse);
    }
  }
}

/**
 * Parse une ligne du bloc `COPY tam_questions`. Retourne null si l'id n'est
 * pas numérique (ligne mal formée). Exporté pour les tests.
 */
export function parseQuestionRow(line: string): RawQuestion | null {
  const row = parseTsvLine(line, QUESTION_FIELDS);
  const id = parseInt(row.id, 10);
  if (isNaN(id)) return null;

  return {
    id,
    matricule: row.matricule.trim(),
    nature: row.natquecod,
    titre: row.titre,
    date: row.datejodepot,
    rubrique: row.rubrique,
    questionText: row.txtque === SQL_NULL ? '' : row.txtque,
    mindepotlib: row.mindepotlib === SQL_NULL ? '' : row.mindepotlib,
    sourceRef: row.reference,
    questionNumber: row.numero
      ? parseInt(row.numero, 10) || undefined
      : undefined,
  };
}

/**
 * Parse une ligne du bloc `COPY tam_reponses`. Retourne null si l'id de
 * question n'est pas numérique. Exporté pour les tests.
 */
export function parseReponseRow(line: string): RawReponse | null {
  const row = parseTsvLine(line, REPONSE_FIELDS);
  const idque = parseInt(row.idque, 10);
  if (isNaN(idque)) return null;

  return {
    idque,
    datejorep: row.datejorep,
    txtrep: row.txtrep === SQL_NULL ? '' : row.txtrep,
    minreplib: row.minreplib === SQL_NULL ? '' : row.minreplib,
  };
}
