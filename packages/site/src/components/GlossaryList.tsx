/**
 * Liste filtrable des termes du glossaire, groupés par catégorie.
 *
 * Rendue sur `pages/glossaire/index.astro` avec `client:load` : la recherche
 * est purement locale (les entrées sont passées en props, pas d'appel API) et
 * doit répondre dès que l'utilisateur tape.
 *
 * La recherche est insensible à la casse et aux accents, et porte sur le
 * terme, la catégorie et la définition courte.
 */
import { useMemo, useState } from 'react';

type Entry = {
  slug: string;
  term: string;
  category: string;
  shortDefinition: string;
};

/** Props injectées par la page Astro. */
type Props = {
  /** Toutes les entrées du glossaire (données statiques de `lib/glossary.ts`). */
  entries: Entry[];
};

/** Minuscules sans diacritiques, pour une comparaison tolérante. */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export default function GlossaryList({ entries }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    if (!normalizedQuery) return entries;
    return entries.filter(
      (entry) =>
        normalize(entry.term).includes(normalizedQuery) ||
        normalize(entry.category).includes(normalizedQuery) ||
        normalize(entry.shortDefinition).includes(normalizedQuery),
    );
  }, [entries, query]);

  // Catégories triées alphabétiquement (fr), chacune avec ses entrées.
  const byCategory = useMemo(() => {
    const entriesByCategory = new Map<string, Entry[]>();
    for (const entry of filtered) {
      const list = entriesByCategory.get(entry.category) ?? [];
      list.push(entry);
      entriesByCategory.set(entry.category, list);
    }
    return [...entriesByCategory.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], 'fr'),
    );
  }, [filtered]);

  return (
    <div>
      <label htmlFor="glossary-search" className="sr-only">
        Rechercher un terme du glossaire
      </label>
      <div className="relative">
        <i
          className="fa-solid fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          id="glossary-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un terme (ex. panachage, triangulaire, commune nouvelle...)"
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-indigo-500/20"
        />
      </div>

      {filtered.length === 0 && (
        <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Aucun terme ne correspond à « {query} ».
        </p>
      )}

      <div className="mt-8 space-y-8">
        {byCategory.map(([category, items]) => (
          <div key={category}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {category}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {items
                .sort((a, b) => a.term.localeCompare(b.term, 'fr'))
                .map((entry) => (
                  <a
                    key={entry.slug}
                    href={`/glossaire/${entry.slug}`}
                    className="group block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md no-underline dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500"
                  >
                    <h3 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors dark:text-white dark:group-hover:text-indigo-400">
                      {entry.term}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {entry.shortDefinition}
                    </p>
                  </a>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
