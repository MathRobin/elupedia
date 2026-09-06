const BASE_URL = 'https://archives.legiondhonneur.fr';
const SEARCH_ENGINE_ID = 15;
const MOTEUR_REF = 'arko_default_684af021cfb1c';
const MODE_RESTIT = 'arko_default_684af11bcc698';
const SEARCH_FIELD = 'arko_default_684af0837f315';

export interface DecorationRecord {
  arkoRef: string;
  lastName: string;
  firstName: string | null;
  sex: string | null;
  birthDate: string | null;
  deathDate: string | null;
  birthPlace: string | null;
  decorations: {
    orderName: string;
    grade: string;
    decreeDate: string | null;
    journalOfficielDate: string | null;
    ministry: string | null;
    quality: string | null;
  }[];
}

function buildFilterParams(name: string): URLSearchParams {
  const prefix = `${MOTEUR_REF}--filtreGroupes`;
  const params = new URLSearchParams();
  params.set(`${prefix}[groupes][0][${SEARCH_FIELD}][q][0]`, name);
  params.set(`${prefix}[groupes][0][${SEARCH_FIELD}][op]`, 'AND');
  params.set(`${prefix}[groupes][0][${SEARCH_FIELD}][extras][mode]`, 'input');
  params.set(`${prefix}[operator]`, 'AND');
  params.set(`${prefix}[mode]`, 'simple');
  return params;
}

export async function searchDecorations(name: string): Promise<{
  total: number;
  results: { intitule: string; refUnique: string }[];
}> {
  const params = buildFilterParams(name);
  const url = `${BASE_URL}/_recherche-api/search/${SEARCH_ENGINE_ID}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = (await res.json()) as {
    total: number;
    results: { intitule: string; refUnique: string }[];
  };
  return { total: data.total, results: data.results };
}

function parseFrenchDate(s: string): string | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

export async function fetchFicheDetail(
  arkoRef: string,
): Promise<DecorationRecord | null> {
  const url = `${BASE_URL}/_recherche-api/render-fiche/${MOTEUR_REF}/${arkoRef}/${MODE_RESTIT}/detail/json`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { html: string };
  const html = data.html;

  const field = (name: string): string | null => {
    const re = new RegExp(`data-champ="${name}"[^>]*>([^<]*)`, 'i');
    const m = html.match(re);
    return m ? decodeEntities(m[1]).trim() || null : null;
  };

  const lastName = field('nom');
  if (!lastName) return null;

  const firstName = field('prenom');
  const sex = field('sexe');

  let birthDate: string | null = null;
  const birthDateRaw = field('date_naissance_publique');
  if (birthDateRaw) birthDate = parseFrenchDate(birthDateRaw);

  let deathDate: string | null = null;
  const deathMatch = html.match(
    /Date de décès\s*<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/s,
  );
  if (deathMatch) {
    const raw = stripHtml(deathMatch[1]);
    deathDate = parseFrenchDate(raw);
  }

  let birthPlace: string | null = null;
  const birthPlaceMatch = html.match(
    /Lieu de naissance\s*<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/s,
  );
  if (birthPlaceMatch) {
    birthPlace = stripHtml(birthPlaceMatch[1]) || null;
  }

  const decorations: DecorationRecord['decorations'] = [];
  const rows = html.matchAll(
    /<tr>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<\/tr>/gs,
  );
  for (const row of rows) {
    const orderName = stripHtml(row[1]);
    const grade = stripHtml(row[2]);
    if (!orderName || !grade) continue;
    const decreeDateRaw = stripHtml(row[3]);
    const joDateRaw = stripHtml(row[4]);
    decorations.push({
      orderName,
      grade,
      decreeDate: parseFrenchDate(decreeDateRaw),
      journalOfficielDate: parseFrenchDate(joDateRaw),
      ministry: stripHtml(row[5]) || null,
      quality: stripHtml(row[6]) || null,
    });
  }

  return {
    arkoRef,
    lastName,
    firstName,
    sex,
    birthDate,
    deathDate,
    birthPlace,
    decorations,
  };
}

export async function fetchDecorationsForOfficial(
  lastName: string,
  firstName: string | null,
): Promise<DecorationRecord[]> {
  const query = firstName ? `${lastName} ${firstName}` : lastName;
  const { results } = await searchDecorations(query);
  const records: DecorationRecord[] = [];

  for (const r of results) {
    const detail = await fetchFicheDetail(r.refUnique);
    if (detail && detail.decorations.length > 0) {
      records.push(detail);
    }
  }
  return records;
}
