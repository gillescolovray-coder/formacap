"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function getOrgAndRole() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Aucune organisation");
  return {
    organizationId: data.organization_id as string,
    role: (data.role as string) ?? "",
  };
}

/**
 * Fusionne deux fiches apprenant en une seule (Gilles 2026-06-25).
 * `survivorId` est conservé ; `duplicateId` est supprimé après transfert de
 * TOUTES ses données (inscriptions/sessions, demandes, notes, visites portail,
 * avis Google). Les champs vides du survivant sont complétés par ceux du
 * doublon. L'historique (émargements, quiz) suit les inscriptions transférées.
 *
 * Garde-fou : si les deux fiches sont inscrites à la MÊME session, on refuse
 * (il faudrait fusionner deux inscriptions = perte possible d'émargements/quiz).
 * Ce cas (rare) se traite à la main.
 */
export async function mergeLearners(
  survivorId: string,
  duplicateId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!survivorId || !duplicateId)
    return { ok: false, error: "Sélection incomplète." };
  if (survivorId === duplicateId)
    return { ok: false, error: "Impossible de fusionner une fiche avec elle-même." };

  const { organizationId, role } = await getOrgAndRole();
  if (!["admin", "manager", "pedagogy_lead"].includes(role)) {
    return { ok: false, error: "Action réservée aux gestionnaires." };
  }

  const admin = createAdminClient();

  // Vérifie que les deux fiches appartiennent bien à l'organisation.
  const { data: both } = await admin
    .from("learners")
    .select(
      "id, organization_id, civility, first_name, last_name, email, phone, mobile, birth_date, birth_place, address, postal_code, city, country, job_title, company_id, company_name_temp, company_siret_temp, is_temporary, is_active",
    )
    .in("id", [survivorId, duplicateId]);
  const survivor = (both ?? []).find((l) => l.id === survivorId);
  const duplicate = (both ?? []).find((l) => l.id === duplicateId);
  if (!survivor || !duplicate)
    return { ok: false, error: "Fiche introuvable." };
  if (
    survivor.organization_id !== organizationId ||
    duplicate.organization_id !== organizationId
  )
    return { ok: false, error: "Fiches hors de votre organisation." };

  // Garde-fou : sessions partagées ?
  const [{ data: sEnr }, { data: dEnr }] = await Promise.all([
    admin.from("session_enrollments").select("session_id").eq("learner_id", survivorId),
    admin.from("session_enrollments").select("session_id").eq("learner_id", duplicateId),
  ]);
  const survSessions = new Set((sEnr ?? []).map((r) => r.session_id as string));
  const shared = (dEnr ?? [])
    .map((r) => r.session_id as string)
    .filter((s) => survSessions.has(s));
  if (shared.length > 0) {
    return {
      ok: false,
      error:
        "Les deux fiches sont inscrites à une même session. Fusion automatique impossible (risque de perdre des émargements/quiz). Retirez l'un des deux de cette session, puis réessayez.",
    };
  }

  // Transfert des données liées (duplicate -> survivor).
  const reassign = async (table: string) => {
    const { error } = await admin
      .from(table)
      .update({ learner_id: survivorId })
      .eq("learner_id", duplicateId);
    return error?.message;
  };
  for (const table of [
    "session_enrollments",
    "inscription_requests",
    "learner_notes",
    "learner_portal_visits",
    "google_review_requests",
  ]) {
    const err = await reassign(table);
    if (err) return { ok: false, error: `Transfert ${table} : ${err}` };
  }
  // Jeton portail : unique par apprenant -> on supprime celui du doublon
  // (le survivant garde / régénère le sien).
  await admin.from("learner_portal_tokens").delete().eq("learner_id", duplicateId);

  // Complète les champs vides du survivant avec ceux du doublon.
  const fill: Record<string, unknown> = {};
  const fields = [
    "civility",
    "first_name",
    "last_name",
    "email",
    "phone",
    "mobile",
    "birth_date",
    "birth_place",
    "address",
    "postal_code",
    "city",
    "country",
    "job_title",
    "company_id",
    "company_name_temp",
    "company_siret_temp",
  ] as const;
  for (const f of fields) {
    const sv = (survivor as Record<string, unknown>)[f];
    const dv = (duplicate as Record<string, unknown>)[f];
    if ((sv === null || sv === undefined || sv === "") && dv != null && dv !== "") {
      fill[f] = dv;
    }
  }
  if (Object.keys(fill).length > 0) {
    await admin.from("learners").update(fill).eq("id", survivorId);
  }

  // Supprime la fiche doublon (ses inscriptions ont été transférées).
  const { error: delErr } = await admin
    .from("learners")
    .delete()
    .eq("id", duplicateId);
  if (delErr) return { ok: false, error: `Suppression du doublon : ${delErr.message}` };

  revalidatePath("/apprenants");
  revalidatePath("/apprenants/doublons");
  revalidatePath(`/apprenants/${survivorId}`);
  revalidatePath("/sessions");
  return { ok: true };
}
