"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizePhoneE164 } from "@/lib/phone";

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

function parseDate(raw: FormDataEntryValue | null): string | null {
  const s = parseText(raw);
  if (!s) return null;
  // Le format date HTML est déjà ISO (YYYY-MM-DD) — on le renvoie tel quel
  return s;
}

function buildPayload(formData: FormData) {
  return {
    civility: parseText(formData.get("civility")),
    first_name: parseText(formData.get("first_name")),
    last_name: parseText(formData.get("last_name")),
    birth_date: parseDate(formData.get("birth_date")),
    birth_place: parseText(formData.get("birth_place")),
    email: parseText(formData.get("email")),
    phone: normalizePhoneE164(parseText(formData.get("phone"))),
    mobile: normalizePhoneE164(parseText(formData.get("mobile"))),
    address: parseText(formData.get("address")),
    postal_code: parseText(formData.get("postal_code")),
    city: parseText(formData.get("city")),
    country: parseText(formData.get("country")) ?? "France",
    company_id: parseText(formData.get("company_id")),
    job_title: parseText(formData.get("job_title")),
    special_needs: parseText(formData.get("special_needs")),
    accessibility: parseText(formData.get("accessibility")),
    lead_source: parseText(formData.get("lead_source")),
    is_active: formData.get("is_active") === "on",
  };
}

/**
 * Si l'utilisateur a saisi une nouvelle entreprise via le CompanyPicker,
 * on la crée (ou on la réutilise si une homonyme existe) et on renvoie
 * son ID. Sinon, renvoie null.
 */
async function maybeCreateCompany(
  formData: FormData,
  organizationId: string,
  userId: string,
): Promise<string | null> {
  const newName = parseText(formData.get("new_company_name"));
  if (!newName) return null;

  const supabase = await createClient();

  // Évite le doublon : si une entreprise avec le même nom existe déjà,
  // on la réutilise.
  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("name", newName)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const rawStatus = parseText(formData.get("new_company_legal_status"));
  const legal_status =
    rawStatus === "A" || rawStatus === "C" || rawStatus === "D"
      ? rawStatus
      : null;
  let pappers_url = parseText(formData.get("new_company_pappers_url"));
  const siren = parseText(formData.get("new_company_siren"));
  if (!pappers_url && siren) {
    pappers_url = `https://www.pappers.fr/entreprise/${siren}`;
  }

  const { data: created } = await supabase
    .from("companies")
    .insert({
      organization_id: organizationId,
      name: newName,
      type: "prospect",
      created_by: userId,
      siret: parseText(formData.get("new_company_siret")),
      siren,
      legal_form: parseText(formData.get("new_company_legal_form")),
      industry: parseText(formData.get("new_company_industry")),
      naf_code: parseText(formData.get("new_company_naf_code")),
      legal_status,
      pappers_url,
      address: parseText(formData.get("new_company_address")),
      postal_code: parseText(formData.get("new_company_postal_code")),
      city: parseText(formData.get("new_company_city")),
    })
    .select("id")
    .single();
  return (created?.id as string | null) ?? null;
}

export async function createLearner(formData: FormData) {
  const { organizationId, userId } = await getCurrentOrganizationId();
  const payload = buildPayload(formData);

  if (!payload.first_name || !payload.last_name) {
    redirect(
      "/apprenants/new?error=Le+pr%C3%A9nom+et+le+nom+sont+obligatoires",
    );
  }

  // Si l'utilisateur a tapé une nouvelle entreprise dans le picker, on
  // la crée d'abord et on rattache l'apprenant à l'ID résultant.
  if (!payload.company_id) {
    const newId = await maybeCreateCompany(formData, organizationId, userId);
    if (newId) payload.company_id = newId;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("learners")
    .insert({
      ...payload,
      organization_id: organizationId,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/apprenants/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/apprenants");
  revalidatePath("/entreprises");

  // Si la création a été lancée depuis une fiche entreprise (hidden field
  // `return_to_company_id`), on renvoie sur celle-ci pour permettre
  // d'enchaîner facilement la création d'autres apprenants.
  const returnTo = parseText(formData.get("return_to_company_id"));
  if (returnTo) {
    revalidatePath(`/entreprises/${returnTo}`);
    redirect(`/entreprises/${returnTo}?learner_created=1`);
  }
  redirect(`/apprenants/${data.id}?created=1`);
}

export async function updateLearner(id: string, formData: FormData) {
  const { organizationId, userId } = await getCurrentOrganizationId();
  const payload = buildPayload(formData);

  if (!payload.first_name || !payload.last_name) {
    redirect(
      `/apprenants/${id}?error=Le+pr%C3%A9nom+et+le+nom+sont+obligatoires`,
    );
  }

  // Si l'utilisateur a tapé une nouvelle entreprise dans le picker, on
  // la crée et on rattache l'apprenant.
  if (!payload.company_id) {
    const newId = await maybeCreateCompany(formData, organizationId, userId);
    if (newId) payload.company_id = newId;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("learners")
    .update(payload)
    .eq("id", id);

  if (error) {
    redirect(`/apprenants/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/apprenants");
  revalidatePath(`/apprenants/${id}`);
  revalidatePath("/entreprises");
  redirect(`/apprenants/${id}?updated=1`);
}

/**
 * Suppression d'un apprenant — règle métier Qualiopi (2026-05-13) :
 * un apprenant ayant participé à AU MOINS UNE formation NE PEUT PAS
 * être supprimé. Son historique (conventions signées, émargements,
 * attestations) doit rester accessible pour audit. Si tu veux l'oublier
 * de la liste active, utilise `archiveLearner` à la place.
 *
 * Pour les apprenants sans aucune inscription (créés par erreur, tests),
 * la suppression est autorisée et fait juste le ménage des demandes
 * orphelines associées.
 *
 * Pour forcer la suppression d'un apprenant historique : voir
 * `forceDeleteLearner` (admin uniquement, code de confirmation requis).
 */
export async function deleteLearner(id: string) {
  const supabase = await createClient();

  // Garde-fou Qualiopi : on bloque si l'apprenant a des inscriptions.
  const { count: enrollmentCount } = await supabase
    .from("session_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("learner_id", id);
  const hasEnrollments = (enrollmentCount ?? 0) > 0;

  if (hasEnrollments) {
    redirect(
      `/apprenants/${id}?error=${encodeURIComponent(
        `Cet apprenant a participé à ${enrollmentCount} formation${
          (enrollmentCount ?? 0) > 1 ? "s" : ""
        }. Pour préserver l'audit Qualiopi (conventions signées, émargements, attestations), la suppression est interdite. Pour le retirer des listes actives sans perdre son historique, DÉCOCHEZ la case « Apprenant actif » ci-dessous puis Enregistrer.`,
      )}`,
    );
  }

  // Cas autorisé : pas d'inscription. On nettoie les éventuelles
  // demandes d'inscription orphelines (FK on delete set null nous
  // laisserait sinon des prospect_* sans learner).
  await supabase
    .from("inscription_requests")
    .delete()
    .eq("learner_id", id);

  const { error } = await supabase.from("learners").delete().eq("id", id);
  if (error) {
    redirect(`/apprenants/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/apprenants");
  revalidatePath("/inscriptions");
  revalidatePath("/sessions");
  revalidatePath("/dashboard");
  redirect("/apprenants?deleted=1");
}

/**
 * Archivage doux : l'apprenant n'apparaît plus dans les listes de
 * sélection (pickers d'inscription) mais son historique est conservé.
 * Action réversible — il suffit de recocher "Apprenant actif" sur
 * sa fiche.
 */
export async function archiveLearner(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("learners")
    .update({ is_active: false })
    .eq("id", id);
  if (error) {
    redirect(`/apprenants/${id}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/apprenants");
  revalidatePath("/inscriptions");
  revalidatePath("/sessions");
  revalidatePath("/dashboard");
  redirect("/apprenants?archived=1");
}

/**
 * Suppression DÉFINITIVE d'un apprenant — RÉSERVÉE à l'administrateur
 * de la plateforme. Détruit l'apprenant ET tout son historique
 * (inscriptions sessions, demandes, notes, liens OPCO en cascade).
 *
 * Sécurités :
 *   1. Le rôle de l'utilisateur courant doit être "admin" dans son
 *      organisation.
 *   2. Code de confirmation : l'utilisateur doit retaper le NOM de
 *      famille de l'apprenant en MAJUSCULES (preuve qu'il sait qui
 *      il supprime — pattern GitHub "type the repo name to delete").
 *
 * À n'utiliser qu'en cas de demande RGPD (droit à l'oubli) ou pour
 * nettoyer des données de test. Toute autre suppression doit passer
 * par l'archivage.
 */
export async function forceDeleteLearner(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/apprenants/${id}?error=Non+authentifi%C3%A9`);
  }

  // Vérif rôle admin
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if ((membership?.role as string | undefined) !== "admin") {
    redirect(
      `/apprenants/${id}?error=${encodeURIComponent(
        "Suppression définitive réservée à l'administrateur de la plateforme.",
      )}`,
    );
  }

  // Vérif code de confirmation = last_name en majuscules
  const { data: learner } = await supabase
    .from("learners")
    .select("last_name")
    .eq("id", id)
    .maybeSingle();
  const expected = ((learner?.last_name as string | null) ?? "")
    .trim()
    .toUpperCase();
  const provided = String(formData.get("confirm_code") ?? "")
    .trim()
    .toUpperCase();
  if (!expected || provided !== expected) {
    redirect(
      `/apprenants/${id}?error=${encodeURIComponent(
        `Code de confirmation incorrect. Tapez « ${expected || "NOM"} » pour confirmer.`,
      )}`,
    );
  }

  // Cascade complète
  await supabase.from("session_enrollments").delete().eq("learner_id", id);
  await supabase.from("inscription_requests").delete().eq("learner_id", id);

  const { error } = await supabase.from("learners").delete().eq("id", id);
  if (error) {
    redirect(`/apprenants/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/apprenants");
  revalidatePath("/inscriptions");
  revalidatePath("/sessions");
  revalidatePath("/dashboard");
  redirect("/apprenants?forceDeleted=1");
}
