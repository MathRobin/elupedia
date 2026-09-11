import { useState, useRef, useEffect } from 'react';

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
  const ref = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const mandateLabels: Record<string, string> = {
    depute: 'Député·e',
    senateur: 'Sénateur·rice',
  };

  return (
    <div ref={ref} className="relative w-full max-w-xl mx-auto">
      <div className="relative">
        <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher un élu…"
          className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
        />
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-2 w-full rounded-xl border border-slate-200 bg-white py-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {results.map((o) => (
            <li key={o.slug}>
              <a
                href={`/elus/${o.slug}`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm no-underline hover:bg-slate-50 transition-colors dark:hover:bg-slate-700/50"
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
    </div>
  );
}
