/**
 * Génère une disposition générique en hémicycle pour N sièges, quand on ne
 * dispose pas d'un plan de salle réel (cf. hemicycle-seats.json pour
 * l'Assemblée nationale, dont les votes portent un numéro de siège officiel —
 * ce n'est pas le cas des scrutins du Sénat).
 *
 * Répartit les sièges sur des rangées concentriques en arc de 180°, avec un
 * nombre de sièges par rangée proportionnel à son rayon (densité angulaire
 * constante), dans le même repère que hemicycle-seats.json (x centré sur 0,
 * y croissant du premier rang — près du podium — vers le dernier).
 */

const MIN_RADIUS = 22;
const MAX_RADIUS = 95;

export function generateHemicycleSeats(totalSeats: number): [number, number][] {
  if (totalSeats <= 0) return [];

  const rowCount = Math.min(
    totalSeats,
    Math.max(4, Math.round(Math.sqrt(totalSeats / 2.2))),
  );
  const radii = Array.from({ length: rowCount }, (_, i) =>
    rowCount === 1
      ? MAX_RADIUS
      : MIN_RADIUS + (i * (MAX_RADIUS - MIN_RADIUS)) / (rowCount - 1),
  );

  const radiusSum = radii.reduce((sum, r) => sum + r, 0);
  const seatsPerRow = radii.map((r) =>
    Math.round((r / radiusSum) * totalSeats),
  );

  // L'arrondi par rangée peut s'écarter de totalSeats de quelques sièges :
  // on ajuste rangée par rangée jusqu'à tomber juste, sans jamais descendre
  // sous 0 (sinon rien à retirer nulle part → boucle infinie).
  let diff = totalSeats - seatsPerRow.reduce((a, b) => a + b, 0);
  let i = seatsPerRow.length - 1;
  let guard = 0;
  while (diff !== 0 && guard < totalSeats * rowCount + rowCount) {
    guard++;
    if (diff > 0) {
      seatsPerRow[i]++;
      diff--;
    } else if (seatsPerRow[i] > 0) {
      seatsPerRow[i]--;
      diff++;
    }
    i = i === 0 ? seatsPerRow.length - 1 : i - 1;
  }

  const coords: [number, number][] = [];
  for (let row = 0; row < rowCount; row++) {
    const radius = radii[row];
    const n = seatsPerRow[row];
    for (let s = 0; s < n; s++) {
      const theta = n === 1 ? Math.PI / 2 : (Math.PI * s) / (n - 1);
      coords.push([radius * Math.cos(theta), radius * Math.sin(theta)]);
    }
  }

  return coords;
}
