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

const statusColors: Record<string, string> = {
  adopted: 'text-green-700 bg-green-50',
  rejected: 'text-red-700 bg-red-50',
  withdrawn: 'text-yellow-700 bg-yellow-50',
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
            } | null,
          ) => {
            if (data) {
              setQuestion((prev) =>
                prev
                  ? {
                      ...prev,
                      questionText: data.questionText,
                      responseText: data.responseText,
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
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-lg transform bg-white shadow-xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Détail de la question"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h3 className="text-base font-semibold text-slate-900">
              {question
                ? (activityTypeLabels[question.type] ?? question.type)
                : ''}
            </h3>
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
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              <div>
                <p className="text-sm font-medium text-slate-500">Intitulé</p>
                <p className="mt-1 text-slate-900">{question.title}</p>
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="font-medium text-slate-500">Date : </span>
                  <span className="text-slate-900">
                    {formatDate(question.date)}
                  </span>
                </div>
                {question.status && (
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusColors[question.status] ?? ''}`}
                  >
                    {statusLabels[question.status] ?? question.status}
                  </span>
                )}
              </div>

              {question.governmentComments && (
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    Ministère interrogé
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {question.governmentComments}
                  </p>
                </div>
              )}

              {isQuestion && (
                <>
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      Texte de la question
                    </p>
                    {loading ? (
                      <p className="mt-2 text-sm text-slate-400 animate-pulse">
                        Chargement…
                      </p>
                    ) : question.questionText ? (
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                        {stripHtml(question.questionText)}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm italic text-slate-400">
                        Texte non disponible.
                      </p>
                    )}
                  </div>

                  <div className="border-t border-slate-200 pt-5">
                    <p className="text-sm font-medium text-slate-500">
                      Réponse du gouvernement
                    </p>
                    {loading ? (
                      <p className="mt-2 text-sm text-slate-400 animate-pulse">
                        Chargement…
                      </p>
                    ) : question.responseText ? (
                      <>
                        {question.responseDate && (
                          <p className="mt-1 text-xs text-slate-400">
                            Publiée le {formatDate(question.responseDate)}
                          </p>
                        )}
                        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                          {stripHtml(question.responseText)}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm italic text-slate-400">
                        Pas encore de réponse publiée.
                      </p>
                    )}
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
