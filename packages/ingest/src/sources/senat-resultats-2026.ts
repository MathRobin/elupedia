/**
 * Résultats des élections sénatoriales du 27 septembre 2026 (post-scrutin) :
 * sénateurs élus et voix par candidat/liste et par tour.
 *
 * Source : senatoriales2026.senat.fr, mêmes pages de circonscription que
 * senat-candidacies-2026.ts (dont on réutilise DEPARTEMENT_SLUGS, parseCount
 * et splitNomPrenom), republiées avec les résultats. Une page sans bloc
 * « Sénateurs élus » (`.senators-list`) est considérée non dépouillée → null.
 *
 * Mise en page selon le scrutin (déduit ici de la présence du tableau) :
 *   - proportionnel : `table.district-listing`, une ligne par liste ; les voix
 *     de la liste sont recopiées sur chacun de ses candidats, `li.elected`
 *     marque les élus ;
 *   - majoritaire : `table.district-simple`, une ligne par candidat avec une
 *     cellule de voix par tour (1 ou 2) ; un candidat est élu au dernier tour
 *     où il a des voix.
 * La cellule `.candidates-vote` est lue en texte (« 709 / 19 % ») car son
 * balisage varie selon les circonscriptions (voir parseVoteCell).
 *
 * Appelé par run-senat-resultats.ts, consommé par upsert/senat-resultats-2026.ts
 * et upsert/senat-mandats-2026.ts. parseDepartementResultPage est exporté pour
 * les tests.
 */
import * as cheerio from 'cheerio';
import type { Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';
import { logger } from '../logger.js';
import {
  DEPARTEMENT_SLUGS,
  parseCount,
  splitNomPrenom,
} from './senat-candidacies-2026.js';

const BASE_URL = 'https://senatoriales2026.senat.fr';
const ELECTION_YEAR = '2026';
const ELECTION_DATE = '2026-09-27';
/** Pause entre deux pages, par courtoisie envers le site du Sénat. */
const DELAY_BETWEEN_PAGES_MS = 300;
const USER_AGENT = 'Mozilla/5.0 (elupedia ingest bot)';

export interface SenatorialResultCandidate {
  nom: string;
  prenom: string;
  nuance: string | null;
  /** Nom de la liste (scrutin proportionnel uniquement). */
  liste: string | null;
  voix: number;
  /** Pourcentage des suffrages exprimés tel qu'affiché (entier le plus souvent). */
  ratioExprimes: number | null;
  elected: boolean;
}

export interface SenatorialResultRound {
  round: number;
  candidates: SenatorialResultCandidate[];
}

export interface SenatorialElu {
  nom: string;
  prenom: string;
  nuance: string | null;
}

export interface SenatorialResultDepartement {
  electionYear: string;
  departementCode: string;
  departementName: string;
  scrutinType: 'majoritaire' | 'proportionnel';
  electionDate: string;
  siegesAPourvoir: number | null;
  electeursSenatoriaux: number | null;
  elus: SenatorialElu[];
  rounds: SenatorialResultRound[];
}

/** Retire le suffixe « (sortant) » / « (sortante) » d'un nom. */
function stripSortant(raw: string): string {
  return raw.replace(/\(sortant(e)?\)/i, '').trim();
}

// Le balisage de ".candidates-vote" n'est pas homogène sur le site : les
// gros départements séparent voix/pourcentage en <span> ("<span>709</span>
// <span>/</span><span>19 %</span>"), mais la Corse, les COM (Saint-
// Barthélemy, Saint-Martin, Wallis-et-Futuna), la Polynésie française et
// les Français établis hors de France rendent la cellule en texte brut
// ("293 / 64%", sans espace avant le %). On parse donc le texte concaténé
// de la cellule plutôt que de dépendre de la présence de <span>.
function parseVoteCell($cell: Cheerio<AnyNode>): {
  voix: number;
  ratioExprimes: number | null;
} | null {
  const $vote = $cell.find('.candidates-vote');
  if ($vote.length === 0) return null;
  const text = $vote
    .text()
    .replace(/\u00A0/g, ' ')
    .trim();
  // Cellule présente mais vide = le candidat n'a pas concouru à ce tour.
  if (!text) return null;
  const match = text.match(/^([\d\s]+)\s*\/\s*([\d.,]+)\s*%?/);
  if (!match) return null;
  const voix = parseCount(match[1]);
  if (voix === null) return null;
  const ratioExprimes = parseFloat(match[2].replace(',', '.'));
  return {
    voix,
    ratioExprimes: isNaN(ratioExprimes) ? null : ratioExprimes,
  };
}

/** Bloc « Sénateurs élus » en tête de page ; vide tant que le scrutin n'est pas dépouillé. */
function parseElusList($: cheerio.CheerioAPI): SenatorialElu[] {
  const elus: SenatorialElu[] = [];
  $('.senators-list .senator-item').each((_, item) => {
    const $item = $(item);
    const name = stripSortant(
      $item.find('.senator-name .label').text().replace(/\s+/g, ' ').trim(),
    );
    const nuance = $item
      .find('.senator-group')
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    if (!name) return;
    const { nom, prenom } = splitNomPrenom(name);
    if (nom && prenom) {
      elus.push({ nom, prenom, nuance: nuance || null });
    }
  });
  return elus;
}

/**
 * Scrutin proportionnel (tour unique) : les voix et le pourcentage de la
 * liste sont portés par chaque candidat de la liste.
 */
function parseProportionnelRounds(
  $: cheerio.CheerioAPI,
): SenatorialResultRound[] {
  const candidates: SenatorialResultCandidate[] = [];

  $('table.district-listing tbody tr').each((_, row) => {
    const $row = $(row);
    const nuance = $row.find('td.candidates-party').text().trim();
    const namesCell = $row.find('td.candidates-names');
    const listeName = namesCell
      .find('.candidates-list-toggle .label')
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    const vote = parseVoteCell($row.find('td.text-center.middle').eq(0));
    if (!vote) return;

    namesCell.find('ol.candidates-list li').each((_, listItem) => {
      const $listItem = $(listItem);
      const elected = $listItem.hasClass('elected');
      const rawName = stripSortant(
        $listItem.text().replace(/\s+/g, ' ').trim(),
      );
      const { nom, prenom } = splitNomPrenom(rawName);
      if (!nom || !prenom) return;
      candidates.push({
        nom,
        prenom,
        nuance: nuance || null,
        liste: listeName || null,
        voix: vote.voix,
        ratioExprimes: vote.ratioExprimes,
        elected,
      });
    });
  });

  if (candidates.length === 0) return [];
  return [{ round: 1, candidates }];
}

/**
 * Scrutin majoritaire (un ou deux tours) : une colonne de voix par tour,
 * regroupées en SenatorialResultRound par numéro de tour.
 */
function parseMajoritaireRounds(
  $: cheerio.CheerioAPI,
): SenatorialResultRound[] {
  const byRound = new Map<number, SenatorialResultCandidate[]>();

  $('table.district-simple tbody tr').each((_, row) => {
    const $row = $(row);
    const nuance = $row.find('td.candidates-party').text().trim();
    // La 2e cellule (index 1) porte toujours le nom : Nuance, Nom, Voix[, Voix T2].
    const nameContainer = $row.find('td').eq(1);
    const elected = nameContainer.find('.vote-pin.elected').length > 0;
    // On clone pour retirer la pastille « Élu » sans toucher au DOM d'origine.
    const rawName = stripSortant(
      nameContainer
        .clone()
        .find('.vote-pin')
        .remove()
        .end()
        .text()
        .replace(/\s+/g, ' ')
        .trim(),
    );
    const { nom, prenom } = splitNomPrenom(rawName);
    if (!nom || !prenom) return;

    const voteCells = $row.find('td.text-center.middle').toArray();
    const perRound: ({ voix: number; ratioExprimes: number | null } | null)[] =
      voteCells.map((cell) => parseVoteCell($(cell)));

    // Le siège attribué à ce candidat est décidé par le dernier tour où il a
    // effectivement des voix enregistrées : un candidat sans 2e colonne n'a
    // pas participé au second tour (déjà élu au 1er, ou non représenté).
    let lastRoundWithVote = -1;
    for (let i = perRound.length - 1; i >= 0; i--) {
      if (perRound[i]) {
        lastRoundWithVote = i;
        break;
      }
    }

    perRound.forEach((vote, idx) => {
      if (!vote) return;
      const roundNumber = idx + 1;
      const list = byRound.get(roundNumber) ?? [];
      list.push({
        nom,
        prenom,
        nuance: nuance || null,
        liste: null,
        voix: vote.voix,
        ratioExprimes: vote.ratioExprimes,
        elected: elected && idx === lastRoundWithVote,
      });
      byRound.set(roundNumber, list);
    });
  });

  return [...byRound.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, candidates]) => ({ round, candidates }));
}

/**
 * Parse une page de circonscription avec résultats. Retourne null si la
 * liste des élus est vide (scrutin non dépouillé ou balisage changé).
 */
function parseDepartementResultPage(
  html: string,
  code: string,
): SenatorialResultDepartement | null {
  const $ = cheerio.load(html);

  const departementName = $('.district-name').first().text().trim();

  const isProportionnel = $('table.district-listing').length > 0;
  const scrutinType: 'majoritaire' | 'proportionnel' = isProportionnel
    ? 'proportionnel'
    : 'majoritaire';

  let siegesAPourvoir: number | null = null;
  let electeursSenatoriaux: number | null = null;
  $('.district-header li').each((_, headerItem) => {
    const text = $(headerItem).text();
    const count = $(headerItem).find('.district-count').text();
    // "siège(s) pourvu(s)" — singulier pour les circonscriptions à un seul
    // siège (Corse, plusieurs COM/DOM-TOM).
    if (/si[eè]ges?/i.test(text)) siegesAPourvoir = parseCount(count);
    if (/électeurs/i.test(text)) electeursSenatoriaux = parseCount(count);
  });

  const elus = parseElusList($);
  if (elus.length === 0) return null;

  const rounds = isProportionnel
    ? parseProportionnelRounds($)
    : parseMajoritaireRounds($);

  return {
    electionYear: ELECTION_YEAR,
    departementCode: code,
    departementName: departementName || code,
    scrutinType,
    electionDate: ELECTION_DATE,
    siegesAPourvoir,
    electeursSenatoriaux,
    elus,
    rounds,
  };
}

/**
 * Scrape toutes les circonscriptions de DEPARTEMENT_SLUGS (un GET par page,
 * séquentiel, avec pause) et retourne celles dont les résultats sont publiés.
 * Ne lève jamais : les pages en échec ou non dépouillées sont loguées en warn
 * et sautées. Utilise le `fetch` global (non injectable).
 */
export async function fetchSenatorialResults2026(): Promise<
  SenatorialResultDepartement[]
> {
  const results: SenatorialResultDepartement[] = [];

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
      const parsed = parseDepartementResultPage(html, code);
      if (parsed) {
        results.push(parsed);
      } else {
        logger.warn(
          `  ${slug}: aucun résultat trouvé (scrutin pas encore dépouillé ?)`,
        );
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

export { parseDepartementResultPage };
