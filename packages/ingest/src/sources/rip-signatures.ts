/**
 * Signataires des propositions de loi de référendum d'initiative partagée (RIP).
 *
 * Source : la page HTML officielle de chaque proposition (assemblee-nationale.fr
 * ou senat.fr), listée en dur dans RIP_PROPOSITIONS avec la décision du Conseil
 * constitutionnel associée. Pas d'API ni de format structuré : on aplatit le
 * HTML en texte, on isole le bloc « présentée par Mesdames et Messieurs … députés
 * et sénateurs » et on découpe les noms sur les virgules.
 *
 * Format des noms : « Prénom NOM », parfois précédé d'un titre (Mme, M., MM.).
 * Le nom de famille est reconnu par sa casse (mots entièrement en capitales),
 * donc une particule en minuscules (« de », « van ») est rattachée au prénom.
 *
 * Appelé par main-rip-signatures.ts ; le rattachement aux élus (matching
 * nom/prénom) est fait en aval par upsert/sponsorships.ts.
 */
import { logger } from '../logger.js';

export interface RipProposition {
  year: number;
  subject: string;
  /** Page HTML de la proposition, scrapée pour la liste des signataires. */
  url: string;
  /** Décision du Conseil constitutionnel sur la recevabilité de la proposition. */
  sourceDecision: string;
  decisionDate: string;
}

export const RIP_PROPOSITIONS: RipProposition[] = [
  {
    year: 2019,
    subject: 'Aéroports de Paris (ADP)',
    url: 'https://www.assemblee-nationale.fr/dyn/opendata/PIONANR5L15B1867.html',
    sourceDecision:
      'https://www.conseil-constitutionnel.fr/decision/2019/20191RIP.htm',
    decisionDate: '2019-05-09',
  },
  {
    year: 2023,
    subject: 'Âge légal de départ à la retraite (n°959)',
    url: 'https://www.assemblee-nationale.fr/dyn/opendata/PIONANR5L16B0959.html',
    sourceDecision:
      'https://www.conseil-constitutionnel.fr/decision/2023/20234RIP.htm',
    decisionDate: '2023-04-14',
  },
  {
    year: 2023,
    subject: 'Âge légal de départ à la retraite (n°530)',
    url: 'https://www.senat.fr/leg/ppl22-530.html',
    sourceDecision:
      'https://www.conseil-constitutionnel.fr/decision/2023/20235RIP.htm',
    decisionDate: '2023-05-03',
  },
];

export interface RipSignataireRow {
  firstName: string;
  lastName: string;
  subject: string;
  year: number;
}

/** Titres de civilité en tête d'un nom (« Mme », « M. », « MM. » pour une suite de messieurs). */
const TITLE_PREFIXES = /^(Mme|Mmes|M\.|MM\.|M)\s+/;

// Formules d'ouverture et de clôture du bloc des signataires, telles qu'elles
// apparaissent sur les pages AN et Sénat (casse et accord variables).
const SIGNATORY_BLOCK_START_MARKERS = [
  'présentée par Mesdames et Messieurs',
  'présenté par Mesdames et Messieurs',
  'PRÉSENTÉE PAR MESDAMES ET MESSIEURS',
];
const SIGNATORY_BLOCK_END_MARKERS = [
  'députés et sénateurs',
  'députés.',
  'sénateurs et députés',
  'sénateurs.',
  'Sénateurs et Députés',
];

/**
 * Isole le bloc des signataires dans le texte aplati et le découpe en noms
 * bruts (titre éventuel inclus). Retourne [] si la formule d'ouverture est absente.
 */
function extractNamesFromText(text: string): string[] {
  let startIdx = -1;
  for (const marker of SIGNATORY_BLOCK_START_MARKERS) {
    startIdx = text.indexOf(marker);
    if (startIdx !== -1) {
      startIdx += marker.length;
      break;
    }
  }

  if (startIdx === -1) return [];

  // Fin du bloc = la première des formules de clôture rencontrée après l'ouverture.
  let endIdx = text.length;
  for (const marker of SIGNATORY_BLOCK_END_MARKERS) {
    const idx = text.indexOf(marker, startIdx);
    if (idx !== -1 && idx < endIdx) {
      endIdx = idx;
    }
  }

  const block = text.slice(startIdx, endIdx);
  return block
    .split(',')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 1);
}

/**
 * Sépare prénom et nom d'un nom brut (« Mme Nadège ABOMANGOLI » → Nadège /
 * ABOMANGOLI). Les mots tout en capitales forment le nom, les autres le
 * prénom. Retourne null si l'un des deux manque (ex. un seul mot).
 */
function parseName(
  raw: string,
): { firstName: string; lastName: string } | null {
  const cleaned = raw.replace(TITLE_PREFIXES, '').trim();
  if (!cleaned) return null;

  const parts = cleaned.split(/\s+/);
  if (parts.length < 2) return null;

  const lastNameParts: string[] = [];
  const firstNameParts: string[] = [];

  for (const part of parts) {
    // `length > 1` évite de prendre une initiale (« J. ») pour un nom.
    if (part === part.toUpperCase() && part.length > 1) {
      lastNameParts.push(part);
    } else {
      firstNameParts.push(part);
    }
  }

  if (lastNameParts.length === 0 || firstNameParts.length === 0) return null;

  return {
    firstName: firstNameParts.join(' '),
    lastName: lastNameParts.join(' '),
  };
}

/**
 * Aplatit le HTML en texte : balises → espace, entités courantes décodées.
 * &#8209; (tiret insécable, fréquent dans les prénoms composés côté AN) est
 * conservé tel quel ; les espaces typographiques &#x2000-200F; sont supprimés.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8209;/g, '‑')
    .replace(/&#x202[0-9a-fA-F];/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Télécharge la page d'une proposition RIP et en extrait les signataires.
 * Appel réseau (un GET). Lève une erreur si la page ne répond pas en 2xx ;
 * un bloc de signataires introuvable donne simplement une liste vide.
 */
export async function fetchRipSignatures(
  proposition: RipProposition,
  fetchFn: typeof fetch = fetch,
): Promise<RipSignataireRow[]> {
  logger.info(`[RIP] Fetching ${proposition.year} ${proposition.subject}`);
  const response = await fetchFn(proposition.url);
  if (!response.ok) {
    throw new Error(
      `RIP fetch error: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();
  const text = stripHtml(html);
  const rawNames = extractNamesFromText(text);

  const rows: RipSignataireRow[] = [];
  for (const rawName of rawNames) {
    const parsed = parseName(rawName);
    if (!parsed) continue;
    rows.push({
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      subject: proposition.subject,
      year: proposition.year,
    });
  }

  logger.info(
    `[RIP] Parsed ${rows.length} signataires for ${proposition.year} ${proposition.subject}`,
  );
  return rows;
}
