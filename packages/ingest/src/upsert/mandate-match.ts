/**
 * Rapprochement d'un mandat publié par une source (AN) avec les mandats déjà
 * en base pour le même élu. Fonction pure, testée sans base.
 *
 * Règles, dans l'ordre :
 * 1. Même type et même date de début → c'est ce mandat. Si la source le dit
 *    encore « en cours » alors qu'il est clos en base et qu'un autre mandat du
 *    même type est en cours, la source est en retard sur un renouvellement
 *    (ex. sénatoriales 2026 : l'AN republie le mandat 2023 comme actif alors
 *    que le Sénat l'a clos et a créé celui de 2026) : on garde la clôture.
 *    Sans cette règle, l'ancien code prenait « le mandat en cours » (celui de
 *    2026) et lui remettait la date de début de 2023 — collision sur l'index
 *    unique (official, type, start_date).
 * 2. Sinon, si la source dit « en cours » : le mandat en cours du même type,
 *    s'il existe (les deux sources AN et Sénat peuvent publier des dates de
 *    début légèrement différentes pour un même mandat en cours).
 * 3. Sinon : aucun, à insérer.
 */

export interface ExistingMandate {
  id: string;
  type: string;
  startDate: string;
  endDate: string | null;
  department: string | null;
}

export interface SourceMandate {
  type: string;
  mandat_debut: string;
  mandat_fin?: string;
}

export interface MandateMatch {
  target: ExistingMandate | null;
  /** Date de fin à écrire (null = en cours). */
  endDate: string | null;
}

export function matchMandate(
  existing: ExistingMandate[],
  m: SourceMandate,
): MandateMatch {
  const sameType = existing.filter((r) => r.type === m.type);
  const byStart = sameType.find((r) => r.startDate === m.mandat_debut);

  if (byStart) {
    if (m.mandat_fin) return { target: byStart, endDate: m.mandat_fin };
    const renewed =
      byStart.endDate !== null &&
      sameType.some((r) => r.id !== byStart.id && r.endDate === null);
    return { target: byStart, endDate: renewed ? byStart.endDate : null };
  }

  if (!m.mandat_fin) {
    const ongoing = sameType.find((r) => r.endDate === null);
    if (ongoing) return { target: ongoing, endDate: null };
  }

  return { target: null, endDate: m.mandat_fin ?? null };
}
