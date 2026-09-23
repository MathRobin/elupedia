import { useMemo, useState } from 'react';
import type { PanoramaCandidate } from '../lib/election-types.js';

const PAGE_SIZE = 48;

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function initial(name: string): string {
  return normalize(name).charAt(0).toUpperCase() || '#';
}

// Certaines communes (scrutin de liste) ne fournissent que le nom de la
// liste dans les données sources, sans identité individuelle pour la tête
// de liste — on affiche alors le nom de liste comme identifiant principal.
function displayName(c: PanoramaCandidate): string {
  const full = `${c.prenom} ${c.nom}`.trim();
  return full || c.liste || 'Liste sans nom';
}

// Tri "annuaire" : par nom de famille (comme un répertoire d'entreprises
// trie par raison sociale), ou par nom de liste quand il n'y a pas
// d'identité individuelle.
function sortKey(c: PanoramaCandidate): string {
  return c.nom.trim() || c.liste || 'Liste sans nom';
}

export default function ElectionPanorama({
  type,
  id,
  candidates,
  needsSearch,
  initialQuery,
}: {
  type: string;
  id: string;
  candidates: PanoramaCandidate[];
  needsSearch: boolean;
  initialQuery: string;
}) {
  const [search, setSearch] = useState(initialQuery);
  const [textFilter, setTextFilter] = useState('');
  const [page, setPage] = useState(1);

  const isCommuneSearch =
    needsSearch || type === 'municipale' || type === 'legislative';

  const filtered = useMemo(() => {
    const q = normalize(textFilter.trim());
    const sorted = [...candidates].sort((a, b) =>
      normalize(sortKey(a)).localeCompare(normalize(sortKey(b))),
    );
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        normalize(displayName(c)).includes(q) ||
        (c.nuance && normalize(c.nuance).includes(q)) ||
        normalize(c.scope).includes(q),
    );
  }, [candidates, textFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function submitCommuneSearch(e: React.FormEvent) {
    e.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set('q', search);
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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

  return (
    <div className="mt-6">
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
        <div className="relative flex-1 sm:max-w-xs sm:ml-auto">
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
            placeholder="Filtrer par nom, nuance..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          />
        </div>
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
          {pageItems.map((c, i) => {
            const showLetterHeader =
              i === 0 ||
              initial(sortKey(pageItems[i - 1])) !== initial(sortKey(c));
            return (
              <div key={`${c.nom}-${c.prenom}-${i}`} className="contents">
                {showLetterHeader && (
                  <div className="sm:col-span-2 lg:col-span-3 -mb-1 mt-2 text-xs font-bold uppercase tracking-wider text-indigo-500 first:mt-0 dark:text-indigo-400">
                    {initial(sortKey(c))}
                  </div>
                )}
                <CandidateCard candidate={c} />
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
  );
}

function CandidateCard({ candidate: c }: { candidate: PanoramaCandidate }) {
  const name = displayName(c);
  const isListOnly = !`${c.prenom}${c.nom}`.trim();
  const avatarInitials = isListOnly
    ? name.charAt(0)
    : `${c.prenom.charAt(0)}${c.nom.charAt(0)}`;

  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
        {c.hasProfile && c.profilePhotoUrl ? (
          <img
            src={c.profilePhotoUrl}
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
          {c.sortant && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              sortant
            </span>
          )}
        </p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          {c.nuance && <span>{c.nuance}</span>}
          {!isListOnly && c.liste && <span> · {c.liste}</span>}
        </p>
        <p className="truncate text-xs text-slate-400 dark:text-slate-500">
          {c.scope}
        </p>
        {!c.hasProfile && (
          <p className="mt-0.5 text-[11px] italic text-slate-400 dark:text-slate-500">
            Pas de fiche disponible
          </p>
        )}
      </div>
      {c.elected && (
        <i
          className="fa-solid fa-check-circle shrink-0 text-emerald-500"
          title="Élu(e)"
          aria-hidden="true"
        ></i>
      )}
    </>
  );

  if (c.hasProfile && c.profileSlug) {
    return (
      <a
        href={`/elus/${c.profileSlug}`}
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
