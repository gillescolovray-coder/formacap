"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "../_resolve";
import {
  createMirroredEnrollmentForRequest,
  findStageIdByKey,
} from "@/lib/inscriptions/sync";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";

/**
 * Valide une pré-inscription publique. Étapes :
 *   1. Récupère SIRET/ville depuis l'event « created » (saisis au moment
 *      de la pré-inscription côté formulaire public).
 *   2. Trouve ou crée l'entreprise dans le module Entreprises si un
 *      SIRET a été fourni — matching par SIRET sur la même organisation.
 *   3. Trouve ou crée le learner (par email) et le rattache à
 *      l'entreprise si on en a une.
 *   4. Passe le stage à `confirmed` + crée l'enrollment miroir.
 *   5. Envoie 2 emails (best-effort, ne bloque pas la validation) :
 *        - apprenant : « Votre inscription est confirmée »
 *        - admin de l'organisation : « Nouvelle inscription à convoquer »
 */
export async function validatePreinscription(
  token: string,
  requestId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await resolvePartnerContext(token);
  if (!ctx) return { ok: false, error: "Token invalide." };

  const supabase = createAdminClient();

  // 1) Charge la demande + payload de l'event "created" (SIRET, ville…)
  const [{ data: req }, { data: createdEvent }] = await Promise.all([
    supabase
      .from("inscription_requests")
      .select(
        "id, organization_id, referrer_company_id, target_session_id, prospect_first_name, prospect_last_name, prospect_email, prospect_phone, company_name_freetext, learner_id",
      )
      .eq("id", requestId)
      .eq("referrer_company_id", ctx.company.id)
      .eq("organization_id", ctx.company.organization_id)
      .maybeSingle<{
        id: string;
        organization_id: string;
        referrer_company_id: string;
        target_session_id: string | null;
        prospect_first_name: string | null;
        prospect_last_name: string | null;
        prospect_email: string | null;
        prospect_phone: string | null;
        company_name_freetext: string | null;
        learner_id: string | null;
      }>(),
    supabase
      .from("inscription_events")
      .select("payload")
      .eq("request_id", requestId)
      .eq("event_type", "created")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{
        payload: {
          company_siret?: string | null;
          company_city?: string | null;
          job_title?: string | null;
        } | null;
      }>(),
  ]);
  if (!req) return { ok: false, error: "Pré-inscription introuvable." };
  if (!req.target_session_id) {
    return { ok: false, error: "Session manquante sur la demande." };
  }

  const createdPayload = createdEvent?.payload ?? {};
  const rawSiret = createdPayload.company_siret?.trim() ?? "";
  const cleanSiret = rawSiret.replace(/\s/g, "");
  const companyCity = createdPayload.company_city ?? null;
  const jobTitle = createdPayload.job_title ?? null;

  // 2) Trouve ou crée l'entreprise dans le module Entreprises si on a
  //    un SIRET. Sans SIRET, on garde juste le texte libre.
  let learnerCompanyId: string | null = null;
  if (cleanSiret && req.company_name_freetext) {
    const { data: existingCompany } = await supabase
      .from("companies")
      .select("id")
      .eq("organization_id", req.organization_id)
      .eq("siret", cleanSiret)
      .maybeSingle<{ id: string }>();
    if (existingCompany) {
      learnerCompanyId = existingCompany.id;
    } else {
      const { data: newCompany } = await supabase
        .from("companies")
        .insert({
          organization_id: req.organization_id,
          name: req.company_name_freetext,
          siret: cleanSiret,
          city: companyCity,
          type: "client",
          is_active: true,
        })
        .select("id")
        .single<{ id: string }>();
      if (newCompany) learnerCompanyId = newCompany.id;
    }
  }

  // 3) Trouve ou crée le learner (par email)
  let learnerId: string | null = req.learner_id;
  if (!learnerId && req.prospect_email) {
    const { data: existing } = await supabase
      .from("learners")
      .select("id, company_id")
      .eq("organization_id", req.organization_id)
      .ilike("email", req.prospect_email)
      .maybeSingle<{ id: string; company_id: string | null }>();
    if (existing) {
      learnerId = existing.id;
      // Si l'apprenant existait déjà sans entreprise et qu'on en a une
      // maintenant, on le rattache.
      if (!existing.company_id && learnerCompanyId) {
        await supabase
          .from("learners")
          .update({ company_id: learnerCompanyId })
          .eq("id", existing.id);
      }
    } else {
      const { data: created, error: createErr } = await supabase
        .from("learners")
        .insert({
          organization_id: req.organization_id,
          first_name: req.prospect_first_name ?? "",
          last_name: req.prospect_last_name ?? "",
          email: req.prospect_email,
          phone: req.prospect_phone,
          job_title: jobTitle,
          company_id: learnerCompanyId,
        })
        .select("id")
        .single<{ id: string }>();
      if (createErr || !created) {
        return {
          ok: false,
          error: `Création apprenant impossible : ${createErr?.message ?? "inconnu"}`,
        };
      }
      learnerId = created.id;
    }
  }
  if (!learnerId) {
    return { ok: false, error: "Email apprenant manquant." };
  }

  const confirmedStageId = await findStageIdByKey(
    supabase,
    req.organization_id,
    "confirmed",
  );
  if (!confirmedStageId) {
    return { ok: false, error: "Stage 'confirmed' introuvable." };
  }

  // 4) Validation officielle — détecte préventivement le cas où le
  //    même apprenant est déjà inscrit (par exemple 2 pré-inscriptions
  //    soumises avec le même email pour des apprenants distincts).
  //    Contrainte SQL : uniq_inscription_request_session_learner sur
  //    (target_session_id, learner_id). On donne un message parlant
  //    plutôt que de laisser fuiter l'erreur Postgres brute.
  const { data: existingForLearner } = await supabase
    .from("inscription_requests")
    .select("id")
    .eq("target_session_id", req.target_session_id)
    .eq("learner_id", learnerId)
    .neq("id", req.id)
    .limit(1)
    .maybeSingle();
  if (existingForLearner) {
    return {
      ok: false,
      error:
        "Cet apprenant (même email) est déjà inscrit sur cette session. Si ce sont deux personnes différentes, modifiez l'email côté apprenant avant de valider — sinon, refusez ce doublon.",
    };
  }

  const { error: updErr } = await supabase
    .from("inscription_requests")
    .update({
      stage_id: confirmedStageId,
      learner_id: learnerId,
      company_id: learnerCompanyId,
      contract_signed_at: new Date().toISOString(),
    })
    .eq("id", req.id);
  if (updErr) {
    // Filet de sécurité : si la contrainte d'unicité saute malgré le
    // pré-check (race condition), on traduit le message.
    const friendly = updErr.message.includes(
      "uniq_inscription_request_session_learner",
    )
      ? "Cet apprenant est déjà inscrit sur cette session (doublon détecté). Refusez ce doublon ou modifiez l'email de l'apprenant."
      : `Validation impossible : ${updErr.message}`;
    return { ok: false, error: friendly };
  }

  await createMirroredEnrollmentForRequest(supabase, {
    id: req.id,
    target_session_id: req.target_session_id,
    learner_id: learnerId,
    stage_key: "confirmed",
  });

  await supabase.from("inscription_events").insert({
    request_id: req.id,
    event_type: "validated",
    payload: {
      validated_by_partner: ctx.company.id,
      partner_company_name: ctx.company.name,
      company_id: learnerCompanyId,
      company_created: cleanSiret ? true : false,
    },
  });

  // 5) Notifications email (best-effort — ne bloquent pas la validation
  //    si Resend échoue).
  if (isResendConfigured()) {
    // Récupère le détail de la session + formation pour personnaliser
    const { data: sessionRow } = await supabase
      .from("sessions")
      .select(
        "id, start_date, end_date, modality, location, video_app, formation:formations!inner(title)",
      )
      .eq("id", req.target_session_id)
      .maybeSingle();
    const sess = sessionRow as unknown as {
      start_date: string | null;
      end_date: string | null;
      modality: string | null;
      location: string | null;
      video_app: string | null;
      formation:
        | { title: string }
        | Array<{ title: string }>
        | null;
    } | null;
    const formationTitle = (() => {
      if (!sess?.formation) return "";
      const f = Array.isArray(sess.formation)
        ? sess.formation[0]
        : sess.formation;
      return f?.title ?? "";
    })();
    const formatDate = (s: string | null) =>
      s
        ? new Date(s + "T00:00:00").toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "";
    const dateLabel =
      sess?.start_date && sess?.end_date && sess.start_date !== sess.end_date
        ? `du ${formatDate(sess.start_date)} au ${formatDate(sess.end_date)}`
        : `le ${formatDate(sess?.start_date ?? null)}`;
    const modalityLine =
      sess?.modality === "presentiel" && sess.location
        ? `<p><strong>Modalité :</strong> Présentiel — ${sess.location}</p>`
        : sess?.modality === "distanciel" && sess.video_app
          ? `<p><strong>Modalité :</strong> Distanciel — ${sess.video_app}</p>`
          : sess?.modality
            ? `<p><strong>Modalité :</strong> ${sess.modality}</p>`
            : "";
    const learnerFullName =
      `${req.prospect_first_name ?? ""} ${req.prospect_last_name ?? ""}`.trim();

    // 5a) Email à l'apprenant
    if (req.prospect_email) {
      try {
        await sendEmail({
          to: req.prospect_email,
          toName: learnerFullName,
          subject: `Inscription confirmée — ${formationTitle}`,
          html: `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px;margin:0 auto;">
  <p>Bonjour ${learnerFullName || ""},</p>
  <p>
    Votre inscription à la formation
    <strong>« ${formationTitle} »</strong> a été <strong>confirmée</strong>
    par <strong>${ctx.company.name}</strong>.
  </p>
  <p><strong>Date :</strong> ${dateLabel}</p>
  ${modalityLine}
  <p>
    Vous recevrez prochainement par email votre convocation officielle et
    les autres documents (convention, programme détaillé, etc.) de la part
    de ${ctx.organization.name}.
  </p>
  <p style="font-size:12px;color:#6b7280;margin-top:24px;">
    Pour toute question relative à cette inscription, contactez
    ${ctx.company.name}${ctx.company.email ? ` (${ctx.company.email})` : ""}.
  </p>
</div>`.trim(),
          text: `Bonjour ${learnerFullName},\n\nVotre inscription à "${formationTitle}" est confirmée par ${ctx.company.name}.\nDate : ${dateLabel}\n\nVous recevrez prochainement votre convocation officielle.\n\nQuestions : ${ctx.company.email ?? ctx.company.name}`,
        });
      } catch {
        // best-effort
      }
    }

    // 5b) Email à l'admin (Gilles) — rappel de convocation à envoyer
    if (ctx.organization.email) {
      const adminUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com"}/sessions/${req.target_session_id}`;
      try {
        await sendEmail({
          to: ctx.organization.email,
          toName: ctx.organization.name,
          subject: `Nouvelle inscription confirmée à convoquer — ${learnerFullName}`,
          html: `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px;margin:0 auto;">
  <p>Une pré-inscription vient d'être <strong>validée</strong> par le partenaire
  <strong>${ctx.company.name}</strong> :</p>
  <ul>
    <li><strong>Apprenant :</strong> ${learnerFullName} (${req.prospect_email ?? ""})</li>
    <li><strong>Entreprise :</strong> ${req.company_name_freetext ?? "—"}${cleanSiret ? ` (SIRET ${cleanSiret})` : ""}${learnerCompanyId ? ` — fiche créée/rattachée ✅` : ""}</li>
    <li><strong>Formation :</strong> ${formationTitle}</li>
    <li><strong>Date :</strong> ${dateLabel}</li>
  </ul>
  <p>
    👉 <strong>Pensez à envoyer la convocation</strong> et les autres documents
    Qualiopi (convention, etc.) depuis la fiche session.
  </p>
  <p style="text-align:center;margin:20px 0;">
    <a href="${adminUrl}" style="display:inline-block;padding:10px 20px;background:#0891b2;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">
      Ouvrir la fiche session
    </a>
  </p>
</div>`.trim(),
          text: `Pré-inscription validée par ${ctx.company.name} :\n- ${learnerFullName} (${req.prospect_email})\n- ${req.company_name_freetext}${cleanSiret ? ` (SIRET ${cleanSiret})` : ""}\n- ${formationTitle} (${dateLabel})\n\nPense à envoyer la convocation : ${adminUrl}`,
        });
      } catch {
        // best-effort
      }
    }
  }

  revalidatePath(`/partenaire/${token}/preinscriptions`);
  // L'inscription devient officielle → elle doit apparaitre dans
  // l'onglet « Mes inscriptions » (sinon elle reste en cache et le
  // partenaire ne voit plus rien apres validation).
  revalidatePath(`/partenaire/${token}/inscriptions`);
  revalidatePath(`/partenaire/${token}`);
  return { ok: true };
}

/**
 * Met à jour les champs modifiables d'une pré-inscription en attente
 * de validation. Permet au partenaire de corriger un email mal saisi
 * (cas frequent : double email avec un autre apprenant) sans avoir à
 * refuser la demande et redemander la saisie.
 *
 * Seuls les champs « apprenant » sont éditables ici. Entreprise, session
 * et financement restent gelés (si erreur sur ces points → refuser).
 */
export async function updatePreinscription(
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

  // Validation minimale
  if (!patch.first_name?.trim() || !patch.last_name?.trim()) {
    return { ok: false, error: "Prénom et nom obligatoires." };
  }
  if (!/^\S+@\S+\.\S+$/.test(patch.email?.trim() ?? "")) {
    return { ok: false, error: "Email invalide." };
  }

  const supabase = createAdminClient();

  // Vérifie ownership + récupère target_session_id pour le check doublon
  const { data: req } = await supabase
    .from("inscription_requests")
    .select("id, target_session_id, prospect_email")
    .eq("id", requestId)
    .eq("referrer_company_id", ctx.company.id)
    .eq("organization_id", ctx.company.organization_id)
    .maybeSingle<{
      id: string;
      target_session_id: string | null;
      prospect_email: string | null;
    }>();
  if (!req) return { ok: false, error: "Pré-inscription introuvable." };

  // Vérifie qu'on ne crée pas de doublon en changeant l'email
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
        error: `L'email « ${patch.email} » est déjà inscrit sur cette session. Choisissez un autre email.`,
      };
    }
  }

  // Update
  const { error: updErr } = await supabase
    .from("inscription_requests")
    .update({
      prospect_first_name: patch.first_name.trim(),
      prospect_last_name: patch.last_name.trim(),
      prospect_email: patch.email.trim(),
      prospect_phone: patch.phone,
    })
    .eq("id", req.id);
  if (updErr) {
    return { ok: false, error: `Mise à jour impossible : ${updErr.message}` };
  }

  // Trace timeline (en mettant job_title dans le payload car pas de colonne dédiée)
  await supabase.from("inscription_events").insert({
    request_id: req.id,
    event_type: "edited",
    payload: {
      edited_by_partner: ctx.company.id,
      partner_company_name: ctx.company.name,
      job_title: patch.job_title,
    },
  });

  revalidatePath(`/partenaire/${token}/preinscriptions`);
  return { ok: true };
}

/** Refuse une pré-inscription : passe le stage à "refused". */
export async function rejectPreinscription(
  token: string,
  requestId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await resolvePartnerContext(token);
  if (!ctx) return { ok: false, error: "Token invalide." };

  const supabase = createAdminClient();

  const { data: req } = await supabase
    .from("inscription_requests")
    .select("id, organization_id")
    .eq("id", requestId)
    .eq("referrer_company_id", ctx.company.id)
    .eq("organization_id", ctx.company.organization_id)
    .maybeSingle<{ id: string; organization_id: string }>();
  if (!req) return { ok: false, error: "Pré-inscription introuvable." };

  const refusedStageId = await findStageIdByKey(
    supabase,
    req.organization_id,
    "refused",
  );
  if (!refusedStageId) {
    return { ok: false, error: "Stage 'refused' introuvable." };
  }

  const { error: updErr } = await supabase
    .from("inscription_requests")
    .update({ stage_id: refusedStageId })
    .eq("id", req.id);
  if (updErr) {
    return { ok: false, error: `Refus impossible : ${updErr.message}` };
  }

  await supabase.from("inscription_events").insert({
    request_id: req.id,
    event_type: "rejected",
    payload: {
      rejected_by_partner: ctx.company.id,
      partner_company_name: ctx.company.name,
    },
  });

  revalidatePath(`/partenaire/${token}/preinscriptions`);
  return { ok: true };
}
