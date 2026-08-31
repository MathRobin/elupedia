import { Readable } from 'node:stream';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, rm } from 'node:fs/promises';
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
  date: string;
  rubrique: string;
  questionText: string;
  mindepotlib: string;
  sourceRef: string;
  questionNumber: number | undefined;
}

interface RawReponse {
  idque: number;
  datejorep: string;
  txtrep: string;
  minreplib: string;
}

function parseDate(raw: string): string {
  if (!raw || raw === '\\N') return '';
  return raw.split(' ')[0];
}

function parseTsvLine(line: string, fields: string[]): Record<string, string> {
  const parts = line.split('\t');
  const record: Record<string, string> = {};
  for (let i = 0; i < fields.length && i < parts.length; i++) {
    record[fields[i]] = parts[i];
  }
  return record;
}

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
    const { mkdir } = await import('node:fs/promises');
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

    for (const [id, q] of questions) {
      const type = NATURE_MAP[q.nature];
      if (!type) continue;

      const date = parseDate(q.date);
      if (!date) continue;

      const rep = reponses.get(id);

      const item: ActivityItem = {
        type,
        title: q.titre || 'Question sans titre',
        date,
        questionText: q.questionText || undefined,
        responseText: rep?.txtrep || undefined,
        responseDate: rep ? parseDate(rep.datejorep) || undefined : undefined,
        ministry: q.mindepotlib || undefined,
        sourceUrl: `https://www.senat.fr/questions/base/${q.sourceRef}.html`,
        rubrique: q.rubrique || undefined,
        questionNumber: q.questionNumber,
      };

      let list = byMatricule.get(q.matricule);
      if (!list) {
        list = [];
        byMatricule.set(q.matricule, list);
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

async function parseSqlDump(
  sqlPath: string,
  questions: Map<number, RawQuestion>,
  reponses: Map<number, RawReponse>,
): Promise<void> {
  const stream = createReadStream(sqlPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let currentSection: 'questions' | 'reponses' | null = null;

  for await (const line of rl) {
    if (line.startsWith('COPY tam_questions ')) {
      currentSection = 'questions';
      continue;
    }
    if (line.startsWith('COPY tam_reponses ')) {
      currentSection = 'reponses';
      continue;
    }
    if (line === '\\.') {
      currentSection = null;
      continue;
    }

    if (currentSection === 'questions') {
      const row = parseTsvLine(line, QUESTION_FIELDS);
      const id = parseInt(row.id, 10);
      if (isNaN(id)) continue;

      questions.set(id, {
        id,
        matricule: row.matricule.trim(),
        nature: row.natquecod,
        titre: row.titre,
        date: row.datejodepot,
        rubrique: row.rubrique,
        questionText: row.txtque === '\\N' ? '' : row.txtque,
        mindepotlib: row.mindepotlib === '\\N' ? '' : row.mindepotlib,
        sourceRef: row.reference,
        questionNumber: row.numero
          ? parseInt(row.numero, 10) || undefined
          : undefined,
      });
    } else if (currentSection === 'reponses') {
      const row = parseTsvLine(line, REPONSE_FIELDS);
      const idque = parseInt(row.idque, 10);
      if (isNaN(idque)) continue;

      reponses.set(idque, {
        idque,
        datejorep: row.datejorep,
        txtrep: row.txtrep === '\\N' ? '' : row.txtrep,
        minreplib: row.minreplib === '\\N' ? '' : row.minreplib,
      });
    }
  }
}

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
    questionText: row.txtque === '\\N' ? '' : row.txtque,
    mindepotlib: row.mindepotlib === '\\N' ? '' : row.mindepotlib,
    sourceRef: row.reference,
    questionNumber: row.numero
      ? parseInt(row.numero, 10) || undefined
      : undefined,
  };
}

export function parseReponseRow(line: string): RawReponse | null {
  const row = parseTsvLine(line, REPONSE_FIELDS);
  const idque = parseInt(row.idque, 10);
  if (isNaN(idque)) return null;

  return {
    idque,
    datejorep: row.datejorep,
    txtrep: row.txtrep === '\\N' ? '' : row.txtrep,
    minreplib: row.minreplib === '\\N' ? '' : row.minreplib,
  };
}
