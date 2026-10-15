/**
 * Génère une disposition générique en hémicycle pour N sièges, quand on ne
 * dispose pas d'un plan de salle réel (cf. hemicycle-seats.json pour
 * l'Assemblée nationale, dont les votes portent un numéro de siège officiel —
 * ce n'est pas le cas des scrutins du Sénat). Consommé par `HemicycleChart`.
 *
 * Répartit les sièges sur des rangées concentriques en arc de 180°, avec un
 * nombre de sièges par rangée proportionnel à son rayon (densité angulaire
 * constante), dans le même repère que hemicycle-seats.json (x centré sur 0,
 * y croissant du premier rang — près du podium — vers le dernier).
 */

/** Rayon du premier rang (près du podium) et du dernier, dans le repère de hemicycle-seats.json. */
const MIN_RADIUS = 22;
const MAX_RADIUS = 95;
/** Au moins 4 rangées, sauf si le nombre de sièges ne le permet pas. */
const MIN_ROW_COUNT = 4;
/**
 * Heuristique de densité : `rowCount ≈ √(totalSeats / 2.2)`, calée pour que
 * 348 sièges (Sénat) donnent ~13 rangées et 577 (AN) ~16.
 */
const SEATS_TO_ROWS_DIVISOR = 2.2;

/**
 * Renvoie exactement `totalSeats` couples `[x, y]`, du premier rang au dernier
 * et, dans chaque rang, de droite à gauche (angle croissant de 0 à π).
 */
export function generateHemicycleSeats(totalSeats: number): [number, number][] {
  if (totalSeats <= 0) return [];

  const rowCount = Math.min(
    totalSeats,
    Math.max(
      MIN_ROW_COUNT,
      Math.round(Math.sqrt(totalSeats / SEATS_TO_ROWS_DIVISOR)),
    ),
  );
  const radii = Array.from({ length: rowCount }, (_, rowIndex) =>
    rowCount === 1
      ? MAX_RADIUS
      : MIN_RADIUS + (rowIndex * (MAX_RADIUS - MIN_RADIUS)) / (rowCount - 1),
  );

  const radiusSum = radii.reduce((sum, radius) => sum + radius, 0);
  const seatsPerRow = radii.map((radius) =>
    Math.round((radius / radiusSum) * totalSeats),
  );

  // L'arrondi par rangée peut s'écarter de totalSeats de quelques sièges :
  // on ajuste rangée par rangée (en partant du dernier rang, le plus large)
  // jusqu'à tomber juste, sans jamais descendre sous 0 (sinon rien à retirer
  // nulle part → boucle infinie). `guard` borne la boucle par sécurité.
  let diff = totalSeats - seatsPerRow.reduce((a, b) => a + b, 0);
  let rowIndex = seatsPerRow.length - 1;
  let guard = 0;
  while (diff !== 0 && guard < totalSeats * rowCount + rowCount) {
    guard++;
    if (diff > 0) {
      seatsPerRow[rowIndex]++;
      diff--;
    } else if (seatsPerRow[rowIndex] > 0) {
      seatsPerRow[rowIndex]--;
      diff++;
    }
    rowIndex = rowIndex === 0 ? seatsPerRow.length - 1 : rowIndex - 1;
  }

  const coords: [number, number][] = [];
  for (let row = 0; row < rowCount; row++) {
    const radius = radii[row];
    const seatsInRow = seatsPerRow[row];
    for (let seatIndex = 0; seatIndex < seatsInRow; seatIndex++) {
      // Un siège seul est placé au centre de l'arc (θ = π/2).
      const theta =
        seatsInRow === 1
          ? Math.PI / 2
          : (Math.PI * seatIndex) / (seatsInRow - 1);
      coords.push([radius * Math.cos(theta), radius * Math.sin(theta)]);
    }
  }

  return coords;
}
