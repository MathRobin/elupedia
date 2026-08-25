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
  activitesPro: RawItem[];
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
  let inActivitePro = false;
  let currentActivitePro: RawItem = {};

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
        activitesPro: [],
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
    if (
      joined.includes('activProfCinqDerniereDto/items/items') &&
      tag === 'items'
    ) {
      inActivitePro = true;
      currentActivitePro = {};
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

      if (inActivitePro) {
        if (
          tag === 'items' &&
          joined.includes('activProfCinqDerniereDto/items/items')
        ) {
          if (currentActivitePro.description || currentActivitePro.employeur) {
            current.activitesPro.push({ ...currentActivitePro });
          }
          inActivitePro = false;
        } else if (text) {
          currentActivitePro[tag] = text;
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

          for (const a of current.activitesPro) {
            interests.push({
              category: 'professional_activity',
              type: 'professional_activity',
              entity_name: a.employeur || a.description,
              role_description: a.employeur ? a.description : undefined,
              declared_date: declaredDate,
              start_date: parseMonthDate(a.dateDebut),
              end_date: parseMonthDate(a.dateFin),
              full: a,
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

function parseMonthDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/^(\d{2})\/(\d{4})/);
  if (match) return `${match[2]}-${match[1]}-01`;
  return undefined;
}

function capitalize(s: string): string {
  return s.toLowerCase().replace(/(^|\s|-)\S/g, (c) => c.toUpperCase());
}
