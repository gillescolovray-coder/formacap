"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logInscriptionAttempt } from "@/lib/inscriptions/audit-log";
import {
  computeEffectivePartnerPrice,
  loadOrgPartnerDefaults,
} from "@/lib/portal/partner-pricing";
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

  const orgDefaults = await loadOrgPartnerDefaults(
    supabase,
    ctx.company.organization_id,
  );
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
    ...orgDefaults,
  });

  if (effective.price === null) {
    return {
      ok: false,
      error:
        "Aucun tarif défini pour cette formation. Contactez l'organisme de formation.",
    };
  }
  const unitPriceHt = effective.price;

  // 3) Learner : on cherche par TRIPLET (email + first_name + last_name)
  // pour autoriser plusieurs apprenants avec la meme adresse generique
  // (`contact@boite.fr` partagee — fix Gilles 2026-05-22).
  let learnerId: string | null = null;
  if (email) {
    const { data: existingLearner } = await supabase
      .from("learners")
      .select("id")
      .eq("organization_id", ctx.company.organization_id)
      .ilike("email", email)
      .ilike("first_name", firstName)
      .ilike("last_name", lastName)
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
      // Fix Gilles 2026-05-22 : canal d'inscription = type du partenaire
      // pour que la colonne SOURCE D'INSCRIPTION (onglets Convocations,
      // Conventions, etc.) affiche directement « Via BATYS » au lieu de
      // « CAP NUMERIQUE ».
      inscription_channel: ctx.company.type === "of" ? "of" : "prescripteur",
      inscription_channel_company_id: ctx.company.id,
      financing_mode: "employeur",
      quote_amount_ht: unitPriceHt,
      // Refonte tarification 2026-05-31 (Gilles etape 6 phase 2f) :
      // populer billing_total_ht des l inscription pour aligner les
      // ecrans (tableau Sessions, conventions, dashboard) sur le tarif
      // partenaire effectif. billing_total_ht = quote_amount_ht (meme
      // valeur, mais champ de la refonte qui est priorise partout).
      billing_total_ht: unitPriceHt,
      billing_pricing_mode: "flat",
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
  // Renseigne explicitement le canal d'inscription pour que l'onglet
  // Participants affiche « Via [nom du partenaire] » au lieu de
  // « CAP NUMERIQUE (direct) » par défaut (fix Gilles 2026-05-22).
  await createMirroredEnrollmentForRequest(supabase, {
    id: request.id,
    target_session_id: sessionId,
    learner_id: learnerId,
    stage_key: "confirmed",
    inscription_channel: ctx.company.type === "of" ? "of" : "prescripteur",
    inscription_channel_company_id: ctx.company.id,
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
  civility?: string; // "M." | "Mme" | "" (Gilles 2026-05-22)
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
  // Representant legal (Gilles 2026-05-28, migration 0110)
  representantCivility?: string;
  representantFirstName?: string;
  representantLastName?: string;
  representantJobTitle?: string;
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

  // Validation contact référent (Gilles 2026-05-22).
  //
  // PRESCRIPTEUR :
  //   - Si le formulaire envoie referent_fallback_first_learner=1
  //     (case "Renseigner un référent pédagogique" décochée), on
  //     bascule sur le PREMIER APPRENANT comme destinataire des
  //     documents (convention, convocation, etc.).
  //   - Sinon, contact référent obligatoire (prénom, nom, email).
  //
  // OF : workflow simplifié sans convention → contact référent optionnel.
  const isPrescripteur = ctx.company.type === "prescripteur";
  const referentFallbackFirstLearner =
    String(formData.get("referent_fallback_first_learner") ?? "") === "1";

  if (isPrescripteur && referentFallbackFirstLearner) {
    // On bascule sur le premier apprenant. La validation des
    // apprenants a déjà été faite plus haut, donc on est sûr d'avoir
    // au moins un apprenant valide.
    const first = learners[0];
    contactReferent = {
      first_name: first.firstName.trim(),
      last_name: first.lastName.trim(),
      email: first.email.trim(),
      phone: first.phone?.trim() || null,
      role: "Apprenant — destinataire des documents",
    };
  } else if (
    isPrescripteur &&
    (!contactReferent?.first_name?.trim() ||
      !contactReferent?.last_name?.trim() ||
      !/^\S+@\S+\.\S+$/.test(contactReferent?.email ?? ""))
  ) {
    return redirectError(
      "Contact référent (prénom, nom, email) obligatoire, ou cochez la case pour faire recevoir les documents par le premier apprenant.",
    );
  } else if (
    !contactReferent?.first_name?.trim() ||
    !contactReferent?.last_name?.trim() ||
    !/^\S+@\S+\.\S+$/.test(contactReferent?.email ?? "")
  ) {
    // OF avec contact partiellement rempli ou vide → on met à null.
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
  const orgDefaultsBatch = await loadOrgPartnerDefaults(
    supabase,
    ctx.company.organization_id,
  );
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
    ...orgDefaultsBatch,
  });
  if (effective.price === null) {
    return redirectError("Aucun tarif defini pour cette formation.");
  }
  const unitPriceHt = effective.price;

  // Trouver ou creer l'entreprise par SIRET
  const cleanSiret = company.siret.replace(/\s/g, "");
  let learnerCompanyId: string | null = null;

  // Representant legal — whitelist civilite + nettoyage trim
  const repCivRaw = company.representantCivility?.trim() ?? "";
  const repCiv =
    repCivRaw === "M." || repCivRaw === "Mme" ? repCivRaw : null;
  const repFn = company.representantFirstName?.trim() || null;
  const repLn = company.representantLastName?.trim() || null;
  const repJt = company.representantJobTitle?.trim() || null;
  const hasRepInput = !!(repCiv || repFn || repLn || repJt);

  const { data: existingCompany } = await supabase
    .from("companies")
    .select("id")
    .eq("organization_id", ctx.company.organization_id)
    .eq("siret", cleanSiret)
    .maybeSingle<{ id: string }>();
  if (existingCompany) {
    learnerCompanyId = existingCompany.id;
    // Si le partenaire a saisi le representant legal, on met a jour la
    // fiche entreprise (Gilles 2026-05-28). Ne touche pas si tout vide.
    if (hasRepInput) {
      await supabase
        .from("companies")
        .update({
          representant_civility: repCiv,
          representant_first_name: repFn,
          representant_last_name: repLn,
          representant_job_title: repJt,
        })
        .eq("id", existingCompany.id);
    }
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
        // Representant legal a la creation (Gilles 2026-05-28)
        representant_civility: repCiv,
        representant_first_name: repFn,
        representant_last_name: repLn,
        representant_job_title: repJt,
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
  const createdRequestIds: string[] = [];
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
    // Civilité (Gilles 2026-05-22) : on accepte "M." ou "Mme", sinon null.
    const civilityRaw = l.civility?.trim() ?? "";
    const civility =
      civilityRaw === "M." || civilityRaw === "Mme" ? civilityRaw : null;

    // Trouve/cree learner — Gilles 2026-05-22 : on matche sur le
    // TRIPLET (email + first_name + last_name) au lieu de l'email seul.
    // Cas typique PME : plusieurs personnes utilisent la meme adresse
    // entreprise (`contact@boite.fr`, `direction@boite.fr`) — sans ce
    // fix, le 2e apprenant heritait du learner_id du 1er, ce qui
    // declenchait une violation de la contrainte unique
    // uniq_inscription_request_session_learner sur l'INSERT inscription.
    let learnerId: string | null = null;
    // Recherche existant — triplet email + prenom + nom. .maybeSingle()
    // peut retourner une ERREUR si plusieurs lignes matchent (cas vecu :
    // homonymes ou doublons historiques). On capture cette erreur pour
    // tomber proprement en mode "creation nouveau learner".
    const lookupResult = await supabase
      .from("learners")
      .select("id, civility")
      .eq("organization_id", ctx.company.organization_id)
      .ilike("email", email)
      .ilike("first_name", firstName)
      .ilike("last_name", lastName)
      .maybeSingle<{ id: string; civility: string | null }>();
    if (lookupResult.error) {
      console.warn(
        "[partenaire/actions] learner lookup erreur (multiple matches probable)",
        { firstName, lastName, email, error: lookupResult.error.message },
      );
    }
    const existingLearner = lookupResult.data ?? null;
    if (existingLearner) {
      learnerId = existingLearner.id;
      if (!existingLearner.civility && civility) {
        await supabase
          .from("learners")
          .update({ civility })
          .eq("id", existingLearner.id);
      }
    } else {
      const { data: created, error: createErr } = await supabase
        .from("learners")
        .insert({
          organization_id: ctx.company.organization_id,
          civility,
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
      if (createErr) {
        console.error(
          "[partenaire/actions] CREATE learner echec",
          { firstName, lastName, email, error: createErr.message },
        );
        errors.push(
          `Echec creation apprenant "${firstName} ${lastName}" (${email || "sans email"}) : ${createErr.message ?? "raison inconnue"}`,
        );
        continue;
      }
      if (created) learnerId = created.id;
    }
    if (!learnerId) {
      errors.push(
        `Echec creation apprenant "${firstName} ${lastName}" — aucun ID retourne par la base.`,
      );
      continue;
    }

    // Pre-check anti-doublon (Gilles 2026-05-25) : si une
    // inscription_request existe deja pour (target_session_id,
    // learner_id), on ne tente PAS le INSERT — sinon la contrainte
    // unique uniq_inscription_request_session_learner remonte un
    // message SQL cryptique cote partenaire. On affiche a la place
    // un message en francais lisible et on enchaine sur les autres
    // apprenants. Cas vecu : un partenaire essaie de reinscrire une
    // apprenante deja inscrite par l'admin OF en direct.
    const { data: alreadyInscribed } = await supabase
      .from("inscription_requests")
      .select("id")
      .eq("target_session_id", sessionId)
      .eq("learner_id", learnerId)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (alreadyInscribed) {
      errors.push(
        `${firstName} ${lastName} : deja inscrit(e) sur cette session — inscription ignoree.`,
      );
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
      // Fix Gilles 2026-05-22 : voir commentaire similaire plus haut.
      inscription_channel: ctx.company.type === "of" ? "of" : "prescripteur",
      inscription_channel_company_id: ctx.company.id,
      financing_mode: financingMode,
      financing_details: financingDetails,
      quote_amount_ht: unitPriceHt,
      // Refonte tarification 2026-05-31 (Gilles etape 6 phase 2f) :
      // populer billing_total_ht des l inscription (voir explication
      // dans la 1ere insertion plus haut dans ce fichier).
      billing_total_ht: unitPriceHt,
      billing_pricing_mode: "flat",
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
      // Diagnostic enrichi (Gilles 2026-05-25) : Supabase peut renvoyer
      // code / details / hint en plus du message — utile pour comprendre
      // les echecs de contrainte sans avoir a fouiller les logs serveur.
      console.error(
        "[partenaire/actions] INSERT inscription_requests echec",
        {
          firstName,
          lastName,
          email,
          learnerId,
          error: insertErr,
          payload: insertPayload,
        },
      );
      const reason =
        insertErr?.message?.trim() ||
        insertErr?.details ||
        insertErr?.hint ||
        insertErr?.code ||
        "raison inconnue (verifier les logs serveur)";
      errors.push(
        `Echec inscription "${firstName} ${lastName}" (${email || "sans email"}) : ${reason}`,
      );
      continue;
    }
    createdRequestIds.push(request.id);
    await createMirroredEnrollmentForRequest(supabase, {
      id: request.id,
      target_session_id: sessionId,
      learner_id: learnerId,
      stage_key: "confirmed",
      // Fix Gilles 2026-05-22 : renseigne le canal pour que l'onglet
      // Participants affiche « Via BATYS » et non « CAP NUMERIQUE ».
      inscription_channel: ctx.company.type === "of" ? "of" : "prescripteur",
      inscription_channel_company_id: ctx.company.id,
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

  // Audit log (Gilles 2026-05-22 — migration 0099)
  const h = await headers();
  const clientIp =
    h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? null;
  const userAgent = h.get("user-agent") ?? null;
  await logInscriptionAttempt({
    source: "portail_partenaire_batch",
    referrerCompanyId: ctx.company.id,
    organizationId: ctx.company.organization_id,
    targetSessionId: sessionId,
    payload: { company, learners, financing, contactReferent, message },
    success: successCount > 0,
    createdRequestIds,
    errorMessage: errors.length > 0 ? errors.join(" | ") : null,
    clientIp,
    userAgent,
  });

  if (successCount === 0) {
    return redirectError(
      `Aucune inscription creee. ${errors.length > 0 ? errors[0] : ""}`,
    );
  }
  redirect(
    `/partenaire/${token}/inscriptions?ok=${successCount}${errors.length > 0 ? `&errors=${encodeURIComponent(errors.join(", "))}` : ""}`,
  );
}

// =====================================================================
// Lookup automatique au moment de la saisie SIRET (Gilles 2026-05-22)
// =====================================================================

/**
 * Cherche si une entreprise (par SIRET) est déjà connue dans la BDD du
 * partenaire, et renvoie son dernier contact référent saisi (si existe).
 *
 * Utilisé par le formulaire d'inscription portail : quand le partenaire
 * fait une recherche SIRENE et trouve une société, on regarde si elle a
 * déjà été inscrite par ce partenaire avec un contact référent. Si oui,
 * on pré-remplit le bloc CONTACT RÉFÉRENT PÉDAGOGIQUE pour éviter à
 * l'utilisateur de ressaisir.
 *
 * Cascade :
 *   1. Dernière inscription_request du partenaire pour ce SIRET avec
 *      contact_referent_email rempli → reprend les coordonnées
 *   2. Sinon : company_contacts.is_primary de l'entreprise
 *   3. Sinon : null
 */
export async function lookupExistingPartnerCompanyContext(input: {
  token: string;
  siret: string;
}): Promise<{
  ok: true;
  found: boolean;
  contactReferent?: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    role: string;
  } | null;
}> {
  const ctx = await resolvePartnerContext(input.token);
  if (!ctx) return { ok: true, found: false };
  const cleanSiret = input.siret.replace(/\s/g, "");
  if (!cleanSiret) return { ok: true, found: false };

  const supabase = createAdminClient();
  // 1. Cherche l'entreprise par SIRET
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("organization_id", ctx.company.organization_id)
    .eq("siret", cleanSiret)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (!company) return { ok: true, found: false };

  // 2. Cherche la dernière inscription_request du partenaire pour cette
  // entreprise qui a un contact référent saisi.
  const { data: lastReq } = await supabase
    .from("inscription_requests")
    .select(
      "contact_referent_first_name, contact_referent_last_name, contact_referent_email, contact_referent_phone, contact_referent_role",
    )
    .eq("organization_id", ctx.company.organization_id)
    .eq("referrer_company_id", ctx.company.id)
    .eq("company_id", company.id)
    .not("contact_referent_email", "is", null)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      contact_referent_first_name: string | null;
      contact_referent_last_name: string | null;
      contact_referent_email: string | null;
      contact_referent_phone: string | null;
      contact_referent_role: string | null;
    }>();

  if (lastReq && lastReq.contact_referent_email) {
    return {
      ok: true,
      found: true,
      contactReferent: {
        firstName: lastReq.contact_referent_first_name ?? "",
        lastName: lastReq.contact_referent_last_name ?? "",
        email: lastReq.contact_referent_email,
        phone: lastReq.contact_referent_phone ?? "",
        role: lastReq.contact_referent_role ?? "",
      },
    };
  }

  // 3. Fallback : contact principal de l'entreprise (table company_contacts).
  const { data: primaryContact } = await supabase
    .from("company_contacts")
    .select("first_name, last_name, email, phone, job_title")
    .eq("company_id", company.id)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle<{
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      job_title: string | null;
    }>();
  if (primaryContact?.email) {
    return {
      ok: true,
      found: true,
      contactReferent: {
        firstName: primaryContact.first_name ?? "",
        lastName: primaryContact.last_name ?? "",
        email: primaryContact.email,
        phone: primaryContact.phone ?? "",
        role: primaryContact.job_title ?? "",
      },
    };
  }

  return { ok: true, found: true, contactReferent: null };
}
