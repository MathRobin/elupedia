/**
 * Candidatures aux élections sénatoriales du 27 septembre 2026 (pré-scrutin).
 *
 * Source : senatoriales2026.senat.fr, site officiel du Sénat, une page HTML
 * par circonscription (`/departement/<slug>`). Pas d'API ni de sitemap : la
 * page d'accueil construit ses liens en JS, d'où le roster figé
 * DEPARTEMENT_SLUGS. Scraping cheerio avec un délai entre pages.
 *
 * Deux mises en page selon le mode de scrutin (déduit du libellé
 * `#election-type-toggle`) :
 *   - proportionnel (3 sièges et plus) : `table.district-listing`, une ligne
 *     par liste, les candidats dans `ol.candidates-list li` ;
 *   - majoritaire : `table.district-simple`, une ligne par candidat.
 * Les noms sont au format « Prénom NOM », suffixés « (sortant) » le cas
 * échéant ; la nuance politique est dans `td.candidates-party`.
 *
 * Une page sans candidat (HTTP KO, balisage changé, page vide) est loguée et
 * ignorée : le run ne s'arrête pas. Appelé par run-senat-candidacies.ts,
 * consommé par upsert/senat-candidacies.ts. DEPARTEMENT_SLUGS, parseCount et
 * splitNomPrenom sont réutilisés par senat-resultats-2026.ts.
 */
import * as cheerio from 'cheerio';
import { logger } from '../logger.js';

const BASE_URL = 'https://senatoriales2026.senat.fr';
const ELECTION_YEAR = '2026';
const ELECTION_DATE = '2026-09-27';
/** Pause entre deux pages, par courtoisie envers le site du Sénat. */
const DELAY_BETWEEN_PAGES_MS = 300;
const USER_AGENT = 'Mozilla/5.0 (elupedia ingest bot)';

// Roster fixe des 63 départements renouvelés en 2026 + les Français établis
// hors de France (code ZZ), tel que publié sur senatoriales2026.senat.fr.
// La page d'accueil construit ces liens en JS (pas de sitemap/API), d'où la
// liste figée ici plutôt qu'une découverte dynamique. Exporté pour être
// réutilisé par le scraper post-scrutin (sources/senat-resultats-2026.ts),
// qui cible les mêmes pages une fois les résultats publiés.
export const DEPARTEMENT_SLUGS = [
  '01-ain',
  '02-aisne',
  '03-allier',
  '04-alpes-de-haute-provence',
  '05-hautes-alpes',
  '06-alpes-maritimes',
  '07-ardeche',
  '08-ardennes',
  '09-ariege',
  '10-aube',
  '11-aude',
  '12-aveyron',
  '13-bouches-du-rhone',
  '14-calvados',
  '15-cantal',
  '16-charente',
  '17-charente-maritime',
  '18-cher',
  '19-correze',
  '2A-corse-du-sud',
  '2B-haute-corse',
  '21-cote-d-or',
  '22-cotes-d-armor',
  '23-creuse',
  '24-dordogne',
  '25-doubs',
  '26-drome',
  '27-eure',
  '28-eure-et-loir',
  '29-finistere',
  '30-gard',
  '31-haute-garonne',
  '32-gers',
  '33-gironde',
  '34-herault',
  '35-ille-et-vilaine',
  '36-indre',
  '67-bas-rhin',
  '68-haut-rhin',
  '69-rhone',
  '70-haute-saone',
  '71-saone-et-loire',
  '72-sarthe',
  '73-savoie',
  '74-haute-savoie',
  '76-seine-maritime',
  '79-deux-sevres',
  '80-somme',
  '81-tarn',
  '82-tarn-et-garonne',
  '83-var',
  '84-vaucluse',
  '85-vendee',
  '86-vienne',
  '87-haute-vienne',
  '88-vosges',
  '89-yonne',
  '90-territoire-de-belfort',
  '973-guyane',
  '977-saint-barthelemy',
  '978-saint-martin',
  '986-wallis-et-futuna',
  '987-polynesie-francaise',
  'ZZ-francais-etablis-hors-de-france',
];

export interface SenatorialCandidacy {
  nom: string;
  prenom: string;
  nuance: string | null;
  /** Nom de la liste (scrutin proportionnel uniquement). */
  liste: string | null;
  sortant: boolean;
}

export interface SenatorialCandidacyDepartement {
  electionYear: string;
  departementCode: string;
  departementName: string;
  scrutinType: 'majoritaire' | 'proportionnel';
  electionDate: string;
  siegesAPourvoir: number | null;
  electeursSenatoriaux: number | null;
  candidates: SenatorialCandidacy[];
}

/** Marqueur « (sortant) » / « (sortante) » accolé au nom d'un candidat déjà en poste. */
const SORTANT_RE = /\(sortant(e)?\)/i;

/** « 3 743 » → 3743 ; null si vide ou sans chiffre. Tolère les espaces de milliers (insécables inclus). */
export function parseCount(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? null : n;
}

/**
 * Sépare « Prénom NOM » (format du site et de data.gouv) en prénom(s) et nom.
 * Le nom commence au premier mot tout en capitales ; une particule en
 * minuscules reste donc dans le prénom. Si aucun mot n'est en capitales (ou si
 * le premier l'est déjà), on prend le dernier mot comme nom par défaut.
 */
export function splitNomPrenom(fullName: string): {
  nom: string;
  prenom: string;
} {
  // Convention data.gouv/Sénat : "PRENOM NOM" ou "Prénom NOM" — le nom de
  // famille est en capitales. On isole le premier "mot tout en majuscules"
  // comme début du nom, le reste avant comme prénom(s).
  const words = fullName.trim().split(/\s+/);
  const nomStart = words.findIndex(
    (w) => w === w.toUpperCase() && /[A-ZÀ-Ÿ]/.test(w),
  );
  if (nomStart <= 0) {
    return {
      nom: words[words.length - 1] ?? fullName,
      prenom: words.slice(0, -1).join(' '),
    };
  }
  return {
    nom: words.slice(nomStart).join(' '),
    prenom: words.slice(0, nomStart).join(' '),
  };
}

/** Parse une page de circonscription ; null si aucun candidat n'y est trouvé. */
function parseDepartementPage(
  html: string,
  code: string,
): SenatorialCandidacyDepartement | null {
  const $ = cheerio.load(html);

  const departementName = $('.district-name').first().text().trim();

  const electionTypeLabel = $('#election-type-toggle .label').text().trim();
  const scrutinType: 'majoritaire' | 'proportionnel' = /proportionnel/i.test(
    electionTypeLabel,
  )
    ? 'proportionnel'
    : 'majoritaire';

  let siegesAPourvoir: number | null = null;
  let electeursSenatoriaux: number | null = null;
  $('.district-header li').each((_, headerItem) => {
    const text = $(headerItem).text();
    const count = $(headerItem).find('.district-count').text();
    // "siège(s) pourvu(s)" — singulier pour les circonscriptions à un seul
    // siège (Corse, plusieurs COM/DOM-TOM) : bug découvert lors de la
    // vérification du scraper post-scrutin (mêmes pages), qui ratait
    // "1 siège pourvu" faute du "s" final attendu par le regex.
    if (/si[eè]ges?/i.test(text)) siegesAPourvoir = parseCount(count);
    if (/électeurs/i.test(text)) electeursSenatoriaux = parseCount(count);
  });

  const candidates: SenatorialCandidacy[] = [];

  $('table.district-listing tbody tr, table.district-simple tbody tr').each(
    (_, row) => {
      const $row = $(row);
      const nuanceCell = $row.find('td.candidates-party').text().trim();
      const namesCell = $row.find('td.candidates-names');

      const listItems = namesCell.find('ol.candidates-list li');
      if (listItems.length > 0) {
        // Scrutin proportionnel : une ligne = une liste, avec ses candidats.
        const listeName = namesCell
          .find('.candidates-list-toggle .label')
          .text()
          .replace(/\s+/g, ' ')
          .trim();
        listItems.each((_, listItem) => {
          const rawName = $(listItem).text().replace(/\s+/g, ' ').trim();
          const sortant = SORTANT_RE.test(rawName);
          const { nom, prenom } = splitNomPrenom(
            rawName.replace(SORTANT_RE, '').trim(),
          );
          if (nom && prenom) {
            candidates.push({
              nom,
              prenom,
              nuance: nuanceCell || null,
              liste: listeName || null,
              sortant,
            });
          }
        });
      } else {
        // Scrutin majoritaire : une ligne = un candidat individuel.
        const rawName = namesCell.text().replace(/\s+/g, ' ').trim();
        if (rawName) {
          const sortant = SORTANT_RE.test(rawName);
          const { nom, prenom } = splitNomPrenom(
            rawName.replace(SORTANT_RE, '').trim(),
          );
          if (nom && prenom) {
            candidates.push({
              nom,
              prenom,
              nuance: nuanceCell || null,
              liste: null,
              sortant,
            });
          }
        }
      }
    },
  );

  if (candidates.length === 0) return null;

  return {
    electionYear: ELECTION_YEAR,
    departementCode: code,
    departementName: departementName || code,
    scrutinType,
    electionDate: ELECTION_DATE,
    siegesAPourvoir,
    electeursSenatoriaux,
    candidates,
  };
}

/**
 * Scrape toutes les circonscriptions de DEPARTEMENT_SLUGS (un GET par page,
 * séquentiel, avec pause) et retourne celles où des candidats ont été lus.
 * Ne lève jamais : les pages en échec sont loguées en warn et sautées.
 * Utilise le `fetch` global (non injectable).
 */
export async function fetchSenatorialCandidacies2026(): Promise<
  SenatorialCandidacyDepartement[]
> {
  const results: SenatorialCandidacyDepartement[] = [];

  for (const slug of DEPARTEMENT_SLUGS) {
    // Le code de circonscription est le préfixe du slug (« 2A », « 973 », « ZZ »).
    const code = slug.split('-')[0];
    const url = `${BASE_URL}/departement/${slug}`;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!response.ok) {
        logger.warn(`  ${slug}: HTTP ${response.status}`);
        continue;
      }
      const html = await response.text();
      const parsed = parseDepartementPage(html, code);
      if (parsed) {
        results.push(parsed);
      } else {
        logger.warn(`  ${slug}: aucun candidat trouvé (page mal parsée ?)`);
      }
    } catch (error) {
      logger.warn(
        `  ${slug}: erreur — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_PAGES_MS));
  }

  return results;
}
