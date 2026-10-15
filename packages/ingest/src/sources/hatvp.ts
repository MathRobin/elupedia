/**
 * Déclarations d'intérêts publiées par la HATVP (députés, sénateurs, maires).
 *
 * Source : `declarations.xml`, un seul fichier XML de plusieurs centaines de
 * Mo regroupant toutes les déclarations publiées. Il est parsé en flux (sax)
 * pour ne jamais être chargé entièrement en mémoire.
 *
 * Structure utile de chaque `<declaration>` :
 * - `general/declarant/{nom,prenom}`, `dateDepot` (JJ/MM/AAAA hh:mm:ss),
 *   `typeDeclaration` (DI… initiale, DM… modificative) ;
 * - des sections `<xxxDto><items><items>…</items></items></xxxDto>` : le
 *   premier `items` est le conteneur, les `items` imbriqués sont les
 *   éléments (participations financières, fonctions bénévoles, activités
 *   professionnelles, activités de consultant, fonctions dirigeantes,
 *   mandats électifs).
 *
 * Extrait : une `Declaration` par déclaration dont au moins un mandat
 * électif correspond à ELIGIBLE_MANDATS, avec ses intérêts normalisés
 * (`InterestItem`, voir ../schemas.ts). Les mandats parlementaires / de
 * maire eux-mêmes ne sont pas émis comme intérêts, seuls les autres mandats
 * électifs le sont. Une déclaration sans aucun intérêt est ignorée.
 *
 * Pièges :
 * - Le parseur conserve une machine à états par section (`inXxx` +
 *   `currentXxx`) ; le texte d'une balise feuille est copié tel quel dans
 *   l'item courant sous le nom de la balise.
 * - Les dates de début/fin sont au format MM/AAAA → ramenées au 1er du mois.
 * - Le nom est forcé en majuscules et le prénom capitalisé pour faciliter le
 *   rapprochement avec les fiches.
 *
 * Appelé par run-interests.ts via upsert/interests.ts et
 * upsert/declaration-snapshots.ts.
 */
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

/**
 * Préfixes (en majuscules) des descriptions de mandat qui rendent une
 * déclaration éligible, accentués ou non selon la saisie du déclarant.
 */
const ELIGIBLE_MANDATS = new Set([
  'DEPUTE',
  'DÉPUTÉ',
  'DEPUTEE',
  'DÉPUTÉE',
  'SENATEUR',
  'SÉNATEUR',
  'SENATRICE',
  'SÉNATRICE',
  'MAIRE',
]);

function isEligibleMandat(description: string): boolean {
  const upper = description.toUpperCase().trim();
  for (const prefix of ELIGIBLE_MANDATS) {
    if (upper.startsWith(prefix)) return true;
  }
  return false;
}

/** Élément d'une section, clé = nom de balise XML, valeur = texte brut. */
type RawItem = Record<string, string>;

interface RawDeclaration {
  nom: string;
  prenom: string;
  dateDepot: string;
  typeDeclaration: string;
  /** Toutes les descriptions de mandat, éligibles ou non. */
  mandatDescriptions: string[];
  participations: RawItem[];
  fonctionsBenevoles: RawItem[];
  activitesPro: RawItem[];
  activitesConsultant: RawItem[];
  participationsDirigeant: RawItem[];
  /** Mandats électifs non éligibles (ceux émis comme intérêts). */
  mandatsElectifs: RawItem[];
}

/**
 * Télécharge le flux XML et renvoie les déclarations des élus éligibles.
 * Lève si le téléchargement échoue.
 */
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
  /** Pile des balises ouvertes, de la racine à la balise courante. */
  const path: string[] = [];
  let textBuf = '';

  // Une machine à états par section : « dans un item de la section » +
  // l'item en cours de remplissage.
  let inParticipation = false;
  let currentParticipation: RawItem = {};
  let inFonctionBenevole = false;
  let currentFonction: RawItem = {};
  let inActivitePro = false;
  let currentActivitePro: RawItem = {};
  let inActiviteConsultant = false;
  let currentActiviteConsultant: RawItem = {};
  let inParticipationDirigeant = false;
  let currentParticipationDirigeant: RawItem = {};
  let inMandatElectif = false;
  let currentMandatElectif: RawItem = {};

  parser.on('opentag', (node) => {
    const tag = node.name;
    path.push(tag);
    textBuf = '';

    if (tag === 'declaration') {
      current = {
        nom: '',
        prenom: '',
        dateDepot: '',
        typeDeclaration: '',
        mandatDescriptions: [],
        participations: [],
        fonctionsBenevoles: [],
        activitesPro: [],
        activitesConsultant: [],
        participationsDirigeant: [],
        mandatsElectifs: [],
      };
    }

    // Entrée dans un élément (`items/items`) d'une section.
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
    if (joined.includes('activConsultantDto/items/items') && tag === 'items') {
      inActiviteConsultant = true;
      currentActiviteConsultant = {};
    }
    if (
      joined.includes('participationDirigeantDto/items/items') &&
      tag === 'items'
    ) {
      inParticipationDirigeant = true;
      currentParticipationDirigeant = {};
    }
    if (joined.includes('mandatElectifDto/items/items') && tag === 'items') {
      inMandatElectif = true;
      currentMandatElectif = {};
    }
  });

  parser.on('text', (text) => {
    textBuf += text;
  });

  parser.on('cdata', (cdata) => {
    textBuf += cdata;
  });

  parser.on('closetag', (tag) => {
    const text = textBuf.trim();

    if (current) {
      const joined = path.join('/');

      if (joined.endsWith('declarant/nom')) current.nom = text;
      if (joined.endsWith('declarant/prenom')) current.prenom = text;
      // Première occurrence seulement : d'autres dateDepot peuvent suivre.
      if (joined.endsWith('declaration/dateDepot') && !current.dateDepot)
        current.dateDepot = text;
      if (joined.endsWith('declaration/typeDeclaration'))
        current.typeDeclaration = text;

      // Pour chaque section : à la fermeture de l'élément, on l'ajoute s'il
      // est valide ; sinon on copie le texte de la balise feuille dans l'item.
      if (inMandatElectif) {
        if (
          tag === 'items' &&
          joined.includes('mandatElectifDto/items/items')
        ) {
          if (currentMandatElectif.descriptionMandat) {
            current.mandatDescriptions.push(
              currentMandatElectif.descriptionMandat,
            );
            // Le mandat parlementaire / de maire fonde l'éligibilité ; seuls
            // les autres mandats deviennent des intérêts « fonction élue ».
            if (!isEligibleMandat(currentMandatElectif.descriptionMandat)) {
              current.mandatsElectifs.push({ ...currentMandatElectif });
            }
          }
          inMandatElectif = false;
        } else if (text) {
          currentMandatElectif[tag] = text;
        }
      }

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
            current.fonctionsBenevoles.push({ ...currentFonction });
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

      if (inActiviteConsultant) {
        if (
          tag === 'items' &&
          joined.includes('activConsultantDto/items/items')
        ) {
          if (
            currentActiviteConsultant.description ||
            currentActiviteConsultant.nomEmployeur
          ) {
            current.activitesConsultant.push({
              ...currentActiviteConsultant,
            });
          }
          inActiviteConsultant = false;
        } else if (text) {
          currentActiviteConsultant[tag] = text;
        }
      }

      if (inParticipationDirigeant) {
        if (
          tag === 'items' &&
          joined.includes('participationDirigeantDto/items/items')
        ) {
          if (currentParticipationDirigeant.nomSociete) {
            current.participationsDirigeant.push({
              ...currentParticipationDirigeant,
            });
          }
          inParticipationDirigeant = false;
        } else if (text) {
          currentParticipationDirigeant[tag] = text;
        }
      }

      if (tag === 'declaration') {
        const isParlementaire =
          current.mandatDescriptions.some(isEligibleMandat);
        if (isParlementaire && current.nom && current.prenom) {
          const declaredDate = parseDate(current.dateDepot);
          const interests = buildInterests(current, declaredDate);

          if (interests.length > 0) {
            const declType = parseDeclarationType(current.typeDeclaration);
            results.push({
              nom: current.nom.toUpperCase(),
              prenom: capitalize(current.prenom),
              date_depot: declaredDate,
              interests,
              declaration_type: declType,
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

/**
 * Convertit les sections brutes d'une déclaration en intérêts normalisés,
 * dans l'ordre : participations financières, fonctions bénévoles, activités
 * professionnelles, activités de consultant, fonctions dirigeantes, autres
 * mandats électifs.
 */
function buildInterests(
  raw: RawDeclaration,
  declaredDate: string,
): InterestItem[] {
  const interests: InterestItem[] = [];

  for (const participation of raw.participations) {
    const ownershipParts: string[] = [];
    if (participation.nombreParts)
      ownershipParts.push(`${participation.nombreParts} parts`);
    if (participation.pourcentageCapital)
      ownershipParts.push(`${participation.pourcentageCapital}% du capital`);

    interests.push({
      category: 'financial_participation',
      type: 'company_share',
      entity_name: participation.nomSociete,
      role_description: participation.nombreParts
        ? `${participation.nombreParts} parts`
        : undefined,
      declared_date: declaredDate,
      full: participation,
      declarant_comment: participation.commentaire || undefined,
      ownership_detail:
        ownershipParts.length > 0 ? ownershipParts.join(', ') : undefined,
    });
  }

  for (const fonction of raw.fonctionsBenevoles) {
    interests.push({
      category: 'voluntary_activity',
      type: 'nonprofit_role',
      entity_name: fonction.nomSociete,
      role_description: fonction.activite || undefined,
      declared_date: declaredDate,
      full: fonction,
      declarant_comment: fonction.commentaire || undefined,
    });
  }

  // Sans employeur, la description tient lieu d'entité (ex. profession
  // libérale) et il n'y a pas de rôle distinct.
  for (const activite of raw.activitesPro) {
    interests.push({
      category: 'professional_activity',
      type: 'professional_activity',
      entity_name: activite.employeur || activite.description,
      role_description: activite.employeur ? activite.description : undefined,
      declared_date: declaredDate,
      start_date: parseMonthDate(activite.dateDebut),
      end_date: parseMonthDate(activite.dateFin),
      full: activite,
      declarant_comment: activite.commentaire || undefined,
      ...parseAmount(activite),
    });
  }

  for (const consultant of raw.activitesConsultant) {
    interests.push({
      category: 'consulting_activity',
      type: 'consulting_activity',
      entity_name: consultant.nomEmployeur || consultant.description,
      role_description: consultant.nomEmployeur
        ? consultant.description
        : undefined,
      declared_date: declaredDate,
      start_date: parseMonthDate(consultant.dateDebut),
      end_date: parseMonthDate(consultant.dateFin),
      full: consultant,
      declarant_comment: consultant.commentaire || undefined,
      ...parseAmount(consultant),
    });
  }

  for (const dirigeant of raw.participationsDirigeant) {
    interests.push({
      category: 'governing_body_membership',
      type: 'governing_body_membership',
      entity_name: dirigeant.nomSociete,
      role_description: dirigeant.activite || undefined,
      declared_date: declaredDate,
      start_date: parseMonthDate(dirigeant.dateDebut),
      end_date: parseMonthDate(dirigeant.dateFin),
      full: dirigeant,
      declarant_comment: dirigeant.commentaire || undefined,
    });
  }

  for (const mandat of raw.mandatsElectifs) {
    interests.push({
      category: 'elected_function',
      type: 'elected_function',
      entity_name: mandat.descriptionMandat,
      role_description: undefined,
      declared_date: declaredDate,
      start_date: parseMonthDate(mandat.dateDebut),
      end_date: parseMonthDate(mandat.dateFin),
      full: mandat,
      declarant_comment: mandat.commentaire || undefined,
    });
  }

  return interests;
}

/** Code HATVP (DIA, DMIA…) → initiale / modificative. */
function parseDeclarationType(
  raw: string,
): 'initial' | 'modification' | undefined {
  const upper = raw.toUpperCase().trim();
  if (upper.startsWith('DM') || upper.includes('MODIF')) return 'modification';
  if (upper.startsWith('DI') || upper.startsWith('D')) return 'initial';
  return undefined;
}

/** Rémunération (`remuneration` ou `montant`), année et indicateur net/brut. */
function parseAmount(
  item: RawItem,
): Pick<InterestItem, 'annual_amount' | 'amount_year' | 'amount_is_net'> {
  const result: Pick<
    InterestItem,
    'annual_amount' | 'amount_year' | 'amount_is_net'
  > = {};
  const raw = item.remuneration || item.montant;
  if (raw) {
    const cleaned = raw.replace(/\s/g, '').replace(',', '.');
    // Seuls les montants purement numériques sont conservés (les déclarants
    // saisissent parfois du texte libre).
    if (/^\d+(\.\d+)?$/.test(cleaned)) {
      result.annual_amount = cleaned;
    }
  }
  if (item.anneeRemuneration) {
    const year = parseInt(item.anneeRemuneration, 10);
    if (!isNaN(year)) result.amount_year = year;
  }
  if (item.netBrut) {
    const lower = item.netBrut.toLowerCase();
    if (lower === 'net') result.amount_is_net = true;
    else if (lower === 'brut') result.amount_is_net = false;
  }
  return result;
}

/** « JJ/MM/AAAA … » → AAAA-MM-JJ ; sinon la valeur brute, ou aujourd'hui si vide. */
function parseDate(raw: string): string {
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return raw || new Date().toISOString().slice(0, 10);
}

/** « MM/AAAA » → AAAA-MM-01 ; undefined si absent ou mal formé. */
function parseMonthDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/^(\d{2})\/(\d{4})/);
  if (match) return `${match[2]}-${match[1]}-01`;
  return undefined;
}

/** « JEAN-PIERRE » → « Jean-Pierre ». */
function capitalize(value: string): string {
  return value.toLowerCase().replace(/(^|\s|-)\S/g, (c) => c.toUpperCase());
}
