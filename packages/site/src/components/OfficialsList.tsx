import { useState, useEffect, useMemo, useRef } from 'react';

type Official = {
  id: string;
  slug: string | null;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  district: string | null;
  department: string | null;
  politicalGroup: string | null;
  mandateType: string;
  isFemale: boolean;
};

type Filters = {
  search: string;
  depute: boolean;
  senateur: boolean;
  maire: boolean;
  department: string;
  group: string;
  sort: 'name' | 'department';
};

const PAGE_SIZE = 50;

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function readFiltersFromUrl(): { filters: Partial<Filters>; page?: number } {
  if (typeof window === 'undefined') return { filters: {} };
  const p = new URLSearchParams(window.location.search);
  const f: Partial<Filters> = {};
  if (p.has('q')) f.search = p.get('q')!;
  if (p.has('type')) {
    const types = new Set(p.get('type')!.split(','));
    f.depute = types.has('depute');
    f.senateur = types.has('senateur');
    f.maire = types.has('maire');
  }
  if (p.has('dep')) f.department = p.get('dep')!;
  if (p.has('groupe')) f.group = p.get('groupe')!;
  if (
    p.has('tri') &&
    (p.get('tri') === 'name' || p.get('tri') === 'department')
  )
    f.sort = p.get('tri') as 'name' | 'department';
  const pg = parseInt(p.get('page') ?? '', 10);
  return { filters: f, page: pg > 0 ? pg : undefined };
}

function writeFiltersToUrl(filters: Filters, page: number) {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams();
  if (filters.search) p.set('q', filters.search);
  const activeTypes = [
    filters.depute && 'depute',
    filters.senateur && 'senateur',
    filters.maire && 'maire',
  ].filter(Boolean) as string[];
  const allTypes = 3;
  if (activeTypes.length > 0 && activeTypes.length < allTypes) {
    p.set('type', activeTypes.join(','));
  }
  if (filters.department) p.set('dep', filters.department);
  if (filters.group) p.set('groupe', filters.group);
  if (filters.sort !== 'name') p.set('tri', filters.sort);
  if (page > 1) p.set('page', String(page));
  const qs = p.toString();
  const url = qs
    ? `${window.location.pathname}?${qs}`
    : window.location.pathname;
  window.history.replaceState(null, '', url);
}

function pageRange(current: number, total: number): (number | '…')[] {
  const pages: (number | '…')[] = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
    return pages;
  }
  pages.push(1);
  if (current > 3) pages.push('…');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  const btn =
    'inline-flex items-center justify-center h-9 min-w-[2.25rem] rounded-lg text-sm font-medium transition-colors';
  const inactive =
    'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700';
  const active = 'bg-indigo-600 text-white dark:bg-indigo-500';
  const disabled = 'text-slate-300 pointer-events-none dark:text-slate-600';

  return (
    <nav
      className="mt-8 flex items-center justify-center gap-1"
      aria-label="Pagination"
    >
      <button
        onClick={() => onChange(page - 1)}
        className={`${btn} px-2 ${page <= 1 ? disabled : inactive}`}
        aria-label="Page précédente"
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
            d="M15.75 19.5 8.25 12l7.5-7.5"
          />
        </svg>
      </button>
      {pageRange(page, totalPages).map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="px-1 text-slate-400">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`${btn} ${p === page ? active : inactive}`}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onChange(page + 1)}
        className={`${btn} px-2 ${page >= totalPages ? disabled : inactive}`}
        aria-label="Page suivante"
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
            d="m8.25 4.5 7.5 7.5-7.5 7.5"
          />
        </svg>
      </button>
    </nav>
  );
}

function FilterPanel({
  filters,
  onChange,
  onReset,
  counts,
  groups,
  departments,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onReset: () => void;
  counts: { depute: number; senateur: number; maire: number };
  groups: string[];
  departments: string[];
}) {
  const activeCount =
    (filters.search ? 1 : 0) +
    (!filters.depute || !filters.senateur || !filters.maire ? 1 : 0) +
    (filters.department ? 1 : 0) +
    (filters.group ? 1 : 0);

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
          placeholder="Nom, prénom, ville…"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        />
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Type de mandat
        </legend>
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.depute}
              onChange={(e) =>
                onChange({ ...filters, depute: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Députés·es{' '}
              <span className="text-slate-400">({counts.depute})</span>
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.senateur}
              onChange={(e) =>
                onChange({ ...filters, senateur: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Sénateurs·rices{' '}
              <span className="text-slate-400">({counts.senateur})</span>
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.maire}
              onChange={(e) =>
                onChange({ ...filters, maire: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Maires <span className="text-slate-400">({counts.maire})</span>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Groupe politique
        </legend>
        <select
          value={filters.group}
          onChange={(e) => onChange({ ...filters, group: e.target.value })}
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="">Tous les groupes</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Département
        </legend>
        <select
          value={filters.department}
          onChange={(e) => onChange({ ...filters, department: e.target.value })}
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="">Tous les départements</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
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

export default function OfficialsList({
  officials,
}: {
  officials: Official[];
}) {
  const defaultFilters: Filters = {
    search: '',
    depute: true,
    senateur: true,
    maire: true,
    department: '',
    group: '',
    sort: 'name',
  };

  const initial = readFiltersFromUrl();
  const [filters, setFilters] = useState<Filters>({
    ...defaultFilters,
    ...initial.filters,
  });
  const [page, setPage] = useState(initial.page ?? 1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isFirstRender = useRef(true);

  useEffect(() => {
    writeFiltersToUrl(filters, page);
    if (isFirstRender.current) {
      isFirstRender.current = false;
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [filters, page]);

  const updateFilters = (f: Filters) => {
    setFilters(f);
    setPage(1);
  };

  useEffect(() => {
    const onPop = () => {
      const u = readFiltersFromUrl();
      setFilters({ ...defaultFilters, ...u.filters });
      setPage(u.page ?? 1);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const counts = useMemo(
    () => ({
      depute: officials.filter((o) => o.mandateType === 'depute').length,
      senateur: officials.filter((o) => o.mandateType === 'senateur').length,
      maire: officials.filter((o) => o.mandateType === 'maire').length,
    }),
    [officials],
  );

  const groups = useMemo(
    () =>
      [...new Set(officials.map((o) => o.politicalGroup).filter(Boolean))].sort(
        (a, b) => a!.localeCompare(b!, 'fr'),
      ) as string[],
    [officials],
  );

  const departments = useMemo(
    () =>
      [...new Set(officials.map((o) => o.department).filter(Boolean))].sort(
        (a, b) => a!.localeCompare(b!, 'fr'),
      ) as string[],
    [officials],
  );

  const filtered = useMemo(() => {
    const q = normalize(filters.search);
    let list = officials.filter((o) => {
      if (o.mandateType === 'depute' && !filters.depute) return false;
      if (o.mandateType === 'senateur' && !filters.senateur) return false;
      if (o.mandateType === 'maire' && !filters.maire) return false;
      if (filters.department && o.department !== filters.department)
        return false;
      if (filters.group && o.politicalGroup !== filters.group) return false;
      if (q) {
        const haystack = normalize(
          `${o.firstName} ${o.lastName} ${o.district ?? ''} ${o.department ?? ''}`,
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (filters.sort === 'department') {
      list = [...list].sort((a, b) =>
        (a.department ?? '').localeCompare(b.department ?? '', 'fr'),
      );
    }

    return list;
  }, [officials, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const activeCount =
    (filters.search ? 1 : 0) +
    (!filters.depute || !filters.senateur || !filters.maire ? 1 : 0) +
    (filters.department ? 1 : 0) +
    (filters.group ? 1 : 0);

  const resetFilters = () => {
    setFilters(defaultFilters);
    setPage(1);
  };

  return (
    <div className="flex gap-8">
      {/* Sidebar desktop */}
      <aside className="hidden lg:block w-72 shrink-0">
        <div className="sticky top-24">
          <FilterPanel
            filters={filters}
            onChange={updateFilters}
            onReset={resetFilters}
            counts={counts}
            groups={groups}
            departments={departments}
          />
        </div>
      </aside>

      {/* Résultats */}
      <div className="flex-1 min-w-0">
        {/* Barre mobile */}
        <div className="lg:hidden mb-4 flex items-center gap-3">
          <input
            type="search"
            value={filters.search}
            onChange={(e) =>
              updateFilters({ ...filters, search: e.target.value })
            }
            placeholder="Rechercher un élu…"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          />
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
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
                d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
              />
            </svg>
            Filtres{activeCount > 0 && ` (${activeCount})`}
          </button>
        </div>

        {/* En-tête résultats */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filtered.length > PAGE_SIZE
              ? `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filtered.length)} sur ${filtered.length.toLocaleString('fr-FR')} élus`
              : `${filtered.length} élu${filtered.length !== 1 ? 's' : ''} trouvé${filtered.length !== 1 ? 's' : ''}`}
          </p>
          <select
            value={filters.sort}
            onChange={(e) =>
              updateFilters({
                ...filters,
                sort: e.target.value as 'name' | 'department',
              })
            }
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            <option value="name">Nom A-Z</option>
            <option value="department">Département</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500 dark:text-slate-400">
              Aucun résultat trouvé.
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {paged.map((d) => (
                <a
                  key={d.id}
                  href={`/elus/${d.slug ?? d.id}`}
                  className="group flex items-start gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5 hover:shadow-md hover:ring-indigo-400/40 transition-all no-underline dark:bg-slate-800 dark:ring-slate-700 dark:hover:ring-indigo-500/40"
                >
                  <div className="shrink-0 flex flex-col items-center gap-1">
                    {d.photoUrl ? (
                      <img
                        src={d.photoUrl}
                        alt={`${d.firstName} ${d.lastName}`}
                        className="h-14 w-14 rounded-full object-cover ring-2 ring-slate-100 dark:ring-slate-700"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-lg font-semibold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                        {d.firstName[0]}
                        {d.lastName[0]}
                      </div>
                    )}
                    <span
                      className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        d.mandateType === 'depute'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : d.mandateType === 'senateur'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}
                    >
                      {d.mandateType === 'depute'
                        ? d.isFemale
                          ? 'Députée'
                          : 'Député'
                        : d.mandateType === 'senateur'
                          ? d.isFemale
                            ? 'Sénatrice'
                            : 'Sénateur'
                          : d.isFemale
                            ? 'Mairesse'
                            : 'Maire'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors dark:text-white dark:group-hover:text-indigo-400">
                      {d.firstName} {d.lastName}
                    </p>
                    {d.district && (
                      <p className="mt-0.5 text-sm text-slate-500 truncate dark:text-slate-400">
                        {d.district}
                      </p>
                    )}
                    {d.politicalGroup && (
                      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                        {d.politicalGroup}
                      </p>
                    )}
                  </div>
                </a>
              ))}
            </div>

            {totalPages > 1 && (
              <Pagination
                page={safePage}
                totalPages={totalPages}
                onChange={setPage}
              />
            )}
          </>
        )}
      </div>

      {/* Drawer mobile */}
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
                onChange={updateFilters}
                onReset={resetFilters}
                counts={counts}
                groups={groups}
                departments={departments}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
