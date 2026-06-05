/**
 * Outils géo : géocodage via l'API officielle Adresse (gratuite, FR) et
 * calcul de distance à vol d'oiseau (haversine).
 */

export type LatLng = { lat: number; lng: number };

/**
 * Géocode une adresse française en coordonnées GPS.
 * Renvoie null si l'adresse est introuvable ou en cas d'erreur réseau.
 */
export async function geocodeAddressFR(
  address: string | null | undefined,
  postalCode?: string | null,
  city?: string | null,
): Promise<LatLng | null> {
  const query = [address, postalCode, city].filter(Boolean).join(" ").trim();
  if (!query) return null;
  try {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(
      query,
    )}&limit=1`;
    const res = await fetch(url, {
      // Cache 24h : une adresse ne bouge pas.
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
    };
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    // L'API renvoie [lng, lat].
    return { lng: coords[0], lat: coords[1] };
  } catch {
    return null;
  }
}

/** Distance à vol d'oiseau en kilomètres entre deux points GPS. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371; // rayon terrestre (km)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
