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

export interface SenatorialResultCandidate {
  nom: string;
  prenom: string;
  nuance: string | null;
  liste: string | null;
  voix: number;
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

function parseElusList($: cheerio.CheerioAPI): SenatorialElu[] {
  const elus: SenatorialElu[] = [];
  $('.senators-list .senator-item').each((_, el) => {
    const $el = $(el);
    const name = stripSortant(
      $el.find('.senator-name .label').text().replace(/\s+/g, ' ').trim(),
    );
    const nuance = $el
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

    namesCell.find('ol.candidates-list li').each((_, li) => {
      const $li = $(li);
      const elected = $li.hasClass('elected');
      const raw = stripSortant($li.text().replace(/\s+/g, ' ').trim());
      const { nom, prenom } = splitNomPrenom(raw);
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
  $('.district-header li').each((_, el) => {
    const text = $(el).text();
    const count = $(el).find('.district-count').text();
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

export async function fetchSenatorialResults2026(): Promise<
  SenatorialResultDepartement[]
> {
  const results: SenatorialResultDepartement[] = [];

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
      const parsed = parseDepartementResultPage(html, code);
      if (parsed) {
        results.push(parsed);
      } else {
        logger.warn(
          `  ${slug}: aucun résultat trouvé (scrutin pas encore dépouillé ?)`,
        );
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

export { parseDepartementResultPage };
