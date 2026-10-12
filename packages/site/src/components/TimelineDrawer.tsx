/**
 * Bouton « Chronologie complète » et tiroir latéral affichant la frise de
 * vie publique d'un élu : naissance, mandats, affiliations, commissions,
 * élections, collaborateurs, parrainages, décès.
 *
 * Rendu sur `pages/elus/[slug]/index.astro` avec `client:load` (le bouton
 * déclencheur est dans le composant lui-même). Les événements sont
 * construits par la page.
 *
 * Modèle d'affichage :
 * - les événements « ponctuels » (naissance, décès, élection, parrainage)
 *   sont des cartes à une date ;
 * - les événements « à durée » (mandat, affiliation, commission,
 *   collaborateur) sont des couloirs verticaux (`assignLanes`) : chaque
 *   couloir est une colonne de barres, et une barre est pleine à la date
 *   de début, atténuée à la date de fin, grise quand le couloir est occupé
 *   par un autre événement ;
 * - le tout est groupé par année, de la plus récente à la plus ancienne,
 *   avec un groupe « Date inconnue » (année sentinelle 0) en fin de liste.
 */
import { useState, useMemo, useEffect } from 'react';
import { useFocusTrap } from '../lib/use-focus-trap.js';

type TimelineEventType =
  | 'birth'
  | 'death'
  | 'mandate'
  | 'affiliation'
  | 'committee'
  | 'election'
  | 'staffer'
  | 'sponsorship';

type TimelineEvent = {
  type: TimelineEventType;
  /** Libellé brut (souvent une clé snake_case), passé par `humanize`. */
  label: string;
  detail?: string;
  /** Date ISO ; null si inconnue. */
  startDate: string | null;
  /** Date ISO ; null/absent si en cours ou ponctuel. */
  endDate?: string | null;
  /** Mandat/fonction en cours : affiche le badge « en cours ». */
  active?: boolean;
};

/** Props injectées par la page Astro. */
type Props = {
  events: TimelineEvent[];
  officialName: string;
};

const typeColors: Record<TimelineEventType, string> = {
  birth: 'bg-pink-500',
  death: 'bg-slate-800 dark:bg-slate-200',
  mandate: 'bg-indigo-500',
  affiliation: 'bg-violet-500',
  committee: 'bg-cyan-500',
  election: 'bg-amber-500',
  staffer: 'bg-emerald-500',
  sponsorship: 'bg-rose-500',
};

const typeLabels: Record<TimelineEventType, string> = {
  birth: 'Naissance',
  death: 'Décès',
  mandate: 'Mandat',
  affiliation: 'Affiliation',
  committee: 'Commission',
  election: 'Élection',
  staffer: 'Collaborateur',
  sponsorship: 'Parrainage',
};

const typeBorderColors: Record<TimelineEventType, string> = {
  birth: 'border-pink-300 dark:border-pink-700',
  death: 'border-slate-400 dark:border-slate-500',
  mandate: 'border-indigo-300 dark:border-indigo-700',
  affiliation: 'border-violet-300 dark:border-violet-700',
  committee: 'border-cyan-300 dark:border-cyan-700',
  election: 'border-amber-300 dark:border-amber-700',
  staffer: 'border-emerald-300 dark:border-emerald-700',
  sponsorship: 'border-rose-300 dark:border-rose-700',
};

const typeBgColors: Record<TimelineEventType, string> = {
  birth: 'bg-pink-50 dark:bg-pink-900/20',
  death: 'bg-slate-100 dark:bg-slate-700/30',
  mandate: 'bg-indigo-50 dark:bg-indigo-900/20',
  affiliation: 'bg-violet-50 dark:bg-violet-900/20',
  committee: 'bg-cyan-50 dark:bg-cyan-900/20',
  election: 'bg-amber-50 dark:bg-amber-900/20',
  staffer: 'bg-emerald-50 dark:bg-emerald-900/20',
  sponsorship: 'bg-rose-50 dark:bg-rose-900/20',
};

/** Date de fin fictive des événements en cours, pour les comparaisons ISO. */
const OPEN_ENDED_DATE = '9999-12-31';
/** Année sentinelle du groupe « Date inconnue ». */
const UNKNOWN_YEAR = 0;

/** Événements affichés comme une carte à une date (sans durée). */
function isPointEvent(event: TimelineEvent): boolean {
  return (
    event.type === 'birth' ||
    event.type === 'death' ||
    event.type === 'election' ||
    event.type === 'sponsorship'
  );
}

/** `commission_des_lois` → « Commission des lois ». */
function humanize(s: string): string {
  const spaced = s.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function yearFromDate(isoDate: string): number {
  return new Date(isoDate).getFullYear();
}

/** Partie AAAA-MM-JJ d'une date ISO ; '' si absente. */
function dayOf(isoDate: string | null | undefined): string {
  return isoDate?.slice(0, 10) ?? '';
}

type Lane = { event: TimelineEvent; col: number };

/**
 * Attribue une colonne (« couloir ») à chaque événement à durée, par
 * balayage chronologique : un événement prend le premier couloir dont
 * l'occupant précédent est terminé à sa date de début, sinon un nouveau
 * couloir. Les événements en cours bloquent leur couloir jusqu'à
 * `OPEN_ENDED_DATE`.
 */
function assignLanes(ranges: TimelineEvent[]): Lane[] {
  const sorted = [...ranges].sort((a, b) =>
    (a.startDate ?? '').localeCompare(b.startDate ?? ''),
  );
  // Date de fin de l'occupant courant de chaque couloir.
  const laneEndDates: (string | null)[] = [];
  const lanes: Lane[] = [];

  for (const event of sorted) {
    const end = event.endDate ?? OPEN_ENDED_DATE;
    let assigned = -1;
    for (let i = 0; i < laneEndDates.length; i++) {
      if (!laneEndDates[i] || laneEndDates[i]! <= (event.startDate ?? '')) {
        laneEndDates[i] = end;
        assigned = i;
        break;
      }
    }
    if (assigned === -1) {
      assigned = laneEndDates.length;
      laneEndDates.push(end);
    }
    lanes.push({ event, col: assigned });
  }

  return lanes;
}

/** Une date de la frise : éventuel événement ponctuel, couloirs qui y démarrent. */
type DateEntry = {
  date: string;
  isPoint: boolean;
  pointEvent?: TimelineEvent;
  lanes: Lane[];
};

export default function TimelineDrawer({ events, officialName }: Props) {
  const [open, setOpen] = useState(false);
  // Types affichés ; vide = tous.
  const [typeFilter, setTypeFilter] = useState<Set<TimelineEventType>>(
    new Set(),
  );
  const trapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const allTypes = useMemo(() => {
    const types = new Set<TimelineEventType>();
    for (const event of events) types.add(event.type);
    return [...types].sort((a, b) =>
      typeLabels[a].localeCompare(typeLabels[b], 'fr'),
    );
  }, [events]);

  const filtered = useMemo(() => {
    if (typeFilter.size === 0) return events;
    return events.filter((event) => typeFilter.has(event.type));
  }, [events, typeFilter]);

  const pointEvents = useMemo(
    () =>
      filtered
        .filter(isPointEvent)
        .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '')),
    [filtered],
  );

  const rangeEvents = useMemo(
    () => filtered.filter((event) => !isPointEvent(event)),
    [filtered],
  );

  const lanes = useMemo(() => assignLanes(rangeEvents), [rangeEvents]);
  const maxCol = useMemo(
    () => (lanes.length > 0 ? Math.max(...lanes.map((l) => l.col)) : 0),
    [lanes],
  );

  // Toutes les dates à afficher (début/fin de couloir, événements ponctuels),
  // de la plus récente à la plus ancienne. Si plusieurs événements ponctuels
  // tombent le même jour, seul le dernier est affiché comme carte.
  const allDates = useMemo<DateEntry[]>(() => {
    const entryByDate = new Map<string, Omit<DateEntry, 'date'>>();

    for (const pointEvent of pointEvents) {
      const day = dayOf(pointEvent.startDate);
      if (!entryByDate.has(day))
        entryByDate.set(day, { isPoint: true, pointEvent, lanes: [] });
      else {
        const entry = entryByDate.get(day)!;
        entry.isPoint = true;
        entry.pointEvent = pointEvent;
      }
    }

    for (const lane of lanes) {
      const startDay = dayOf(lane.event.startDate);
      if (!entryByDate.has(startDay))
        entryByDate.set(startDay, { isPoint: false, lanes: [lane] });
      else entryByDate.get(startDay)!.lanes.push(lane);

      if (lane.event.endDate) {
        const endDay = dayOf(lane.event.endDate);
        if (!entryByDate.has(endDay))
          entryByDate.set(endDay, { isPoint: false, lanes: [] });
      }
    }

    const dates: DateEntry[] = [];
    for (const [date, entry] of entryByDate) {
      dates.push({ date, ...entry });
    }
    dates.sort((a, b) => b.date.localeCompare(a.date));
    return dates;
  }, [pointEvents, lanes]);

  // Années présentes, décroissantes, puis `UNKNOWN_YEAR` s'il y a des dates vides.
  const years = useMemo(() => {
    const yearSet = new Set<number>();
    for (const entry of allDates) {
      if (entry.date) yearSet.add(yearFromDate(entry.date));
    }
    const sorted = [...yearSet].sort((a, b) => b - a);
    if (allDates.some((entry) => !entry.date)) sorted.push(UNKNOWN_YEAR);
    return sorted;
  }, [allDates]);

  function toggleTypeFilter(type: TimelineEventType) {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  if (events.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors no-underline dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
      >
        <i
          className="fa-solid fa-clock-rotate-left text-xs"
          aria-hidden="true"
        />
        Chronologie complète
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Chronologie complète — ${officialName}`}
            className="relative w-full max-w-4xl bg-white shadow-2xl flex flex-col dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Chronologie complète
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {officialName}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors dark:hover:bg-slate-800 dark:hover:text-slate-300"
                aria-label="Fermer"
              >
                <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
              </button>
            </div>

            <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800">
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Filtrer par type"
              >
                {allTypes.map((type) => {
                  // Sans filtre actif, toutes les puces apparaissent « allumées ».
                  const highlighted =
                    typeFilter.size === 0 || typeFilter.has(type);
                  return (
                    <button
                      key={type}
                      onClick={() => toggleTypeFilter(type)}
                      aria-pressed={typeFilter.has(type)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                        highlighted
                          ? `${typeBgColors[type]} ${typeBorderColors[type]} border`
                          : 'bg-slate-100 text-slate-400 border border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${highlighted ? typeColors[type] : 'bg-slate-300 dark:bg-slate-600'}`}
                      />
                      {typeLabels[type]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {years.map((year) => {
                const yearDates = allDates.filter((entry) =>
                  year === UNKNOWN_YEAR
                    ? !entry.date
                    : entry.date && yearFromDate(entry.date) === year,
                );
                return (
                  <div key={year} className="mb-6">
                    <div className="sticky top-0 z-10 mb-3">
                      <span className="inline-block rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                        {year === UNKNOWN_YEAR ? 'Date inconnue' : year}
                      </span>
                    </div>

                    <div className="relative ml-4">
                      <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />

                      {yearDates.map((dateEntry) => {
                        const startingLanes = lanes.filter(
                          (lane) =>
                            dayOf(lane.event.startDate) === dateEntry.date,
                        );
                        const endingLanes = lanes.filter(
                          (lane) =>
                            lane.event.endDate?.slice(0, 10) === dateEntry.date,
                        );
                        // Couloirs occupés à cette date (barres grises de contexte).
                        const activeLanes = lanes.filter((lane) => {
                          const laneStart = dayOf(lane.event.startDate);
                          const laneEnd =
                            lane.event.endDate?.slice(0, 10) ?? OPEN_ENDED_DATE;
                          return (
                            laneStart <= dateEntry.date &&
                            laneEnd >= dateEntry.date
                          );
                        });

                        return (
                          <div
                            key={dateEntry.date}
                            className="relative pl-8 pb-4"
                          >
                            <div className="absolute left-[9px] top-2 h-2.5 w-2.5 rounded-full bg-slate-300 ring-2 ring-white dark:bg-slate-600 dark:ring-slate-900" />

                            {dateEntry.date && (
                              <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-1.5">
                                {formatDate(dateEntry.date)}
                              </p>
                            )}

                            {dateEntry.isPoint && dateEntry.pointEvent && (
                              <div
                                className={`mb-2 rounded-lg border p-3 ${typeBorderColors[dateEntry.pointEvent.type]} ${typeBgColors[dateEntry.pointEvent.type]}`}
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`h-2.5 w-2.5 rounded-full ${typeColors[dateEntry.pointEvent.type]}`}
                                  />
                                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                                    {humanize(dateEntry.pointEvent.label)}
                                  </span>
                                </div>
                                {dateEntry.pointEvent.detail && (
                                  <p className="mt-1 ml-[18px] text-xs text-slate-600 dark:text-slate-400">
                                    {humanize(dateEntry.pointEvent.detail)}
                                  </p>
                                )}
                              </div>
                            )}

                            {startingLanes.length > 0 && (
                              <div className="space-y-1.5">
                                {startingLanes.map((lane) => (
                                  <div
                                    key={`start-${lane.event.label}-${lane.event.startDate}`}
                                    className="flex items-start gap-2"
                                  >
                                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                      {Array.from({ length: maxCol + 1 }).map(
                                        (_, col) => {
                                          const isThisLane = col === lane.col;
                                          const isOccupied = activeLanes.some(
                                            (other) =>
                                              other.col === col &&
                                              other !== lane,
                                          );
                                          return (
                                            <div
                                              key={col}
                                              className={`h-4 w-1 rounded-full ${
                                                isThisLane
                                                  ? typeColors[lane.event.type]
                                                  : isOccupied
                                                    ? 'bg-slate-300 dark:bg-slate-600'
                                                    : 'bg-transparent'
                                              }`}
                                            />
                                          );
                                        },
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm text-slate-900 dark:text-white">
                                        <span className="font-medium">
                                          {humanize(lane.event.label)}
                                        </span>
                                        {lane.event.active && (
                                          <span className="ml-1.5 inline-block rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/20 dark:text-green-400">
                                            en cours
                                          </span>
                                        )}
                                      </p>
                                      {lane.event.detail && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                          {humanize(lane.event.detail)}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Les fins ne sont affichées que si rien ne démarre le même jour. */}
                            {endingLanes.length > 0 &&
                              startingLanes.length === 0 && (
                                <div className="space-y-1.5">
                                  {endingLanes.map((lane) => (
                                    <div
                                      key={`end-${lane.event.label}-${lane.event.endDate}`}
                                      className="flex items-start gap-2"
                                    >
                                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                        {Array.from({ length: maxCol + 1 }).map(
                                          (_, col) => {
                                            const isThisLane = col === lane.col;
                                            const isOccupied = activeLanes.some(
                                              (other) =>
                                                other.col === col &&
                                                other !== lane,
                                            );
                                            return (
                                              <div
                                                key={col}
                                                className={`h-4 w-1 rounded-full ${
                                                  isThisLane
                                                    ? `${typeColors[lane.event.type]} opacity-40`
                                                    : isOccupied
                                                      ? 'bg-slate-300 dark:bg-slate-600'
                                                      : 'bg-transparent'
                                                }`}
                                              />
                                            );
                                          },
                                        )}
                                      </div>
                                      <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                                        Fin : {humanize(lane.event.label)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
