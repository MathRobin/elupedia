/**
 * Section « Élections municipales » d'une fiche d'élu : une carte cliquable
 * par tour de scrutin (barre de répartition des voix, légende des premiers
 * candidats), groupées par année, et un tiroir latéral détaillant le tour
 * (participation, blancs/nuls, résultats par candidat).
 *
 * Rendue sur `pages/elus/[slug]/index.astro` (section municipales) avec
 * `client:load`. Le composant exporté par défaut s'appelle
 * `MunicipalElectionSection` bien que le fichier soit nommé
 * `MunicipalElectionDrawer` : le tiroir (`DrawerContent`) n'en est qu'une
 * partie.
 *
 * Les données viennent des résultats municipaux du ministère de l'Intérieur
 * (`electionId` de la forme `<année>_…`, champs en français : inscrits,
 * exprimés, nuance, liste…).
 */
import { useState, useEffect } from 'react';
import { useFocusTrap } from '../lib/use-focus-trap.js';

type Candidate = {
  /** Numéro de panneau électoral, identifiant du candidat dans le tour. */
  panneau: number;
  nom: string;
  prenom: string;
  sexe: string | null;
  /** Nuance politique attribuée par le ministère. */
  nuance: string | null;
  /** Nom de la liste ; null en scrutin plurinominal (panachage). */
  liste: string | null;
  voix: number;
  ratioInscrits: number;
  ratioExprimes: number;
  officialId: string | null;
  officialSlug: string | null;
};

type Election = {
  id: string;
  /** Identifiant ministère, préfixé par l'année (`2020_…`). */
  electionId: string;
  communeName: string | null;
  round: number;
  /** Date ISO. */
  electionDate: string;
  inscrits: number;
  abstentions: number;
  votants: number;
  blancs: number;
  nuls: number;
  exprimes: number;
  candidates: Candidate[];
};

/** Props injectées par la page Astro. */
type Props = {
  elections: Election[];
};

/** Nombre de segments de la barre de répartition sur la carte d'un tour. */
const MAX_BAR_SEGMENTS = 8;
/** Nombre de candidats nommés dans la légende de la carte d'un tour. */
const MAX_LEGEND_CANDIDATES = 4;

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** « 12,34 % » (virgule décimale, deux décimales). */
function formatPercent(value: number): string {
  return value.toFixed(2).replace('.', ',') + ' %';
}

function formatNumber(value: number): string {
  return value.toLocaleString('fr-FR');
}

/** Année extraite de l'`electionId` ministère (`2020_…` → 2020). */
function electionYear(electionId: string): string {
  return electionId.split('_')[0];
}

function electionLabel(electionId: string): string {
  return `Municipales ${electionYear(electionId)}`;
}

/** Part des exprimés obtenue par un candidat, en pourcentage. */
function votePercent(candidate: Candidate, election: Election): number {
  return election.exprimes > 0 ? (candidate.voix / election.exprimes) * 100 : 0;
}

// En dessous de 1000 habitants, le scrutin municipal est plurinominal
// majoritaire avec panachage : chaque électeur vote pour des candidats
// individuels (pas pour une liste bloquée), jusqu'à concurrence du nombre
// de sièges à pourvoir. Les scores par candidat sont donc indépendants les
// uns des autres et ne s'additionnent pas à 100 % — l'absence de "liste"
// dans les données officielles est le signal de ce mode de scrutin.
function isPanachage(election: Election): boolean {
  return (
    election.candidates.length > 0 &&
    election.candidates.every((candidate) => !candidate.liste)
  );
}

/** Couleur par candidat, attribuée cycliquement selon son rang. */
const CANDIDATE_COLORS = [
  'bg-indigo-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-cyan-500',
  'bg-violet-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-lime-500',
];

function candidateColor(index: number): string {
  return CANDIDATE_COLORS[index % CANDIDATE_COLORS.length];
}

/** Tiroir latéral : détail complet d'un tour de scrutin. */
function DrawerContent({
  election,
  onClose,
}: {
  election: Election;
  onClose: () => void;
}) {
  const trapRef = useFocusTrap(true);

  useEffect(() => {
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const participationRate =
    election.inscrits > 0
      ? ((election.votants / election.inscrits) * 100).toFixed(2)
      : '0';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${electionLabel(election.electionId)} — Tour ${election.round}`}
        className="relative w-full max-w-2xl bg-white shadow-2xl flex flex-col dark:bg-slate-900"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {electionLabel(election.electionId)} — Tour {election.round}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {formatDate(election.electionDate)}
              {election.communeName && ` · ${election.communeName}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Fermer"
          >
            <i
              className="fa-solid fa-xmark h-5 w-5 flex items-center justify-center"
              aria-hidden="true"
            />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Inscrits
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {formatNumber(election.inscrits)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Votants
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {formatNumber(election.votants)}
              </p>
              <p className="text-xs text-slate-400">
                {participationRate.replace('.', ',')} %
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Abstentions
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {formatNumber(election.abstentions)}
              </p>
              <p className="text-xs text-slate-400">
                {election.inscrits > 0
                  ? formatPercent(
                      (election.abstentions / election.inscrits) * 100,
                    )
                  : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Blancs
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {formatNumber(election.blancs)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Nuls
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {formatNumber(election.nuls)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Exprimés
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {formatNumber(election.exprimes)}
              </p>
            </div>
          </div>

          {isPanachage(election) && (
            <div className="flex gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 p-3.5 text-sm text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
              <i
                className="fa-solid fa-circle-info mt-0.5 shrink-0 text-indigo-500 dark:text-indigo-400"
                aria-hidden="true"
              />
              <p>
                Commune de moins de 1&nbsp;000 habitants : le scrutin est un{' '}
                <strong>panachage</strong>
                <a
                  href="/glossaire/panachage"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Voir la définition dans le glossaire"
                  aria-label="Voir la définition de panachage dans le glossaire"
                  className="mx-1 inline-flex align-middle text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  <i
                    className="fa-solid fa-circle-question"
                    aria-hidden="true"
                  />
                </a>
                , pas un vote de liste. Chaque électeur choisit librement des
                candidats individuels, jusqu'à autant de noms que de sièges à
                pourvoir, y compris en mélangeant plusieurs listes. Les scores
                de chaque candidat sont donc indépendants les uns des autres et
                ne s'additionnent pas à 100&nbsp;% — il est normal que plusieurs
                candidats affichent un score élevé et proche les uns des autres.
              </p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              Résultats par candidat
            </h3>
            <div className="space-y-3">
              {election.candidates.map((candidate, idx) => {
                const percent = votePercent(candidate, election);
                const color = candidateColor(idx);

                return (
                  <div
                    key={`${candidate.panneau}-${candidate.nom}`}
                    className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`h-3 w-3 rounded-full shrink-0 ${color}`}
                        />
                        <span className="font-medium text-sm text-slate-900 dark:text-white truncate">
                          {candidate.prenom} {candidate.nom}
                        </span>
                        {candidate.officialSlug && (
                          <a
                            href={`/elus/${candidate.officialSlug}`}
                            className="shrink-0 text-indigo-500 hover:text-indigo-700 transition-colors"
                            title="Voir la fiche"
                          >
                            <i
                              className="fa-solid fa-arrow-up-right-from-square text-sm"
                              aria-hidden="true"
                            />
                          </a>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {formatNumber(candidate.voix)} voix
                        </span>
                        <span className="ml-2 text-xs text-slate-500">
                          ({formatPercent(percent)})
                        </span>
                      </div>
                    </div>

                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-700">
                      <div
                        className={`h-full rounded-full ${color} transition-all`}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                      {candidate.nuance && <span>{candidate.nuance}</span>}
                      {candidate.liste && (
                        <span className="truncate max-w-[300px]">
                          {candidate.liste}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MunicipalElectionSection({ elections }: Props) {
  const [openElection, setOpenElection] = useState<Election | null>(null);

  if (elections.length === 0) return null;

  // Regroupement par année, affiché de la plus récente à la plus ancienne.
  const electionsByYear = new Map<string, Election[]>();
  for (const election of elections) {
    const year = electionYear(election.electionId);
    if (!electionsByYear.has(year)) electionsByYear.set(year, []);
    electionsByYear.get(year)!.push(election);
  }

  const sortedYears = [...electionsByYear.keys()].sort((a, b) =>
    b.localeCompare(a),
  );

  return (
    <>
      <div className="mt-4 space-y-6">
        {sortedYears.map((year) => {
          const rounds = electionsByYear
            .get(year)!
            .sort((a, b) => a.round - b.round);
          return (
            <div key={year}>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                Municipales {year}
              </h3>
              <div className="space-y-3">
                {rounds.map((election) => {
                  return (
                    <button
                      key={election.id}
                      type="button"
                      onClick={() => setOpenElection(election)}
                      className="w-full text-left rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-indigo-300/60 hover:shadow-md cursor-pointer dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500/40"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                          Tour {election.round}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {formatDate(election.electionDate)} ·{' '}
                          {formatNumber(election.exprimes)} exprimés
                        </span>
                      </div>

                      <div className="h-3 flex rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700">
                        {election.candidates
                          .slice(0, MAX_BAR_SEGMENTS)
                          .map((candidate, idx) => {
                            const percent = votePercent(candidate, election);
                            return (
                              <div
                                key={candidate.panneau}
                                className={candidateColor(idx)}
                                style={{ width: `${percent}%` }}
                                title={`${candidate.prenom} ${candidate.nom}: ${formatPercent(percent)}`}
                              />
                            );
                          })}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                        {election.candidates
                          .slice(0, MAX_LEGEND_CANDIDATES)
                          .map((candidate, idx) => (
                            <span
                              key={candidate.panneau}
                              className="flex items-center gap-1.5"
                            >
                              <span
                                className={`h-2 w-2 rounded-full ${candidateColor(idx)}`}
                              />
                              {candidate.prenom} {candidate.nom}{' '}
                              <span className="text-slate-400">
                                {formatPercent(
                                  votePercent(candidate, election),
                                )}
                              </span>
                            </span>
                          ))}
                        {election.candidates.length > MAX_LEGEND_CANDIDATES && (
                          <span className="text-slate-400">
                            +
                            {election.candidates.length - MAX_LEGEND_CANDIDATES}{' '}
                            autres
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {openElection && (
        <DrawerContent
          election={openElection}
          onClose={() => setOpenElection(null)}
        />
      )}
    </>
  );
}
