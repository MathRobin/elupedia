/**
 * Rapport d'écart de participation des eurodéputés : lit en base les trois
 * ensembles de dates nécessaires, appelle `computeMepGap` (pur, dans
 * `@elupedia/shared`) pour chaque mandat, et met en forme un rapport
 * d'anomalies pour le journal de l'étape « eurodeputes-presence ».
 *
 * Lecture seule. Rien n'est écrit : la fiche élu du site recalcule les mêmes
 * compteurs à l'affichage, depuis les mêmes tables.
 *
 * Sources en base :
 * - jours de scrutin nominatif : dates distinctes de `ballots` de type
 *   `europarl`. Ces scrutins sont écrits pour TOUTES les décisions nominatives
 *   de la séance, indépendamment de la participation française (le filtre sur
 *   les votants ne s'applique qu'à `votes`) : la liste est donc bien celle de
 *   tous les scrutins, comme l'exige `computeMepGap` ;
 * - jours signés : `europarl_attendance` ;
 * - jours avec position exprimée : `votes` joints à ces scrutins.
 *
 * Anomalies remontées :
 * - un mandat `eurodepute` sans `officials.europarl_id` : aucun rapprochement
 *   possible avec les listes du Parlement, l'élu est sorti du calcul et son
 *   nom est listé ;
 * - un vote enregistré un jour sans signature (signature manquante côté
 *   source ou erreur de rapprochement), jamais compté comme une absence.
 *
 * Appelé par run-europe.ts (étape « eurodeputes-presence »).
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import {
  officials,
  mandates,
  ballots,
  votes,
  europarlAttendance,
  computeMepGap,
  type MandateWindow,
  type MepAttendanceGap,
} from '@elupedia/shared';
import { eq } from 'drizzle-orm';

/** Type de mandat des eurodéputés dans `mandates`. */
const MANDATE_TYPE = 'eurodepute';
/** Type des scrutins du Parlement européen dans `ballots`. */
const BALLOT_TYPE = 'europarl';

export interface MepGapInput {
  officialId: string;
  name: string;
  /** Identifiant EP, null si la fiche n'en a pas (rapprochement impossible). */
  europarlId: string | null;
  window: MandateWindow;
  signedDates: string[];
  votedDates: string[];
}

export interface MepGapInputs {
  /** Jours de scrutin nominatif, toutes nationalités confondues. */
  rollcallDays: string[];
  meps: MepGapInput[];
}

export interface MepGapRow extends MepAttendanceGap {
  name: string;
  europarlId: string;
}

export interface MepGapReport {
  /** Jours de scrutin nominatif connus en base, toutes fenêtres confondues. */
  rollcallDays: number;
  rows: MepGapRow[];
  /** Mandats écartés du calcul faute d'identifiant EP. */
  unmatched: { officialId: string; name: string }[];
  /** Élus dont la fenêtre compte trop peu de scrutins pour afficher. */
  insufficientData: { name: string; rollcallDays: number }[];
  /** Jours avec un vote mais sans signature, par élu. */
  anomalies: { name: string; dates: string[] }[];
}

/**
 * Compteurs de tous les mandats d'eurodéputé, et anomalies. Fonction pure :
 * `loadMepGapInputs` fournit les données.
 */
export function buildMepGapReport(inputs: MepGapInputs): MepGapReport {
  const report: MepGapReport = {
    rollcallDays: inputs.rollcallDays.length,
    rows: [],
    unmatched: [],
    insufficientData: [],
    anomalies: [],
  };

  for (const mep of inputs.meps) {
    if (!mep.europarlId) {
      report.unmatched.push({ officialId: mep.officialId, name: mep.name });
      continue;
    }

    const gap = computeMepGap(inputs.rollcallDays, {
      officialId: mep.officialId,
      window: mep.window,
      signedDates: mep.signedDates,
      votedDates: mep.votedDates,
    });

    report.rows.push({ ...gap, name: mep.name, europarlId: mep.europarlId });

    if (gap.insufficientData) {
      report.insufficientData.push({
        name: mep.name,
        rollcallDays: gap.rollcallDays,
      });
    }
    if (gap.anomalies.length > 0) {
      report.anomalies.push({ name: mep.name, dates: gap.anomalies });
    }
  }

  return report;
}

/** Lignes du rapport pour le journal de l'étape (une anomalie par ligne). */
export function formatMepGapReport(report: MepGapReport): string[] {
  const lines = [
    `  ${report.rows.length} mandats calculés sur ${report.rollcallDays} jours de scrutin nominatif connus en base (toutes législatures ; chaque mandat ne compte que ceux de sa fenêtre)`,
  ];
  for (const mep of report.unmatched) {
    lines.push(
      `  anomalie : ${mep.name} (${mep.officialId}) n'a pas d'identifiant europarl, mandat exclu du calcul`,
    );
  }
  for (const mep of report.insufficientData) {
    lines.push(
      `  ${mep.name} : ${mep.rollcallDays} jour(s) de scrutin dans la fenêtre, compteurs masqués`,
    );
  }
  for (const mep of report.anomalies) {
    lines.push(
      `  anomalie : ${mep.name} a voté sans signature le ${mep.dates.join(', ')}`,
    );
  }
  return lines;
}

/**
 * Charge les trois ensembles de dates depuis la base : une requête pour les
 * jours de scrutin, une pour les mandats, une pour les signatures, une pour
 * les votes. Les dates sont renvoyées telles que stockées (`AAAA-MM-JJ`).
 */
export async function loadMepGapInputs(
  db: NeonHttpDatabase,
): Promise<MepGapInputs> {
  const rollcallRows = await db
    .selectDistinct({ date: ballots.date })
    .from(ballots)
    .where(eq(ballots.type, BALLOT_TYPE))
    .orderBy(ballots.date);

  const mandateRows = await db
    .select({
      officialId: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      europarlId: officials.europarlId,
      startDate: mandates.startDate,
      endDate: mandates.endDate,
    })
    .from(mandates)
    .innerJoin(officials, eq(officials.id, mandates.officialId))
    .where(eq(mandates.type, MANDATE_TYPE))
    .orderBy(officials.lastName, mandates.startDate);

  const signedRows = await db
    .select({
      officialId: europarlAttendance.officialId,
      date: europarlAttendance.sittingDate,
    })
    .from(europarlAttendance);

  const votedRows = await db
    .selectDistinct({ officialId: votes.officialId, date: ballots.date })
    .from(votes)
    .innerJoin(ballots, eq(ballots.id, votes.ballotId))
    .where(eq(ballots.type, BALLOT_TYPE));

  const signedByOfficial = groupDates(signedRows);
  const votedByOfficial = groupDates(votedRows);

  return {
    rollcallDays: rollcallRows.map((row) => row.date),
    meps: mandateRows.map((row) => ({
      officialId: row.officialId,
      name: `${row.firstName} ${row.lastName}`,
      europarlId: row.europarlId,
      window: { start: row.startDate, end: row.endDate },
      signedDates: signedByOfficial.get(row.officialId) ?? [],
      votedDates: votedByOfficial.get(row.officialId) ?? [],
    })),
  };
}

function groupDates(
  rows: { officialId: string; date: string }[],
): Map<string, string[]> {
  const byOfficial = new Map<string, string[]>();
  for (const row of rows) {
    const dates = byOfficial.get(row.officialId);
    if (dates) dates.push(row.date);
    else byOfficial.set(row.officialId, [row.date]);
  }
  return byOfficial;
}
