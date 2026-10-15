/**
 * Tiroir latéral détaillant une activité parlementaire d'un député
 * (question écrite ou orale, amendement, rapport) : texte de la question,
 * réponse du gouvernement, ministère, métadonnées AN.
 *
 * Rendu une seule fois sur `pages/elus/[slug]/index.astro` avec
 * `client:idle` : sans contenu tant qu'il n'est pas ouvert. Il s'ouvre sur
 * l'événement `open-question-detail` dispatché sur `window` par la liste
 * d'activités de la page, dont `detail` est un `QuestionDetail` partiel
 * (sans textes). Les textes sont alors chargés depuis `/api/question-text`
 * (ils sont trop volumineux pour être injectés dans la page) et fusionnés
 * dans l'état.
 *
 * `QuestionDetailDrawer.test.ts` vérifie la présence de chaînes exactes dans
 * ce fichier (`stripHtml`, `setLoading`, libellés…) : les garder telles quelles.
 */
import { useState, useEffect, useCallback } from 'react';
import { useFocusTrap } from '../lib/use-focus-trap.js';

export interface QuestionDetail {
  officialId: string;
  /** Clé de `ACTIVITY_TYPE_LABELS`. */
  type: string;
  title: string;
  /** Date ISO. */
  date: string;
  /** Clé de `STATUS_LABELS` (amendements), ou null. */
  status: string | null;
  /** HTML brut de l'AN, nettoyé par `stripHtml` à l'affichage. */
  questionText: string | null;
  responseText: string | null;
  responseDate: string | null;
  /** Ministère interrogé. */
  governmentComments: string | null;
  sourceUrl: string | null;
  rubrique: string | null;
  teteAnalyse: string | null;
  questionNumber: number | null;
}

/** Champs renvoyés par `/api/question-text`, fusionnés dans `QuestionDetail`. */
type QuestionTextResponse = {
  questionText: string | null;
  responseText: string | null;
  sourceUrl: string | null;
  rubrique: string | null;
  teteAnalyse: string | null;
  questionNumber: number | null;
};

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  written_question: 'Question écrite',
  oral_question: 'Question orale',
  amendment: 'Amendement',
  report: 'Rapport',
};

const STATUS_LABELS: Record<string, string> = {
  adopted: 'Adopté',
  rejected: 'Rejeté',
  withdrawn: 'Retiré',
};

/**
 * Durée de l'animation de fermeture (doit rester égale au `duration-300`
 * Tailwind du panneau) : le contenu n'est vidé qu'après.
 */
const CLOSE_ANIMATION_MS = 300;

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Convertit le HTML des questions AN en texte brut multi-lignes : les
 * <br>/<p> deviennent des sauts de ligne, les autres balises sont retirées
 * et les entités les plus fréquentes décodées.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, '’')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function QuestionDetailDrawer() {
  const [question, setQuestion] = useState<QuestionDetail | null>(null);
  const [open, setOpen] = useState(false);
  const trapRef = useFocusTrap(open);
  // Chargement des textes depuis l'API en cours.
  const [loading, setLoading] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setTimeout(() => setQuestion(null), CLOSE_ANIMATION_MS);
  }, []);

  useEffect(() => {
    function openFromEvent(e: Event) {
      const detail = (e as CustomEvent<QuestionDetail>).detail;
      setQuestion(detail);
      setOpen(true);

      // L'API identifie la question par (élu, type, titre, date) : pas d'id
      // stable côté page.
      const params = new URLSearchParams({
        officialId: detail.officialId,
        type: detail.type,
        title: detail.title,
        date: detail.date,
      });
      setLoading(true);
      fetch(`/api/question-text?${params}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((texts: QuestionTextResponse | null) => {
          if (texts) {
            // `prev` peut être null si le tiroir a été fermé entre-temps.
            setQuestion((prev) =>
              prev
                ? {
                    ...prev,
                    questionText: texts.questionText,
                    responseText: texts.responseText,
                    sourceUrl: texts.sourceUrl,
                    rubrique: texts.rubrique,
                    teteAnalyse: texts.teteAnalyse,
                    questionNumber: texts.questionNumber,
                  }
                : prev,
            );
          }
        })
        .catch(() => {
          /* Échec réseau : on garde l'affichage « Texte non disponible ». */
        })
        .finally(() => setLoading(false));
    }
    window.addEventListener('open-question-detail', openFromEvent);
    return () =>
      window.removeEventListener('open-question-detail', openFromEvent);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) close();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  if (!question && !open) return null;

  // Seules les questions ont un texte et une réponse ; amendements et
  // rapports n'affichent que le titre et les métadonnées.
  const isQuestion =
    question?.type === 'written_question' || question?.type === 'oral_question';

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={close}
      />
      <div
        ref={trapRef}
        className={`fixed inset-y-0 right-0 z-50 w-full sm:max-w-lg transform bg-white shadow-xl transition-transform duration-300 dark:bg-slate-900 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Détail de la question"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200/60 ring-inset dark:bg-indigo-900/30 dark:text-indigo-300 dark:ring-indigo-500/30">
                {question
                  ? (ACTIVITY_TYPE_LABELS[question.type] ?? question.type)
                  : ''}
              </span>
              {question?.status && (
                <span
                  className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                    question.status === 'adopted'
                      ? 'bg-green-50 text-green-700 ring-green-200/60'
                      : question.status === 'rejected'
                        ? 'bg-red-50 text-red-700 ring-red-200/60'
                        : 'bg-yellow-50 text-yellow-700 ring-yellow-200/60'
                  }`}
                >
                  {STATUS_LABELS[question.status] ?? question.status}
                </span>
              )}
            </div>
            <button
              onClick={close}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Fermer"
            >
              <i
                className="fa-solid fa-xmark h-5 w-5 flex items-center justify-center"
                aria-hidden="true"
              />
            </button>
          </div>

          {question && (
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              <div>
                <h4 className="text-lg font-semibold text-slate-900 leading-snug dark:text-white">
                  {question.title}
                </h4>
                <p className="mt-2 text-sm text-slate-500">
                  {formatDate(question.date)}
                </p>
              </div>

              {isQuestion && (
                <div>
                  {question.sourceUrl ? (
                    <a
                      href={question.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                      <i
                        className="fa-solid fa-arrow-up-right-from-square text-sm"
                        aria-hidden="true"
                      />
                      Consulter sur assemblee-nationale.fr
                    </a>
                  ) : (
                    <span
                      className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-400"
                      title="Le lien officiel n'a pas été trouvé pour cette question"
                    >
                      <i
                        className="fa-solid fa-arrow-up-right-from-square text-sm"
                        aria-hidden="true"
                      />
                      Consulter sur assemblee-nationale.fr
                    </span>
                  )}
                </div>
              )}

              {question.governmentComments && (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800">
                  <i
                    className="fa-solid fa-landmark text-sm shrink-0 text-slate-400"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    {question.governmentComments}
                  </p>
                </div>
              )}

              {isQuestion && (
                <>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="border-b border-slate-200 px-4 py-3">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Texte de la question
                      </h4>
                    </div>
                    <div className="px-4 py-4">
                      {loading ? (
                        <p className="text-sm text-slate-400 animate-pulse">
                          Chargement…
                        </p>
                      ) : question.questionText ? (
                        <p className="whitespace-pre-line text-sm leading-7 text-slate-700 dark:text-slate-300">
                          {stripHtml(question.questionText)}
                        </p>
                      ) : (
                        <p className="text-sm italic text-slate-400">
                          Texte non disponible.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 dark:border-indigo-500/30 dark:bg-indigo-900/20">
                    <div className="flex items-center justify-between border-b border-indigo-200 px-4 py-3">
                      <h4 className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">
                        Réponse du gouvernement
                      </h4>
                      {question.responseDate && (
                        <span className="text-xs text-indigo-400">
                          {formatDate(question.responseDate)}
                        </span>
                      )}
                    </div>
                    <div className="px-4 py-4">
                      {loading ? (
                        <p className="text-sm text-slate-400 animate-pulse">
                          Chargement…
                        </p>
                      ) : question.responseText ? (
                        <p className="whitespace-pre-line text-sm leading-7 text-slate-700 dark:text-slate-300">
                          {stripHtml(question.responseText)}
                        </p>
                      ) : (
                        <p className="text-sm italic text-slate-400">
                          Pas encore de réponse publiée.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {(question.rubrique ||
                question.teteAnalyse ||
                question.questionNumber) && (
                <div className="border-t border-slate-200 pt-5 dark:border-slate-700">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Métadonnées
                  </h4>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {question.rubrique && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {question.rubrique}
                      </span>
                    )}
                    {question.teteAnalyse && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        {question.teteAnalyse}
                      </span>
                    )}
                  </div>
                  {question.questionNumber && (
                    <p className="mt-3 text-xs text-slate-400">
                      Question n°{question.questionNumber}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
