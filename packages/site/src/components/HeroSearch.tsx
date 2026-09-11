import { useState, useRef, useEffect, useCallback } from 'react';

type SearchResult = {
  slug: string;
  firstName: string;
  lastName: string;
  mandateType: string;
  politicalGroup: string | null;
};

export default function HeroSearch({
  officials,
}: {
  officials: SearchResult[];
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listboxId = 'hero-search-listbox';

  const normalized = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const results =
    normalized.length >= 2
      ? officials
          .filter((o) => {
            const full = `${o.firstName} ${o.lastName}`
              .toLowerCase()
              .normalize('NFD')
              .replace(/[̀-ͯ]/g, '');
            return full.includes(normalized);
          })
          .slice(0, 8)
      : [];

  const showResults = open && results.length > 0;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showResults) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => (i < results.length - 1 ? i + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((i) => (i > 0 ? i - 1 : results.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && results[activeIndex]) {
            window.location.href = `/elus/${results[activeIndex].slug}`;
          }
          break;
        case 'Escape':
          setOpen(false);
          break;
      }
    },
    [showResults, results, activeIndex],
  );

  const mandateLabels: Record<string, string> = {
    depute: 'Député·e',
    senateur: 'Sénateur·rice',
  };

  return (
    <div ref={ref} className="relative w-full max-w-xl mx-auto">
      <label htmlFor="hero-search" className="sr-only">
        Rechercher un élu
      </label>
      <div className="relative">
        <i
          className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          id="hero-search"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showResults}
          aria-controls={listboxId}
          aria-activedescendant={
            activeIndex >= 0 ? `hero-search-option-${activeIndex}` : undefined
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Rechercher un élu…"
          className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
        />
      </div>

      {showResults && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Résultats de recherche"
          className="absolute z-50 mt-2 w-full rounded-xl border border-slate-200 bg-white py-2 shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          {results.map((o, i) => (
            <li
              key={o.slug}
              id={`hero-search-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
            >
              <a
                href={`/elus/${o.slug}`}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm no-underline transition-colors ${
                  i === activeIndex
                    ? 'bg-indigo-50 dark:bg-indigo-900/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
                tabIndex={-1}
              >
                <span className="font-medium text-slate-900 dark:text-white">
                  {o.firstName} {o.lastName}
                </span>
                <span className="ml-auto text-xs text-slate-400">
                  {mandateLabels[o.mandateType] ?? o.mandateType}
                  {o.politicalGroup && ` · ${o.politicalGroup}`}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <div aria-live="polite" className="sr-only">
        {showResults &&
          `${results.length} résultat${results.length > 1 ? 's' : ''} trouvé${results.length > 1 ? 's' : ''}`}
      </div>
    </div>
  );
}
