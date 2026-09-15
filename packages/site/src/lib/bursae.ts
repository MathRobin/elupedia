/**
 * Client de la fiche budgétaire Bursae, récupérée par oEmbed.
 *
 * Bursae identifie ses collectivités par code INSEE (voir MathRobin/bursae#115) :
 * c'est la seule clé non ambiguë, plusieurs communes françaises partageant le
 * même nom. Aucune donnée n'est copiée : la réponse contient une iframe servie
 * et rendue par Bursae.
 */

// Surchargeable pour tester le comportement en cas d'indisponibilité, ou pour
// couper la dépendance sans redéployer.
const BURSAE_ORIGIN = import.meta.env?.BURSAE_ORIGIN ?? 'https://www.bursae.fr';
// L'apex bursae.fr redirige en 308 vers www : on l'évite en appelant www
// directement, mais les URLs de page restent en apex, forme canonique côté
// Bursae et seule reconnue par son endpoint.
const BURSAE_PAGE_ORIGIN = 'https://bursae.fr';

/** Les données budgétaires accusent 12 à 18 mois de décalage : un cache long est sans risque. */
const TTL_MS = 24 * 60 * 60 * 1000;
/** Une absence peut être due à une couverture Bursae encore partielle : on retente plus souvent. */
const MISS_TTL_MS = 60 * 60 * 1000;
/** Bursae ne doit jamais retarder le rendu d'une fiche élu. */
const TIMEOUT_MS = 2000;

export interface BursaeEmbed {
  title: string;
  html: string;
  width: number;
  height: number;
  providerName: string;
  providerUrl: string;
  /** Code INSEE renvoyé par Bursae, à comparer à celui demandé. */
  codeInsee: string | null;
  /** Page Bursae correspondante, pour un lien sortant. */
  pageUrl: string;
}

interface CacheEntry {
  value: BursaeEmbed | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function buildOembedUrl(communeCode: string): string {
  const pageUrl = `${BURSAE_PAGE_ORIGIN}/collectivite/insee/${communeCode}`;
  return `${BURSAE_ORIGIN}/api/oembed?url=${encodeURIComponent(pageUrl)}&format=json`;
}

/**
 * Valide la réponse oEmbed avant de la rendre exploitable. Une réponse
 * malformée est traitée comme une absence de fiche, pas comme une erreur.
 */
export function parseOembed(payload: unknown): BursaeEmbed | null {
  if (typeof payload !== 'object' || payload === null) return null;

  const raw = payload as Record<string, unknown>;
  if (raw.type !== 'rich') return null;
  if (typeof raw.html !== 'string' || !raw.html.includes('<iframe'))
    return null;

  const codeInsee = typeof raw.code_insee === 'string' ? raw.code_insee : null;

  return {
    title: typeof raw.title === 'string' ? raw.title : 'Fiche budgétaire',
    html: raw.html,
    width: typeof raw.width === 'number' ? raw.width : 600,
    height: typeof raw.height === 'number' ? raw.height : 400,
    providerName:
      typeof raw.provider_name === 'string' ? raw.provider_name : 'Bursae',
    providerUrl:
      typeof raw.provider_url === 'string'
        ? raw.provider_url
        : BURSAE_PAGE_ORIGIN,
    codeInsee,
    pageUrl: extractIframeSrc(raw.html) ?? BURSAE_PAGE_ORIGIN,
  };
}

function extractIframeSrc(html: string): string | null {
  return html.match(/<iframe[^>]+src="([^"]+)"/)?.[1] ?? null;
}

/**
 * Récupère la fiche budgétaire d'une commune. Renvoie `null` dès que la fiche
 * n'est pas disponible, quelle qu'en soit la raison — Bursae injoignable, lent,
 * commune hors de sa couverture, réponse inattendue. L'appelant affiche la
 * section ou non ; le rendu de la fiche élu n'échoue jamais à cause de Bursae.
 */
export async function fetchBursaeEmbed(
  communeCode: string,
  fetchFn: typeof fetch = fetch,
): Promise<BursaeEmbed | null> {
  if (!/^[0-9AB]{5}$/i.test(communeCode)) return null;

  const key = communeCode.toUpperCase();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  let value: BursaeEmbed | null = null;

  try {
    const response = await fetchFn(buildOembedUrl(key), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      const payload = await response.json();
      value = parseOembed(payload);

      // Une réponse acceptée mais illisible signale un changement de contrat
      // côté Bursae, pas une commune absente : c'est le seul cas qui demande
      // une intervention de notre part.
      if (!value) {
        logFailure('contrat', key, describePayload(payload));
      }
    } else if (response.status >= 500) {
      logFailure('indisponible', key, `HTTP ${response.status}`);
    }
    // 404 (hors couverture) et 409 (slug ambigu) sont des réponses normales,
    // pas des incidents : la fiche n'est simplement pas affichable.
  } catch (err) {
    // Timeout, DNS, réseau, JSON invalide : la fiche est absente, mais le
    // motif est journalisé pour distinguer une panne d'une absence.
    const name = err instanceof Error ? err.name : 'Error';
    logFailure(
      name === 'TimeoutError' ? 'timeout' : 'réseau',
      key,
      err instanceof Error ? err.message : String(err),
    );
    value = null;
  }

  cache.set(key, {
    value,
    expiresAt: Date.now() + (value ? TTL_MS : MISS_TTL_MS),
  });

  return value;
}

type FailureKind = 'contrat' | 'indisponible' | 'timeout' | 'réseau';

/**
 * Journalise les appels en échec pour qu'une rupture de contrat côté Bursae se
 * voie dans les journaux sans attendre un signalement. Une commune absente du
 * référentiel n'est pas un échec et n'apparaît pas ici.
 */
function logFailure(kind: FailureKind, communeCode: string, detail: string) {
  const level = kind === 'contrat' ? 'error' : 'warn';
  console[level](`[bursae] ${kind} — commune ${communeCode} : ${detail}`);
}

/** Résume une charge utile inattendue sans déverser la réponse entière. */
function describePayload(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) {
    return `charge utile ${typeof payload}`;
  }
  const raw = payload as Record<string, unknown>;
  return `type=${JSON.stringify(raw.type)} html=${typeof raw.html}`;
}

/** Réservé aux tests : vide le cache mémoire. */
export function clearBursaeCache(): void {
  cache.clear();
}
