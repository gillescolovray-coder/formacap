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

/**
 * Distance ROUTIÈRE (itinéraire le plus rapide, profil voiture) en km entre
 * deux points GPS, via OpenRouteService (gratuit, Gilles 2026-06-26).
 * Nécessite la clé ORS_API_KEY (env). Renvoie null si non configuré, erreur
 * réseau, ou aucun itinéraire -> l'appelant retombe alors sur le vol d'oiseau.
 */
export async function drivingDistanceKm(
  a: LatLng,
  b: LatLng,
): Promise<number | null> {
  // 1) OpenRouteService si une clé est configurée (le plus fiable / quota dédié).
  const key = process.env.ORS_API_KEY;
  if (key) {
    try {
      const res = await fetch(
        "https://api.openrouteservice.org/v2/directions/driving-car",
        {
          method: "POST",
          headers: { Authorization: key, "Content-Type": "application/json" },
          body: JSON.stringify({
            coordinates: [
              [a.lng, a.lat],
              [b.lng, b.lat],
            ],
          }),
          // Cache 24h : un itinéraire entre deux points fixes ne change pas.
          next: { revalidate: 86400 },
        },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          routes?: Array<{ summary?: { distance?: number } }>;
        };
        const meters = data.routes?.[0]?.summary?.distance;
        if (typeof meters === "number" && meters > 0) return meters / 1000;
      }
    } catch {
      /* on tente le repli OSRM ci-dessous */
    }
  }

  // 2) Repli SANS clé : serveur public OSRM (itinéraire le plus rapide par
  //    défaut). Permet d'avoir la distance routière sans configuration.
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (res.ok) {
      const data = (await res.json()) as {
        routes?: Array<{ distance?: number }>;
      };
      const meters = data.routes?.[0]?.distance;
      if (typeof meters === "number" && meters > 0) return meters / 1000;
    }
  } catch {
    /* dernier repli = vol d'oiseau côté appelant */
  }

  return null;
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
