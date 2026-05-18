"use client";

import { useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  MapPin,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Company } from "@/lib/companies/types";

type Props = {
  company?: Company;
};

type GeocodeResult = {
  lat: number;
  lng: number;
  formattedAddress?: string;
  score?: number;
};

/**
 * Géocode une adresse via l'API officielle Adresse (api-adresse.data.gouv.fr).
 * Gratuite, sans clé, optimisée pour la France.
 */
async function geocodeFR(query: string): Promise<GeocodeResult | null> {
  if (!query.trim()) return null;
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: { label?: string; score?: number };
      }>;
    };
    const f = json.features?.[0];
    if (!f?.geometry?.coordinates) return null;
    const [lng, lat] = f.geometry.coordinates;
    return {
      lat,
      lng,
      formattedAddress: f.properties?.label,
      score: f.properties?.score,
    };
  } catch {
    return null;
  }
}

export function CompanyGpsSection({ company }: Props) {
  const [lat, setLat] = useState<string>(
    company?.latitude !== null && company?.latitude !== undefined
      ? String(company.latitude)
      : "",
  );
  const [lng, setLng] = useState<string>(
    company?.longitude !== null && company?.longitude !== undefined
      ? String(company.longitude)
      : "",
  );
  const [source, setSource] = useState<"auto" | "manual" | "">(
    company?.gps_source ?? "",
  );
  const [updatedAt, setUpdatedAt] = useState<string>(
    company?.gps_updated_at ?? "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleGeocode() {
    setError(null);
    setInfo(null);
    const form =
      typeof document !== "undefined"
        ? (document.querySelector("form#form-company") as HTMLFormElement | null) ??
          (document.querySelector("form") as HTMLFormElement | null)
        : null;
    if (!form) return;
    const fd = new FormData(form);
    const address = String(fd.get("address") ?? "").trim();
    const postal = String(fd.get("postal_code") ?? "").trim();
    const city = String(fd.get("city") ?? "").trim();
    const query = [address, postal, city].filter(Boolean).join(" ");
    if (!query) {
      setError(
        "Saisissez d'abord l'adresse (rue, code postal, ville) puis relancez le calcul.",
      );
      return;
    }
    setLoading(true);
    const result = await geocodeFR(query);
    setLoading(false);
    if (!result) {
      setError(
        "Adresse introuvable. Vérifiez l'orthographe ou saisissez les coordonnées manuellement.",
      );
      return;
    }
    setLat(result.lat.toFixed(6));
    setLng(result.lng.toFixed(6));
    setSource("auto");
    setUpdatedAt(new Date().toISOString());
    setInfo(
      `✓ Adresse trouvée : ${result.formattedAddress ?? query}${
        result.score ? ` (précision ${Math.round(result.score * 100)} %)` : ""
      }`,
    );
  }

  function handleManualChange(field: "lat" | "lng", value: string) {
    if (field === "lat") setLat(value);
    else setLng(value);
    setSource("manual");
    setUpdatedAt(new Date().toISOString());
    setInfo(null);
  }

  const hasCoords =
    lat.trim() !== "" &&
    lng.trim() !== "" &&
    !Number.isNaN(Number(lat)) &&
    !Number.isNaN(Number(lng));

  const mapUrl = hasCoords
    ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`
    : null;
  const googleMapsUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : null;
  // Carte intégrée OpenStreetMap (sans clé API, simple iframe)
  const embedSrc = hasCoords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${Number(lng) - 0.005},${Number(lat) - 0.003},${Number(lng) + 0.005},${Number(lat) + 0.003}&layer=mapnik&marker=${lat},${lng}`
    : null;

  return (
    <div className="rounded-lg bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold tracking-tight inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-blue-700 dark:text-blue-400" />
            Coordonnées GPS
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Calculées automatiquement depuis l&apos;adresse, ou saisies
            manuellement.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleGeocode}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {loading ? "Calcul…" : "Calculer depuis l'adresse"}
        </Button>
      </div>

      <input type="hidden" name="latitude" value={lat} />
      <input type="hidden" name="longitude" value={lng} />
      <input type="hidden" name="gps_source" value={source} />
      <input type="hidden" name="gps_updated_at" value={updatedAt} />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="latitude_visible" className="text-xs">
            Latitude
          </Label>
          <Input
            id="latitude_visible"
            type="number"
            step="0.000001"
            value={lat}
            onChange={(e) => handleManualChange("lat", e.target.value)}
            placeholder="Ex: 45.764043"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="longitude_visible" className="text-xs">
            Longitude
          </Label>
          <Input
            id="longitude_visible"
            type="number"
            step="0.000001"
            value={lng}
            onChange={(e) => handleManualChange("lng", e.target.value)}
            placeholder="Ex: 4.835659"
          />
        </div>
      </div>

      {info && (
        <p className="text-xs text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/30 px-3 py-2 rounded-md">
          {info}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-md inline-flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}

      {/* Mini-carte OpenStreetMap si on a les coordonnées */}
      {embedSrc && (
        <div className="rounded-md overflow-hidden border border-blue-200 dark:border-blue-900">
          <iframe
            src={embedSrc}
            title="Carte OpenStreetMap"
            className="w-full h-56 bg-white"
            loading="lazy"
          />
        </div>
      )}

      {hasCoords && (
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-blue-200/50 dark:border-blue-900/50 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium",
              source === "auto"
                ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300"
                : source === "manual"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
            )}
          >
            {source === "auto"
              ? "🤖 Calcul automatique"
              : source === "manual"
                ? "✏ Saisie manuelle"
                : "—"}
          </span>
          {updatedAt && (
            <span className="text-slate-500">
              {source === "auto" ? "Calculé" : "Modifié"} le{" "}
              {new Date(updatedAt).toLocaleDateString("fr-FR")} à{" "}
              {new Date(updatedAt).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-3">
            {mapUrl && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline font-medium"
                title="Ouvrir sur OpenStreetMap"
              >
                <ExternalLink className="h-3 w-3" />
                Carte OSM
              </a>
            )}
            {googleMapsUrl && (
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline font-medium"
                title="Ouvrir sur Google Maps"
              >
                <ExternalLink className="h-3 w-3" />
                Google Maps
              </a>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
