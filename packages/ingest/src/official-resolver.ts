/**
 * Rapprochement d'un nom de personne (et d'un département) avec les fiches
 * `officials`, pour les sources qui ne fournissent ni identifiant ni date de
 * naissance : parrainages présidentiels, signatures RIP, candidats aux
 * élections. Fonctions pures, testées sans base ; l'index est construit une
 * fois par run par reconcile-elections.ts.
 *
 * Règles, dans l'ordre :
 * 1. fiches de même nom et prénom (clé normalizePersonName : casse, accents,
 *    tirets et espaces ignorés) ; à défaut, même nom et même premier prénom
 *    (« Jean Pierre » dans la source, « Jean » sur la fiche) ;
 * 2. aucune fiche → `no_match` : rien à rattacher (ex. maire de 2017 qui n'est
 *    plus en fonction, donc absent du RNE) ;
 * 3. une seule fiche dont un mandat est dans le département indiqué → elle ;
 *    une seule fiche, sans département à comparer d'un côté ou de l'autre →
 *    elle aussi ;
 * 4. sinon → `ambiguous` : homonymes, ou fiche unique mais département
 *    discordant ; un humain tranche dans l'admin.
 */
import { normalizePersonName } from '@elupedia/shared';

export interface IndexedOfficial {
  id: string;
  firstNameKey: string;
  /** Départements normalisés de ses mandats (vide si inconnus). */
  departments: Set<string>;
}

export interface OfficialIndex {
  byName: Map<string, IndexedOfficial[]>;
  bySurname: Map<string, IndexedOfficial[]>;
}

export type Resolution = { officialId: string } | 'no_match' | 'ambiguous';

export function buildOfficialIndex(
  officials: { id: string; firstName: string; lastName: string }[],
  mandateDepartments: { officialId: string; department: string | null }[],
): OfficialIndex {
  const departmentsByOfficial = new Map<string, Set<string>>();
  for (const mandate of mandateDepartments) {
    if (!mandate.department) continue;
    const set =
      departmentsByOfficial.get(mandate.officialId) ??
      departmentsByOfficial
        .set(mandate.officialId, new Set())
        .get(mandate.officialId)!;
    set.add(normalizePersonName(mandate.department));
  }

  const byName = new Map<string, IndexedOfficial[]>();
  const bySurname = new Map<string, IndexedOfficial[]>();
  for (const official of officials) {
    const lastNameKey = normalizePersonName(official.lastName);
    const firstNameKey = normalizePersonName(official.firstName);
    const indexed: IndexedOfficial = {
      id: official.id,
      firstNameKey,
      departments: departmentsByOfficial.get(official.id) ?? new Set(),
    };
    push(byName, `${lastNameKey}|${firstNameKey}`, indexed);
    push(bySurname, lastNameKey, indexed);
  }
  return { byName, bySurname };
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function resolveOfficial(
  index: OfficialIndex,
  lastName: string,
  firstName: string,
  department: string | null,
): Resolution {
  const lastNameKey = normalizePersonName(lastName);
  const firstNameKey = normalizePersonName(firstName);

  let candidates = index.byName.get(`${lastNameKey}|${firstNameKey}`) ?? [];
  if (candidates.length === 0) {
    const firstGivenName = firstNameKey.split(' ')[0];
    candidates = (index.bySurname.get(lastNameKey) ?? []).filter(
      (official) => official.firstNameKey.split(' ')[0] === firstGivenName,
    );
  }
  if (candidates.length === 0) return 'no_match';

  const departmentKey = department ? normalizePersonName(department) : '';
  if (departmentKey) {
    // « Bouches-du-Rhône » côté source, « Bouches-Du-Rhône » sur le mandat :
    // les deux se normalisent pareil. Égalité stricte : une inclusion
    // ferait passer « Rhône » pour « Bouches-du-Rhône ».
    const sameDepartment = candidates.filter((official) =>
      official.departments.has(departmentKey),
    );
    if (sameDepartment.length === 1)
      return { officialId: sameDepartment[0].id };
  }
  if (
    candidates.length === 1 &&
    (!departmentKey || candidates[0].departments.size === 0)
  ) {
    return { officialId: candidates[0].id };
  }
  return 'ambiguous';
}

/**
 * Découpe « DUPONT Jean Pierre » (nom en capitales puis prénoms, convention
 * des listes du Conseil constitutionnel) en nom et prénom. Les mots en
 * capitales de tête forment le nom ; sans mot en minuscules (ou sans mot en
 * capitales), le découpage est impossible et renvoie null.
 */
export function splitUppercaseLastName(
  rawName: string,
): { lastName: string; firstName: string } | null {
  const words = rawName.trim().split(/\s+/);
  let count = 0;
  while (
    count < words.length &&
    words[count] === words[count].toUpperCase() &&
    /\p{Lu}/u.test(words[count])
  ) {
    count++;
  }
  if (count === 0 || count === words.length) return null;
  return {
    lastName: words.slice(0, count).join(' '),
    firstName: words.slice(count).join(' '),
  };
}
