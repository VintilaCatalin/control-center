import { fetchJSON } from '../client';

export interface GeocodeResult {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

// GET /api/geocode - proxies Open-Meteo's geocoding search (the sibling
// of the forecast API collect_weather() already calls) so the location
// field can be "type a city, pick one" instead of asking anyone to look
// up and type their own latitude/longitude.
export function searchCity(q: string): Promise<{ results: GeocodeResult[] }> {
  return fetchJSON(`/api/geocode?q=${encodeURIComponent(q)}`);
}
