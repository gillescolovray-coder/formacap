/**
 * Wrapper autour de l'API publique "recherche-entreprises.api.gouv.fr".
 *
 * - Gratuite, sans clé API, sans quota signalé.
 * - Données issues de l'INSEE Sirene (état administratif, adresse, NAF…)
 *   + INPI (forme juridique, dirigeants).
 * - Utilisée côté serveur uniquement (Server Action ou Route Handler).
 */

import { getNafLabel } from "./naf-labels";
import type { SireneCompany, SireneLegalStatus } from "./types";

const API_BASE = "https://recherche-entreprises.api.gouv.fr/search";

type RawResult = {
  siren: string;
  nom_complet?: string | null;
  nom_raison_sociale?: string | null;
  sigle?: string | null;
  date_creation?: string | null;
  etat_administratif?: string | null; // 'A' | 'C'
  nature_juridique?: string | null;   // code (ex : '5710')
  activite_principale?: string | null; // code NAF (ex : '6201Z')
  siege?: {
    siret?: string | null;
    numero_voie?: string | null;
    type_voie?: string | null;
    libelle_voie?: string | null;
    complement_adresse?: string | null;
    adresse?: string | null;
    code_postal?: string | null;
    libelle_commune?: string | null;
    etat_administratif?: string | null;
  } | null;
  dirigeants?: Array<{
    nom?: string | null;
    prenoms?: string | null;
    qualite?: string | null;
    type_dirigeant?: string | null;
    denomination?: string | null;
  }> | null;
};

/**
 * Mapping des codes "catégorie juridique" INSEE les plus fréquents vers
 * leur libellé court. Liste non exhaustive : si le code n'est pas connu,
 * on renvoie "Cat. <code>" pour ne pas perdre l'info.
 */
const LEGAL_FORM_LABELS: Record<string, string> = {
  "1000": "Entrepreneur individuel",
  "5202": "SNC",
  "5306": "SCS",
  "5308": "SCA",
  "5410": "SARL unipersonnelle",
  "5498": "SARL (autre)",
  "5499": "SARL",
  "5505": "SA à participation ouvrière",
  "5510": "SA à conseil d'administration",
  "5515": "SA d'économie mixte",
  "5520": "F.S.A. à conseil d'administration",
  "5599": "SA à directoire",
  "5699": "SAS (avec directoire)",
  "5710": "SAS",
  "5720": "SASU",
  "5800": "SE (Société européenne)",
  "6100": "Caisse d'épargne et de prévoyance",
  "6317": "Coopérative agricole",
  "6411": "Coopérative agricole",
  "6532": "Société civile de placement immobilier",
  "6540": "SCI",
  "6541": "SCI de construction-vente",
  "9220": "Association déclarée",
  "9230": "Association reconnue d'utilité publique",
  "9300": "Fondation",
};

function normalizeStatus(raw: string | null | undefined): SireneLegalStatus {
  if (raw === "A") return "A";
  if (raw === "C") return "C";
  return "D";
}

function normalizeAddress(siege: RawResult["siege"]) {
  if (!siege) {
    return { address: null, postal_code: null, city: null };
  }
  // On préfère reconstruire l'adresse à partir des champs structurés —
  // `siege.adresse` inclut déjà CP + ville, ce qui ferait doublon dans
  // notre formulaire qui a des champs séparés pour CP et ville.
  const structured = [
    siege.numero_voie ?? "",
    siege.type_voie ?? "",
    siege.libelle_voie ?? "",
    siege.complement_adresse ?? "",
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  let address: string | null = structured || null;
  // Fallback : si aucun champ structuré, on utilise `adresse` mais on
  // retire le CP et le libellé commune pour éviter le doublon.
  if (!address && siege.adresse) {
    let cleaned = siege.adresse;
    if (siege.code_postal) {
      cleaned = cleaned.replace(siege.code_postal, "");
    }
    if (siege.libelle_commune) {
      cleaned = cleaned.replace(siege.libelle_commune, "");
    }
    address = cleaned.replace(/\s+/g, " ").trim() || null;
  }

  return {
    address,
    postal_code: siege.code_postal ?? null,
    city: siege.libelle_commune ?? null,
  };
}

function normalize(raw: RawResult): SireneCompany {
  const status = normalizeStatus(raw.etat_administratif);
  const { address, postal_code, city } = normalizeAddress(raw.siege);

  const directors = (raw.dirigeants ?? [])
    .filter((d) => d.type_dirigeant !== "personne morale" || d.denomination)
    .map((d) => {
      // Si dirigeant = personne morale, on remonte la dénomination en
      // "nom" pour ne pas perdre l'info.
      if (d.denomination) {
        return {
          first_name: null,
          last_name: d.denomination,
          role: d.qualite ?? null,
        };
      }
      // L'API renvoie souvent prenoms en chaîne séparée par espaces.
      const firstNames = (d.prenoms ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join(" ");
      return {
        first_name: firstNames || null,
        last_name: d.nom ?? null,
        role: d.qualite ?? null,
      };
    });

  // Forme juridique : l'API renvoie un code (ex: "5710"), on traduit
  // en libellé court via le mapping. Sinon on garde le code préfixé.
  const legalFormCode = raw.nature_juridique ?? null;
  const legal_form = legalFormCode
    ? (LEGAL_FORM_LABELS[legalFormCode] ?? `Cat. ${legalFormCode}`)
    : null;

  // Libellé NAF/APE depuis le dictionnaire local (l'API ne renvoie que
  // le code). Si le code est inconnu, on laisse `industry` vide pour
  // que l'utilisateur puisse saisir un libellé manuellement.
  const nafCode = raw.activite_principale ?? null;
  const industry = getNafLabel(nafCode);

  return {
    siren: raw.siren,
    siret: raw.siege?.siret ?? null,
    name: raw.nom_raison_sociale ?? raw.nom_complet ?? raw.siren,
    legal_form,
    naf_code: nafCode,
    industry,
    address,
    postal_code,
    city,
    legal_status: status,
    legal_status_label:
      status === "A" ? "Active" : status === "C" ? "Cessée" : "Procédure / radiée",
    pappers_url: `https://www.pappers.fr/entreprise/${raw.siren}`,
    directors,
  };
}

/**
 * Recherche d'entreprises par raison sociale, SIREN ou SIRET.
 * @param query texte libre (3 caractères minimum) ou suite de chiffres.
 */
export async function searchSirene(query: string): Promise<SireneCompany[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url = new URL(API_BASE);
  url.searchParams.set("q", q);
  url.searchParams.set("per_page", "10");
  // L'API renvoie par défaut tous les états administratifs (A + C),
  // on n'ajoute donc pas de filtre — passer "A,C" provoque un HTTP 400.

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    // Pas de cache : les données peuvent changer (cessation, etc.)
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Recherche entreprise INSEE/Sirene indisponible (HTTP ${res.status}).`,
    );
  }

  const json = (await res.json()) as { results?: RawResult[] };
  return (json.results ?? []).map(normalize);
}
