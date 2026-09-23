import { useMemo, useState } from 'react';
import { useFocusTrap } from '../lib/use-focus-trap.js';
import type { ElectionEvent, ElectionType } from '../lib/election-types.js';

const TYPE_LABELS: Record<ElectionType, string> = {
  municipale: 'Municipales',
  legislative: 'Législatives',
  senatoriale: 'Sénatoriales',
};

const TYPE_COLORS: Record<ElectionType, string> = {
  municipale:
    'bg-blue-50 text-blue-700 ring-blue-600/10 dark:bg-blue-900/20 dark:text-blue-300',
  legislative:
    'bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-900/20 dark:text-emerald-300',
  senatoriale:
    'bg-purple-50 text-purple-700 ring-purple-600/10 dark:bg-purple-900/20 dark:text-purple-300',
};

function isUpcoming(dateStr: string): boolean {
  return new Date(dateStr).getTime() > Date.now();
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

type StatusFilter = 'all' | 'upcoming' | 'past';

export default function ElectionsList({ events }: { events: ElectionEvent[] }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<Set<ElectionType>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const drawerRef = useFocusTrap(mobileFiltersOpen);

  const years = useMemo(
    () =>
      [...new Set(events.map((e) => e.electionDate.slice(0, 4)))].sort((a, b) =>
        b.localeCompare(a),
      ),
    [events],
  );
  const [yearFilter, setYearFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (q && !e.label.toLowerCase().includes(q)) return false;
      if (typeFilter.size > 0 && !typeFilter.has(e.type)) return false;
      if (yearFilter && e.electionDate.slice(0, 4) !== yearFilter) return false;
      if (statusFilter === 'upcoming' && !isUpcoming(e.electionDate))
        return false;
      if (statusFilter === 'past' && isUpcoming(e.electionDate)) return false;
      return true;
    });
  }, [events, search, typeFilter, yearFilter, statusFilter]);

  const activeFilterCount =
    typeFilter.size + (yearFilter ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0);

  function toggleType(t: ElectionType) {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function resetFilters() {
    setTypeFilter(new Set());
    setYearFilter(null);
    setStatusFilter('all');
    setSearch('');
  }

  const filterPanel = (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Type d'élection
        </legend>
        <div className="mt-2 space-y-1.5">
          {(Object.keys(TYPE_LABELS) as ElectionType[]).map((t) => (
            <label
              key={t}
              className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"
            >
              <input
                type="checkbox"
                checked={typeFilter.has(t)}
                onChange={() => toggleType(t)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              {TYPE_LABELS[t]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Statut
        </legend>
        <div className="mt-2 space-y-1.5">
          {(
            [
              ['all', 'Toutes'],
              ['upcoming', 'À venir'],
              ['past', 'Passées'],
            ] as [StatusFilter, string][]
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"
            >
              <input
                type="radio"
                name="status"
                checked={statusFilter === value}
                onChange={() => setStatusFilter(value)}
                className="border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Année
        </legend>
        <select
          value={yearFilter ?? ''}
          onChange={(e) => setYearFilter(e.target.value || null)}
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
        >
          <option value="">Toutes les années</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </fieldset>

      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={resetFilters}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
        >
          Réinitialiser les filtres
        </button>
      )}
    </div>
  );

  return (
    <div className="mt-6 flex flex-col gap-6 lg:flex-row">
      <aside className="hidden w-72 shrink-0 lg:block">
        <div className="sticky top-24 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          {filterPanel}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <i
              className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            ></i>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une élection..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            />
          </div>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 lg:hidden"
          >
            <i className="fa-solid fa-sliders" aria-hidden="true"></i>
            Filtres{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {filtered.length} élection{filtered.length !== 1 ? 's' : ''}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {filtered.map((e) => (
            <a
              key={`${e.type}-${e.id}`}
              href={`/elections/${e.type}/${e.id}`}
              className="group flex flex-col rounded-xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/50 p-5 shadow-sm transition-all hover:border-indigo-300/60 hover:shadow-lg hover:-translate-y-0.5 no-underline dark:border-slate-700 dark:from-slate-800 dark:to-slate-800/80 dark:hover:border-indigo-500/40"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TYPE_COLORS[e.type]}`}
                >
                  {TYPE_LABELS[e.type]}
                </span>
                {isUpcoming(e.electionDate) && (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/10 dark:bg-amber-900/20 dark:text-amber-300">
                    À venir
                  </span>
                )}
              </div>
              <h2 className="mt-3 font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors dark:text-slate-100 dark:group-hover:text-indigo-400">
                {e.label}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {fmtDate(e.electionDate)}
              </p>
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                {e.candidateCount > 0 &&
                  `${e.candidateCount.toLocaleString('fr-FR')} candidat(e)s · `}
                {e.scopeCount.toLocaleString('fr-FR')}{' '}
                {e.type === 'senatoriale' ? 'départements' : 'communes'}
              </p>
            </a>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="mt-8 text-center text-slate-500 dark:text-slate-400">
            Aucune élection ne correspond à ces critères.
          </p>
        )}
      </div>

      {mobileFiltersOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filtres"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div
            ref={drawerRef}
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-5 dark:bg-slate-800"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMobileFiltersOpen(false);
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Filtres
              </h2>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
                aria-label="Fermer"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
            <div className="mt-4">{filterPanel}</div>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
              className="mt-6 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white"
            >
              Voir {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
