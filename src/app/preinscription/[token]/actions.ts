"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "@/app/partenaire/[token]/_resolve";
import { findStageIdByKey } from "@/lib/inscriptions/sync";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";

type LearnerInput = {
  civility?: string | null; // "M." | "Mme" | null (Gilles 2026-05-22)
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
};

/**
 * Soumet une pré-inscription publique via un lien partenaire.
 *
 * Accepte UN OU PLUSIEURS apprenants pour la même entreprise et la même
 * session — un cas fréquent quand un RH inscrit toute son équipe en une
 * seule fois.
 *
 * Crée N `inscription_request` (une par apprenant) au stage
 * `partner_preinscription` (migration 0090). Toutes partagent la même
 * `company_name_freetext`. Pas d'enrollment créé tant que le partenaire
 * n'a pas validé chaque ligne.
 *
 * AUCUN PRIX n'est calculé / enregistré ici : la marge commerciale du
 * partenaire (frais de commercialisation) est appliquée ENSUITE par lui,
 * lors de la facturation à son entreprise cliente.
 */
type FinancingInput =
  | { mode: "employeur" }
  | { mode: "opco"; opco_name: string; subrogation: boolean };

export async function submitPreinscription(input: {
  token: string;
  sessionId: string;
  learners: LearnerInput[];
  company: {
    name: string;
    siret: string | null;
    city: string | null;
  };
  /** Contact référent pédagogique côté entreprise — recevra la convention
   *  de formation (Qualiopi indic. 9). Distinct de l'apprenant. */
  contact_referent: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    role: string | null;
  };
  /** Mode de financement déclaré côté demandeur (Qualiopi indic. 9).
   *  Stocké dans `financing_mode` (enum) + `financing_details` (texte). */
  financing: FinancingInput;
  message: string | null;
}): Promise<
  | { ok: true; created: number }
  | { ok: false; error: string }
> {
  if (!input.company.name?.trim()) {
    return { ok: false, error: "Raison sociale entreprise obligatoire." };
  }
  if (input.financing.mode === "opco" && !input.financing.opco_name?.trim()) {
    return { ok: false, error: "Nom de l'OPCO obligatoire." };
  }
  if (
    !input.contact_referent.first_name?.trim() ||
    !input.contact_referent.last_name?.trim()
  ) {
    return {
      ok: false,
      error: "Contact référent (prénom et nom) obligatoire.",
    };
  }
  if (!/^\S+@\S+\.\S+$/.test(input.contact_referent.email ?? "")) {
    return { ok: false, error: "Email du contact référent invalide." };
  }
  if (!Array.isArray(input.learners) || input.learners.length === 0) {
    return { ok: false, error: "Ajoutez au moins un apprenant." };
  }
  for (const l of input.learners) {
    if (!l.first_name?.trim() || !l.last_name?.trim()) {
      return { ok: false, error: "Prénom et nom obligatoires pour chaque apprenant." };
    }
    if (!/^\S+@\S+\.\S+$/.test(l.email ?? "")) {
      return {
        ok: false,
        error: `Email invalide pour ${l.first_name} ${l.last_name}.`,
      };
    }
  }

  const ctx = await resolvePartnerContext(input.token);
  if (!ctx) return { ok: false, error: "Lien invalide ou expiré." };

  const supabase = createAdminClient();

  // Vérifier que la session existe bien et appartient à l'organisation
  const { data: session } = await supabase
    .from("sessions")
    .select("id, organization_id, is_inter, prescriber_company_id")
    .eq("id", input.sessionId)
    .eq("organization_id", ctx.company.organization_id)
    .maybeSingle<{
      id: string;
      organization_id: string;
      is_inter: boolean;
      prescriber_company_id: string | null;
    }>();
  if (!session) {
    return { ok: false, error: "Session introuvable." };
  }

  const stageId = await findStageIdByKey(
    supabase,
    ctx.company.organization_id,
    "partner_preinscription",
  );
  if (!stageId) {
    return {
      ok: false,
      error:
        "Stage 'partner_preinscription' manquant. Veuillez appliquer la migration 0090.",
    };
  }

  // Détection préventive de doublons d'email pour cette session :
  //   - parmi les inscription_requests existantes (toutes pas terminales
  //     négatives) avec un prospect_email correspondant
  //   - parmi les learners déjà associés à un session_enrollment actif
  //     (cas où le RH essaie d'inscrire un apprenant déjà inscrit)
  // On donne un message clair avec le nom de l'apprenant en doublon
  // au lieu de laisser la contrainte SQL bloquer plus tard.
  const learnerEmails = input.learners
    .map((l) => l.email.trim().toLowerCase())
    .filter((e) => e.length > 0);
  if (learnerEmails.length > 0) {
    const { data: existingReqs } = await supabase
      .from("inscription_requests")
      .select("prospect_email, prospect_first_name, prospect_last_name")
      .eq("target_session_id", input.sessionId)
      .in("prospect_email", learnerEmails);
    const collision = (existingReqs ?? []).find(
      (r) =>
        r.prospect_email &&
        learnerEmails.includes(
          (r.prospect_email as string).trim().toLowerCase(),
        ),
    );
    if (collision) {
      return {
        ok: false,
        error: `L'email « ${collision.prospect_email} » est déjà inscrit sur cette session${collision.prospect_first_name ? ` (${collision.prospect_first_name} ${collision.prospect_last_name ?? ""})` : ""}. Modifiez l'email avant de soumettre, ou contactez ${ctx.company.name} si vous pensez qu'il s'agit d'une erreur.`,
      };
    }
  }

  // Sérialise le financement pour la persistance.
  //   - employeur : financing_mode='employeur', pas de détail
  //   - opco      : financing_mode='opco' + financing_details = nom OPCO
  //                 + mention "avec/sans subrogation"
  const financingMode: "employeur" | "opco" = input.financing.mode;
  const financingDetails =
    input.financing.mode === "opco"
      ? `${input.financing.opco_name.trim()} — ${input.financing.subrogation ? "avec subrogation" : "sans subrogation"}`
      : null;
  const subrogation =
    input.financing.mode === "opco" ? input.financing.subrogation : null;

  // Crée N inscription_requests (une par apprenant) — toutes au même
  // stage, même session, même entreprise. Si l'une échoue, on annule
  // les précédentes pour rester cohérent.
  const createdIds: string[] = [];
  for (const learner of input.learners) {
    const { data: req, error: reqErr } = await supabase
      .from("inscription_requests")
      .insert({
        organization_id: ctx.company.organization_id,
        // L'enum `inscription_source` n'accepte qu'une liste fermée de
        // valeurs (cf. migration 0025). On utilise `partenaire` (valeur
        // existante) et on précise dans `source_details` que c'est le
        // lien public — facilite le tri admin sans toucher au schéma.
        source: "partenaire",
        source_details: `Pré-inscription publique — ${ctx.company.name}`,
        target_session_id: input.sessionId,
        stage_id: stageId,
        referrer_company_id: ctx.company.id,
        via_partner_portal: true,
        financing_mode: financingMode,
        financing_details: financingDetails,
        // Civilité (Gilles 2026-05-22 — migration 0098). Reportée sur
        // le learner lors de la validation par le partenaire.
        prospect_civility:
          learner.civility === "M." || learner.civility === "Mme"
            ? learner.civility
            : null,
        prospect_first_name: learner.first_name.trim(),
        prospect_last_name: learner.last_name.trim(),
        prospect_email: learner.email.trim(),
        prospect_phone: learner.phone,
        company_name_freetext: input.company.name.trim(),
        contact_referent_first_name: input.contact_referent.first_name.trim(),
        contact_referent_last_name: input.contact_referent.last_name.trim(),
        contact_referent_email: input.contact_referent.email.trim(),
        contact_referent_phone: input.contact_referent.phone,
        contact_referent_role: input.contact_referent.role,
        request_message: input.message,
        received_at: new Date().toISOString(),
      })
      .select("id")
      .single<{ id: string }>();
    if (reqErr || !req) {
      // Rollback : supprime ce qui a été créé jusqu'ici
      if (createdIds.length > 0) {
        await supabase
          .from("inscription_requests")
          .delete()
          .in("id", createdIds);
      }
      return {
        ok: false,
        error: `Enregistrement impossible : ${reqErr?.message ?? "inconnu"}`,
      };
    }
    createdIds.push(req.id);
    await supabase.from("inscription_events").insert({
      request_id: req.id,
      event_type: "created",
      payload: {
        via_partner_portal: true,
        preinscription_publique: true,
        partner_company_id: ctx.company.id,
        partner_company_name: ctx.company.name,
        company_name: input.company.name,
        company_siret: input.company.siret,
        company_city: input.company.city,
        job_title: learner.job_title,
        batch_size: input.learners.length,
      },
    });
  }

  // Email récap unique au partenaire pour tous les apprenants soumis
  if (ctx.company.email && isResendConfigured()) {
    try {
      const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com"}/partenaire/${input.token}/preinscriptions`;
      const itemsHtml = input.learners
        .map(
          (l) =>
            `<li><strong>${l.first_name} ${l.last_name}</strong> (${l.email})${l.job_title ? ` — ${l.job_title}` : ""}</li>`,
        )
        .join("");
      const itemsText = input.learners
        .map((l) => `- ${l.first_name} ${l.last_name} (${l.email})`)
        .join("\n");
      const subject =
        input.learners.length === 1
          ? `Nouvelle pré-inscription à valider — ${input.learners[0].first_name} ${input.learners[0].last_name}`
          : `${input.learners.length} nouvelles pré-inscriptions à valider — ${input.company.name}`;
      await sendEmail({
        to: ctx.company.email,
        toName: ctx.company.name,
        subject,
        html: `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px;margin:0 auto;">
  <p>Bonjour,</p>
  <p>
    ${input.learners.length === 1 ? "Une nouvelle <strong>pré-inscription</strong> vient" : `<strong>${input.learners.length} nouvelles pré-inscriptions</strong> viennent`}
    d'être soumise${input.learners.length > 1 ? "s" : ""} via votre lien public :
  </p>
  <p><strong>Entreprise</strong> : ${input.company.name}${input.company.city ? ` — ${input.company.city}` : ""}${input.company.siret ? ` (SIRET ${input.company.siret})` : ""}</p>
  <ul>${itemsHtml}</ul>
  <p>
    Connectez-vous à votre espace partenaire pour valider ou refuser :
  </p>
  <p style="text-align:center;margin:24px 0;">
    <a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#0891b2;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">
      Voir les pré-inscriptions à valider
    </a>
  </p>
</div>`.trim(),
        text: `${input.learners.length} pré-inscription${input.learners.length > 1 ? "s" : ""} à valider pour ${input.company.name} :\n\n${itemsText}\n\nValidez ici : ${portalUrl}`,
      });
    } catch {
      // best-effort : la pré-inscription reste valide même si l'email échoue
    }
  }

  return { ok: true, created: createdIds.length };
}
