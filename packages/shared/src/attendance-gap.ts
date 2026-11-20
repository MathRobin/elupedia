/**
 * Calcul des deux compteurs d'assiduité d'un eurodéputé, sur la fenêtre de son
 * mandat :
 * - jours de scrutin nominatif sans signature du registre ;
 * - jours signés, avec scrutin nominatif, sans aucune position exprimée.
 * Aucun taux, aucun score : deux compteurs et le total de référence.
 *
 * Fonction pure, sans I/O. Toutes les dates sont au format ISO `AAAA-MM-JJ`.
 * Les entrées viennent des sources (jours de séance, signatures du registre)
 * et de la base (votes par élu) ; ce module ne fait que comparer des ensembles
 * de dates.
 *
 * Vit dans `@elupedia/shared` parce que deux packages l'appellent : l'étape
 * « eurodeputes-presence » de `packages/ingest/src/run-europe.ts`, qui ingère
 * le registre de présence, et la fiche élu du site
 * (`packages/site/src/pages/elus/[slug]/index.astro`), qui affiche les
 * compteurs. Le site ne dépend que de ce package.
 *
 * Pièges :
 * - `rollcallDays` doit contenir les jours de TOUS les scrutins nominatifs,
 *   pas seulement ceux des eurodéputés français : sinon un jour où seuls des
 *   non-français ont voté serait compté à tort comme « sans scrutin ».
 * - Un jour sans scrutin nominatif n'est jamais compté : il ne prouve rien.
 * - Une signature un jour sans scrutin nominatif n'entre pas dans les
 *   compteurs ; elle est remontée dans `signedDaysWithoutRollcall`.
 * - Un vote enregistré un jour sans signature est une anomalie (signature
 *   manquante ou erreur de rapprochement), pas une absence : il sort du
 *   compteur « sans signature » et part dans `anomalies`.
 * - Aucun seuil ne retire un élu : `insufficientData` ne porte que sur le
 *   nombre de jours de scrutin de la fenêtre, jamais sur l'activité de l'élu.
 */

/** En dessous de ce nombre de jours de scrutin, le site n'affiche pas les compteurs. */
export const MIN_ROLLCALL_DAYS = 10;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface MandateWindow {
  /** Premier jour du mandat, inclus. */
  start: string;
  /** Dernier jour du mandat, inclus ; `null` si le mandat est en cours. */
  end: string | null;
}

export interface MepDays {
  officialId: string;
  window: MandateWindow;
  /** Jours où le registre de présence porte la signature de l'élu. */
  signedDates: readonly string[];
  /** Jours où l'élu a exprimé au moins une position dans un scrutin nominatif. */
  votedDates: readonly string[];
}

export interface MepAttendanceGap {
  officialId: string;
  /** Total de référence : jours de scrutin nominatif dans la fenêtre du mandat. */
  rollcallDays: number;
  /** Jours de scrutin nominatif sans signature et sans vote de l'élu. */
  daysWithoutSignature: number;
  /** Jours signés, avec scrutin nominatif, sans aucune position exprimée. */
  signedDaysWithoutVote: number;
  /** Jours signés sans scrutin nominatif ce jour-là (information seulement). */
  signedDaysWithoutRollcall: number;
  /** Jours avec un vote enregistré mais sans signature, triés. */
  anomalies: string[];
  /** Vrai si la fenêtre compte moins de MIN_ROLLCALL_DAYS jours de scrutin. */
  insufficientData: boolean;
}

function assertIsoDate(value: string, label: string): void {
  const valid =
    ISO_DATE.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid) {
    throw new Error(
      `${label} : date ISO attendue (AAAA-MM-JJ), reçu « ${value} »`,
    );
  }
}

function assertWindow(window: MandateWindow, officialId: string): void {
  assertIsoDate(window.start, `${officialId} : début de mandat`);
  if (window.end !== null) {
    assertIsoDate(window.end, `${officialId} : fin de mandat`);
    if (window.end < window.start) {
      throw new Error(`${officialId} : fin de mandat antérieure au début`);
    }
  }
}

/**
 * Compteurs d'un élu sur la fenêtre de son mandat.
 * Lève une erreur si une date n'est pas une date ISO valide.
 */
export function computeMepGap(
  rollcallDays: readonly string[],
  mep: MepDays,
): MepAttendanceGap {
  assertWindow(mep.window, mep.officialId);
  rollcallDays.forEach((d) => assertIsoDate(d, 'Jour de scrutin nominatif'));
  mep.signedDates.forEach((d) =>
    assertIsoDate(d, `${mep.officialId} : signature`),
  );
  mep.votedDates.forEach((d) => assertIsoDate(d, `${mep.officialId} : vote`));

  const inWindow = (d: string): boolean =>
    d >= mep.window.start && (mep.window.end === null || d <= mep.window.end);

  // Les ensembles suppriment les doublons et les dates hors mandat.
  const rollcall = new Set(rollcallDays.filter(inWindow));
  const signed = new Set(mep.signedDates.filter(inWindow));
  const voted = new Set(mep.votedDates.filter(inWindow));

  let daysWithoutSignature = 0;
  for (const day of rollcall) {
    if (!signed.has(day) && !voted.has(day)) daysWithoutSignature++;
  }

  let signedDaysWithoutVote = 0;
  let signedDaysWithoutRollcall = 0;
  for (const day of signed) {
    if (!rollcall.has(day)) {
      signedDaysWithoutRollcall++;
    } else if (!voted.has(day)) {
      signedDaysWithoutVote++;
    }
  }

  const anomalies = [...voted].filter((d) => !signed.has(d)).sort();

  return {
    officialId: mep.officialId,
    rollcallDays: rollcall.size,
    daysWithoutSignature,
    signedDaysWithoutVote,
    signedDaysWithoutRollcall,
    anomalies,
    insufficientData: rollcall.size < MIN_ROLLCALL_DAYS,
  };
}
