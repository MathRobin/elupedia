import * as cheerio from 'cheerio';
import { logger } from '../logger.js';

const BASE_URL = 'https://senatoriales2026.senat.fr';
const ELECTION_YEAR = '2026';
const ELECTION_DATE = '2026-09-27';

// Roster fixe des 63 départements renouvelés en 2026 + les Français établis
// hors de France (code ZZ), tel que publié sur senatoriales2026.senat.fr.
// La page d'accueil construit ces liens en JS (pas de sitemap/API), d'où la
// liste figée ici plutôt qu'une découverte dynamique.
const DEPARTEMENT_SLUGS = [
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

function parseCount(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function splitNomPrenom(fullName: string): { nom: string; prenom: string } {
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
  $('.district-header li').each((_, el) => {
    const text = $(el).text();
    const count = $(el).find('.district-count').text();
    if (/si[eè]ges/i.test(text)) siegesAPourvoir = parseCount(count);
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
        listItems.each((_, li) => {
          const raw = $(li).text().replace(/\s+/g, ' ').trim();
          const sortant = /\(sortant(e)?\)/i.test(raw);
          const { nom, prenom } = splitNomPrenom(
            raw.replace(/\(sortant(e)?\)/i, '').trim(),
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
        const raw = namesCell.text().replace(/\s+/g, ' ').trim();
        if (raw) {
          const sortant = /\(sortant(e)?\)/i.test(raw);
          const { nom, prenom } = splitNomPrenom(
            raw.replace(/\(sortant(e)?\)/i, '').trim(),
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

export async function fetchSenatorialCandidacies2026(): Promise<
  SenatorialCandidacyDepartement[]
> {
  const results: SenatorialCandidacyDepartement[] = [];

  for (const slug of DEPARTEMENT_SLUGS) {
    const code = slug.split('-')[0];
    const url = `${BASE_URL}/departement/${slug}`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (elupedia ingest bot)' },
      });
      if (!res.ok) {
        logger.warn(`  ${slug}: HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      const parsed = parseDepartementPage(html, code);
      if (parsed) {
        results.push(parsed);
      } else {
        logger.warn(`  ${slug}: aucun candidat trouvé (page mal parsée ?)`);
      }
    } catch (e) {
      logger.warn(
        `  ${slug}: erreur — ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  return results;
}
