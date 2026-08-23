import { useState, useRef, useEffect } from 'react';

type SearchResult = {
  url: string;
  meta: { title: string };
  excerpt: string;
};

type PagefindResult = {
  data: () => Promise<{
    url: string;
    meta: { title: string };
    excerpt: string;
  }>;
};

type PagefindSearch = {
  results: PagefindResult[];
};

type PagefindInstance = {
  init: () => Promise<void>;
  search: (query: string) => Promise<PagefindSearch>;
};

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const pagefindRef = useRef<PagefindInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadPagefind() {
      if (!import.meta.env.PROD) {
        return;
      }
      try {
        const pagefindPath = '/pagefind/pagefind.js';
        pagefindRef.current = await import(/* @vite-ignore */ pagefindPath);
        await pagefindRef.current!.init();
      } catch {
        // Pagefind index not available
      }
    }
    loadPagefind();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleSearch(value: string) {
    setQuery(value);
    if (!pagefindRef.current || value.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const search = await pagefindRef.current.search(value);
    const items: SearchResult[] = await Promise.all(
      search.results.slice(0, 8).map(async (r) => {
        const data = await r.data();
        return { url: data.url, meta: data.meta, excerpt: data.excerpt };
      }),
    );
    setResults(items);
    setOpen(items.length > 0);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <label htmlFor="search-input" className="sr-only">
        Rechercher un élu ou un scrutin
      </label>
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          />
        </svg>
        <input
          id="search-input"
          type="search"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Rechercher un élu ou un scrutin…"
          className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          autoComplete="off"
          aria-label="Rechercher un élu ou un scrutin"
          aria-controls="search-results"
          aria-expanded={open}
          role="combobox"
        />
      </div>
      {open && (
        <ul
          id="search-results"
          role="listbox"
          className="absolute z-10 mt-2 max-h-80 w-full overflow-y-auto rounded-xl bg-white shadow-lg ring-1 ring-slate-200"
        >
          {results.map((r) => (
            <li key={r.url} role="option" aria-selected={false}>
              <a
                href={r.url}
                className="block px-4 py-3 text-sm hover:bg-slate-50 no-underline transition-colors"
              >
                <span className="font-medium text-slate-900">
                  {r.meta.title}
                </span>
                <span
                  className="mt-1 block text-xs text-slate-500"
                  dangerouslySetInnerHTML={{ __html: r.excerpt }}
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
