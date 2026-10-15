/**
 * Panorama des candidats d'une élection : grille de cartes triée par ordre
 * alphabétique (avec séparateurs par initiale), filtres par texte / périmètre
 * (commune ou département) / nuance politique, pagination côté client.
 *
 * Rendu sur `pages/elections/[type]/[id].astro` avec `client:load`.
 *
 * Deux régimes selon `needsSearch` (décidé par la page) :
 * - élection trop volumineuse (municipales, législatives) : la page ne charge
 *   aucun candidat tant qu'une commune n'est pas saisie ; le formulaire
 *   recharge la page avec `?q=<commune>` et la page filtre côté serveur ;
 * - sinon, tous les candidats sont passés en props et filtrés localement.
 *
 * Une carte est cliquable seulement si le candidat a une fiche Elupedia
 * (`hasProfile` + `profileSlug`) ; sinon elle est grisée.
 */
import { useMemo, useState } from 'react';
import { useFocusTrap } from '../lib/use-focus-trap.js';
import type { PanoramaCandidate } from '../lib/election-types.js';

/** Nombre de cartes par page. */
const PAGE_SIZE = 48;

/** Minuscules sans diacritiques, pour tri et comparaison tolérants. */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Initiale (majuscule, sans accent) servant de séparateur dans la grille. */
function initial(name: string): string {
  return normalize(name).charAt(0).toUpperCase() || '#';
}

// Certaines communes (scrutin de liste) ne fournissent que le nom de la
// liste dans les données sources, sans identité individuelle pour la tête
// de liste — on affiche alors le nom de liste comme identifiant principal.
function displayName(candidate: PanoramaCandidate): string {
  const fullName = `${candidate.prenom} ${candidate.nom}`.trim();
  return fullName || candidate.liste || 'Liste sans nom';
}

// Tri "annuaire" : par nom de famille (comme un répertoire d'entreprises
// trie par raison sociale), ou par nom de liste quand il n'y a pas
// d'identité individuelle.
function sortKey(candidate: PanoramaCandidate): string {
  return candidate.nom.trim() || candidate.liste || 'Liste sans nom';
}

/** Libellé du filtre « périmètre » selon le type d'élection. */
const SCOPE_LABELS: Record<string, string> = {
  senatoriale: 'Département',
  municipale: 'Commune',
  legislative: 'Commune',
};

/** Props injectées par la page Astro. */
type Props = {
  /** Type d'élection (`municipale`, `legislative`, `senatoriale`). */
  type: string;
  /** Identifiant de l'élection, pour reconstruire l'URL de la page. */
  id: string;
  candidates: PanoramaCandidate[];
  /** true : afficher le formulaire de recherche de commune au lieu de la grille. */
  needsSearch: boolean;
  /** Valeur de `?q=` (commune recherchée), '' sinon. */
  initialQuery: string;
};

export default function ElectionPanorama({
  type,
  id,
  candidates,
  needsSearch,
  initialQuery,
}: Props) {
  // Recherche de commune (rechargement de page), distincte du filtre texte local.
  const [communeSearch, setCommuneSearch] = useState(initialQuery);
  const [textFilter, setTextFilter] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  const [nuanceFilter, setNuanceFilter] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const drawerRef = useFocusTrap(mobileFiltersOpen);

  // Affiche « Commune : X · changer » quand le panorama est restreint à une commune.
  const isCommuneSearch =
    needsSearch || type === 'municipale' || type === 'legislative';
  const scopeLabel = SCOPE_LABELS[type] ?? 'Circonscription';

  const scopes = useMemo(
    () =>
      [...new Set(candidates.map((c) => c.scope).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [candidates],
  );

  // Nuances avec leur effectif, les plus représentées d'abord.
  const nuances = useMemo(() => {
    const countByNuance = new Map<string, number>();
    for (const candidate of candidates) {
      if (!candidate.nuance) continue;
      countByNuance.set(
        candidate.nuance,
        (countByNuance.get(candidate.nuance) ?? 0) + 1,
      );
    }
    return [...countByNuance.entries()].sort((a, b) => b[1] - a[1]);
  }, [candidates]);

  function toggleNuance(nuance: string) {
    setNuanceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(nuance)) next.delete(nuance);
      else next.add(nuance);
      return next;
    });
    setPage(1);
  }

  const filtered = useMemo(() => {
    const normalizedQuery = normalize(textFilter.trim());
    const sorted = [...candidates].sort((a, b) =>
      normalize(sortKey(a)).localeCompare(normalize(sortKey(b))),
    );
    return sorted.filter((candidate) => {
      if (scopeFilter && candidate.scope !== scopeFilter) return false;
      if (
        nuanceFilter.size > 0 &&
        !(candidate.nuance && nuanceFilter.has(candidate.nuance))
      )
        return false;
      if (normalizedQuery) {
        return (
          normalize(displayName(candidate)).includes(normalizedQuery) ||
          (candidate.nuance &&
            normalize(candidate.nuance).includes(normalizedQuery)) ||
          normalize(candidate.scope).includes(normalizedQuery)
        );
      }
      return true;
    });
  }, [candidates, textFilter, scopeFilter, nuanceFilter]);

  const activeFilterCount =
    (textFilter ? 1 : 0) + (scopeFilter ? 1 : 0) + nuanceFilter.size;

  function resetFilters() {
    setTextFilter('');
    setScopeFilter('');
    setNuanceFilter(new Set());
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Recharge la page avec `?q=` : le filtrage par commune est fait côté serveur.
  function submitCommuneSearch(e: React.FormEvent) {
    e.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set('q', communeSearch);
    window.location.href = url.toString();
  }

  if (needsSearch) {
    return (
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-slate-600 dark:text-slate-400">
          Cette élection concerne un grand nombre de communes. Recherchez une
          commune pour afficher son panorama de candidats.
        </p>
        <form onSubmit={submitCommuneSearch} className="mt-4 flex gap-2">
          <input
            type="search"
            value={communeSearch}
            onChange={(e) => setCommuneSearch(e.target.value)}
            placeholder="Nom de la commune..."
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Rechercher
          </button>
        </form>
      </div>
    );
  }

  // Panneau de filtres partagé entre la barre latérale desktop et le tiroir mobile.
  const filterPanel = (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Recherche
        </legend>
        <div className="relative mt-2">
          <i
            className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          ></i>
          <input
            type="search"
            value={textFilter}
            onChange={(e) => {
              setTextFilter(e.target.value);
              setPage(1);
            }}
            placeholder="Nom, nuance..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          />
        </div>
      </fieldset>

      {scopes.length > 1 && (
        <fieldset>
          <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {scopeLabel}
          </legend>
          <select
            value={scopeFilter}
            onChange={(e) => {
              setScopeFilter(e.target.value);
              setPage(1);
            }}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            <option value="">Tous</option>
            {scopes.map((scope) => (
              <option key={scope} value={scope}>
                {scope}
              </option>
            ))}
          </select>
        </fieldset>
      )}

      {nuances.length > 0 && (
        <fieldset>
          <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Groupe politique
          </legend>
          <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {nuances.map(([nuance, count]) => (
              <label
                key={nuance}
                className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400"
              >
                <input
                  type="checkbox"
                  checked={nuanceFilter.has(nuance)}
                  onChange={() => toggleNuance(nuance)}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  {nuance}{' '}
                  <span className="text-slate-400 dark:text-slate-500">
                    ({count})
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {isCommuneSearch && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Commune : <strong>{initialQuery}</strong> ·{' '}
              <a
                href={`/elections/${type}/${id}`}
                className="text-indigo-600 hover:underline dark:text-indigo-400"
              >
                changer
              </a>
            </p>
          )}
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
          {filtered.length} candidat{filtered.length !== 1 ? 's' : ''}
        </p>

        {filtered.length === 0 ? (
          <p className="mt-8 text-center text-slate-500 dark:text-slate-400">
            Aucun candidat trouvé.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pageItems.map((candidate, index) => {
              // Séparateur d'initiale avant la première carte de chaque lettre.
              const showLetterHeader =
                index === 0 ||
                initial(sortKey(pageItems[index - 1])) !==
                  initial(sortKey(candidate));
              return (
                <div
                  key={`${candidate.nom}-${candidate.prenom}-${index}`}
                  className="contents"
                >
                  {showLetterHeader && (
                    <div className="sm:col-span-2 lg:col-span-3 -mb-1 mt-2 text-xs font-bold uppercase tracking-wider text-indigo-500 first:mt-0 dark:text-indigo-400">
                      {initial(sortKey(candidate))}
                    </div>
                  )}
                  <CandidateCard candidate={candidate} />
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-600"
            >
              Précédent
            </button>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-600"
            >
              Suivant
            </button>
          </div>
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

/** Carte d'un candidat : lien vers sa fiche si elle existe, grisée sinon. */
function CandidateCard({ candidate }: { candidate: PanoramaCandidate }) {
  const name = displayName(candidate);
  const isListOnly = !`${candidate.prenom}${candidate.nom}`.trim();
  const avatarInitials = isListOnly
    ? name.charAt(0)
    : `${candidate.prenom.charAt(0)}${candidate.nom.charAt(0)}`;

  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
        {candidate.hasProfile && candidate.profilePhotoUrl ? (
          <img
            src={candidate.profilePhotoUrl}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          avatarInitials
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-800 dark:text-slate-100">
          {name}
          {candidate.sortant && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              sortant
            </span>
          )}
        </p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          {candidate.nuance && <span>{candidate.nuance}</span>}
          {!isListOnly && candidate.liste && <span> · {candidate.liste}</span>}
        </p>
        <p className="truncate text-xs text-slate-400 dark:text-slate-500">
          {candidate.scope}
        </p>
        {!candidate.hasProfile && (
          <p className="mt-0.5 text-[11px] italic text-slate-400 dark:text-slate-500">
            Pas de fiche disponible
          </p>
        )}
      </div>
      {candidate.elected && (
        <i
          className="fa-solid fa-check-circle shrink-0 text-emerald-500"
          title="Élu(e)"
          aria-hidden="true"
        ></i>
      )}
    </>
  );

  if (candidate.hasProfile && candidate.profileSlug) {
    return (
      <a
        href={`/elus/${candidate.profileSlug}`}
        className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm transition-all hover:border-indigo-300/60 hover:shadow-md no-underline dark:border-slate-700 dark:bg-slate-800"
      >
        {content}
      </a>
    );
  }

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-slate-200/60 bg-slate-50/60 p-3 opacity-70 dark:border-slate-700/60 dark:bg-slate-800/40"
      aria-disabled="true"
      title="Pas de fiche disponible pour ce candidat"
    >
      {content}
    </div>
  );
}
