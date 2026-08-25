import { Readable } from 'node:stream';
import { Extract } from 'unzipper';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdir, readFile, mkdir, rm } from 'node:fs/promises';

export interface ActivityItem {
  type: 'written_question' | 'oral_question' | 'amendment' | 'report';
  title: string;
  date: string;
  status?: 'adopted' | 'rejected' | 'withdrawn';
  questionText?: string;
  responseText?: string;
  responseDate?: string;
  ministry?: string;
}

export interface DeputeActivity {
  id_an: string;
  activities: ActivityItem[];
}

export const QUESTIONS_ECRITES_URL =
  'https://data.assemblee-nationale.fr/static/openData/repository/17/questions/questions_ecrites/Questions_ecrites.json.zip';

export const QUESTIONS_GOUVERNEMENT_URL =
  'https://data.assemblee-nationale.fr/static/openData/repository/17/questions/questions_gouvernement/Questions_gouvernement.json.zip';

export async function fetchActivities(
  fetchFn: typeof fetch = fetch,
): Promise<DeputeActivity[]> {
  const byDepute = new Map<string, ActivityItem[]>();

  await Promise.all([
    loadQuestions(QUESTIONS_ECRITES_URL, 'written_question', fetchFn, byDepute),
    loadQuestions(
      QUESTIONS_GOUVERNEMENT_URL,
      'oral_question',
      fetchFn,
      byDepute,
    ),
  ]);

  const result: DeputeActivity[] = [];
  for (const [id_an, activities] of byDepute) {
    result.push({ id_an, activities });
  }
  return result;
}

async function loadQuestions(
  url: string,
  type: ActivityItem['type'],
  fetchFn: typeof fetch,
  byDepute: Map<string, ActivityItem[]>,
): Promise<void> {
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(
      `AN activité API error: ${response.status} ${response.statusText}`,
    );
  }

  const extractDir = join(tmpdir(), `an-activity-${type}-${Date.now()}`);
  await mkdir(extractDir, { recursive: true });

  try {
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await new Promise<void>((resolve, reject) => {
      const extractor = Extract({ path: extractDir });
      extractor.on('close', resolve);
      extractor.on('error', reject);
      Readable.from(buffer).pipe(extractor);
    });

    const jsonDir = join(extractDir, 'json');
    let files: string[];
    try {
      files = await readdir(jsonDir);
    } catch {
      return;
    }

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const raw = await readFile(join(jsonDir, file), 'utf-8');

      let question: Record<string, unknown>;
      try {
        question = (JSON.parse(raw) as { question: Record<string, unknown> })
          .question;
      } catch {
        continue;
      }

      const auteur = question?.auteur as Record<string, unknown> | undefined;
      const identite = auteur?.identite as Record<string, string> | undefined;
      const acteurRef = identite?.acteurRef;
      if (!acteurRef) continue;

      const indexation = question?.indexationAN as
        Record<string, unknown> | undefined;
      const rubrique = (indexation?.rubrique as string) ?? '';
      const analyses = indexation?.analyses as
        Record<string, string> | undefined;
      const analyse = analyses?.analyse ?? '';
      const title = analyse || rubrique || 'Question sans titre';

      const date = extractDate(question);
      if (!date) continue;

      const questionText = extractQuestionText(question);
      const { responseText, responseDate } = extractResponse(question);
      const ministry = extractMinistry(question);

      let list = byDepute.get(acteurRef);
      if (!list) {
        list = [];
        byDepute.set(acteurRef, list);
      }
      list.push({
        type,
        title,
        date,
        questionText,
        responseText,
        responseDate,
        ministry,
      });
    }
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }
}

function extractDate(question: Record<string, unknown>): string | undefined {
  const textes = question?.textesQuestion as
    Record<string, unknown> | undefined;
  if (textes) {
    const texteQ = textes.texteQuestion as Record<string, unknown> | undefined;
    if (texteQ) {
      const jo = texteQ.infoJO as Record<string, string> | undefined;
      if (jo?.dateJO) return jo.dateJO;
    }
  }

  const minAttribs = question?.minAttribs as
    Record<string, unknown> | undefined;
  if (minAttribs) {
    const minAttrib = minAttribs.minAttrib as
      Record<string, unknown> | undefined;
    if (minAttrib) {
      const jo = minAttrib.infoJO as Record<string, string> | undefined;
      if (jo?.dateJO) return jo.dateJO;
    }
  }

  return undefined;
}

function extractQuestionText(
  question: Record<string, unknown>,
): string | undefined {
  const textes = question?.textesQuestion as
    Record<string, unknown> | undefined;
  if (!textes) return undefined;
  const texteQ = textes.texteQuestion as Record<string, unknown> | undefined;
  return (texteQ?.texte as string) ?? undefined;
}

function extractResponse(question: Record<string, unknown>): {
  responseText?: string;
  responseDate?: string;
} {
  const textes = question?.textesReponse as Record<string, unknown> | undefined;
  if (!textes) return {};
  const texteR = textes.texteReponse as Record<string, unknown> | undefined;
  if (!texteR) return {};
  const responseText = (texteR.texte as string) ?? undefined;
  const jo = texteR.infoJO as Record<string, string> | undefined;
  const responseDate = jo?.dateJO ?? undefined;
  return { responseText, responseDate };
}

function extractMinistry(
  question: Record<string, unknown>,
): string | undefined {
  const minInt = question?.minInt as Record<string, string> | undefined;
  return minInt?.developpe ?? undefined;
}
