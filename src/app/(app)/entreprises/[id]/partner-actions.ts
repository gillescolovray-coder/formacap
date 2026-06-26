"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";
import { getOrCreatePartnerPortalToken } from "@/lib/portal/partner-token";

/**
 * Envoie par email le lien d'accès au portail partenaire à un CONTACT de
 * l'entreprise (Gilles 2026-06-26), avec une explication du fonctionnement
 * et l'invitation à conserver le lien pour ses prochaines sessions. Trace le
 * dernier envoi (date/heure + destinataire) sur la fiche entreprise.
 */
export async function sendPartnerPortalLink(
  companyId: string,
  contactId: string,
): Promise<{ ok: boolean; error?: string; recipient?: string }> {
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };
  if (!isResendConfigured())
    return { ok: false, error: "Envoi d'email non configuré." };

  const admin = createAdminClient();
  const { data: company } = await admin
    .from("companies")
    .select("id, organization_id, name, type")
    .eq("id", companyId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      name: string;
      type: string | null;
    }>();
  if (!company) return { ok: false, error: "Entreprise introuvable." };

  // Autorisation : l'utilisateur doit appartenir à l'organisation.
  const { data: memberships } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true);
  if (
    !(memberships ?? []).some(
      (m) => m.organization_id === company.organization_id,
    )
  ) {
    return { ok: false, error: "Non autorisé pour cette organisation." };
  }

  const { data: contact } = await admin
    .from("company_contacts")
    .select("id, company_id, first_name, last_name, email")
    .eq("id", contactId)
    .maybeSingle<{
      id: string;
      company_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }>();
  if (!contact || contact.company_id !== companyId) {
    return { ok: false, error: "Contact introuvable." };
  }
  if (!contact.email) {
    return { ok: false, error: "Ce contact n'a pas d'email renseigné." };
  }

  // Token + URL du portail (idempotent : crée si besoin).
  const { token } = await getOrCreatePartnerPortalToken(userClient, companyId);
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const portalUrl = `${proto}://${host}/partenaire/${token}`;

  const { data: org } = await admin
    .from("organizations")
    .select("name, email")
    .eq("id", company.organization_id)
    .maybeSingle<{ name: string; email: string | null }>();
  const orgName = org?.name ?? "CAP NUMERIQUE";
  const contactName = [contact.first_name, contact.last_name]
    .filter(Boolean)
    .join(" ");
  const isOf = company.type === "of";

  const subject = `${orgName} : votre accès au portail partenaire`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
      <p>Bonjour <strong>${contactName || "—"}</strong>,</p>
      <p><strong>${orgName}</strong> met à votre disposition un <strong>espace partenaire privé</strong> dédié à
      <strong>${company.name}</strong>. Vous y pouvez à tout moment :</p>
      <ul style="padding-left:20px;">
        <li><strong>Consulter vos sessions</strong> à venir et passées (catalogue + vos sessions dédiées) ;</li>
        <li><strong>Inscrire vos apprenants</strong> en autonomie ;</li>
        ${isOf ? "<li>Suivre les <strong>résultats des quiz</strong> de vos apprenants ;</li>" : ""}
        <li>Accéder aux <strong>documents partagés</strong> et supports des sessions.</li>
      </ul>
      <p style="text-align:center;margin:24px 0;">
        <a href="${portalUrl}" style="display:inline-block;background:#0e7490;color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;font-size:15px;">🤝 Accéder à mon espace partenaire</a>
      </p>
      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px 14px;font-size:13px;color:#92400e;">
        ⚠️ <strong>Important :</strong> conservez précieusement cet email et surtout ce lien.
        C'est votre <strong>accès permanent</strong> pour consulter et inscrire vos apprenants à
        <strong>toutes vos prochaines sessions</strong>. Il est personnel à ${company.name} — ne le diffusez pas publiquement.
      </div>
      <p style="font-size:12px;color:#6b7280;background:#f3f4f6;padding:10px 12px;border-radius:6px;margin-top:14px;">
        Lien direct :<br/><a href="${portalUrl}" style="color:#0e7490;word-break:break-all;">${portalUrl}</a>
      </p>
      <p style="margin-top:24px;">Bien cordialement,<br/><strong>${orgName}</strong></p>
    </div>`;
  const text = `Bonjour ${contactName || "—"},

${orgName} met a votre disposition un espace partenaire prive dedie a ${company.name} :
consulter vos sessions, inscrire vos apprenants, acceder aux documents partages.

Votre acces : ${portalUrl}

IMPORTANT : conservez precieusement cet email et surtout ce lien. C'est votre acces permanent
pour vos prochaines sessions. Il est personnel a ${company.name}.

Cordialement,
${orgName}`;

  const res = await sendEmail({
    to: contact.email,
    toName: contactName,
    subject,
    html,
    text,
    replyTo: org?.email ?? undefined,
  });
  if (!res.ok) return { ok: false, error: res.error };

  // Trace du dernier envoi (best-effort, migration 0141).
  try {
    await admin
      .from("companies")
      .update({
        partner_portal_link_sent_at: new Date().toISOString(),
        partner_portal_link_sent_to: contactName || contact.email,
      })
      .eq("id", companyId);
  } catch {
    /* colonnes absentes -> on ignore la trace */
  }
  revalidatePath(`/entreprises/${companyId}`);
  return { ok: true, recipient: contact.email };
}
import {
  deletePartnerPrice,
  upsertPartnerPrice,
} from "@/lib/portal/partner-pricing";

/**
 * Active (génère si besoin) le token portail partenaire pour une
 * entreprise OF/prescripteur. Idempotent : si le token existe déjà,
 * renvoie celui-ci.
 */
export async function activatePartnerPortal(
  companyId: string,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const { token } = await getOrCreatePartnerPortalToken(supabase, companyId);
    revalidatePath(`/entreprises/${companyId}`);
    return { ok: true, token };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erreur inconnue",
    };
  }
}

/**
 * Révoque le token portail (le partenaire ne pourra plus accéder
 * via l'ancienne URL). Un nouveau token sera généré au prochain
 * « Activer ».
 */
export async function revokePartnerPortal(
  companyId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("partner_portal_tokens")
    .delete()
    .eq("company_id", companyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/entreprises/${companyId}`);
  return { ok: true };
}

/**
 * Met à jour les tarifs généraux du partenaire (OF ou prescripteur).
 *
 * Depuis 2026-05-18 (harmonisation UX), les OF utilisent eux aussi les
 * deux tarifs jour distanciel + présentiel (au lieu du forfait historique
 * `partner_quiz_unit_price_ht`). Ce dernier reste lu en fallback côté
 * `computeEffectivePartnerPrice` pour les OF qui n'ont pas encore migré.
 */
export async function savePartnerGeneralRate(
  companyId: string,
  rates: {
    /** Forfait HT par apprenant pour l'accès aux quiz (legacy OF). */
    quizUnitPriceHt?: number | null;
    /** Tarif HT par jour pour les formations distanciel. */
    dailyRateDistancielHt?: number | null;
    /** Tarif HT par jour pour les formations présentiel. */
    dailyRatePresentielHt?: number | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  // FIX Gilles 2026-05-22 : auth check user pour la securite, puis
  // utilisation de createAdminClient pour bypasser RLS sur l'UPDATE.
  // Cause : les policies RLS de la table companies sur les champs
  // partner_* peuvent bloquer silencieusement l'UPDATE quand l'utilisateur
  // n'a pas le bon role, et l'ancienne version retournait { ok: true }
  // meme si 0 ligne avait ete modifiee → le tarif n'etait pas sauve.
  const userSupabase = await createClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié" };

  const supabase = createAdminClient();
  const { data: company } = await supabase
    .from("companies")
    .select("type")
    .eq("id", companyId)
    .maybeSingle<{ type: string }>();
  if (!company) return { ok: false, error: "Entreprise introuvable" };

  if (company.type !== "of" && company.type !== "prescripteur") {
    return { ok: false, error: "Type d'entreprise non éligible." };
  }

  const sanitize = (n: number | null | undefined): number | null => {
    if (n === null || n === undefined) return null;
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  };

  const patch: Record<string, number | null> = {};
  if (rates.dailyRateDistancielHt !== undefined) {
    patch.partner_daily_rate_distanciel_ht = sanitize(
      rates.dailyRateDistancielHt,
    );
  }
  if (rates.dailyRatePresentielHt !== undefined) {
    patch.partner_daily_rate_presentiel_ht = sanitize(
      rates.dailyRatePresentielHt,
    );
  }
  if (rates.quizUnitPriceHt !== undefined) {
    patch.partner_quiz_unit_price_ht = sanitize(rates.quizUnitPriceHt);
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true };
  }

  // .select() pour verifier que l'UPDATE a touche au moins 1 ligne.
  const { data: updated, error } = await supabase
    .from("companies")
    .update(patch)
    .eq("id", companyId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: "Aucune ligne modifiée — vérifiez que la société existe.",
    };
  }
  revalidatePath(`/entreprises/${companyId}`);
  return { ok: true };
}

/**
 * Met à jour les toggles de visibilité du catalogue dans le portail
 * partenaire (uniquement pertinent pour les prescripteurs).
 */
export async function savePartnerPortalVisibility(
  companyId: string,
  toggles: { showInterCatalog: boolean; showOwnIntra: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({
      partner_portal_show_inter_catalog: toggles.showInterCatalog,
      partner_portal_show_own_intra: toggles.showOwnIntra,
    })
    .eq("id", companyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/entreprises/${companyId}`);
  return { ok: true };
}

const LOGO_VALID_MIMES = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
];
const LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 Mo

function extractLogoPath(url: string): string | null {
  const marker = "/company-logos/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.substring(idx + marker.length);
}

/**
 * Upload d'un logo pour une entreprise partenaire.
 * - Vérifie taille (max 2 Mo) et type (PNG / JPEG / SVG / WebP)
 * - Stocke dans le bucket `company-logos` sous le path `{companyId}/...`
 * - Met à jour `companies.logo_url` avec l'URL publique
 * - Nettoie l'ancien fichier si présent
 *
 * Le formData doit contenir un champ « logo » de type File.
 */
export async function uploadPartnerLogo(
  companyId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string; url?: string }> {
  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, error: "Aucun fichier sélectionné." };
  }
  if (file.size > LOGO_MAX_SIZE_BYTES) {
    return { ok: false, error: "Fichier trop volumineux (max 2 Mo)." };
  }
  if (!LOGO_VALID_MIMES.includes(file.type)) {
    return {
      ok: false,
      error: "Format non supporté (PNG, JPEG, SVG ou WebP attendu).",
    };
  }

  // Auth check via session utilisateur (l'utilisateur doit être connecté
  // côté app — middleware s'en occupe déjà mais on re-valide).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };

  // Storage operations via service_role : les policies RLS sur le
  // bucket sont délicates à passer côté browser (jointure avec companies
  // qui a aussi sa propre RLS). Comme cette action est déjà protégée par
  // le middleware Next, on bypass proprement côté serveur.
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("companies")
    .select("logo_url")
    .eq("id", companyId)
    .maybeSingle<{ logo_url: string | null }>();

  const extGuess = file.name.includes(".")
    ? file.name.split(".").pop()
    : undefined;
  const ext =
    extGuess && /^[a-zA-Z0-9]+$/.test(extGuess)
      ? extGuess.toLowerCase()
      : file.type === "image/svg+xml"
        ? "svg"
        : file.type === "image/jpeg"
          ? "jpg"
          : file.type === "image/webp"
            ? "webp"
            : "png";
  const fileName = `${companyId}/logo-${Date.now()}.${ext}`;

  const { error: uploadErr } = await admin.storage
    .from("company-logos")
    .upload(fileName, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadErr) {
    return { ok: false, error: `Upload impossible : ${uploadErr.message}` };
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("company-logos").getPublicUrl(fileName);

  const { error: updateErr } = await admin
    .from("companies")
    .update({ logo_url: publicUrl })
    .eq("id", companyId);
  if (updateErr) {
    await admin.storage.from("company-logos").remove([fileName]);
    return {
      ok: false,
      error: `Enregistrement impossible : ${updateErr.message}`,
    };
  }

  if (existing?.logo_url) {
    const oldPath = extractLogoPath(existing.logo_url);
    if (oldPath && oldPath !== fileName) {
      await admin.storage.from("company-logos").remove([oldPath]);
    }
  }

  revalidatePath(`/entreprises/${companyId}`);
  return { ok: true, url: publicUrl };
}

/** Supprime le logo (fichier + URL en base). */
export async function deletePartnerLogo(
  companyId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("companies")
    .select("logo_url")
    .eq("id", companyId)
    .maybeSingle<{ logo_url: string | null }>();
  if (existing?.logo_url) {
    const oldPath = extractLogoPath(existing.logo_url);
    if (oldPath) {
      await admin.storage.from("company-logos").remove([oldPath]);
    }
  }
  const { error } = await admin
    .from("companies")
    .update({ logo_url: null })
    .eq("id", companyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/entreprises/${companyId}`);
  return { ok: true };
}

/**
 * CAS 3 — Tarif sous-traitance : montants HT par jour que CAP NUMERIQUE
 * facture a cet OF organisateur quand CAP est sous-traitant
 * (independant du nombre d apprenants). Refonte tarification 2026-05-31.
 */
export async function saveSubcontractingRate(
  companyId: string,
  rates: {
    distancielHt?: number | null;
    presentielHt?: number | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const userSupabase = await createClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié" };

  const supabase = createAdminClient();
  const sanitize = (n: number | null | undefined): number | null => {
    if (n === null || n === undefined) return null;
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  };

  const patch: Record<string, number | null> = {};
  if (rates.distancielHt !== undefined) {
    patch.subcontracting_daily_rate_distanciel_ht = sanitize(rates.distancielHt);
  }
  if (rates.presentielHt !== undefined) {
    patch.subcontracting_daily_rate_presentiel_ht = sanitize(rates.presentielHt);
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { data: updated, error } = await supabase
    .from("companies")
    .update(patch)
    .eq("id", companyId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Aucune ligne modifiée." };
  }
  revalidatePath(`/entreprises/${companyId}`);
  return { ok: true };
}

/**
 * CAS 2b — Commission prescripteur : pourcentage ET/OU forfait fixe HT
 * verses au prescripteur. Refonte tarification 2026-05-31.
 */
export async function savePrescripteurCommission(
  companyId: string,
  commission: {
    ratePct?: number | null;
    flatHt?: number | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const userSupabase = await createClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié" };

  const supabase = createAdminClient();
  const sanitizeRate = (n: number | null | undefined): number | null => {
    if (n === null || n === undefined) return null;
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    return n;
  };
  const sanitizeFlat = (n: number | null | undefined): number | null => {
    if (n === null || n === undefined) return null;
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  };

  const patch: Record<string, number | null> = {};
  if (commission.ratePct !== undefined) {
    patch.prescripteur_commission_rate_pct = sanitizeRate(commission.ratePct);
  }
  if (commission.flatHt !== undefined) {
    patch.prescripteur_commission_flat_ht = sanitizeFlat(commission.flatHt);
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { data: updated, error } = await supabase
    .from("companies")
    .update(patch)
    .eq("id", companyId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Aucune ligne modifiée." };
  }
  revalidatePath(`/entreprises/${companyId}`);
  return { ok: true };
}

export async function savePartnerPrice(
  companyId: string,
  formationId: string,
  unitPriceHt: number,
  notes: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const res = await upsertPartnerPrice(supabase, {
    companyId,
    formationId,
    unitPriceHt,
    notes,
  });
  if (res.ok) revalidatePath(`/entreprises/${companyId}`);
  return res;
}

export async function removePartnerPrice(
  companyId: string,
  formationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const res = await deletePartnerPrice(supabase, companyId, formationId);
  if (res.ok) revalidatePath(`/entreprises/${companyId}`);
  return res;
}
