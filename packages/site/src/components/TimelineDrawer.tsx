import { useState, useMemo } from 'react';

type TimelineEvent = {
  type:
    | 'birth'
    | 'death'
    | 'mandate'
    | 'affiliation'
    | 'committee'
    | 'election'
    | 'staffer'
    | 'sponsorship';
  label: string;
  detail?: string;
  startDate: string;
  endDate?: string | null;
  active?: boolean;
};

type Props = {
  events: TimelineEvent[];
  officialName: string;
};

const typeColors: Record<TimelineEvent['type'], string> = {
  birth: 'bg-pink-500',
  death: 'bg-slate-800 dark:bg-slate-200',
  mandate: 'bg-indigo-500',
  affiliation: 'bg-violet-500',
  committee: 'bg-cyan-500',
  election: 'bg-amber-500',
  staffer: 'bg-emerald-500',
  sponsorship: 'bg-rose-500',
};

const typeLabels: Record<TimelineEvent['type'], string> = {
  birth: 'Naissance',
  death: 'Décès',
  mandate: 'Mandat',
  affiliation: 'Affiliation',
  committee: 'Commission',
  election: 'Élection',
  staffer: 'Collaborateur',
  sponsorship: 'Parrainage',
};

const typeBorderColors: Record<TimelineEvent['type'], string> = {
  birth: 'border-pink-300 dark:border-pink-700',
  death: 'border-slate-400 dark:border-slate-500',
  mandate: 'border-indigo-300 dark:border-indigo-700',
  affiliation: 'border-violet-300 dark:border-violet-700',
  committee: 'border-cyan-300 dark:border-cyan-700',
  election: 'border-amber-300 dark:border-amber-700',
  staffer: 'border-emerald-300 dark:border-emerald-700',
  sponsorship: 'border-rose-300 dark:border-rose-700',
};

const typeBgColors: Record<TimelineEvent['type'], string> = {
  birth: 'bg-pink-50 dark:bg-pink-900/20',
  death: 'bg-slate-100 dark:bg-slate-700/30',
  mandate: 'bg-indigo-50 dark:bg-indigo-900/20',
  affiliation: 'bg-violet-50 dark:bg-violet-900/20',
  committee: 'bg-cyan-50 dark:bg-cyan-900/20',
  election: 'bg-amber-50 dark:bg-amber-900/20',
  staffer: 'bg-emerald-50 dark:bg-emerald-900/20',
  sponsorship: 'bg-rose-50 dark:bg-rose-900/20',
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function yearFromDate(d: string): number {
  return new Date(d).getFullYear();
}

type Lane = { event: TimelineEvent; col: number };

function assignLanes(ranges: TimelineEvent[]): Lane[] {
  const sorted = [...ranges].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
  const cols: (string | null)[] = [];
  const result: Lane[] = [];

  for (const ev of sorted) {
    const end = ev.endDate ?? '9999-12-31';
    let assigned = -1;
    for (let i = 0; i < cols.length; i++) {
      if (!cols[i] || cols[i]! <= ev.startDate) {
        cols[i] = end;
        assigned = i;
        break;
      }
    }
    if (assigned === -1) {
      assigned = cols.length;
      cols.push(end);
    }
    result.push({ event: ev, col: assigned });
  }

  return result;
}

export default function TimelineDrawer({ events, officialName }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Set<TimelineEvent['type']>>(new Set());

  const allTypes = useMemo(() => {
    const types = new Set<TimelineEvent['type']>();
    for (const e of events) types.add(e.type);
    return [...types].sort((a, b) =>
      typeLabels[a].localeCompare(typeLabels[b], 'fr'),
    );
  }, [events]);

  const filtered = useMemo(() => {
    if (filter.size === 0) return events;
    return events.filter((e) => filter.has(e.type));
  }, [events, filter]);

  const pointEvents = useMemo(
    () =>
      filtered
        .filter(
          (e) =>
            e.type === 'birth' ||
            e.type === 'death' ||
            e.type === 'election' ||
            e.type === 'sponsorship',
        )
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [filtered],
  );

  const rangeEvents = useMemo(
    () =>
      filtered.filter(
        (e) =>
          e.type !== 'birth' &&
          e.type !== 'death' &&
          e.type !== 'election' &&
          e.type !== 'sponsorship',
      ),
    [filtered],
  );

  const lanes = useMemo(() => assignLanes(rangeEvents), [rangeEvents]);
  const maxCol = useMemo(
    () => (lanes.length > 0 ? Math.max(...lanes.map((l) => l.col)) : 0),
    [lanes],
  );

  const allDates = useMemo(() => {
    const dates: {
      date: string;
      isPoint: boolean;
      pointEvent?: TimelineEvent;
      lanes: Lane[];
    }[] = [];
    const dateMap = new Map<
      string,
      { isPoint: boolean; pointEvent?: TimelineEvent; lanes: Lane[] }
    >();

    for (const pe of pointEvents) {
      const d = pe.startDate.slice(0, 10);
      if (!dateMap.has(d))
        dateMap.set(d, { isPoint: true, pointEvent: pe, lanes: [] });
      else {
        const entry = dateMap.get(d)!;
        entry.isPoint = true;
        entry.pointEvent = pe;
      }
    }

    for (const lane of lanes) {
      const startD = lane.event.startDate.slice(0, 10);
      if (!dateMap.has(startD))
        dateMap.set(startD, { isPoint: false, lanes: [lane] });
      else dateMap.get(startD)!.lanes.push(lane);

      if (lane.event.endDate) {
        const endD = lane.event.endDate.slice(0, 10);
        if (!dateMap.has(endD))
          dateMap.set(endD, { isPoint: false, lanes: [] });
      }
    }

    for (const [date, data] of dateMap) {
      dates.push({ date, ...data });
    }
    dates.sort((a, b) => a.date.localeCompare(b.date));
    return dates;
  }, [pointEvents, lanes]);

  const years = useMemo(() => {
    const ySet = new Set<number>();
    for (const d of allDates) ySet.add(yearFromDate(d.date));
    return [...ySet].sort((a, b) => a - b);
  }, [allDates]);

  function toggleFilter(type: TimelineEvent['type']) {
    setFilter((prev) => {
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
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
        Chronologie complète
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-4xl bg-white shadow-2xl flex flex-col dark:bg-slate-900">
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
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap gap-2">
                {allTypes.map((type) => {
                  const active = filter.size === 0 || filter.has(type);
                  return (
                    <button
                      key={type}
                      onClick={() => toggleFilter(type)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                        active
                          ? `${typeBgColors[type]} ${typeBorderColors[type]} border`
                          : 'bg-slate-100 text-slate-400 border border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${active ? typeColors[type] : 'bg-slate-300 dark:bg-slate-600'}`}
                      />
                      {typeLabels[type]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {years.map((year) => {
                const yearDates = allDates.filter(
                  (d) => yearFromDate(d.date) === year,
                );
                return (
                  <div key={year} className="mb-6">
                    <div className="sticky top-0 z-10 mb-3">
                      <span className="inline-block rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                        {year}
                      </span>
                    </div>

                    <div className="relative ml-4">
                      <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />

                      {yearDates.map((dateEntry) => {
                        const startingLanes = lanes.filter(
                          (l) =>
                            l.event.startDate.slice(0, 10) === dateEntry.date,
                        );
                        const endingLanes = lanes.filter(
                          (l) =>
                            l.event.endDate?.slice(0, 10) === dateEntry.date,
                        );
                        const activeLanes = lanes.filter((l) => {
                          const s = l.event.startDate.slice(0, 10);
                          const e =
                            l.event.endDate?.slice(0, 10) ?? '9999-12-31';
                          return s <= dateEntry.date && e >= dateEntry.date;
                        });

                        return (
                          <div
                            key={dateEntry.date}
                            className="relative pl-8 pb-4"
                          >
                            <div className="absolute left-[9px] top-2 h-2.5 w-2.5 rounded-full bg-slate-300 ring-2 ring-white dark:bg-slate-600 dark:ring-slate-900" />

                            <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-1.5">
                              {fmtDate(dateEntry.date)}
                            </p>

                            {dateEntry.isPoint && dateEntry.pointEvent && (
                              <div
                                className={`mb-2 rounded-lg border p-3 ${typeBorderColors[dateEntry.pointEvent.type]} ${typeBgColors[dateEntry.pointEvent.type]}`}
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`h-2.5 w-2.5 rounded-full ${typeColors[dateEntry.pointEvent.type]}`}
                                  />
                                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                                    {dateEntry.pointEvent.label}
                                  </span>
                                </div>
                                {dateEntry.pointEvent.detail && (
                                  <p className="mt-1 ml-[18px] text-xs text-slate-600 dark:text-slate-400">
                                    {dateEntry.pointEvent.detail}
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
                                        (_, i) => {
                                          const isThis = i === lane.col;
                                          const isActive = activeLanes.some(
                                            (l) => l.col === i && l !== lane,
                                          );
                                          return (
                                            <div
                                              key={i}
                                              className={`h-4 w-1 rounded-full ${
                                                isThis
                                                  ? typeColors[lane.event.type]
                                                  : isActive
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
                                          {lane.event.label}
                                        </span>
                                        {lane.event.active && (
                                          <span className="ml-1.5 inline-block rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/20 dark:text-green-400">
                                            en cours
                                          </span>
                                        )}
                                      </p>
                                      {lane.event.detail && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                          {lane.event.detail}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

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
                                          (_, i) => {
                                            const isThis = i === lane.col;
                                            const isActive = activeLanes.some(
                                              (l) => l.col === i && l !== lane,
                                            );
                                            return (
                                              <div
                                                key={i}
                                                className={`h-4 w-1 rounded-full ${
                                                  isThis
                                                    ? `${typeColors[lane.event.type]} opacity-40`
                                                    : isActive
                                                      ? 'bg-slate-300 dark:bg-slate-600'
                                                      : 'bg-transparent'
                                                }`}
                                              />
                                            );
                                          },
                                        )}
                                      </div>
                                      <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                                        Fin : {lane.event.label}
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
