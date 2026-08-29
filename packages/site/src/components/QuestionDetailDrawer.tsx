import { useState, useEffect, useCallback } from 'react';

export interface QuestionDetail {
  officialId: string;
  type: string;
  title: string;
  date: string;
  status: string | null;
  questionText: string | null;
  responseText: string | null;
  responseDate: string | null;
  governmentComments: string | null;
  sourceUrl: string | null;
}

const activityTypeLabels: Record<string, string> = {
  written_question: 'Question écrite',
  oral_question: 'Question orale',
  amendment: 'Amendement',
  report: 'Rapport',
};

const statusLabels: Record<string, string> = {
  adopted: 'Adopté',
  rejected: 'Rejeté',
  withdrawn: 'Retiré',
};

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

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
  const [loading, setLoading] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setTimeout(() => setQuestion(null), 300);
  }, []);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<QuestionDetail>).detail;
      setQuestion(detail);
      setOpen(true);

      const params = new URLSearchParams({
        officialId: detail.officialId,
        type: detail.type,
        title: detail.title,
        date: detail.date,
      });
      setLoading(true);
      fetch(`/api/question-text?${params}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (
            data: {
              questionText: string | null;
              responseText: string | null;
              sourceUrl: string | null;
            } | null,
          ) => {
            if (data) {
              setQuestion((prev) =>
                prev
                  ? {
                      ...prev,
                      questionText: data.questionText,
                      responseText: data.responseText,
                      sourceUrl: data.sourceUrl,
                    }
                  : prev,
              );
            }
          },
        )
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    window.addEventListener('open-question-detail', handler);
    return () => window.removeEventListener('open-question-detail', handler);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) close();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  if (!question && !open) return null;

  const isQuestion =
    question?.type === 'written_question' || question?.type === 'oral_question';

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={close}
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full sm:max-w-lg transform bg-white shadow-xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Détail de la question"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200/60 ring-inset">
                {question
                  ? (activityTypeLabels[question.type] ?? question.type)
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
                  {statusLabels[question.status] ?? question.status}
                </span>
              )}
            </div>
            <button
              onClick={close}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              aria-label="Fermer"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {question && (
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              <div>
                <h4 className="text-lg font-semibold text-slate-900 leading-snug">
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
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                        />
                      </svg>
                      Consulter sur assemblee-nationale.fr
                    </a>
                  ) : (
                    <span
                      className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-400"
                      title="Le lien officiel n'a pas été trouvé pour cette question"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                        />
                      </svg>
                      Consulter sur assemblee-nationale.fr
                    </span>
                  )}
                </div>
              )}

              {question.governmentComments && (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3">
                  <svg
                    className="h-4 w-4 shrink-0 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21"
                    />
                  </svg>
                  <p className="text-sm font-medium text-slate-600">
                    {question.governmentComments}
                  </p>
                </div>
              )}

              {isQuestion && (
                <>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50">
                    <div className="border-b border-slate-200 px-4 py-3">
                      <h4 className="text-sm font-semibold text-slate-700">
                        Texte de la question
                      </h4>
                    </div>
                    <div className="px-4 py-4">
                      {loading ? (
                        <p className="text-sm text-slate-400 animate-pulse">
                          Chargement…
                        </p>
                      ) : question.questionText ? (
                        <p className="whitespace-pre-line text-sm leading-7 text-slate-700">
                          {stripHtml(question.questionText)}
                        </p>
                      ) : (
                        <p className="text-sm italic text-slate-400">
                          Texte non disponible.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-indigo-200 bg-indigo-50/40">
                    <div className="flex items-center justify-between border-b border-indigo-200 px-4 py-3">
                      <h4 className="text-sm font-semibold text-indigo-800">
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
                        <p className="whitespace-pre-line text-sm leading-7 text-slate-700">
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
            </div>
          )}
        </div>
      </div>
    </>
  );
}
