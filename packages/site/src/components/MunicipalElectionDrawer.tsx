import { useState } from 'react';

type Candidate = {
  panneau: number;
  nom: string;
  prenom: string;
  sexe: string | null;
  nuance: string | null;
  liste: string | null;
  voix: number;
  ratioInscrits: number;
  ratioExprimes: number;
  officialId: string | null;
  officialSlug: string | null;
};

type Election = {
  id: string;
  electionId: string;
  communeName: string | null;
  round: number;
  electionDate: string;
  inscrits: number;
  abstentions: number;
  votants: number;
  blancs: number;
  nuls: number;
  exprimes: number;
  candidates: Candidate[];
};

type Props = {
  elections: Election[];
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function fmtPct(n: number): string {
  return n.toFixed(2).replace('.', ',') + ' %';
}

function fmtNum(n: number): string {
  return n.toLocaleString('fr-FR');
}

function electionLabel(electionId: string): string {
  const year = electionId.split('_')[0];
  return `Municipales ${year}`;
}

const candidateColors = [
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

function DrawerContent({
  election,
  onClose,
}: {
  election: Election;
  onClose: () => void;
}) {
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
      <div className="relative w-full max-w-2xl bg-white shadow-2xl flex flex-col dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {electionLabel(election.electionId)} — Tour {election.round}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {fmtDate(election.electionDate)}
              {election.communeName && ` · ${election.communeName}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors dark:hover:bg-slate-800 dark:hover:text-slate-300"
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
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Inscrits
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {fmtNum(election.inscrits)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Votants
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {fmtNum(election.votants)}
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
                {fmtNum(election.abstentions)}
              </p>
              <p className="text-xs text-slate-400">
                {election.inscrits > 0
                  ? fmtPct((election.abstentions / election.inscrits) * 100)
                  : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Blancs
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {fmtNum(election.blancs)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Nuls
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {fmtNum(election.nuls)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Exprimés
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {fmtNum(election.exprimes)}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              Résultats par candidat
            </h3>
            <div className="space-y-3">
              {election.candidates.map((c, idx) => {
                const pct =
                  election.exprimes > 0
                    ? (c.voix / election.exprimes) * 100
                    : 0;
                const color = candidateColors[idx % candidateColors.length];

                return (
                  <div
                    key={`${c.panneau}-${c.nom}`}
                    className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`h-3 w-3 rounded-full shrink-0 ${color}`}
                        />
                        <span className="font-medium text-sm text-slate-900 dark:text-white truncate">
                          {c.prenom} {c.nom}
                        </span>
                        {c.officialSlug && (
                          <a
                            href={`/elus/${c.officialSlug}`}
                            className="shrink-0 text-indigo-500 hover:text-indigo-700 transition-colors"
                            title="Voir la fiche"
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
                                d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                              />
                            </svg>
                          </a>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {fmtNum(c.voix)} voix
                        </span>
                        <span className="ml-2 text-xs text-slate-500">
                          ({fmtPct(pct)})
                        </span>
                      </div>
                    </div>

                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-700">
                      <div
                        className={`h-full rounded-full ${color} transition-all`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                      {c.nuance && <span>{c.nuance}</span>}
                      {c.liste && (
                        <span className="truncate max-w-[300px]">
                          {c.liste}
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

  const byYear = new Map<string, Election[]>();
  for (const e of elections) {
    const year = e.electionId.split('_')[0];
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(e);
  }

  const sortedYears = [...byYear.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <>
      <div className="mt-4 space-y-6">
        {sortedYears.map((year) => {
          const rounds = byYear.get(year)!.sort((a, b) => a.round - b.round);
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
                          {fmtDate(election.electionDate)} ·{' '}
                          {fmtNum(election.exprimes)} exprimés
                        </span>
                      </div>

                      <div className="h-3 flex rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700">
                        {election.candidates.slice(0, 8).map((c, idx) => {
                          const pct =
                            election.exprimes > 0
                              ? (c.voix / election.exprimes) * 100
                              : 0;
                          return (
                            <div
                              key={c.panneau}
                              className={
                                candidateColors[idx % candidateColors.length]
                              }
                              style={{ width: `${pct}%` }}
                              title={`${c.prenom} ${c.nom}: ${fmtPct(pct)}`}
                            />
                          );
                        })}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                        {election.candidates.slice(0, 4).map((c, idx) => (
                          <span
                            key={c.panneau}
                            className="flex items-center gap-1.5"
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${candidateColors[idx % candidateColors.length]}`}
                            />
                            {c.prenom} {c.nom}{' '}
                            <span className="text-slate-400">
                              {fmtPct(
                                election.exprimes > 0
                                  ? (c.voix / election.exprimes) * 100
                                  : 0,
                              )}
                            </span>
                          </span>
                        ))}
                        {election.candidates.length > 4 && (
                          <span className="text-slate-400">
                            +{election.candidates.length - 4} autres
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
