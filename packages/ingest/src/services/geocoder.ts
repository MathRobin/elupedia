const BASE_URL = 'https://api-adresse.data.gouv.fr/search/';

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  score: number;
  label: string;
}

export async function geocodeAddress(
  query: string,
): Promise<GeocodingResult | null> {
  const url = new URL(BASE_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '1');

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const data = (await res.json()) as {
    features: {
      geometry: { coordinates: [number, number] };
      properties: { score: number; label: string };
    }[];
  };

  const feature = data.features[0];
  if (!feature || feature.properties.score < 0.4) return null;

  const [lng, lat] = feature.geometry.coordinates;
  return {
    latitude: lat,
    longitude: lng,
    score: feature.properties.score,
    label: feature.properties.label,
  };
}
