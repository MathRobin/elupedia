import { useState, useEffect, useCallback } from 'react';

export interface InterestDetail {
  entityName: string;
  type: string;
  category: string;
  roleDescription: string | null;
  declaredDate: string;
  declarantComment: string | null;
  sourceDocumentUrl: string | null;
  ownershipDetail: string | null;
  annualAmount: string | null;
  amountYear: number | null;
  amountIsNet: boolean | null;
  declarationSnapshots: DeclarationSnapshot[];
}

export interface DeclarationSnapshot {
  declarationDate: string;
  declarationType: string;
}

const categoryLabels: Record<string, string> = {
  professional_activity: 'Activité professionnelle',
  consulting_activity: 'Activité de conseil',
  governing_body_membership: 'Organe dirigeant',
  voluntary_activity: 'Activité bénévole',
  elected_function: 'Fonction élective',
  financial_participation: 'Participation financière',
};

const typeLabels: Record<string, string> = {
  initial: 'Déclaration initiale',
  modification: 'Modification',
};

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatAmount(amount: string, isNet: boolean | null): string {
  const num = parseFloat(amount);
  const formatted = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(num);
  if (isNet === true) return `${formatted} net`;
  if (isNet === false) return `${formatted} brut`;
  return formatted;
}

export default function InterestDetailDrawer() {
  const [interest, setInterest] = useState<InterestDetail | null>(null);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setTimeout(() => setInterest(null), 300);
  }, []);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<InterestDetail>).detail;
      setInterest(detail);
      setOpen(true);
    }
    window.addEventListener('open-interest-detail', handler);
    return () => window.removeEventListener('open-interest-detail', handler);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) close();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  if (!interest && !open) return null;

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
        aria-label="Détail de l'intérêt déclaré"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {interest
                ? (categoryLabels[interest.category] ?? interest.category)
                : ''}
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

          {interest && (
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  Entité
                </p>
                <p className="mt-1 text-slate-900 font-medium dark:text-white">
                  {interest.entityName}
                </p>
              </div>

              {interest.roleDescription && (
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Rôle
                  </p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                    {interest.roleDescription}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="font-medium text-slate-500 dark:text-slate-400">
                    Déclaré le :{' '}
                  </span>
                  <span className="text-slate-900 dark:text-white">
                    {formatDate(interest.declaredDate)}
                  </span>
                </div>
              </div>

              {interest.declarantComment && (
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Commentaire du déclarant
                  </p>
                  <p className="mt-1 text-sm text-slate-700 whitespace-pre-line">
                    {interest.declarantComment}
                  </p>
                </div>
              )}

              {interest.ownershipDetail && (
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Détail de participation
                  </p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                    {interest.ownershipDetail}
                  </p>
                </div>
              )}

              {interest.annualAmount && (
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Montant annuel déclaré
                    {interest.amountYear ? ` (${interest.amountYear})` : ''}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {formatAmount(interest.annualAmount, interest.amountIsNet)}
                  </p>
                </div>
              )}

              {interest.sourceDocumentUrl && (
                <div>
                  <a
                    href={interest.sourceDocumentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 transition-colors"
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
                    Voir la déclaration sur hatvp.fr
                  </a>
                </div>
              )}

              {interest.declarationSnapshots.length > 0 && (
                <div className="border-t border-slate-200 pt-5 dark:border-slate-700">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Historique des déclarations
                  </p>
                  <ul className="mt-3 space-y-2">
                    {interest.declarationSnapshots.map((snap, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-400" />
                        <span className="text-slate-700 dark:text-slate-300">
                          {formatDate(snap.declarationDate)}
                        </span>
                        <span className="text-xs text-slate-400">
                          {typeLabels[snap.declarationType] ??
                            snap.declarationType}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
