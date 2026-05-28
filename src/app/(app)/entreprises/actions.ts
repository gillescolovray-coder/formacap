"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizePhoneE164 } from "@/lib/phone";
import type { CompanyType } from "@/lib/companies/types";

async function getCurrentOrganizationId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Aucune organisation rattachée à ce compte");
  return { organizationId: data.organization_id, userId: user.id };
}

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

/**
 * Géocodage serveur via l'API officielle Adresse (api-adresse.data.gouv.fr).
 * Gratuite, sans clé. Utilisée comme filet de sécurité au save : si
 * l'utilisateur a saisi une adresse mais oublié de cliquer sur
 * « Calculer GPS », on calcule pour lui à l'enregistrement.
 *
 * Renvoie null si l'adresse est introuvable ou si l'API est indisponible —
 * on n'empêche jamais la sauvegarde, c'est juste un bonus.
 */
async function geocodeAddressFR(
  address: string | null,
  postalCode: string | null,
  city: string | null,
): Promise<{ lat: number; lng: number } | null> {
  const query = [address, postalCode, city]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join(" ")
    .trim();
  if (!query) return null;
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`;
  try {
    const res = await fetch(url, {
      // Pas de cache : ce n'est appelé qu'au save manuel d'une fiche.
      cache: "no-store",
      // Timeout raisonnable : si l'API tarde, on n'empêche pas le save.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
      }>;
    };
    const f = json.features?.[0];
    if (!f?.geometry?.coordinates) return null;
    const [lng, lat] = f.geometry.coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * Si le payload n'a pas de coordonnées GPS mais qu'une adresse complète
 * est renseignée, on tente un géocodage automatique. Mute le payload.
 */
async function autoGeocodeIfMissing(
  payload: ReturnType<typeof buildPayload>,
): Promise<void> {
  // Coordonnées déjà présentes → on ne touche pas
  if (payload.latitude !== null && payload.longitude !== null) return;
  // Pas assez d'adresse → on n'essaie pas (au moins ville requise)
  if (!payload.city) return;
  const geocoded = await geocodeAddressFR(
    payload.address,
    payload.postal_code,
    payload.city,
  );
  if (!geocoded) return;
  payload.latitude = geocoded.lat;
  payload.longitude = geocoded.lng;
  payload.gps_source = "auto";
  payload.gps_updated_at = new Date().toISOString();
}

function buildPayload(formData: FormData) {
  // legal_status : on n'accepte que A / C / D, sinon null.
  const rawStatus = parseText(formData.get("legal_status"));
  const legal_status =
    rawStatus === "A" || rawStatus === "C" || rawStatus === "D"
      ? rawStatus
      : null;

  // pappers_url : si vide mais qu'on a un SIREN, on le génère.
  let pappers_url = parseText(formData.get("pappers_url"));
  const siren = parseText(formData.get("siren"));
  if (!pappers_url && siren) {
    pappers_url = `https://www.pappers.fr/entreprise/${siren}`;
  }

  // Coordonnées GPS (calcul depuis adresse ou saisie manuelle).
  // Le filet de sécurité côté serveur (auto-géocodage si vide) est
  // appliqué dans createCompany / updateCompany — buildPayload reste
  // un mapping pur sans appel réseau.
  const latRaw = parseText(formData.get("latitude"));
  const lngRaw = parseText(formData.get("longitude"));
  const latitude = latRaw && Number.isFinite(Number(latRaw)) ? Number(latRaw) : null;
  const longitude = lngRaw && Number.isFinite(Number(lngRaw)) ? Number(lngRaw) : null;
  const gpsSourceRaw = parseText(formData.get("gps_source"));
  const gps_source =
    gpsSourceRaw === "auto" || gpsSourceRaw === "manual" ? gpsSourceRaw : null;
  const gps_updated_at = parseText(formData.get("gps_updated_at"));

  // Representant legal (Gilles 2026-05-28, migration 0110)
  const repCivRaw = parseText(formData.get("representant_civility"));
  const representant_civility =
    repCivRaw === "M." || repCivRaw === "Mme" ? repCivRaw : null;

  return {
    name: parseText(formData.get("name")),
    legal_form: parseText(formData.get("legal_form")),
    siret: parseText(formData.get("siret")),
    siren,
    nda: parseText(formData.get("nda")),
    industry: parseText(formData.get("industry")),
    naf_code: parseText(formData.get("naf_code")),
    legal_status,
    pappers_url,
    type:
      (parseText(formData.get("type")) as CompanyType | null) ?? "prospect",
    lead_source: parseText(formData.get("lead_source")),
    address: parseText(formData.get("address")),
    postal_code: parseText(formData.get("postal_code")),
    city: parseText(formData.get("city")),
    country: parseText(formData.get("country")) ?? "France",
    latitude,
    longitude,
    gps_source,
    gps_updated_at,
    email: parseText(formData.get("email")),
    phone: normalizePhoneE164(parseText(formData.get("phone"))),
    website: parseText(formData.get("website")),
    notes: parseText(formData.get("notes")),
    is_active: formData.get("is_active") === "on",
    representant_civility,
    representant_first_name: parseText(formData.get("representant_first_name")),
    representant_last_name: parseText(formData.get("representant_last_name")),
    representant_job_title: parseText(formData.get("representant_job_title")),
  };
}

/**
 * Server action : liste les apprenants rattaches a une entreprise.
 * Utilisee par le picker "Reprendre les infos d'un apprenant" sur la
 * fiche entreprise et dans les formulaires d'inscription (bouton
 * "C'est le meme que l'apprenant"). Gilles 2026-05-28.
 */
export async function listLearnersOfCompany(companyId: string): Promise<
  Array<{
    id: string;
    civility: string | null;
    first_name: string | null;
    last_name: string | null;
    job_title: string | null;
  }>
> {
  if (!companyId) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("learners")
    .select("id, civility, first_name, last_name, job_title")
    .eq("company_id", companyId)
    .order("last_name", { ascending: true });
  return (data ?? []) as Array<{
    id: string;
    civility: string | null;
    first_name: string | null;
    last_name: string | null;
    job_title: string | null;
  }>;
}

export async function createCompany(formData: FormData) {
  const { organizationId, userId } = await getCurrentOrganizationId();
  const payload = buildPayload(formData);

  if (!payload.name) {
    redirect("/entreprises/new?error=La+raison+sociale+est+obligatoire");
  }

  // Filet de sécurité : si l'utilisateur a saisi une adresse mais
  // oublié de cliquer sur « Calculer GPS », on calcule à sa place.
  await autoGeocodeIfMissing(payload);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .insert({
      ...payload,
      organization_id: organizationId,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/entreprises/new?error=${encodeURIComponent(error.message)}`);
  }

  // Création des contacts joints (depuis ContactsBuilder)
  const contactsPayloadRaw = parseText(formData.get("contacts_payload"));
  if (contactsPayloadRaw && data.id) {
    try {
      const contacts = JSON.parse(contactsPayloadRaw) as Array<
        Record<string, unknown>
      >;
      const valid = contacts
        .filter((c) => typeof c.last_name === "string" && c.last_name)
        .map((c) => {
          const rawCiv =
            typeof c.civility === "string" ? c.civility.trim() : "";
          const civility =
            rawCiv === "M." || rawCiv === "Mme" || rawCiv === "Autre"
              ? rawCiv
              : null;
          return {
            ...c,
            civility,
            phone: normalizePhoneE164(
              typeof c.phone === "string" ? c.phone : null,
            ),
            mobile: normalizePhoneE164(
              typeof c.mobile === "string" ? c.mobile : null,
            ),
            company_id: data.id,
          };
        });
      if (valid.length > 0) {
        await supabase.from("company_contacts").insert(valid);
      }
    } catch {
      // payload invalide → ignoré silencieusement
    }
  }

  revalidatePath("/entreprises");
  redirect(`/entreprises/${data.id}?created=1`);
}

export async function updateCompany(id: string, formData: FormData) {
  const payload = buildPayload(formData);

  if (!payload.name) {
    redirect(`/entreprises/${id}?error=La+raison+sociale+est+obligatoire`);
  }

  // Filet de sécurité : si l'utilisateur a saisi une adresse mais
  // oublié de cliquer sur « Calculer GPS », on calcule à sa place.
  await autoGeocodeIfMissing(payload);

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update(payload)
    .eq("id", id);

  if (error) {
    redirect(`/entreprises/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/entreprises");
  revalidatePath(`/entreprises/${id}`);
  redirect(`/entreprises/${id}?updated=1`);
}

export async function deleteCompany(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) {
    redirect(`/entreprises/${id}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/entreprises");
  redirect("/entreprises");
}

/**
 * Rattache une entreprise à une société mère (ou la détache si
 * `parent_company_id` est vide).
 *
 * Validation côté serveur :
 *   - Une société ne peut pas être sa propre mère.
 *   - Aucune boucle dans la chaîne (A mère de B, B mère de A → refusé).
 */
export async function setParentCompany(
  childId: string,
  formData: FormData,
): Promise<void> {
  const newParentId = parseText(formData.get("parent_company_id"));

  // Validation 1 : auto-référence
  if (newParentId === childId) {
    redirect(
      `/entreprises/${childId}?error=${encodeURIComponent(
        "Une société ne peut pas être sa propre société mère.",
      )}`,
    );
  }

  const supabase = await createClient();

  // Validation 2 : détection de boucle. On remonte la chaîne des parents
  // depuis le candidat ; si on tombe sur childId, on refuse.
  if (newParentId) {
    const visited = new Set<string>();
    let cursor: string | null = newParentId;
    while (cursor && !visited.has(cursor)) {
      if (cursor === childId) {
        redirect(
          `/entreprises/${childId}?error=${encodeURIComponent(
            "Boucle détectée : ce rattachement créerait un cycle dans la hiérarchie.",
          )}`,
        );
      }
      visited.add(cursor);
      const { data: row }: { data: { parent_company_id: string | null } | null } =
        await supabase
          .from("companies")
          .select("parent_company_id")
          .eq("id", cursor)
          .maybeSingle();
      cursor = row?.parent_company_id ?? null;
    }
  }

  const { error } = await supabase
    .from("companies")
    .update({ parent_company_id: newParentId })
    .eq("id", childId);
  if (error) {
    redirect(`/entreprises/${childId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/entreprises");
  revalidatePath(`/entreprises/${childId}`);
  if (newParentId) revalidatePath(`/entreprises/${newParentId}`);
  redirect(`/entreprises/${childId}?parentUpdated=1`);
}
