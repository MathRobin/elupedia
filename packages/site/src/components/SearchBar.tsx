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
      <input
        id="search-input"
        type="search"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Rechercher un élu ou un scrutin…"
        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        autoComplete="off"
        aria-label="Rechercher un élu ou un scrutin"
        aria-controls="search-results"
        aria-expanded={open}
        role="combobox"
      />
      {open && (
        <ul
          id="search-results"
          role="listbox"
          className="absolute z-10 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {results.map((r) => (
            <li key={r.url} role="option" aria-selected={false}>
              <a
                href={r.url}
                className="block px-4 py-3 text-sm hover:bg-gray-50 no-underline"
              >
                <span className="font-medium text-gray-900">
                  {r.meta.title}
                </span>
                <span
                  className="mt-1 block text-xs text-gray-500"
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
