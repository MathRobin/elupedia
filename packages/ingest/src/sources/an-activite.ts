/**
 * Questions écrites et questions au gouvernement des députés (open data AN).
 *
 * Source : deux archives ZIP de data.assemblee-nationale.fr (législature 17),
 * contenant chacune un dossier `json/` avec un fichier par question
 * (`{ question: {...} }`, conversion XML→JSON de l'AN).
 *
 * Extrait : pour chaque député (`acteurRef`, ex. PA123456), la liste de ses
 * questions sous forme d'`ActivityItem` (titre, date JO, texte, réponse,
 * ministère interrogé, lien vers la page officielle).
 *
 * Pièges :
 * - Les questions au gouvernement (orales) n'ont pas de `textesQuestion` :
 *   la date est alors lue dans `minAttribs.minAttrib.infoJO.dateJO`.
 * - Une question sans date exploitable ou sans auteur est ignorée.
 * - Les ZIP sont extraits dans un répertoire temporaire supprimé en fin de
 *   traitement, même en cas d'erreur.
 *
 * Appelé par run-an.ts / run-an-partial.ts (via upsert/parliamentary-activity).
 * Le type `ActivityItem` est partagé avec senat-activite.ts, d'où les valeurs
 * `amendment` / `report` jamais produites ici.
 */
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
  sourceUrl?: string;
  rubrique?: string;
  teteAnalyse?: string;
  questionNumber?: number;
}

export interface DeputeActivity {
  id_an: string;
  activities: ActivityItem[];
}

export const QUESTIONS_ECRITES_URL =
  'https://data.assemblee-nationale.fr/static/openData/repository/17/questions/questions_ecrites/Questions_ecrites.json.zip';

export const QUESTIONS_GOUVERNEMENT_URL =
  'https://data.assemblee-nationale.fr/static/openData/repository/17/questions/questions_gouvernement/Questions_gouvernement.json.zip';

/** Titre de repli quand ni l'analyse ni la rubrique ne sont renseignées. */
const UNTITLED_QUESTION = 'Question sans titre';

/** Forme brute d'une question telle que désérialisée depuis le JSON AN. */
type RawQuestion = Record<string, unknown>;

/**
 * Télécharge les deux archives (questions écrites + questions au gouvernement)
 * en parallèle et regroupe toutes les questions par député.
 * Lève une erreur si l'un des téléchargements échoue (HTTP non 2xx).
 */
export async function fetchActivities(
  fetchFn: typeof fetch = fetch,
): Promise<DeputeActivity[]> {
  const activitiesByDepute = new Map<string, ActivityItem[]>();

  await Promise.all([
    loadQuestions(
      QUESTIONS_ECRITES_URL,
      'written_question',
      fetchFn,
      activitiesByDepute,
    ),
    loadQuestions(
      QUESTIONS_GOUVERNEMENT_URL,
      'oral_question',
      fetchFn,
      activitiesByDepute,
    ),
  ]);

  const result: DeputeActivity[] = [];
  for (const [id_an, activities] of activitiesByDepute) {
    result.push({ id_an, activities });
  }
  return result;
}

/**
 * Télécharge une archive, l'extrait dans un dossier temporaire et ajoute
 * chaque question parsée dans `activitiesByDepute` (mutation en place).
 */
async function loadQuestions(
  url: string,
  type: ActivityItem['type'],
  fetchFn: typeof fetch,
  activitiesByDepute: Map<string, ActivityItem[]>,
): Promise<void> {
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(
      `AN activité API error: ${response.status} ${response.statusText}`,
    );
  }

  // Un dossier par type pour que les deux extractions parallèles ne se
  // marchent pas dessus.
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
      // Archive vide ou sans dossier json/ : rien à importer.
      return;
    }

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const raw = await readFile(join(jsonDir, file), 'utf-8');

      let question: RawQuestion;
      try {
        question = (JSON.parse(raw) as { question: RawQuestion }).question;
      } catch {
        continue;
      }

      const parsed = parseQuestion(question, type);
      if (!parsed) continue;

      let activitiesForDepute = activitiesByDepute.get(parsed.acteurRef);
      if (!activitiesForDepute) {
        activitiesForDepute = [];
        activitiesByDepute.set(parsed.acteurRef, activitiesForDepute);
      }
      activitiesForDepute.push(parsed.item);
    }
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }
}

/**
 * Transforme une question brute en `ActivityItem`. Renvoie undefined si la
 * question n'a pas d'auteur identifiable ou pas de date exploitable.
 */
function parseQuestion(
  question: RawQuestion,
  type: ActivityItem['type'],
): { acteurRef: string; item: ActivityItem } | undefined {
  const auteur = question?.auteur as Record<string, unknown> | undefined;
  const identite = auteur?.identite as Record<string, string> | undefined;
  const acteurRef = identite?.acteurRef;
  if (!acteurRef) return undefined;

  const indexation = question?.indexationAN as
    Record<string, unknown> | undefined;
  const rubrique = (indexation?.rubrique as string) ?? '';
  const teteAnalyse = (indexation?.teteAnalyse as string) || undefined;
  const analyses = indexation?.analyses as Record<string, string> | undefined;
  const analyse = analyses?.analyse ?? '';
  // L'« analyse » est la formulation la plus précise ; la rubrique (thème
  // large) sert de repli.
  const title = analyse || rubrique || UNTITLED_QUESTION;

  const identifiant = question?.identifiant as
    Record<string, string> | undefined;
  const questionNumber = identifiant?.numero
    ? parseInt(identifiant.numero, 10)
    : undefined;

  const date = extractDate(question);
  if (!date) return undefined;

  const questionText = extractQuestionText(question);
  const { responseText, responseDate } = extractResponse(question);
  const ministry = extractMinistry(question);
  const sourceUrl = buildSourceUrl(question);

  return {
    acteurRef,
    item: {
      type,
      title,
      date,
      questionText,
      responseText,
      responseDate,
      ministry,
      sourceUrl,
      rubrique: rubrique || undefined,
      teteAnalyse,
      questionNumber,
    },
  };
}

/**
 * Date de publication au JO : d'abord celle du texte de la question, sinon
 * celle de l'attribution ministérielle (seule date disponible pour les
 * questions au gouvernement).
 */
function extractDate(question: RawQuestion): string | undefined {
  const textesQuestion = question?.textesQuestion as
    Record<string, unknown> | undefined;
  if (textesQuestion) {
    const texteQuestion = textesQuestion.texteQuestion as
      Record<string, unknown> | undefined;
    if (texteQuestion) {
      const infoJO = texteQuestion.infoJO as Record<string, string> | undefined;
      if (infoJO?.dateJO) return infoJO.dateJO;
    }
  }

  const minAttribs = question?.minAttribs as
    Record<string, unknown> | undefined;
  if (minAttribs) {
    const minAttrib = minAttribs.minAttrib as
      Record<string, unknown> | undefined;
    if (minAttrib) {
      const infoJO = minAttrib.infoJO as Record<string, string> | undefined;
      if (infoJO?.dateJO) return infoJO.dateJO;
    }
  }

  return undefined;
}

function extractQuestionText(question: RawQuestion): string | undefined {
  const textesQuestion = question?.textesQuestion as
    Record<string, unknown> | undefined;
  if (!textesQuestion) return undefined;
  const texteQuestion = textesQuestion.texteQuestion as
    Record<string, unknown> | undefined;
  return (texteQuestion?.texte as string) ?? undefined;
}

function extractResponse(question: RawQuestion): {
  responseText?: string;
  responseDate?: string;
} {
  const textesReponse = question?.textesReponse as
    Record<string, unknown> | undefined;
  if (!textesReponse) return {};
  const texteReponse = textesReponse.texteReponse as
    Record<string, unknown> | undefined;
  if (!texteReponse) return {};
  const responseText = (texteReponse.texte as string) ?? undefined;
  const infoJO = texteReponse.infoJO as Record<string, string> | undefined;
  const responseDate = infoJO?.dateJO ?? undefined;
  return { responseText, responseDate };
}

/** Ministère interrogé (`minInt.developpe` = libellé complet). */
function extractMinistry(question: RawQuestion): string | undefined {
  const minInt = question?.minInt as Record<string, string> | undefined;
  return minInt?.developpe ?? undefined;
}

/** Page officielle de la question sur assemblee-nationale.fr. */
function buildSourceUrl(question: RawQuestion): string | undefined {
  const uid = question?.uid as string | undefined;
  const identifiant = question?.identifiant as
    Record<string, string> | undefined;
  const legislature = identifiant?.legislature;
  if (!uid || !legislature) return undefined;
  return `https://www.assemblee-nationale.fr/dyn/${legislature}/questions/${uid}`;
}
