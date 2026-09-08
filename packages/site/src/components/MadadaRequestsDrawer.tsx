import { useState, useEffect, useCallback } from 'react';

export interface MadadaRequestItem {
  madadaId: number;
  urlTitle: string;
  title: string;
  status: string;
  createdAt: string;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  successful: {
    label: 'Aboutie',
    color:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
  },
  partially_successful: {
    label: 'Partiellement aboutie',
    color:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
  },
  waiting_response: {
    label: 'En attente',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  },
  waiting_response_overdue: {
    label: 'En retard',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  },
  overdue: {
    label: 'En retard',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  },
  not_held: {
    label: 'Non détenue',
    color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  },
  rejected: {
    label: 'Refusée',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  },
  waiting_clarification: {
    label: 'Clarification demandée',
    color:
      'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  },
  gone: {
    label: 'Retirée',
    color: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  },
  user_withdrawn: {
    label: 'Retirée',
    color: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  },
  error_message: {
    label: 'Erreur',
    color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  },
  requires_admin: {
    label: 'En traitement',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  },
  internal_review: {
    label: 'En traitement',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  },
  attention_requested: {
    label: 'Signalée',
    color:
      'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  },
  waiting_response_very_overdue: {
    label: 'Très en retard',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  },
  waiting_classification: {
    label: 'En attente de classement',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  },
};

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function StatusBadge({ status }: { status: string }) {
  const info = statusLabels[status] ?? {
    label: status,
    color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${info.color}`}
    >
      {info.label}
    </span>
  );
}

export default function MadadaRequestsDrawer({
  requests,
  madadaUrlName,
  aggregateCount,
}: {
  requests: MadadaRequestItem[];
  madadaUrlName: string;
  aggregateCount: number;
}) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function handler() {
      setOpen(true);
    }
    window.addEventListener('open-madada-drawer', handler);
    return () => window.removeEventListener('open-madada-drawer', handler);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) close();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  if (!open) return null;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={close}
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-lg transform bg-white shadow-xl transition-transform duration-300 dark:bg-slate-900 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Demandes CADA"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Demandes CADA (
              {requests.length > 0 ? requests.length : aggregateCount})
            </h3>
            <button
              onClick={close}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors dark:hover:bg-slate-800 dark:hover:text-slate-300"
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

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {requests.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {aggregateCount} demande{aggregateCount > 1 ? 's' : ''}{' '}
                  enregistrée{aggregateCount > 1 ? 's' : ''} pour cette commune.
                  Le détail individuel sera disponible après la prochaine
                  synchronisation.
                </p>
                <a
                  href={`https://madada.fr/body/${madadaUrlName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 transition-colors dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  Consulter les demandes sur MaDada.fr
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
                </a>
              </div>
            ) : (
              <ul className="space-y-3">
                {requests.map((req) => (
                  <li key={req.madadaId}>
                    <a
                      href={`https://madada.fr/request/${req.urlTitle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border border-slate-200 p-3 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors dark:border-slate-700 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/30"
                    >
                      <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-2">
                        {req.title}
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <StatusBadge status={req.status} />
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {formatDate(req.createdAt)}
                        </span>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-6 text-xs text-slate-400">
              <a
                href={`https://madada.fr/body/${madadaUrlName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-slate-600 dark:hover:text-slate-300"
              >
                Voir toutes les demandes sur MaDada.fr
              </a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
