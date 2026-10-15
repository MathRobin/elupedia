/**
 * Tiroir latéral détaillant un intérêt déclaré à la HATVP (activité
 * professionnelle, participation financière, etc.) d'un élu.
 *
 * Rendu une seule fois sur `pages/elus/[slug]/index.astro` avec
 * `client:idle` : sans contenu tant qu'il n'est pas ouvert, donc hydratation
 * différée. Il s'ouvre sur l'événement `open-interest-detail` dispatché sur
 * `window` par les lignes du tableau d'intérêts de la page, dont `detail`
 * est un `InterestDetail` complet (pas d'appel réseau ici).
 *
 * `InterestDetailDrawer.test.ts` vérifie la présence de chaînes exactes
 * dans ce fichier (libellés de sections, `interest.<champ> &&`) : les
 * garder telles quelles.
 */
import { useState, useEffect, useCallback } from 'react';
import { useFocusTrap } from '../lib/use-focus-trap.js';

export interface InterestDetail {
  entityName: string;
  type: string;
  /** Clé de `CATEGORY_LABELS`. */
  category: string;
  roleDescription: string | null;
  /** Date ISO. */
  declaredDate: string;
  declarantComment: string | null;
  sourceDocumentUrl: string | null;
  ownershipDetail: string | null;
  /** Montant en euros, sous forme de chaîne décimale. */
  annualAmount: string | null;
  amountYear: number | null;
  /** true = net, false = brut, null = non précisé. */
  amountIsNet: boolean | null;
  /** Date ISO. */
  updatedAt: string;
  /** Historique des déclarations ayant mentionné cet intérêt. */
  declarationSnapshots: DeclarationSnapshot[];
}

export interface DeclarationSnapshot {
  declarationDate: string;
  /** Clé de `DECLARATION_TYPE_LABELS`. */
  declarationType: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  professional_activity: 'Activité professionnelle',
  consulting_activity: 'Activité de conseil',
  governing_body_membership: 'Organe dirigeant',
  voluntary_activity: 'Activité bénévole',
  elected_function: 'Fonction élective',
  financial_participation: 'Participation financière',
};

const DECLARATION_TYPE_LABELS: Record<string, string> = {
  initial: 'Déclaration initiale',
  modification: 'Modification',
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

/** « 12 000 € net » / « 12 000 € brut » / « 12 000 € » selon `isNet`. */
function formatAmount(amount: string, isNet: boolean | null): string {
  const value = parseFloat(amount);
  const formatted = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
  if (isNet === true) return `${formatted} net`;
  if (isNet === false) return `${formatted} brut`;
  return formatted;
}

export default function InterestDetailDrawer() {
  const [interest, setInterest] = useState<InterestDetail | null>(null);
  const [open, setOpen] = useState(false);
  const trapRef = useFocusTrap(open);

  const close = useCallback(() => {
    setOpen(false);
    setTimeout(() => setInterest(null), CLOSE_ANIMATION_MS);
  }, []);

  useEffect(() => {
    function openFromEvent(e: Event) {
      const detail = (e as CustomEvent<InterestDetail>).detail;
      setInterest(detail);
      setOpen(true);
    }
    window.addEventListener('open-interest-detail', openFromEvent);
    return () =>
      window.removeEventListener('open-interest-detail', openFromEvent);
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
        ref={trapRef}
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-lg transform bg-white shadow-xl transition-transform duration-300 dark:bg-slate-900 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Détail de l'intérêt déclaré"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {interest
                ? (CATEGORY_LABELS[interest.category] ?? interest.category)
                : ''}
            </h3>
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
                <div>
                  <span className="font-medium text-slate-500 dark:text-slate-400">
                    Dernière mise à jour :{' '}
                  </span>
                  <span className="text-slate-900 dark:text-white">
                    {formatDate(interest.updatedAt)}
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
                    <i
                      className="fa-solid fa-arrow-up-right-from-square text-sm"
                      aria-hidden="true"
                    />
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
                    {interest.declarationSnapshots.map((snapshot, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-400" />
                        <span className="text-slate-700 dark:text-slate-300">
                          {formatDate(snapshot.declarationDate)}
                        </span>
                        <span className="text-xs text-slate-400">
                          {DECLARATION_TYPE_LABELS[snapshot.declarationType] ??
                            snapshot.declarationType}
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
