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

// =====================================================================
// V2 : inscription en LOT (entreprise SIRET + plusieurs apprenants)
// =====================================================================

type LearnerInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  birthYear?: string;
};

type CompanyInput = {
  siret: string;
  name: string;
  address?: string;
  postalCode?: string;
  city?: string;
};

/**
 * Inscription d'un LOT d'apprenants pour la meme session, rattaches a la
 * meme entreprise (identifiee par SIRET). Pour chaque apprenant :
 *   - trouve ou cree le learner (rattache a l'entreprise)
 *   - cree l'inscription_request + enrollment miroir
 *   - envoie l'email quiz (uniquement workflow OF partenaire)
 *
 * L'entreprise est trouvee/creee par SIRET (sur la meme organisation).
 */
export async function submitPartnerBatchEnrollmentForm(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const sessionId = String(formData.get("session_id") ?? "");

  const redirectError = (msg: string) =>
    redirect(
      `/partenaire/${token}/inscrire/${sessionId}?error=${encodeURIComponent(msg)}`,
    );

  // Parsing inputs
  const companyJson = String(formData.get("company") ?? "");
  const learnersJson = String(formData.get("learners") ?? "");
  const financingJson = String(formData.get("financing") ?? "");
  const contactJson = String(formData.get("contact_referent") ?? "");
  const message = String(formData.get("message") ?? "").trim();

  let company: CompanyInput;
  let learners: LearnerInput[];
  // Financement (Qualiopi indic. 9). Optionnel pour rétrocompat avec
  // d'éventuels appels antérieurs sans ce champ — défaut : employeur.
  type FinancingPayload =
    | { mode: "employeur" }
    | { mode: "opco"; opco_name: string; subrogation: boolean };
  let financing: FinancingPayload = { mode: "employeur" };
  // Contact référent pédagogique (recevra la convention)
  type ContactPayload = {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    role: string | null;
  };
  let contactReferent: ContactPayload | null = null;
  try {
    company = JSON.parse(companyJson);
    learners = JSON.parse(learnersJson);
    if (financingJson) {
      financing = JSON.parse(financingJson) as FinancingPayload;
    }
    if (contactJson) {
      contactReferent = JSON.parse(contactJson) as ContactPayload;
    }
  } catch {
    return redirectError("Donnees invalides.");
  }

  if (!company.siret || !company.name) {
    return redirectError("SIRET et raison sociale de l'entreprise obligatoires.");
  }
  if (financing.mode === "opco" && !financing.opco_name?.trim()) {
    return redirectError("Nom de l'OPCO obligatoire.");
  }
  // Note : la validation du contact référent dépend du type du
  // partenaire (cf. plus bas, après resolvePartnerContext).
  // Pour les OF : workflow simplifié (quiz only, pas de convention)
  // → contact référent optionnel.
  // Sérialisation pour l'INSERT : mode + détails texte (nom OPCO +
  // subrogation oui/non). Permet à l'admin de lire l'info sans déplier.
  const financingMode: "employeur" | "opco" = financing.mode;
  const financingDetails =
    financing.mode === "opco"
      ? `${financing.opco_name.trim()} — ${financing.subrogation ? "avec subrogation" : "sans subrogation"}`
      : null;
  if (!Array.isArray(learners) || learners.length === 0) {
    return redirectError("Ajoutez au moins un apprenant.");
  }
  for (const l of learners) {
    if (!l.firstName?.trim() || !l.lastName?.trim()) {
      return redirectError("Prenom et nom obligatoires pour chaque apprenant.");
    }
    if (!l.email?.trim() || !/^\S+@\S+\.\S+$/.test(l.email.trim())) {
      return redirectError(
        `Email invalide pour ${l.firstName} ${l.lastName}.`,
      );
    }
  }

  // Resolve token + session
  const ctx = await resolvePartnerContext(token);
  if (!ctx) return redirectError("Token invalide.");

  // Validation contact référent : obligatoire UNIQUEMENT pour les
  // prescripteurs (qui génèrent une convention). Pour les OF,
  // workflow simplifié sans convention → optionnel.
  // (Gilles 2026-05-22)
  const isPrescripteur = ctx.company.type === "prescripteur";
  if (
    isPrescripteur &&
    (!contactReferent?.first_name?.trim() ||
      !contactReferent?.last_name?.trim() ||
      !/^\S+@\S+\.\S+$/.test(contactReferent?.email ?? ""))
  ) {
    return redirectError(
      "Contact référent (prénom, nom, email) obligatoire pour la convention.",
    );
  }
  // OF : si le contact n'est pas saisi, on le met à null.
  if (
    !contactReferent?.first_name?.trim() ||
    !contactReferent?.last_name?.trim() ||
    !/^\S+@\S+\.\S+$/.test(contactReferent?.email ?? "")
  ) {
    contactReferent = null;
  }

  const supabase = createAdminClient();

  // Session + formation
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, organization_id, formation_id, is_inter, prescriber_company_id, formations!inner(modality, title, duration_hours, duration_days)",
    )
    .eq("id", sessionId)
    .eq("organization_id", ctx.company.organization_id)
    .maybeSingle();
  if (!session) return redirectError("Session introuvable.");

  const sessionTyped = session as {
    formation_id: string;
    is_inter: boolean | null;
    prescriber_company_id: string | null;
    formations: unknown;
  };
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
  if (!formation) return redirectError("Formation introuvable.");

  const isInterDistanciel =
    sessionTyped.is_inter === true && formation.modality === "distanciel";
  const isOwnIntra = sessionTyped.prescriber_company_id === ctx.company.id;
  if (!isInterDistanciel && !isOwnIntra) {
    return redirectError("Session non eligible pour votre espace.");
  }
  if (ctx.company.type === "of" && !isInterDistanciel) {
    return redirectError("Session non eligible pour votre espace.");
  }

  // Prix effectif (1 fois, applique a chaque apprenant)
  const formationId = sessionTyped.formation_id;
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
    return redirectError("Aucun tarif defini pour cette formation.");
  }
  const unitPriceHt = effective.price;

  // Trouver ou creer l'entreprise par SIRET
  const cleanSiret = company.siret.replace(/\s/g, "");
  let learnerCompanyId: string | null = null;
  const { data: existingCompany } = await supabase
    .from("companies")
    .select("id")
    .eq("organization_id", ctx.company.organization_id)
    .eq("siret", cleanSiret)
    .maybeSingle<{ id: string }>();
  if (existingCompany) {
    learnerCompanyId = existingCompany.id;
  } else {
    const { data: newCompany } = await supabase
      .from("companies")
      .insert({
        organization_id: ctx.company.organization_id,
        name: company.name,
        siret: cleanSiret,
        address: company.address ?? null,
        postal_code: company.postalCode ?? null,
        city: company.city ?? null,
        type: "client",
        is_active: true,
      })
      .select("id")
      .single<{ id: string }>();
    if (newCompany) learnerCompanyId = newCompany.id;
  }

  // Stage "confirmed"
  const confirmedStageId = await findStageIdByKey(
    supabase,
    ctx.company.organization_id,
    "confirmed",
  );

  // Pour chaque apprenant : trouve/cree learner + inscription + enrollment + email
  const errors: string[] = [];
  let successCount = 0;
  for (const l of learners) {
    const firstName = l.firstName.trim();
    const lastName = l.lastName.trim();
    const email = l.email.trim();
    const phone = l.phone?.trim() || null;
    const jobTitle = l.jobTitle?.trim() || null;
    const birthYear = l.birthYear?.trim();
    const birthDate =
      birthYear && /^\d{4}$/.test(birthYear) ? `${birthYear}-01-01` : null;

    // Trouve/cree learner par email
    let learnerId: string | null = null;
    const { data: existingLearner } = await supabase
      .from("learners")
      .select("id")
      .eq("organization_id", ctx.company.organization_id)
      .ilike("email", email)
      .maybeSingle<{ id: string }>();
    if (existingLearner) {
      learnerId = existingLearner.id;
    } else {
      const { data: created } = await supabase
        .from("learners")
        .insert({
          organization_id: ctx.company.organization_id,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          job_title: jobTitle,
          birth_date: birthDate,
          company_id: learnerCompanyId,
        })
        .select("id")
        .single<{ id: string }>();
      if (created) learnerId = created.id;
    }
    if (!learnerId) {
      errors.push(`Echec creation ${firstName} ${lastName}`);
      continue;
    }

    // Inscription + enrollment miroir
    // FIX Gilles 2026-05-22 : on capture l'erreur Supabase et on
    // l'inclut dans le message renvoyé pour comprendre les echecs
    // silencieux (contrainte FK, NOT NULL, etc.). Le contact_referent
    // est optionnel pour les OF (workflow simplifie : pas de convention).
    const insertPayload: Record<string, unknown> = {
      organization_id: ctx.company.organization_id,
      source: "partenaire",
      source_details: `Portail partenaire — ${ctx.company.name}`,
      learner_id: learnerId,
      company_id: learnerCompanyId,
      target_session_id: sessionId,
      target_formation_id: formationId,
      stage_id: confirmedStageId,
      referrer_company_id: ctx.company.id,
      via_partner_portal: true,
      financing_mode: financingMode,
      financing_details: financingDetails,
      quote_amount_ht: unitPriceHt,
      request_message: message || null,
      contract_signed_at: new Date().toISOString(),
      received_at: new Date().toISOString(),
    };
    // Le contact référent n'est inséré que s'il a été saisi (cas
    // prescripteur). Pour les OF, le workflow est simplifié — pas de
    // convention donc pas de référent. Voir le formulaire client qui
    // adapte les champs selon le type.
    if (contactReferent) {
      insertPayload.contact_referent_first_name =
        contactReferent.first_name.trim();
      insertPayload.contact_referent_last_name =
        contactReferent.last_name.trim();
      insertPayload.contact_referent_email = contactReferent.email.trim();
      insertPayload.contact_referent_phone = contactReferent.phone;
      insertPayload.contact_referent_role = contactReferent.role;
    }

    const { data: request, error: insertErr } = await supabase
      .from("inscription_requests")
      .insert(insertPayload)
      .select("id")
      .single<{ id: string }>();
    if (insertErr || !request) {
      console.error(
        "[partenaire/actions] INSERT inscription_requests échec",
        { firstName, lastName, error: insertErr?.message },
      );
      errors.push(
        `Echec inscription ${firstName} ${lastName} : ${insertErr?.message ?? "inconnu"}`,
      );
      continue;
    }
    await createMirroredEnrollmentForRequest(supabase, {
      id: request.id,
      target_session_id: sessionId,
      learner_id: learnerId,
      stage_key: "confirmed",
    });
    await supabase.from("inscription_events").insert({
      request_id: request.id,
      event_type: "created",
      payload: {
        via_partner_portal: true,
        partner_company_id: ctx.company.id,
        partner_company_name: ctx.company.name,
        learner_company_siret: cleanSiret,
        unit_price_ht: unitPriceHt,
      },
    });

    // Email quiz auto (workflow OF uniquement)
    if (ctx.company.type === "of" && email && isResendConfigured()) {
      try {
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
          await sendEmail({
            to: email,
            toName: `${firstName} ${lastName}`,
            subject: `Evaluation des connaissances — ${formation.title}`,
            html: `<p>Bonjour ${firstName} ${lastName},</p><p>Dans le cadre de votre formation <strong>${formation.title}</strong> organisee par ${ctx.company.name}, vous etes invite a realiser les quiz d'evaluation de ${ctx.organization.name}.</p><p><a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;">Acceder a mes quiz</a></p><p style="font-size:12px;color:#6b7280;">Vos autres documents (convocation, attestation) vous sont transmis par ${ctx.company.name}.</p>`,
            text: `Bonjour ${firstName} ${lastName},\n\nFormation : ${formation.title}\nLien quiz : ${portalUrl}`,
          });
        }
      } catch {
        // L'inscription reste valide meme si l'email echoue
      }
    }

    successCount++;
  }

  revalidatePath(`/partenaire/${token}`);
  revalidatePath(`/partenaire/${token}/inscriptions`);
  revalidatePath("/inscriptions");
  revalidatePath(`/sessions/${sessionId}`);

  if (successCount === 0) {
    return redirectError(
      `Aucune inscription creee. ${errors.length > 0 ? errors[0] : ""}`,
    );
  }
  redirect(
    `/partenaire/${token}/inscriptions?ok=${successCount}${errors.length > 0 ? `&errors=${encodeURIComponent(errors.join(", "))}` : ""}`,
  );
}
