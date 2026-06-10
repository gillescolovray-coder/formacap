"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePartnerContext } from "../_resolve";
import { logInscriptionDeletion } from "@/lib/inscriptions/deletion-log";

/** True si la session (date de fin) est déjà terminée. */
async function isPartnerSessionEnded(
  supabase: SupabaseClient,
  sessionId: string | null,
): Promise<boolean> {
  if (!sessionId) return false;
  const { data } = await supabase
    .from("sessions")
    .select("start_date, end_date")
    .eq("id", sessionId)
    .maybeSingle<{ start_date: string | null; end_date: string | null }>();
  const end = data?.end_date ?? data?.start_date ?? null;
  if (!end) return false;
  return end.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

/**
 * Met à jour les coordonnées d'un apprenant inscrit via le portail
 * partenaire. Modifie à la fois `inscription_requests.prospect_*` (audit
 * trail) ET, si un learner existe, les colonnes correspondantes sur
 * `learners` (source de vérité côté admin).
 *
 * Champs éditables : prénom, nom, email, téléphone, fonction.
 * Pas de modification de la session ni de l'entreprise (trop risqué).
 */
export async function updateInscription(
  token: string,
  requestId: string,
  patch: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    job_title: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await resolvePartnerContext(token);
  if (!ctx) return { ok: false, error: "Token invalide." };

  if (!patch.first_name?.trim() || !patch.last_name?.trim()) {
    return { ok: false, error: "Prénom et nom obligatoires." };
  }
  if (!/^\S+@\S+\.\S+$/.test(patch.email?.trim() ?? "")) {
    return { ok: false, error: "Email invalide." };
  }

  const supabase = createAdminClient();

  // Vérifie ownership
  const { data: req } = await supabase
    .from("inscription_requests")
    .select("id, learner_id, target_session_id, prospect_email")
    .eq("id", requestId)
    .eq("referrer_company_id", ctx.company.id)
    .eq("organization_id", ctx.company.organization_id)
    .maybeSingle<{
      id: string;
      learner_id: string | null;
      target_session_id: string | null;
      prospect_email: string | null;
    }>();
  if (!req) return { ok: false, error: "Inscription introuvable." };

  // Garde : session terminée -> modification interdite depuis le portail.
  if (await isPartnerSessionEnded(supabase, req.target_session_id)) {
    return {
      ok: false,
      error:
        "Session terminée : la modification n'est plus possible depuis votre espace. Contactez l'organisme de formation.",
    };
  }

  // Si on change l'email : vérifier qu'on ne crée pas un doublon sur
  // la session (contrainte d'unicité (session_id, learner_id) côté DB).
  const newEmail = patch.email.trim().toLowerCase();
  const oldEmail = (req.prospect_email ?? "").trim().toLowerCase();
  if (newEmail !== oldEmail && req.target_session_id) {
    const { data: dup } = await supabase
      .from("inscription_requests")
      .select("id")
      .eq("target_session_id", req.target_session_id)
      .ilike("prospect_email", patch.email.trim())
      .neq("id", req.id)
      .limit(1)
      .maybeSingle();
    if (dup) {
      return {
        ok: false,
        error: `L'email « ${patch.email} » est déjà inscrit sur cette session.`,
      };
    }
  }

  // 1) Update prospect_* sur la request (audit trail)
  const { error: reqErr } = await supabase
    .from("inscription_requests")
    .update({
      prospect_first_name: patch.first_name.trim(),
      prospect_last_name: patch.last_name.trim(),
      prospect_email: patch.email.trim(),
      prospect_phone: patch.phone,
    })
    .eq("id", req.id);
  if (reqErr) {
    return { ok: false, error: `Mise à jour impossible : ${reqErr.message}` };
  }

  // 2) Update learner si présent (source de vérité côté admin)
  if (req.learner_id) {
    await supabase
      .from("learners")
      .update({
        first_name: patch.first_name.trim(),
        last_name: patch.last_name.trim(),
        email: patch.email.trim(),
        phone: patch.phone,
        job_title: patch.job_title,
      })
      .eq("id", req.learner_id);
  }

  // 3) Event timeline
  await supabase.from("inscription_events").insert({
    request_id: req.id,
    event_type: "edited",
    payload: {
      edited_by_partner: ctx.company.id,
      partner_company_name: ctx.company.name,
      source: "mes_inscriptions",
    },
  });

  revalidatePath(`/partenaire/${token}/inscriptions`);
  revalidatePath(`/partenaire/${token}`);
  return { ok: true };
}

/**
 * Supprime une inscription : retire la request + l'enrollment lié.
 * L'apprenant (learner) lui-même est conservé en base — il pourra être
 * réinscrit ailleurs ou supprimé manuellement par l'admin.
 *
 * Trace un event « deleted_by_partner » avant suppression pour audit.
 */
export async function deleteInscription(
  token: string,
  requestId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await resolvePartnerContext(token);
  if (!ctx) return { ok: false, error: "Token invalide." };

  const supabase = createAdminClient();

  // Vérifie ownership + récupère pour l'audit avant suppression
  const { data: req } = await supabase
    .from("inscription_requests")
    .select(
      "id, target_session_id, learner_id, prospect_first_name, prospect_last_name, prospect_email",
    )
    .eq("id", requestId)
    .eq("referrer_company_id", ctx.company.id)
    .eq("organization_id", ctx.company.organization_id)
    .maybeSingle<{
      id: string;
      target_session_id: string | null;
      learner_id: string | null;
      prospect_first_name: string | null;
      prospect_last_name: string | null;
      prospect_email: string | null;
    }>();
  if (!req) return { ok: false, error: "Inscription introuvable." };

  // Garde : session terminée -> suppression interdite depuis le portail.
  if (await isPartnerSessionEnded(supabase, req.target_session_id)) {
    return {
      ok: false,
      error:
        "Session terminée : la suppression n'est plus possible depuis votre espace. Contactez l'organisme de formation.",
    };
  }

  // Audit trail dans une table à part pour conserver la trace même
  // après suppression de la request. On utilise inscription_events
  // avec un payload self-suffisant.
  await supabase.from("inscription_events").insert({
    request_id: req.id,
    event_type: "deleted_by_partner",
    payload: {
      deleted_by_partner: ctx.company.id,
      partner_company_name: ctx.company.name,
      learner_name: `${req.prospect_first_name ?? ""} ${req.prospect_last_name ?? ""}`.trim(),
      learner_email: req.prospect_email,
      session_id: req.target_session_id,
    },
  });
  // Nouveau journal d'audit unifie (utilise par le recap daily)
  // Gilles 2026-05-28
  await logInscriptionDeletion(supabase, {
    requestId: req.id,
    deletedByType: "partner",
    actorPartnerCompanyId: ctx.company.id,
  });

  // Supprime l'enrollment lié (s'il existe)
  if (req.target_session_id && req.learner_id) {
    await supabase
      .from("session_enrollments")
      .delete()
      .eq("session_id", req.target_session_id)
      .eq("learner_id", req.learner_id);
  }

  // Supprime la request (cascade éventuel sur events / opco_fundings)
  const { error: delErr } = await supabase
    .from("inscription_requests")
    .delete()
    .eq("id", req.id);
  if (delErr) {
    return { ok: false, error: `Suppression impossible : ${delErr.message}` };
  }

  revalidatePath(`/partenaire/${token}/inscriptions`);
  revalidatePath(`/partenaire/${token}`);
  return { ok: true };
}
