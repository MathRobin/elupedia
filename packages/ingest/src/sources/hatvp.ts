import { Readable } from 'node:stream';
import sax from 'sax';

import {
  InterestItemSchema,
  type InterestItem,
  type Declaration,
} from '../schemas.js';
import { logger } from '../logger.js';

export { InterestItemSchema, type InterestItem, type Declaration };

export const DECLARATIONS_URL =
  'https://www.hatvp.fr/livraison/merge/declarations.xml';

const PARLIAMENTARY_MANDATS = new Set([
  'DEPUTE',
  'DÉPUTÉ',
  'DEPUTEE',
  'DÉPUTÉE',
  'SENATEUR',
  'SÉNATEUR',
  'SENATRICE',
  'SÉNATRICE',
]);

function isParliamentary(description: string): boolean {
  const upper = description.toUpperCase().trim();
  for (const m of PARLIAMENTARY_MANDATS) {
    if (upper.startsWith(m)) return true;
  }
  return false;
}

type RawItem = Record<string, string>;

interface RawDeclaration {
  nom: string;
  prenom: string;
  dateDepot: string;
  mandatDescriptions: string[];
  participations: RawItem[];
  fonctionsBenefoles: RawItem[];
}

export async function fetchDeclarations(
  fetchFn: typeof fetch = fetch,
): Promise<Declaration[]> {
  const response = await fetchFn(DECLARATIONS_URL);
  if (!response.ok) {
    throw new Error(
      `HATVP API error: ${response.status} ${response.statusText}`,
    );
  }

  const declarations = await parseDeclarationsStream(response);
  logger.info(`HATVP: ${declarations.length} parliamentary declarations found`);
  return declarations;
}

async function parseDeclarationsStream(
  response: Response,
): Promise<Declaration[]> {
  const parser = sax.createStream(true, { trim: true });
  const results: Declaration[] = [];

  let current: RawDeclaration | null = null;
  const path: string[] = [];
  let textBuf = '';

  let inParticipation = false;
  let currentParticipation: RawItem = {};
  let inFonctionBenevole = false;
  let currentFonction: RawItem = {};

  parser.on('opentag', (node) => {
    const tag = node.name;
    path.push(tag);
    textBuf = '';

    if (tag === 'declaration') {
      current = {
        nom: '',
        prenom: '',
        dateDepot: '',
        mandatDescriptions: [],
        participations: [],
        fonctionsBenefoles: [],
      };
    }

    const joined = path.join('/');
    if (
      joined.includes('participationFinanciereDto/items/items') &&
      tag === 'items'
    ) {
      inParticipation = true;
      currentParticipation = {};
    }
    if (joined.includes('fonctionBenevoleDto/items/items') && tag === 'items') {
      inFonctionBenevole = true;
      currentFonction = {};
    }
  });

  parser.on('text', (t) => {
    textBuf += t;
  });

  parser.on('cdata', (t) => {
    textBuf += t;
  });

  parser.on('closetag', (tag) => {
    const text = textBuf.trim();

    if (current) {
      const joined = path.join('/');

      if (joined.endsWith('declarant/nom')) current.nom = text;
      if (joined.endsWith('declarant/prenom')) current.prenom = text;
      if (joined.endsWith('declaration/dateDepot') && !current.dateDepot)
        current.dateDepot = text;
      if (joined.endsWith('mandatElectifDto/items/items/descriptionMandat'))
        current.mandatDescriptions.push(text);

      if (inParticipation) {
        if (
          tag === 'items' &&
          joined.includes('participationFinanciereDto/items/items')
        ) {
          if (currentParticipation.nomSociete) {
            current.participations.push({ ...currentParticipation });
          }
          inParticipation = false;
        } else if (text) {
          currentParticipation[tag] = text;
        }
      }

      if (inFonctionBenevole) {
        if (
          tag === 'items' &&
          joined.includes('fonctionBenevoleDto/items/items')
        ) {
          if (currentFonction.nomSociete) {
            current.fonctionsBenefoles.push({ ...currentFonction });
          }
          inFonctionBenevole = false;
        } else if (text) {
          currentFonction[tag] = text;
        }
      }

      if (tag === 'declaration') {
        const isParlementaire =
          current.mandatDescriptions.some(isParliamentary);
        if (isParlementaire && current.nom && current.prenom) {
          const interests: InterestItem[] = [];
          const declaredDate = parseDate(current.dateDepot);

          for (const p of current.participations) {
            interests.push({
              category: 'financial_participation',
              type: 'company_share',
              entity_name: p.nomSociete,
              role_description: p.nombreParts
                ? `${p.nombreParts} parts`
                : undefined,
              declared_date: declaredDate,
              full: p,
            });
          }

          for (const f of current.fonctionsBenefoles) {
            interests.push({
              category: 'voluntary_activity',
              type: 'nonprofit_role',
              entity_name: f.nomSociete,
              role_description: f.activite || undefined,
              declared_date: declaredDate,
              full: f,
            });
          }

          if (interests.length > 0) {
            results.push({
              nom: current.nom.toUpperCase(),
              prenom: capitalize(current.prenom),
              date_depot: declaredDate,
              interests,
            });
          }
        }
        current = null;
      }
    }

    path.pop();
    textBuf = '';
  });

  return new Promise<Declaration[]>((resolve, reject) => {
    parser.on('end', () => resolve(results));
    parser.on('error', reject);

    const body = response.body;
    if (!body) {
      resolve([]);
      return;
    }
    Readable.fromWeb(body as never).pipe(parser);
  });
}

function parseDate(raw: string): string {
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return raw || new Date().toISOString().slice(0, 10);
}

function capitalize(s: string): string {
  return s.toLowerCase().replace(/(^|\s|-)\S/g, (c) => c.toUpperCase());
}
