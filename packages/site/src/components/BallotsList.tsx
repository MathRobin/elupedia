/**
 * Liste filtrable des scrutins (AN, Sénat, Parlement européen) avec
 * recherche, filtres par type / résultat / période, tri, et chargement
 * progressif (« Voir plus ») ; panneau de filtres latéral sur desktop,
 * tiroir sur mobile.
 *
 * Rendue sur `pages/votes/index.astro` avec `client:load`. Tout le filtrage
 * est local sur la liste passée en props.
 *
 * Les filtres sont synchronisés avec la query string (`q`, `type`,
 * `resultat`, `du`, `au`, `tri`) via `history.replaceState`, pour que l'URL
 * soit partageable. Ils sont lus de l'URL dès l'état initial : contrairement
 * à `OfficialsList`, ce composant ne se protège pas d'un mismatch
 * d'hydratation (le SSR rend toujours les filtres par défaut).
 *
 * Règle d'affichage « Adopté / Rejeté » : pour > contre, sans tenir compte
 * des règles de majorité propres à chaque assemblée.
 */
import { useState, useEffect, useMemo } from 'react';
import { useFocusTrap } from '../lib/use-focus-trap.js';

type Ballot = {
  id: string;
  title: string;
  /** Date ISO (AAAA-MM-JJ), comparable par chaîne. */
  date: string;
  /** Assemblée d'origine (clé brute, ex. `europarl`), cf. `formatTypeLabel`. */
  type: string;
  forCount: number;
  againstCount: number;
  abstainCount: number;
  absentCount: number;
};

type Filters = {
  search: string;
  /** Types cochés ; vide = tous. */
  types: string[];
  result: '' | 'adopted' | 'rejected';
  dateFrom: string;
  dateTo: string;
  sort: 'date-desc' | 'date-asc' | 'alpha';
};

const DEFAULT_FILTERS: Filters = {
  search: '',
  types: [],
  result: '',
  dateFrom: '',
  dateTo: '',
  sort: 'date-desc',
};

/** Nombre de scrutins ajoutés à chaque « Voir plus ». */
const PAGE_SIZE = 30;

/** Libellé d'un type de scrutin brut. */
function formatTypeLabel(raw: string): string {
  if (raw === 'europarl') return 'Parlement européen';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** Minuscules sans diacritiques, pour une comparaison tolérante. */
function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Un scrutin est affiché « Adopté » si les pour dépassent les contre. */
function isAdopted(ballot: Ballot): boolean {
  return ballot.forCount > ballot.againstCount;
}

/** Nombre de filtres actifs affiché dans le bouton « Filtres (n) ». */
function countActiveFilters(filters: Filters): number {
  return (
    (filters.search ? 1 : 0) +
    (filters.types.length > 0 ? 1 : 0) +
    (filters.result ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0)
  );
}

/** Lit les filtres depuis la query string ; vide au SSR. */
function readFiltersFromUrl(): Partial<Filters> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const filters: Partial<Filters> = {};
  if (params.has('q')) filters.search = params.get('q')!;
  if (params.has('type'))
    filters.types = params.get('type')!.split(',').filter(Boolean);
  if (
    params.has('resultat') &&
    (params.get('resultat') === 'adopted' ||
      params.get('resultat') === 'rejected')
  )
    filters.result = params.get('resultat') as 'adopted' | 'rejected';
  if (params.has('du')) filters.dateFrom = params.get('du')!;
  if (params.has('au')) filters.dateTo = params.get('au')!;
  if (params.has('tri')) filters.sort = params.get('tri') as Filters['sort'];
  return filters;
}

/** Reflète les filtres non par défaut dans l'URL, sans entrée d'historique. */
function writeFiltersToUrl(filters: Filters) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  if (filters.types.length > 0) params.set('type', filters.types.join(','));
  if (filters.result) params.set('resultat', filters.result);
  if (filters.dateFrom) params.set('du', filters.dateFrom);
  if (filters.dateTo) params.set('au', filters.dateTo);
  if (filters.sort !== 'date-desc') params.set('tri', filters.sort);
  const queryString = params.toString();
  const url = queryString
    ? `${window.location.pathname}?${queryString}`
    : window.location.pathname;
  window.history.replaceState(null, '', url);
}

/** Panneau de filtres, partagé entre la barre latérale et le tiroir mobile. */
function FilterPanel({
  filters,
  onChange,
  onReset,
  types,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onReset: () => void;
  /** Types de scrutin présents dans les données. */
  types: string[];
}) {
  const activeCount = countActiveFilters(filters);

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
        <div className="mt-2 space-y-1.5">
          {types.map((type) => (
            <label
              key={type}
              className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={filters.types.includes(type)}
                onChange={(e) => {
                  const nextTypes = e.target.checked
                    ? [...filters.types, type]
                    : filters.types.filter((t) => t !== type);
                  onChange({ ...filters, types: nextTypes });
                }}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
              />
              {formatTypeLabel(type)}
            </label>
          ))}
        </div>
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

/** Couleurs des segments de la barre de répartition des votes. */
const positionColors: Record<string, string> = {
  for: 'bg-emerald-500',
  against: 'bg-red-500',
  abstain: 'bg-amber-400',
  absent: 'bg-slate-300 dark:bg-slate-600',
};

/** Props injectées par la page Astro. */
type Props = {
  ballots: Ballot[];
};

export default function BallotsList({ ballots }: Props) {
  const [filters, setFilters] = useState<Filters>({
    ...DEFAULT_FILTERS,
    ...readFiltersFromUrl(),
  });
  // Nombre de « pages » chargées : on affiche `page * PAGE_SIZE` scrutins.
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const filterTrapRef = useFocusTrap(drawerOpen);

  useEffect(() => {
    if (!drawerOpen) return;
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [drawerOpen]);

  // Tout changement de filtre réécrit l'URL et repart du premier lot.
  useEffect(() => {
    writeFiltersToUrl(filters);
    setPage(1);
  }, [filters]);

  const types = useMemo(
    () =>
      [...new Set(ballots.map((ballot) => ballot.type))].sort((a, b) =>
        a.localeCompare(b, 'fr'),
      ),
    [ballots],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = normalize(filters.search);
    let list = ballots.filter((ballot) => {
      if (filters.types.length > 0 && !filters.types.includes(ballot.type))
        return false;
      if (filters.result) {
        const adopted = isAdopted(ballot);
        if (filters.result === 'adopted' && !adopted) return false;
        if (filters.result === 'rejected' && adopted) return false;
      }
      if (filters.dateFrom && ballot.date < filters.dateFrom) return false;
      if (filters.dateTo && ballot.date > filters.dateTo) return false;
      if (normalizedQuery && !normalize(ballot.title).includes(normalizedQuery))
        return false;
      return true;
    });

    if (filters.sort === 'date-asc')
      list = [...list].sort((a, b) => a.date.localeCompare(b.date));
    else if (filters.sort === 'alpha')
      list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    else list = [...list].sort((a, b) => b.date.localeCompare(a.date));

    return list;
  }, [ballots, filters]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;
  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const activeCount = countActiveFilters(filters);

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
          <label htmlFor="ballots-mobile-search" className="sr-only">
            Rechercher un scrutin
          </label>
          <input
            id="ballots-mobile-search"
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
          <label htmlFor="ballots-sort" className="sr-only">
            Trier par
          </label>
          <select
            id="ballots-sort"
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
              {visible.map((ballot) => {
                const totalVotes =
                  ballot.forCount +
                  ballot.againstCount +
                  ballot.abstainCount +
                  ballot.absentCount;
                const adopted = isAdopted(ballot);
                return (
                  <a
                    key={ballot.id}
                    href={`/scrutins/${ballot.id}`}
                    className="group block rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-indigo-300/60 hover:shadow-md no-underline dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500/40"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 dark:text-white dark:group-hover:text-indigo-400">
                          {ballot.title}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>
                            {new Date(ballot.date).toLocaleDateString('fr-FR')}
                          </span>
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300">
                            {formatTypeLabel(ballot.type)}
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

                    {totalVotes > 0 && (
                      <>
                        <div className="mt-3 h-2 flex rounded-full overflow-hidden">
                          {ballot.forCount > 0 && (
                            <div
                              className={positionColors.for}
                              style={{
                                width: `${(ballot.forCount / totalVotes) * 100}%`,
                              }}
                            />
                          )}
                          {ballot.againstCount > 0 && (
                            <div
                              className={positionColors.against}
                              style={{
                                width: `${(ballot.againstCount / totalVotes) * 100}%`,
                              }}
                            />
                          )}
                          {ballot.abstainCount > 0 && (
                            <div
                              className={positionColors.abstain}
                              style={{
                                width: `${(ballot.abstainCount / totalVotes) * 100}%`,
                              }}
                            />
                          )}
                          {ballot.absentCount > 0 && (
                            <div
                              className={positionColors.absent}
                              style={{
                                width: `${(ballot.absentCount / totalVotes) * 100}%`,
                              }}
                            />
                          )}
                        </div>
                        <div className="mt-1.5 flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                          <span>{ballot.forCount} pour</span>
                          <span>{ballot.againstCount} contre</span>
                          <span>{ballot.abstainCount} abst.</span>
                          {ballot.absentCount > 0 && (
                            <span>{ballot.absentCount} abs.</span>
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
                  Voir plus ({filtered.length - visible.length} restants)
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
          <div
            ref={filterTrapRef}
            role="dialog"
            aria-modal="true"
            aria-label="Filtres"
            className="relative w-full max-w-sm bg-white shadow-xl flex flex-col dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Filtres
              </h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Fermer"
              >
                <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
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
