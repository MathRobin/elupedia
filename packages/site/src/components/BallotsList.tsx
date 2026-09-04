import { useState, useEffect, useMemo } from 'react';

type Ballot = {
  id: string;
  title: string;
  date: string;
  type: string;
  forCount: number;
  againstCount: number;
  abstainCount: number;
  absentCount: number;
};

type Filters = {
  search: string;
  type: string;
  result: '' | 'adopted' | 'rejected';
  dateFrom: string;
  dateTo: string;
  sort: 'date-desc' | 'date-asc' | 'alpha';
};

const PAGE_SIZE = 30;

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function readFiltersFromUrl(): Partial<Filters> {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.search);
  const f: Partial<Filters> = {};
  if (p.has('q')) f.search = p.get('q')!;
  if (p.has('type')) f.type = p.get('type')!;
  if (
    p.has('resultat') &&
    (p.get('resultat') === 'adopted' || p.get('resultat') === 'rejected')
  )
    f.result = p.get('resultat') as 'adopted' | 'rejected';
  if (p.has('du')) f.dateFrom = p.get('du')!;
  if (p.has('au')) f.dateTo = p.get('au')!;
  if (p.has('tri')) f.sort = p.get('tri') as Filters['sort'];
  return f;
}

function writeFiltersToUrl(filters: Filters) {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams();
  if (filters.search) p.set('q', filters.search);
  if (filters.type) p.set('type', filters.type);
  if (filters.result) p.set('resultat', filters.result);
  if (filters.dateFrom) p.set('du', filters.dateFrom);
  if (filters.dateTo) p.set('au', filters.dateTo);
  if (filters.sort !== 'date-desc') p.set('tri', filters.sort);
  const qs = p.toString();
  const url = qs
    ? `${window.location.pathname}?${qs}`
    : window.location.pathname;
  window.history.replaceState(null, '', url);
}

function FilterPanel({
  filters,
  onChange,
  onReset,
  types,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onReset: () => void;
  types: string[];
}) {
  const activeCount =
    (filters.search ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.result ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0);

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Recherche
        </legend>
        <input
          type="search"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Intitulé du texte…"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        />
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Type de scrutin
        </legend>
        <select
          value={filters.type}
          onChange={(e) => onChange({ ...filters, type: e.target.value })}
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="">Tous les types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Résultat
        </legend>
        <select
          value={filters.result}
          onChange={(e) =>
            onChange({
              ...filters,
              result: e.target.value as Filters['result'],
            })
          }
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="">Tous</option>
          <option value="adopted">Adopté</option>
          <option value="rejected">Rejeté</option>
        </select>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Période
        </legend>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            Du
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                onChange({ ...filters, dateFrom: e.target.value })
              }
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            au
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            />
          </label>
        </div>
      </fieldset>

      {activeCount > 0 && (
        <button
          onClick={onReset}
          className="w-full rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Réinitialiser les filtres
        </button>
      )}
    </div>
  );
}

const positionColors: Record<string, string> = {
  for: 'bg-emerald-500',
  against: 'bg-red-500',
  abstain: 'bg-amber-400',
  absent: 'bg-slate-300 dark:bg-slate-600',
};

export default function BallotsList({ ballots }: { ballots: Ballot[] }) {
  const defaultFilters: Filters = {
    search: '',
    type: '',
    result: '',
    dateFrom: '',
    dateTo: '',
    sort: 'date-desc',
  };

  const [filters, setFilters] = useState<Filters>({
    ...defaultFilters,
    ...readFiltersFromUrl(),
  });
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    writeFiltersToUrl(filters);
    setPage(1);
  }, [filters]);

  const types = useMemo(
    () =>
      [...new Set(ballots.map((b) => b.type))].sort((a, b) =>
        a.localeCompare(b, 'fr'),
      ),
    [ballots],
  );

  const filtered = useMemo(() => {
    const q = normalize(filters.search);
    let list = ballots.filter((b) => {
      if (filters.type && b.type !== filters.type) return false;
      if (filters.result) {
        const adopted = b.forCount > b.againstCount;
        if (filters.result === 'adopted' && !adopted) return false;
        if (filters.result === 'rejected' && adopted) return false;
      }
      if (filters.dateFrom && b.date < filters.dateFrom) return false;
      if (filters.dateTo && b.date > filters.dateTo) return false;
      if (q && !normalize(b.title).includes(q)) return false;
      return true;
    });

    if (filters.sort === 'date-asc')
      list = [...list].sort((a, b) => a.date.localeCompare(b.date));
    else if (filters.sort === 'alpha')
      list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    else list = [...list].sort((a, b) => b.date.localeCompare(a.date));

    return list;
  }, [ballots, filters]);

  const paged = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = paged.length < filtered.length;
  const resetFilters = () => setFilters(defaultFilters);

  const activeCount =
    (filters.search ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.result ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0);

  return (
    <div className="flex gap-8">
      <aside className="hidden lg:block w-72 shrink-0">
        <div className="sticky top-24">
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            onReset={resetFilters}
            types={types}
          />
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <div className="lg:hidden mb-4 flex items-center gap-3">
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Rechercher un scrutin…"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          />
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            Filtres{activeCount > 0 && ` (${activeCount})`}
          </button>
        </div>

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filtered.length} scrutin{filtered.length !== 1 ? 's' : ''} trouvé
            {filtered.length !== 1 ? 's' : ''}
          </p>
          <select
            value={filters.sort}
            onChange={(e) =>
              setFilters({
                ...filters,
                sort: e.target.value as Filters['sort'],
              })
            }
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            <option value="date-desc">Plus récent</option>
            <option value="date-asc">Plus ancien</option>
            <option value="alpha">Alphabétique</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500 dark:text-slate-400">
              Aucun scrutin trouvé.
            </p>
            <button
              onClick={resetFilters}
              className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
            >
              Réinitialiser les filtres
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {paged.map((b) => {
                const total =
                  b.forCount + b.againstCount + b.abstainCount + b.absentCount;
                const adopted = b.forCount > b.againstCount;
                return (
                  <a
                    key={b.id}
                    href={`/scrutins/${b.id}`}
                    className="group block rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-indigo-300/60 hover:shadow-md no-underline dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500/40"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 dark:text-white dark:group-hover:text-indigo-400">
                          {b.title}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>
                            {new Date(b.date).toLocaleDateString('fr-FR')}
                          </span>
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300">
                            {b.type}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          adopted
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                            : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                        }`}
                      >
                        {adopted ? 'Adopté' : 'Rejeté'}
                      </span>
                    </div>

                    {total > 0 && (
                      <>
                        <div className="mt-3 h-2 flex rounded-full overflow-hidden">
                          {b.forCount > 0 && (
                            <div
                              className={positionColors.for}
                              style={{
                                width: `${(b.forCount / total) * 100}%`,
                              }}
                            />
                          )}
                          {b.againstCount > 0 && (
                            <div
                              className={positionColors.against}
                              style={{
                                width: `${(b.againstCount / total) * 100}%`,
                              }}
                            />
                          )}
                          {b.abstainCount > 0 && (
                            <div
                              className={positionColors.abstain}
                              style={{
                                width: `${(b.abstainCount / total) * 100}%`,
                              }}
                            />
                          )}
                          {b.absentCount > 0 && (
                            <div
                              className={positionColors.absent}
                              style={{
                                width: `${(b.absentCount / total) * 100}%`,
                              }}
                            />
                          )}
                        </div>
                        <div className="mt-1.5 flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                          <span>{b.forCount} pour</span>
                          <span>{b.againstCount} contre</span>
                          <span>{b.abstainCount} abst.</span>
                          {b.absentCount > 0 && (
                            <span>{b.absentCount} abs.</span>
                          )}
                        </div>
                      </>
                    )}
                  </a>
                );
              })}
            </div>

            {hasMore && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Voir plus ({filtered.length - paged.length} restants)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative w-full max-w-sm bg-white shadow-xl flex flex-col dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Filtres
              </h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 transition-colors"
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
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <FilterPanel
                filters={filters}
                onChange={setFilters}
                onReset={resetFilters}
                types={types}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
