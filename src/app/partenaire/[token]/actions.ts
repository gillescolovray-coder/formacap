"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEffectivePartnerPrice } from "@/lib/portal/partner-pricing";
import { resolvePartnerContext } from "./_resolve";
import {
  createMirroredEnrollmentForRequest,
  findStageIdByKey,
} from "@/lib/inscriptions/sync";
import {
  buildPortalUrl,
  getOrCreateEnrollmentPortalToken,
} from "@/lib/portal/enrollment-token";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";

/**
 * Inscription auto-acceptée d'un apprenant via le portail partenaire.
 *
 * Étapes :
 *   1) Valider le token portail → company.
 *   2) Vérifier l'existence d'un tarif négocié sur la formation
 *      cible (sinon refus — règle métier).
 *   3) Trouver ou créer le `learner` (par email).
 *   4) Créer `inscription_request` au stage "confirmed"
 *      avec `referrer_company_id` + `via_partner_portal=true`.
 *   5) Créer le `session_enrollment` miroir via sync.
 *   6) Notifier l'admin (TODO email Resend — Phase 1 = log).
 */
export async function submitPartnerEnrollment(formData: FormData): Promise<
  { ok: false; error: string } | { ok: true; redirectTo: string }
> {
  const token = String(formData.get("token") ?? "");
  const sessionId = String(formData.get("session_id") ?? "");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const jobTitle = String(formData.get("job_title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!firstName || !lastName) {
    return { ok: false, error: "Prénom et nom obligatoires." };
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return { ok: false, error: "Email valide obligatoire." };
  }
  if (!sessionId) {
    return { ok: false, error: "Session manquante." };
  }

  const ctx = await resolvePartnerContext(token);
  if (!ctx) return { ok: false, error: "Token invalide." };

  const supabase = createAdminClient();

  // 1) Récupérer la session + sa formation (avec durée pour le calcul prix).
  // Eligibilité côté partenaire :
  //   - INTER distanciel (catalogue public)
  //   - OU INTRA rattachée à ce partenaire (prescriber_company_id).
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, organization_id, formation_id, is_inter, prescriber_company_id, start_date, end_date, formations!inner(modality, title, duration_hours, duration_days)",
    )
    .eq("id", sessionId)
    .eq("organization_id", ctx.company.organization_id)
    .maybeSingle();
  if (!session) {
    return { ok: false, error: "Session introuvable." };
  }
  const sessionTyped = session as {
    formation_id: string;
    is_inter: boolean | null;
    prescriber_company_id: string | null;
    formations: unknown;
  };
  const formationId = sessionTyped.formation_id;
  const formationRel = sessionTyped.formations;
  const formation =
    Array.isArray(formationRel) && formationRel.length > 0
      ? (formationRel[0] as {
          modality: string;
          title: string;
          duration_hours: number | null;
          duration_days: number | null;
        })
      : (formationRel as {
          modality: string;
          title: string;
          duration_hours: number | null;
          duration_days: number | null;
        } | null);

  if (!formation) {
    return { ok: false, error: "Formation introuvable." };
  }

  // Vérification d'éligibilité côté partenaire
  const isInterDistanciel =
    sessionTyped.is_inter === true && formation.modality === "distanciel";
  const isOwnIntra =
    sessionTyped.prescriber_company_id === ctx.company.id;
  if (!isInterDistanciel && !isOwnIntra) {
    return {
      ok: false,
      error: "Cette session n'est pas accessible depuis votre espace.",
    };
  }
  // Pour les OF (workflow quiz only) : pas d'accès aux INTRA.
  if (ctx.company.type === "of" && !isInterDistanciel) {
    return {
      ok: false,
      error: "Cette session n'est pas accessible depuis votre espace.",
    };
  }

  // 2) Prix effectif (override OU tarif général × durée) — calcul côté serveur
  // pour empêcher tout bypass des prix.
  const { data: priceRow } = await supabase
    .from("partner_pricing")
    .select("unit_price_ht")
    .eq("company_id", ctx.company.id)
    .eq("formation_id", formationId)
    .maybeSingle<{ unit_price_ht: string | number }>();

  const effective = computeEffectivePartnerPrice({
    partnerType: ctx.company.type,
    dailyRateDistancielHt: ctx.company.daily_rate_distanciel_ht,
    dailyRatePresentielHt: ctx.company.daily_rate_presentiel_ht,
    quizUnitPriceHt: ctx.company.quiz_unit_price_ht,
    overrideHt: priceRow ? Number(priceRow.unit_price_ht) : undefined,
    durationDays: formation.duration_days,
    durationHours: formation.duration_hours,
    modality: (formation.modality ?? null) as
      | "presentiel"
      | "distanciel"
      | "hybride"
      | null,
  });

  if (effective.price === null) {
    return {
      ok: false,
      error:
        "Aucun tarif défini pour cette formation. Contactez l'organisme de formation.",
    };
  }
  const unitPriceHt = effective.price;

  // 3) Learner : on cherche par email + organization
  let learnerId: string | null = null;
  if (email) {
    const { data: existingLearner } = await supabase
      .from("learners")
      .select("id")
      .eq("organization_id", ctx.company.organization_id)
      .ilike("email", email)
      .maybeSingle<{ id: string }>();
    if (existingLearner) learnerId = existingLearner.id;
  }
  if (!learnerId) {
    const { data: createdLearner, error: createErr } = await supabase
      .from("learners")
      .insert({
        organization_id: ctx.company.organization_id,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        job_title: jobTitle || null,
        // L'apprenant n'est pas rattaché à l'entreprise prescripteur
        // par défaut (le prescripteur est le RÉFÉRENT, pas l'employeur).
        company_id: null,
      })
      .select("id")
      .single<{ id: string }>();
    if (createErr || !createdLearner) {
      return {
        ok: false,
        error: `Création apprenant impossible : ${createErr?.message ?? "inconnu"}`,
      };
    }
    learnerId = createdLearner.id;
  }

  // 4) Stage "confirmed" de l'organisation
  const confirmedStageId = await findStageIdByKey(
    supabase,
    ctx.company.organization_id,
    "confirmed",
  );

  const { data: request, error: reqErr } = await supabase
    .from("inscription_requests")
    .insert({
      organization_id: ctx.company.organization_id,
      source: "partenaire",
      source_details: `Portail partenaire — ${ctx.company.name}`,
      learner_id: learnerId,
      target_session_id: sessionId,
      target_formation_id: formationId,
      stage_id: confirmedStageId,
      referrer_company_id: ctx.company.id,
      via_partner_portal: true,
      financing_mode: "employeur",
      quote_amount_ht: unitPriceHt,
      request_message: message || null,
      contract_signed_at: new Date().toISOString(),
      received_at: new Date().toISOString(),
    })
    .select("id")
    .single<{ id: string }>();
  if (reqErr || !request) {
    return {
      ok: false,
      error: `Inscription impossible : ${reqErr?.message ?? "inconnu"}`,
    };
  }

  // 5) Enrollment miroir
  await createMirroredEnrollmentForRequest(supabase, {
    id: request.id,
    target_session_id: sessionId,
    learner_id: learnerId,
    stage_key: "confirmed",
  });

  // 6) Trace pour Qualiopi : event timeline
  await supabase.from("inscription_events").insert({
    request_id: request.id,
    event_type: "created",
    payload: {
      via_partner_portal: true,
      partner_company_id: ctx.company.id,
      partner_company_name: ctx.company.name,
      unit_price_ht: unitPriceHt,
    },
  });

  // 7) Email auto vers l'apprenant (uniquement workflow OF) avec lien
  // direct vers son portail Quiz. Pour les prescripteurs, la convocation
  // standard sera envoyée par l'admin CAP via les outils habituels.
  if (ctx.company.type === "of" && email && isResendConfigured()) {
    try {
      // Récupère l'enrollment fraichement créé (sync l'a posé)
      const { data: enrollmentRow } = await supabase
        .from("session_enrollments")
        .select("id")
        .eq("inscription_request_id", request.id)
        .maybeSingle<{ id: string }>();
      if (enrollmentRow?.id) {
        const { token: enrollmentToken } =
          await getOrCreateEnrollmentPortalToken(supabase, enrollmentRow.id);
        const origin =
          process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com";
        const portalUrl = buildPortalUrl(origin, enrollmentToken);
        const subject = `Évaluation des connaissances — ${formation.title}`;
        const html = `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px;margin:0 auto;">
  <p>Bonjour ${firstName} ${lastName},</p>
  <p>
    Dans le cadre de votre formation <strong>« ${formation.title} »</strong>
    organisée par <strong>${ctx.company.name}</strong>, votre organisme de
    formation a choisi d'utiliser les quiz d'évaluation des connaissances
    de <strong>${ctx.organization.name}</strong>.
  </p>
  <p>
    Vous êtes invité(e) à réaliser :
  </p>
  <ul>
    <li><strong>Avant la formation</strong> : un premier quiz pour évaluer vos connaissances de départ.</li>
    <li><strong>Après la formation</strong> : un second quiz pour mesurer votre progression.</li>
  </ul>
  <p style="text-align:center;margin:24px 0;">
    <a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">
      Accéder à mes quiz
    </a>
  </p>
  <p style="font-size:12px;color:#6b7280;">
    Ou copiez ce lien dans votre navigateur :<br/>
    <code style="word-break:break-all;">${portalUrl}</code>
  </p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
  <p style="font-size:12px;color:#6b7280;">
    Vos autres documents (convocation, attestation, etc.) vous sont
    transmis directement par ${ctx.company.name}.
  </p>
</div>`.trim();
        await sendEmail({
          to: email,
          toName: `${firstName} ${lastName}`,
          subject,
          html,
          text: `Bonjour ${firstName} ${lastName},\n\nDans le cadre de votre formation "${formation.title}" organisée par ${ctx.company.name}, vous êtes invité(e) à réaliser les quiz d'évaluation de ${ctx.organization.name}.\n\nAccédez à vos quiz : ${portalUrl}\n\nVos autres documents (convocation, attestation) vous sont transmis par ${ctx.company.name}.`,
        });
      }
    } catch {
      // L'inscription reste valide même si l'email échoue : l'apprenant
      // pourra recevoir le lien manuellement depuis le portail partenaire.
    }
  }

  revalidatePath(`/partenaire/${token}`);
  revalidatePath(`/partenaire/${token}/inscriptions`);
  revalidatePath("/inscriptions");
  revalidatePath(`/sessions/${sessionId}`);

  return { ok: true, redirectTo: `/partenaire/${token}/inscriptions?ok=1` };
}

/** Wrapper pour <form action={...}> : redirige si succès. */
export async function submitPartnerEnrollmentForm(formData: FormData) {
  const res = await submitPartnerEnrollment(formData);
  if (res.ok) {
    redirect(res.redirectTo);
  } else {
    const token = String(formData.get("token") ?? "");
    const sessionId = String(formData.get("session_id") ?? "");
    redirect(
      `/partenaire/${token}/inscrire/${sessionId}?error=${encodeURIComponent(res.error)}`,
    );
  }
}
