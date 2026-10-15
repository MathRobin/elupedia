/**
 * Décorations (Légion d'honneur, Ordre national du Mérite, Médaille
 * militaire) depuis la base Léonore des archives de la Grande Chancellerie.
 *
 * Source : archives.legiondhonneur.fr, moteur de recherche « Arkothèque »
 * non documenté, interrogé comme le fait le site :
 * - `/_recherche-api/search/{engine}` renvoie du JSON (total, count, results
 *   {intitule, refUnique}) ; les paramètres portent des identifiants opaques
 *   (MOTEUR_REF, SEARCH_FIELD, …) relevés dans le front du site ;
 * - `/_recherche-api/render-fiche/…/{ref}/…/detail/json` renvoie
 *   `{ html }` : la fiche détaillée en HTML, qu'on parse par regex.
 *
 * Extrait : un `DecorationRecord` par fiche (état civil + tableau des
 * décorations : ordre, grade, dates du décret et du JO, ministère, qualité).
 *
 * Pièges :
 * - Les identifiants Arkothèque peuvent changer si le site est redéployé.
 * - Pagination par `from` (PAGE_SIZE), plafonnée à MAX_RESULTS résultats.
 * - Retry avec attente croissante sur erreur réseau ou 5xx (fetchWithRetry).
 * - Utilise le `fetch` global ; les dates sont au format JJ/MM/AAAA.
 *
 * Appelé par main-decorations.ts via upsert/decorations.ts.
 */
const BASE_URL = 'https://archives.legiondhonneur.fr';
// Identifiants opaques du moteur Arkothèque, relevés dans le site.
const SEARCH_ENGINE_ID = 15;
const MOTEUR_REF = 'arko_default_684af021cfb1c';
const MODE_RESTIT = 'arko_default_684af11bcc698';
const SEARCH_FIELD = 'arko_default_684af0837f315';

const DEFAULT_RETRIES = 3;
/** Attente de base entre deux tentatives, multipliée par le numéro d'essai. */
const RETRY_BASE_DELAY_MS = 2000;

/**
 * `fetch` avec nouvelles tentatives sur erreur réseau ou réponse 5xx. Une
 * réponse 4xx est renvoyée telle quelle (c'est à l'appelant de la traiter).
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = DEFAULT_RETRIES,
): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || response.status < 500) return response;
    } catch {
      if (attempt === retries - 1)
        throw new Error(
          `Fetch failed after ${retries} retries: ${url.slice(0, 120)}`,
        );
    }
    await new Promise((resolve) =>
      setTimeout(resolve, RETRY_BASE_DELAY_MS * (attempt + 1)),
    );
  }
  throw new Error('unreachable');
}

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

/** Paramètres de recherche simple sur le champ « nom » du moteur. */
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

/** Taille de page du moteur Arkothèque. */
const PAGE_SIZE = 25;
/** Au-delà, un nom trop courant : on s'arrête. */
const MAX_RESULTS = 500;

/**
 * Recherche les fiches correspondant à `name` (toutes pages confondues,
 * jusqu'à MAX_RESULTS). Lève sur réponse HTTP non 2xx.
 */
export async function searchDecorations(name: string): Promise<{
  total: number;
  results: { intitule: string; refUnique: string }[];
}> {
  const params = buildFilterParams(name);
  const allResults: { intitule: string; refUnique: string }[] = [];
  let from = 0;
  let total = 0;

  while (allResults.length < MAX_RESULTS) {
    const pageParams = new URLSearchParams(params);
    if (from > 0) pageParams.set(`${MOTEUR_REF}--from`, String(from));

    const url = `${BASE_URL}/_recherche-api/search/${SEARCH_ENGINE_ID}?${pageParams.toString()}`;
    const response = await fetchWithRetry(url, {
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    if (!response.ok) throw new Error(`Search failed: ${response.status}`);

    const page = (await response.json()) as {
      total: number;
      count: number;
      results: { intitule: string; refUnique: string }[];
    };

    total = page.total;
    allResults.push(...page.results);

    if (page.count < PAGE_SIZE || allResults.length >= total) break;
    from += PAGE_SIZE;
  }

  return { total, results: allResults };
}

/** « JJ/MM/AAAA » → AAAA-MM-JJ ; null si autre format. */
function parseFrenchDate(raw: string): string | null {
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function decodeEntities(raw: string): string {
  return raw
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

/**
 * Charge et parse la fiche détaillée d'une personne. Renvoie null si la
 * fiche est inaccessible ou sans nom.
 */
export async function fetchFicheDetail(
  arkoRef: string,
): Promise<DecorationRecord | null> {
  const url = `${BASE_URL}/_recherche-api/render-fiche/${MOTEUR_REF}/${arkoRef}/${MODE_RESTIT}/detail/json`;
  const response = await fetchWithRetry(url, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { html: string };
  const html = payload.html;

  /** Valeur d'un champ balisé `data-champ="…"` dans la fiche. */
  const field = (name: string): string | null => {
    const fieldRegex = new RegExp(`data-champ="${name}"[^>]*>([^<]*)`, 'i');
    const match = html.match(fieldRegex);
    return match ? decodeEntities(match[1]).trim() || null : null;
  };

  const lastName = field('nom');
  if (!lastName) return null;

  const firstName = field('prenom');
  const sex = field('sexe');

  let birthDate: string | null = null;
  const birthDateRaw = field('date_naissance_publique');
  if (birthDateRaw) birthDate = parseFrenchDate(birthDateRaw);

  // Décès et lieu de naissance ne sont pas balisés data-champ : on lit la
  // paire <dt>/<dd> correspondante.
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

  // Tableau des décorations : 6 colonnes (ordre, grade, date du décret,
  // date JO, ministère, qualité).
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

/**
 * Recherche « Nom Prénom » puis charge chaque fiche ; ne renvoie que les
 * fiches ayant au moins une décoration. Le rapprochement avec l'élu (homonymes,
 * date de naissance) est fait par l'appelant.
 */
export async function fetchDecorationsForOfficial(
  lastName: string,
  firstName: string | null,
): Promise<DecorationRecord[]> {
  const query = firstName ? `${lastName} ${firstName}` : lastName;
  const { results } = await searchDecorations(query);
  const records: DecorationRecord[] = [];

  for (const result of results) {
    const detail = await fetchFicheDetail(result.refUnique);
    if (detail && detail.decorations.length > 0) {
      records.push(detail);
    }
  }
  return records;
}
