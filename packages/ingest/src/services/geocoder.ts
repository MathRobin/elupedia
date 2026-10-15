/**
 * Client minimal de la Base Adresse Nationale (api-adresse.data.gouv.fr),
 * utilisé par upsert/geocode-addresses.ts pour positionner les permanences
 * et mairies. Appel réseau sans retry ni pause : c'est l'appelant qui
 * cadence (quota public ≈ 50 req/s).
 */
const BASE_URL = 'https://api-adresse.data.gouv.fr/search/';
// Score de pertinence BAN (0–1) en dessous duquel on préfère ne pas
// géocoder : au-delà d'un faux positif, le point irait dans la mauvaise ville.
const MIN_SCORE = 0.4;

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  score: number;
  label: string;
}

/**
 * Géocode une adresse en texte libre. Renvoie `null` si l'API répond en
 * erreur, ne trouve rien, ou si le meilleur résultat est trop peu fiable.
 */
export async function geocodeAddress(
  query: string,
): Promise<GeocodingResult | null> {
  const url = new URL(BASE_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString());
  if (!response.ok) return null;

  const data = (await response.json()) as {
    features: {
      geometry: { coordinates: [number, number] };
      properties: { score: number; label: string };
    }[];
  };

  const feature = data.features[0];
  if (!feature || feature.properties.score < MIN_SCORE) return null;

  // GeoJSON : [longitude, latitude], dans cet ordre.
  const [lng, lat] = feature.geometry.coordinates;
  return {
    latitude: lat,
    longitude: lng,
    score: feature.properties.score,
    label: feature.properties.label,
  };
}
