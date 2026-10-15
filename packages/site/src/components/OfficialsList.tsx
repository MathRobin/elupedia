/**
 * Annuaire des élus : grille de cartes paginée avec recherche et filtres
 * (types de mandat, mandat en cours, groupe politique, département, tri),
 * panneau latéral sur desktop et tiroir sur mobile.
 *
 * Rendu sur `pages/elus/index.astro` avec `client:load`. La page passe la
 * liste complète des élus (un élément par couple élu × mandat, d'où la clé
 * `id-mandateType`) ; tout le filtrage est local.
 *
 * Les filtres sont synchronisés avec la query string (`q`, `type`, `actif`,
 * `photo`, `dep`, `groupe`, `tri`, `page`) via `history.replaceState` et
 * relus sur `popstate`. Pour éviter un mismatch d'hydratation, le premier
 * rendu ignore l'URL (identique au SSR) et les filtres de l'URL ne sont
 * appliqués qu'après montage.
 *
 * `readFiltersFromUrl` est exporté pour `OfficialsList.test.ts`.
 * `tests/site-index.test.js` (racine) vérifie des chaînes exactes de ce
 * fichier (`d.photoUrl`, `d.politicalGroup`, `d.id`, `loading="lazy"`…) :
 * la variable `d` des cartes doit garder ce nom.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { DEPARTMENT_CODES } from '../lib/department-codes.js';
import { useFocusTrap } from '../lib/use-focus-trap.js';

type Official = {
  id: string;
  /** Slug de la fiche ; l'id sert de repli dans l'URL. */
  slug: string | null;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  district: string | null;
  department: string | null;
  politicalGroup: string | null;
  /** Clé de type de mandat (`depute`, `senateur`, `conseiller_regional`…). */
  mandateType: string;
  /** Pour accorder le libellé du mandat (Députée, Sénatrice…). */
  isFemale: boolean;
  hasActiveMandate: boolean;
};

/** État complet des filtres ; un booléen par type de mandat (coché = affiché). */
type Filters = {
  search: string;
  depute: boolean;
  senateur: boolean;
  maire: boolean;
  eurodepute: boolean;
  conseillerDepartemental: boolean;
  conseillerRegional: boolean;
  conseillerArrondissement: boolean;
  membreAssembleeStatutParticulier: boolean;
  conseillerFrancaisEtranger: boolean;
  membreAfe: boolean;
  /** Ne montrer que les mandats en cours. */
  mandatActif: boolean;
  /** Filtre masqué dans l'UI (`hidden`) mais encore lisible via `?photo=`. */
  photoFilter: '' | 'with' | 'without';
  department: string;
  group: string;
  sort: 'name' | 'department';
};

/** Nombre de cartes par page. */
const PAGE_SIZE = 30;
/**
 * Nombre de types de mandat filtrables (autant que de booléens dans
 * `Filters`) : quand tous sont cochés, `?type=` n'est pas écrit dans l'URL.
 */
const MANDATE_TYPE_COUNT = 10;

const DEFAULT_FILTERS: Filters = {
  search: '',
  depute: true,
  senateur: true,
  maire: true,
  eurodepute: true,
  conseillerDepartemental: true,
  conseillerRegional: true,
  conseillerArrondissement: true,
  membreAssembleeStatutParticulier: true,
  conseillerFrancaisEtranger: true,
  membreAfe: true,
  mandatActif: true,
  photoFilter: '',
  department: '',
  group: '',
  sort: 'name',
};

/** Minuscules sans diacritiques, pour une comparaison tolérante. */
function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Lit les filtres et la page depuis la query string. Retourne des filtres
 * vides au SSR (pas de `window`). Les types de mandat absents de `?type=`
 * sont explicitement mis à `false` (sinon tous restent cochés par défaut).
 */
export function readFiltersFromUrl(): {
  filters: Partial<Filters>;
  page?: number;
} {
  if (typeof window === 'undefined') return { filters: {} };
  const params = new URLSearchParams(window.location.search);
  const filters: Partial<Filters> = {};
  if (params.has('q')) filters.search = params.get('q')!;
  if (params.has('type')) {
    const types = new Set(params.get('type')!.split(','));
    filters.depute = types.has('depute');
    filters.senateur = types.has('senateur');
    filters.maire = types.has('maire');
    filters.eurodepute = types.has('eurodepute');
    filters.conseillerDepartemental = types.has('conseiller_departemental');
    filters.conseillerRegional = types.has('conseiller_regional');
    filters.conseillerArrondissement = types.has('conseiller_arrondissement');
    filters.membreAssembleeStatutParticulier = types.has(
      'membre_assemblee_statut_particulier',
    );
    filters.conseillerFrancaisEtranger = types.has(
      'conseiller_francais_etranger',
    );
    filters.membreAfe = types.has('membre_afe');
  }
  if (params.has('actif')) filters.mandatActif = params.get('actif') !== '0';
  if (params.has('photo')) {
    const photoParam = params.get('photo');
    if (photoParam === 'with' || photoParam === 'without')
      filters.photoFilter = photoParam;
  }
  if (params.has('dep')) filters.department = params.get('dep')!;
  if (params.has('groupe')) filters.group = params.get('groupe')!;
  if (
    params.has('tri') &&
    (params.get('tri') === 'name' || params.get('tri') === 'department')
  )
    filters.sort = params.get('tri') as 'name' | 'department';
  const pageParam = parseInt(params.get('page') ?? '', 10);
  return { filters, page: pageParam > 0 ? pageParam : undefined };
}

/** Reflète les filtres non par défaut dans l'URL, sans entrée d'historique. */
function writeFiltersToUrl(filters: Filters, page: number) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  const activeTypes = [
    filters.depute && 'depute',
    filters.senateur && 'senateur',
    filters.maire && 'maire',
    filters.eurodepute && 'eurodepute',
    filters.conseillerDepartemental && 'conseiller_departemental',
    filters.conseillerRegional && 'conseiller_regional',
    filters.conseillerArrondissement && 'conseiller_arrondissement',
    filters.membreAssembleeStatutParticulier &&
      'membre_assemblee_statut_particulier',
    filters.conseillerFrancaisEtranger && 'conseiller_francais_etranger',
    filters.membreAfe && 'membre_afe',
  ].filter(Boolean) as string[];
  // Tous cochés = état par défaut, rien à écrire ; aucun coché non plus
  // (l'URL ne sait pas représenter « aucun type »).
  if (activeTypes.length > 0 && activeTypes.length < MANDATE_TYPE_COUNT) {
    params.set('type', activeTypes.join(','));
  }
  if (!filters.mandatActif) params.set('actif', '0');
  if (filters.photoFilter) params.set('photo', filters.photoFilter);
  if (filters.department) params.set('dep', filters.department);
  if (filters.group) params.set('groupe', filters.group);
  if (filters.sort !== 'name') params.set('tri', filters.sort);
  if (page > 1) params.set('page', String(page));
  const queryString = params.toString();
  const url = queryString
    ? `${window.location.pathname}?${queryString}`
    : window.location.pathname;
  window.history.replaceState(null, '', url);
}

/** true si au moins un type de mandat est décoché. */
function isAnyMandateTypeUnchecked(filters: Filters): boolean {
  return (
    !filters.depute ||
    !filters.senateur ||
    !filters.maire ||
    !filters.eurodepute ||
    !filters.conseillerDepartemental ||
    !filters.conseillerRegional ||
    !filters.conseillerArrondissement ||
    !filters.membreAssembleeStatutParticulier ||
    !filters.conseillerFrancaisEtranger ||
    !filters.membreAfe
  );
}

/**
 * Nombre de filtres actifs affiché dans « Filtres (n) » ; les types de
 * mandat comptent pour un seul filtre.
 */
function countActiveFilters(filters: Filters): number {
  return (
    (filters.search ? 1 : 0) +
    (isAnyMandateTypeUnchecked(filters) ? 1 : 0) +
    (!filters.mandatActif ? 1 : 0) +
    (filters.photoFilter ? 1 : 0) +
    (filters.department ? 1 : 0) +
    (filters.group ? 1 : 0)
  );
}

/** Nombre de pages au-delà duquel la pagination est abrégée avec « … ». */
const MAX_UNABRIDGED_PAGES = 7;

/**
 * Numéros de page à afficher : tous jusqu'à `MAX_UNABRIDGED_PAGES`, sinon
 * première, dernière, la page courante et ses voisines, avec des « … ».
 */
function pageRange(current: number, total: number): (number | '…')[] {
  const pages: (number | '…')[] = [];
  if (total <= MAX_UNABRIDGED_PAGES) {
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
  onChange: (page: number) => void;
}) {
  const buttonBase =
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
        className={`${buttonBase} px-2 ${page <= 1 ? disabled : inactive}`}
        aria-label="Page précédente"
      >
        <i className="fa-solid fa-chevron-left text-sm" aria-hidden="true" />
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
            className={`${buttonBase} ${p === page ? active : inactive}`}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onChange(page + 1)}
        className={`${buttonBase} px-2 ${page >= totalPages ? disabled : inactive}`}
        aria-label="Page suivante"
      >
        <i className="fa-solid fa-chevron-right text-sm" aria-hidden="true" />
      </button>
    </nav>
  );
}

/** Panneau de filtres, partagé entre la barre latérale et le tiroir mobile. */
function FilterPanel({
  filters,
  onChange,
  onReset,
  counts,
  groups,
  departments,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onReset: () => void;
  /** Effectif de chaque type de mandat, affiché à côté de la case. */
  counts: {
    depute: number;
    senateur: number;
    maire: number;
    eurodepute: number;
    conseillerDepartemental: number;
    conseillerRegional: number;
    conseillerArrondissement: number;
    membreAssembleeStatutParticulier: number;
    conseillerFrancaisEtranger: number;
    membreAfe: number;
  };
  groups: string[];
  departments: string[];
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
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.eurodepute}
              onChange={(e) =>
                onChange({ ...filters, eurodepute: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Eurodéputé·es{' '}
              <span className="text-slate-400">({counts.eurodepute})</span>
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.conseillerDepartemental}
              onChange={(e) =>
                onChange({
                  ...filters,
                  conseillerDepartemental: e.target.checked,
                })
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Conseillers·ères départementaux·ales{' '}
              <span className="text-slate-400">
                ({counts.conseillerDepartemental})
              </span>
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.conseillerRegional}
              onChange={(e) =>
                onChange({
                  ...filters,
                  conseillerRegional: e.target.checked,
                })
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Conseillers·ères régionaux·ales{' '}
              <span className="text-slate-400">
                ({counts.conseillerRegional})
              </span>
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.conseillerArrondissement}
              onChange={(e) =>
                onChange({
                  ...filters,
                  conseillerArrondissement: e.target.checked,
                })
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Conseillers·ères d'arrondissement{' '}
              <span className="text-slate-400">
                ({counts.conseillerArrondissement})
              </span>
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.membreAssembleeStatutParticulier}
              onChange={(e) =>
                onChange({
                  ...filters,
                  membreAssembleeStatutParticulier: e.target.checked,
                })
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Membres d'assemblée territoriale{' '}
              <span className="text-slate-400">
                ({counts.membreAssembleeStatutParticulier})
              </span>
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.conseillerFrancaisEtranger}
              onChange={(e) =>
                onChange({
                  ...filters,
                  conseillerFrancaisEtranger: e.target.checked,
                })
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Conseillers·ères des Français·es de l'étranger{' '}
              <span className="text-slate-400">
                ({counts.conseillerFrancaisEtranger})
              </span>
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.membreAfe}
              onChange={(e) =>
                onChange({ ...filters, membreAfe: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Membres de l'AFE{' '}
              <span className="text-slate-400">({counts.membreAfe})</span>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Statut
        </legend>
        <label className="mt-3 flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.mandatActif}
            onChange={(e) =>
              onChange({ ...filters, mandatActif: e.target.checked })
            }
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            Mandat en cours uniquement
          </span>
        </label>
      </fieldset>

      {/* Filtre photo retiré de l'UI mais conservé (encore pilotable via ?photo=). */}
      <div className="space-y-2" hidden>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.photoFilter === 'with'}
            onChange={(e) =>
              onChange({
                ...filters,
                photoFilter: e.target.checked ? 'with' : '',
              })
            }
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            Avec photo
          </span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.photoFilter === 'without'}
            onChange={(e) =>
              onChange({
                ...filters,
                photoFilter: e.target.checked ? 'without' : '',
              })
            }
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            Sans photo
          </span>
        </label>
      </div>

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
              {DEPARTMENT_CODES[d] ? ` (${DEPARTMENT_CODES[d]})` : ''}
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

/** Props injectées par la page Astro. */
type Props = {
  /** Un élément par couple élu × mandat. */
  officials: Official[];
};

export default function OfficialsList({ officials }: Props) {
  // État initial identique au SSR (toujours DEFAULT_FILTERS) pour éviter un
  // mismatch d'hydratation : les filtres réels de l'URL sont appliqués après
  // le montage, dans l'effet ci-dessous.
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const filterTrapRef = useFocusTrap(drawerOpen);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!drawerOpen) return;
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [drawerOpen]);

  useEffect(() => {
    // Au tout premier rendu, ne pas réécrire l'URL : elle doit rester
    // intacte jusqu'à ce que l'effet de synchronisation ci-dessous l'ait lue.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    writeFiltersToUrl(filters, page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [filters, page]);

  // Applique les filtres réels de l'URL une fois montés côté client (le
  // rendu initial, identique au SSR, ignore volontairement l'URL).
  useEffect(() => {
    const urlState = readFiltersFromUrl();
    if (Object.keys(urlState.filters).length === 0 && !urlState.page) return;
    setFilters({ ...DEFAULT_FILTERS, ...urlState.filters });
    setPage(urlState.page ?? 1);
  }, []);

  const updateFilters = (nextFilters: Filters) => {
    setFilters(nextFilters);
    setPage(1);
  };

  // Navigation arrière/avant : l'URL a changé, on la relit.
  useEffect(() => {
    const applyUrlState = () => {
      const urlState = readFiltersFromUrl();
      setFilters({ ...DEFAULT_FILTERS, ...urlState.filters });
      setPage(urlState.page ?? 1);
    };
    window.addEventListener('popstate', applyUrlState);
    return () => window.removeEventListener('popstate', applyUrlState);
  }, []);

  const counts = useMemo(
    () => ({
      depute: officials.filter((o) => o.mandateType === 'depute').length,
      senateur: officials.filter((o) => o.mandateType === 'senateur').length,
      maire: officials.filter((o) => o.mandateType === 'maire').length,
      eurodepute: officials.filter((o) => o.mandateType === 'eurodepute')
        .length,
      conseillerDepartemental: officials.filter(
        (o) => o.mandateType === 'conseiller_departemental',
      ).length,
      conseillerRegional: officials.filter(
        (o) => o.mandateType === 'conseiller_regional',
      ).length,
      conseillerArrondissement: officials.filter(
        (o) => o.mandateType === 'conseiller_arrondissement',
      ).length,
      membreAssembleeStatutParticulier: officials.filter(
        (o) => o.mandateType === 'membre_assemblee_statut_particulier',
      ).length,
      conseillerFrancaisEtranger: officials.filter(
        (o) => o.mandateType === 'conseiller_francais_etranger',
      ).length,
      membreAfe: officials.filter((o) => o.mandateType === 'membre_afe').length,
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
    const normalizedQuery = normalize(filters.search);
    let list = officials.filter((o) => {
      if (filters.mandatActif && !o.hasActiveMandate) return false;
      if (o.mandateType === 'depute' && !filters.depute) return false;
      if (o.mandateType === 'senateur' && !filters.senateur) return false;
      if (o.mandateType === 'maire' && !filters.maire) return false;
      if (o.mandateType === 'eurodepute' && !filters.eurodepute) return false;
      if (
        o.mandateType === 'conseiller_departemental' &&
        !filters.conseillerDepartemental
      )
        return false;
      if (
        o.mandateType === 'conseiller_regional' &&
        !filters.conseillerRegional
      )
        return false;
      if (
        o.mandateType === 'conseiller_arrondissement' &&
        !filters.conseillerArrondissement
      )
        return false;
      if (
        o.mandateType === 'membre_assemblee_statut_particulier' &&
        !filters.membreAssembleeStatutParticulier
      )
        return false;
      if (
        o.mandateType === 'conseiller_francais_etranger' &&
        !filters.conseillerFrancaisEtranger
      )
        return false;
      if (o.mandateType === 'membre_afe' && !filters.membreAfe) return false;
      if (filters.photoFilter === 'with' && !o.photoUrl) return false;
      if (filters.photoFilter === 'without' && o.photoUrl) return false;
      if (filters.department && o.department !== filters.department)
        return false;
      if (filters.group && o.politicalGroup !== filters.group) return false;
      if (normalizedQuery) {
        // La recherche porte sur le nom complet, la circonscription et le département.
        const haystack = normalize(
          `${o.firstName} ${o.lastName} ${o.district ?? ''} ${o.department ?? ''}`,
        );
        if (!haystack.includes(normalizedQuery)) return false;
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
  // `page` peut dépasser (URL manuelle, filtres resserrés) : on borne à l'affichage.
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const activeCount = countActiveFilters(filters);

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
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
          <label htmlFor="officials-mobile-search" className="sr-only">
            Rechercher un élu
          </label>
          <input
            id="officials-mobile-search"
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
            <i className="fa-solid fa-sliders text-sm" aria-hidden="true" />
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
          <label htmlFor="officials-sort" className="sr-only">
            Trier par
          </label>
          <select
            id="officials-sort"
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
              {/* `d` : nom vérifié par tests/site-index.test.js, ne pas renommer. */}
              {paged.map((d) => (
                <a
                  key={`${d.id}-${d.mandateType}`}
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
                      className={`inline-block w-24 text-center break-words text-[10px] font-medium uppercase px-1.5 py-0.5 leading-tight rounded-full ${
                        d.mandateType === 'depute'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : d.mandateType === 'senateur'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                            : d.mandateType === 'eurodepute'
                              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                              : d.mandateType === 'conseiller_departemental'
                                ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400'
                                : d.mandateType === 'conseiller_regional'
                                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                  : d.mandateType ===
                                      'conseiller_arrondissement'
                                    ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400'
                                    : d.mandateType ===
                                        'membre_assemblee_statut_particulier'
                                      ? 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400'
                                      : d.mandateType ===
                                          'conseiller_francais_etranger'
                                        ? 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400'
                                        : d.mandateType === 'membre_afe'
                                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
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
                          : d.mandateType === 'eurodepute'
                            ? d.isFemale
                              ? 'Députée européenne'
                              : 'Député européen'
                            : d.mandateType === 'conseiller_departemental'
                              ? d.isFemale
                                ? 'Conseillère départementale'
                                : 'Conseiller départemental'
                              : d.mandateType === 'conseiller_regional'
                                ? d.isFemale
                                  ? 'Conseillère régionale'
                                  : 'Conseiller régional'
                                : d.mandateType === 'conseiller_arrondissement'
                                  ? d.isFemale
                                    ? "Conseillère d'arrondissement"
                                    : "Conseiller d'arrondissement"
                                  : d.mandateType ===
                                      'membre_assemblee_statut_particulier'
                                    ? "Membre d'assemblée"
                                    : d.mandateType ===
                                        'conseiller_francais_etranger'
                                      ? d.isFemale
                                        ? "Conseillère des Français·es de l'étranger"
                                        : "Conseiller des Français·es de l'étranger"
                                      : d.mandateType === 'membre_afe'
                                        ? "Membre de l'AFE"
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
