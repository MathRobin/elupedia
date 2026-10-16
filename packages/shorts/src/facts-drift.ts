import type { BallotFacts, ShortFacts } from './script-facts.js';

/**
 * Dérive entre les faits figés avec le script (ceux que la voix énonce) et les
 * faits actuels de la base. L'Assemblée corrige parfois un scrutin après coup
 * (mises au point) : une vidéo enregistrée sur des chiffres devenus faux ne
 * doit pas être publiée telle quelle — la description renvoie vers la source
 * officielle, qui la contredirait. Comparaison limitée à ce que la vidéo
 * affirme : résultat, voix, effectif, non-participants, position majoritaire
 * des groupes.
 */
export interface FactsDrift {
  ballotId: string;
  field: string;
  frozen: string | number | null;
  current: string | number | null;
}

function ballotDrift(frozen: BallotFacts, current: BallotFacts): FactsDrift[] {
  const out: FactsDrift[] = [];
  const cmp = (
    field: string,
    a: string | number | null,
    b: string | number | null,
  ) => {
    if (a !== b)
      out.push({ ballotId: frozen.ballotId, field, frozen: a, current: b });
  };
  cmp('result', frozen.result, current.result);
  for (const k of [
    'for',
    'against',
    'abstain',
    'seats',
    'notVoting',
  ] as const) {
    cmp(`counts.${k}`, frozen.counts[k], current.counts[k]);
  }
  const currentGroups = new Map(current.groups.map((g) => [g.name, g]));
  for (const g of frozen.groups) {
    const c = currentGroups.get(g.name);
    cmp(
      `${g.name}.majorityPosition`,
      g.majorityPosition,
      c?.majorityPosition ?? null,
    );
  }
  return out;
}

export function factsDrift(
  frozen: ShortFacts,
  current: ShortFacts,
): FactsDrift[] {
  const byId = new Map(current.ballots.map((b) => [b.ballotId, b]));
  return frozen.ballots.flatMap((b) => {
    const c = byId.get(b.ballotId);
    if (!c) {
      return [
        {
          ballotId: b.ballotId,
          field: 'ballot',
          frozen: 'présent',
          current: null,
        },
      ];
    }
    return ballotDrift(b, c);
  });
}

export function formatDrift(drift: FactsDrift[]): string {
  return drift
    .map(
      (d) =>
        `${d.field} : script ${String(d.frozen)} → base ${String(d.current)}`,
    )
    .join(' ; ');
}
