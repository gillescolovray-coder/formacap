/**
 * Congés scolaires français par zone (A/B/C) — Gilles 2026-06-23.
 *
 * La zone est déterminée par le département (code postal) du partenaire /
 * formateur. Les dates proviennent des données OUVERTES officielles
 * (data.education.gouv.fr — dataset « fr-en-calendrier-scolaire ») afin de
 * ne jamais afficher de dates erronées.
 *
 * On expose un dictionnaire { "YYYY-MM-DD": "Vacances d'Hiver" } des jours
 * de vacances, consommé par le calendrier pour colorer les jours concernés.
 */

export type SchoolZone = "A" | "B" | "C";

// Département (2 chiffres) -> zone scolaire (rentrée 2024+).
const ZONE_BY_DEPT: Record<string, SchoolZone> = {};
const setZone = (zone: SchoolZone, depts: string[]) => {
  for (const d of depts) ZONE_BY_DEPT[d] = zone;
};
// Zone A : Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers
setZone("A", [
  "25", "39", "70", "90", // Besançon
  "24", "33", "40", "47", "64", // Bordeaux
  "03", "15", "43", "63", // Clermont-Ferrand
  "21", "58", "71", "89", // Dijon
  "07", "26", "38", "73", "74", // Grenoble
  "19", "23", "87", // Limoges
  "01", "42", "69", // Lyon
  "16", "17", "79", "86", // Poitiers
]);
// Zone B : Aix-Marseille, Amiens, Lille, Nancy-Metz, Nantes, Nice, Orléans-Tours, Reims, Rennes, Rouen, Strasbourg
setZone("B", [
  "04", "05", "13", "84", // Aix-Marseille
  "02", "60", "80", // Amiens
  "59", "62", // Lille
  "54", "55", "57", "88", // Nancy-Metz
  "44", "49", "53", "72", "85", // Nantes
  "06", "83", // Nice
  "18", "28", "36", "37", "41", "45", // Orléans-Tours
  "08", "10", "51", "52", // Reims
  "22", "29", "35", "56", // Rennes
  "27", "76", // Rouen
  "67", "68", // Strasbourg
]);
// Zone C : Créteil, Montpellier, Paris, Toulouse, Versailles
setZone("C", [
  "77", "93", "94", // Créteil
  "11", "30", "34", "48", "66", // Montpellier
  "75", // Paris
  "09", "12", "31", "32", "46", "65", "81", "82", // Toulouse
  "78", "91", "92", "95", // Versailles
]);

/** Déduit la zone scolaire à partir d'un code postal français. */
export function zoneForPostalCode(
  postalCode: string | null | undefined,
): SchoolZone | null {
  const cp = (postalCode ?? "").replace(/\s/g, "").slice(0, 2);
  if (!/^\d{2}$/.test(cp)) return null;
  // Corse (2A/2B) et DOM-TOM (97/98) ont des calendriers propres -> ignorés.
  if (cp === "20" || cp === "97" || cp === "98") return null;
  return ZONE_BY_DEPT[cp] ?? null;
}

type ApiRecord = {
  description: string;
  start_date: string;
  end_date: string;
};

function parisYMD(iso: string): string {
  // Date civile (Europe/Paris) d'un instant absolu -> "YYYY-MM-DD".
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function ymdToUtc(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function utcToYmd(t: number): string {
  const d = new Date(t);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

/**
 * Récupère les jours de vacances scolaires d'une zone sur une plage donnée,
 * sous forme de dictionnaire { "YYYY-MM-DD": "libellé" }.
 * Tolérant aux pannes réseau : renvoie {} en cas d'échec (jamais d'erreur).
 */
export async function fetchSchoolHolidayDays(
  zone: SchoolZone,
  fromISO: string,
  toISO: string,
): Promise<Record<string, string>> {
  const where = encodeURIComponent(
    `zones="Zone ${zone}" and end_date>="${fromISO}" and start_date<="${toISO}"`,
  );
  const url =
    `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/` +
    `fr-en-calendrier-scolaire/records?where=${where}` +
    `&limit=100&select=description,start_date,end_date`;

  let records: ApiRecord[] = [];
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return {};
    const json = (await res.json()) as { results?: ApiRecord[] };
    records = json.results ?? [];
  } catch {
    return {};
  }

  const days: Record<string, string> = {};
  for (const r of records) {
    if (!r.start_date || !r.end_date) continue;
    // Jours de vacances = du jour civil de start_date au jour civil de
    // end_date MOINS 1 (end_date = veille de la rentrée, à minuit Paris).
    const firstUtc = ymdToUtc(parisYMD(r.start_date));
    const lastUtc = ymdToUtc(parisYMD(r.end_date)) - 86400000;
    for (let t = firstUtc; t <= lastUtc; t += 86400000) {
      days[utcToYmd(t)] = r.description || "Vacances scolaires";
    }
  }
  return days;
}

export function zoneLabel(zone: SchoolZone): string {
  return `Zone ${zone}`;
}
