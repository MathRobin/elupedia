import { useState } from 'react';

type Official = {
  id: string;
  slug: string | null;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  district: string | null;
  department: string | null;
  politicalGroup: string | null;
  mandateType: string;
  isFemale: boolean;
};

type Filters = {
  depute: boolean;
  senateur: boolean;
  department: string;
};

const DEPARTMENTS = [
  'Ain',
  'Aisne',
  'Allier',
  'Alpes-de-Haute-Provence',
  'Alpes-Maritimes',
  'Ardèche',
  'Ardennes',
  'Ariège',
  'Aube',
  'Aude',
  'Aveyron',
  'Bas-Rhin',
  'Bouches-du-Rhône',
  'Calvados',
  'Cantal',
  'Charente',
  'Charente-Maritime',
  'Cher',
  'Corrèze',
  'Corse-du-Sud',
  'Creuse',
  "Côte-d'Or",
  "Côtes-d'Armor",
  'Deux-Sèvres',
  'Dordogne',
  'Doubs',
  'Drôme',
  'Essonne',
  'Eure',
  'Eure-et-Loir',
  'Finistère',
  'Français établis hors de France',
  'Gard',
  'Gers',
  'Gironde',
  'Guadeloupe',
  'Guyane',
  'Haut-Rhin',
  'Haute-Corse',
  'Haute-Garonne',
  'Haute-Loire',
  'Haute-Marne',
  'Haute-Savoie',
  'Haute-Saône',
  'Haute-Vienne',
  'Hautes-Alpes',
  'Hautes-Pyrénées',
  'Hauts-de-Seine',
  'Hérault',
  'Ille-et-Vilaine',
  'Indre',
  'Indre-et-Loire',
  'Isère',
  'Jura',
  'La Réunion',
  'Landes',
  'Loir-et-Cher',
  'Loire',
  'Loire-Atlantique',
  'Loiret',
  'Lot',
  'Lot-et-Garonne',
  'Lozère',
  'Maine-et-Loire',
  'Manche',
  'Marne',
  'Martinique',
  'Mayenne',
  'Mayotte',
  'Meurthe-et-Moselle',
  'Meuse',
  'Morbihan',
  'Moselle',
  'Nièvre',
  'Nord',
  'Nouvelle-Calédonie',
  'Oise',
  'Orne',
  'Paris',
  'Pas-de-Calais',
  'Polynésie française',
  'Puy-de-Dôme',
  'Pyrénées-Atlantiques',
  'Pyrénées-Orientales',
  'Rhône',
  'Saint-Barthélemy',
  'Saint-Martin',
  'Saint-Pierre-et-Miquelon',
  'Sarthe',
  'Savoie',
  'Saône-et-Loire',
  'Seine-Maritime',
  'Seine-Saint-Denis',
  'Seine-et-Marne',
  'Somme',
  'Tarn',
  'Tarn-et-Garonne',
  'Territoire de Belfort',
  "Val-d'Oise",
  'Val-de-Marne',
  'Var',
  'Vaucluse',
  'Vendée',
  'Vienne',
  'Vosges',
  'Wallis-et-Futuna',
  'Yonne',
  'Yvelines',
];

function FilterDrawer({
  filters,
  onChange,
  counts,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  counts: { depute: number; senateur: number };
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-indigo-700 transition-colors"
        aria-label="Ouvrir les filtres"
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
            d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
          />
        </svg>
        Filtres
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-sm bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Filtres</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Fermer les filtres"
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

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              <fieldset>
                <legend className="text-sm font-semibold text-slate-700">
                  Type de mandat
                </legend>
                <div className="mt-3 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.depute}
                      onChange={(e) =>
                        onChange({ ...filters, depute: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-700">
                      Députés·es
                      <span className="ml-1 text-slate-400">
                        ({counts.depute})
                      </span>
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.senateur}
                      onChange={(e) =>
                        onChange({ ...filters, senateur: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-700">
                      Sénateurs·rices
                      <span className="ml-1 text-slate-400">
                        ({counts.senateur})
                      </span>
                    </span>
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-semibold text-slate-700">
                  Département
                </legend>
                <select
                  value={filters.department}
                  onChange={(e) =>
                    onChange({ ...filters, department: e.target.value })
                  }
                  className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Tous les départements</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </fieldset>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function OfficialsList({
  officials,
}: {
  officials: Official[];
}) {
  const [filters, setFilters] = useState<Filters>({
    depute: true,
    senateur: true,
    department: '',
  });

  const counts = {
    depute: officials.filter((o) => o.mandateType === 'depute').length,
    senateur: officials.filter((o) => o.mandateType === 'senateur').length,
  };

  const filtered = officials.filter((o) => {
    if (o.mandateType === 'depute' && !filters.depute) return false;
    if (o.mandateType === 'senateur' && !filters.senateur) return false;
    if (filters.department && o.department !== filters.department) return false;
    return true;
  });

  return (
    <>
      <p className="mt-3 text-lg text-slate-500">
        {filtered.length} parlementaire{filtered.length > 1 ? 's' : ''} en
        exercice
      </p>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((d) => (
          <a
            key={d.id}
            href={`/elus/${d.slug ?? d.id}`}
            className="group flex items-start gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5 hover:shadow-md hover:ring-indigo-400/40 transition-all no-underline"
          >
            <div className="shrink-0 flex flex-col items-center gap-1">
              {d.photoUrl ? (
                <img
                  src={d.photoUrl}
                  alt={`${d.firstName} ${d.lastName}`}
                  className="h-14 w-14 rounded-full object-cover ring-2 ring-slate-100"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-lg font-semibold text-indigo-600">
                  {d.firstName[0]}
                  {d.lastName[0]}
                </div>
              )}
              <span
                className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${d.mandateType === 'depute' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}`}
              >
                {d.mandateType === 'depute'
                  ? d.isFemale
                    ? 'Députée'
                    : 'Député'
                  : d.isFemale
                    ? 'Sénatrice'
                    : 'Sénateur'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                {d.firstName} {d.lastName}
              </p>
              {d.district && (
                <p className="mt-0.5 text-sm text-slate-500 truncate">
                  {d.district}
                </p>
              )}
              {d.politicalGroup && (
                <p className="mt-0.5 text-xs text-slate-400">
                  {d.politicalGroup}
                </p>
              )}
            </div>
          </a>
        ))}
      </div>

      <FilterDrawer filters={filters} onChange={setFilters} counts={counts} />
    </>
  );
}
