/**
 * `GET /api/question-text?officialId=&type=&title=&date=` : texte intégral
 * d'une question parlementaire (question + réponse ministérielle) et ses
 * métadonnées, chargés à la demande par `QuestionDetailDrawer.tsx` quand
 * l'utilisateur ouvre une question — ces textes sont trop volumineux pour
 * être inclus dans la fiche élu.
 *
 * La table `parliamentary_activity` n'expose pas d'identifiant côté client :
 * la ligne est désignée par le quadruplet (élu, type, titre, date), qui sert
 * de clé naturelle. Tous les paramètres sont obligatoires.
 *
 * Réponses JSON : 200 (cache 1 h), 400 paramètre manquant, 404 ligne absente.
 */
import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db.js';
import { parliamentaryActivity } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const officialId = url.searchParams.get('officialId');
  const type = url.searchParams.get('type');
  const title = url.searchParams.get('title');
  const date = url.searchParams.get('date');

  if (!officialId || !type || !title || !date) {
    return new Response(JSON.stringify({ error: 'Missing parameters' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = getDb();

  const [row] = await db
    .select({
      questionText: parliamentaryActivity.questionText,
      responseText: parliamentaryActivity.responseText,
      sourceUrl: parliamentaryActivity.sourceUrl,
      rubrique: parliamentaryActivity.rubrique,
      teteAnalyse: parliamentaryActivity.teteAnalyse,
      questionNumber: parliamentaryActivity.questionNumber,
    })
    .from(parliamentaryActivity)
    .where(
      and(
        eq(parliamentaryActivity.officialId, officialId),
        eq(parliamentaryActivity.type, type),
        eq(parliamentaryActivity.title, title),
        eq(parliamentaryActivity.date, date),
      ),
    )
    .limit(1);

  if (!row) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      questionText: row.questionText,
      responseText: row.responseText,
      sourceUrl: row.sourceUrl,
      // `rubrique` et `teteAnalyse` : classification thématique de l'AN/du Sénat.
      rubrique: row.rubrique,
      teteAnalyse: row.teteAnalyse,
      questionNumber: row.questionNumber,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
};
