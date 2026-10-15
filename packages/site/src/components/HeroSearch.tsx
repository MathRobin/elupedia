/**
 * Champ de recherche d'élu de la page d'accueil, avec liste de suggestions
 * (combobox accessible : navigation clavier, aria-activedescendant).
 *
 * Rendu sur `pages/index.astro` avec `client:load` : c'est l'élément central
 * de la page, il doit réagir immédiatement. La recherche est locale : la
 * page passe en props la liste complète des élus (nom, mandat, groupe), pas
 * d'appel réseau. La logique de filtrage est dupliquée dans
 * `HeroSearch.test.ts` ; garder les deux alignées.
 */
import { useState, useRef, useEffect, useCallback } from 'react';

type SearchResult = {
  slug: string;
  firstName: string;
  lastName: string;
  mandateType: string;
  politicalGroup: string | null;
};

/** Props injectées par la page Astro. */
type Props = {
  /** Liste complète des élus cherchables (sérialisée au build). */
  officials: SearchResult[];
};

/** Nombre minimal de caractères avant d'afficher des suggestions. */
const MIN_QUERY_LENGTH = 2;
/** Nombre maximal de suggestions affichées. */
const MAX_RESULTS = 8;
const LISTBOX_ID = 'hero-search-listbox';

/** Libellés affichés à côté du nom, par type de mandat. */
const MANDATE_LABELS: Record<string, string> = {
  depute: 'Député·e',
  senateur: 'Sénateur·rice',
  maire: 'Maire',
  eurodepute: 'Député·e européen·ne',
  conseiller_departemental: 'Conseiller·ère départemental·e',
  conseiller_communautaire: 'Conseiller·ère communautaire',
  conseiller_regional: 'Conseiller·ère régional·e',
  conseiller_arrondissement: "Conseiller·ère d'arrondissement",
  membre_assemblee_statut_particulier: "Membre d'assemblée territoriale",
};

/** Minuscules sans diacritiques, pour une comparaison tolérante. */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export default function HeroSearch({ officials }: Props) {
  const [query, setQuery] = useState('');
  const [listOpen, setListOpen] = useState(false);
  // Index de la suggestion surlignée au clavier ; -1 = aucune.
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedQuery = normalize(query);

  const results =
    normalizedQuery.length >= MIN_QUERY_LENGTH
      ? officials
          .filter((official) => {
            const fullName = normalize(
              `${official.firstName} ${official.lastName}`,
            );
            return fullName.includes(normalizedQuery);
          })
          .slice(0, MAX_RESULTS)
      : [];

  const showResults = listOpen && results.length > 0;

  // Ferme la liste sur clic en dehors du champ.
  useEffect(() => {
    function closeOnOutsideClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setListOpen(false);
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
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
          setListOpen(false);
          break;
      }
    },
    [showResults, results, activeIndex],
  );

  return (
    <div ref={containerRef} className="relative w-full max-w-xl mx-auto">
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
          aria-controls={LISTBOX_ID}
          aria-activedescendant={
            activeIndex >= 0 ? `hero-search-option-${activeIndex}` : undefined
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setListOpen(true);
          }}
          onFocus={() => setListOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Rechercher un élu…"
          className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
        />
      </div>

      {showResults && (
        <ul
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Résultats de recherche"
          className="absolute z-50 mt-2 w-full rounded-xl border border-slate-200 bg-white py-2 shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          {results.map((official, index) => (
            <li
              key={official.slug}
              id={`hero-search-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              <a
                href={`/elus/${official.slug}`}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm no-underline transition-colors ${
                  index === activeIndex
                    ? 'bg-indigo-50 dark:bg-indigo-900/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
                tabIndex={-1}
              >
                <span className="font-medium text-slate-900 dark:text-white">
                  {official.firstName} {official.lastName}
                </span>
                <span className="ml-auto text-xs text-slate-400">
                  {MANDATE_LABELS[official.mandateType] ?? official.mandateType}
                  {official.politicalGroup && ` · ${official.politicalGroup}`}
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
