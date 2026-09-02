import { logger } from '../logger.js';

export interface RipProposition {
  year: number;
  subject: string;
  url: string;
  sourceDecision: string;
}

export const RIP_PROPOSITIONS: RipProposition[] = [
  {
    year: 2019,
    subject: 'Aéroports de Paris (ADP)',
    url: 'https://www.assemblee-nationale.fr/dyn/opendata/PIONANR5L15B1867.html',
    sourceDecision:
      'https://www.conseil-constitutionnel.fr/decision/2019/20191RIP.htm',
  },
  {
    year: 2023,
    subject: 'Âge légal de départ à la retraite (n°959)',
    url: 'https://www.assemblee-nationale.fr/dyn/opendata/PIONANR5L16B0959.html',
    sourceDecision:
      'https://www.conseil-constitutionnel.fr/decision/2023/20234RIP.htm',
  },
  {
    year: 2023,
    subject: 'Âge légal de départ à la retraite (n°530)',
    url: 'https://www.senat.fr/leg/ppl22-530.html',
    sourceDecision:
      'https://www.conseil-constitutionnel.fr/decision/2023/20235RIP.htm',
  },
];

export interface RipSignataireRow {
  firstName: string;
  lastName: string;
  subject: string;
  year: number;
}

const TITLE_PREFIXES = /^(Mme|Mmes|M\.|MM\.|M)\s+/;

function extractNamesFromText(text: string): string[] {
  const startMarkers = [
    'présentée par Mesdames et Messieurs',
    'présenté par Mesdames et Messieurs',
    'PRÉSENTÉE PAR MESDAMES ET MESSIEURS',
  ];

  let startIdx = -1;
  for (const marker of startMarkers) {
    startIdx = text.indexOf(marker);
    if (startIdx !== -1) {
      startIdx += marker.length;
      break;
    }
  }

  if (startIdx === -1) return [];

  const endMarkers = [
    'députés et sénateurs',
    'députés.',
    'sénateurs et députés',
    'sénateurs.',
    'Sénateurs et Députés',
  ];

  let endIdx = text.length;
  for (const marker of endMarkers) {
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
  for (const raw of rawNames) {
    const parsed = parseName(raw);
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
