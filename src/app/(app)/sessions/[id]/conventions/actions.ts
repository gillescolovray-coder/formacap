"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { renderPdf } from "@/lib/pdf/render";
import {
  conventionPdfTemplatesWithLegalHtml,
  fetchImageAsDataUrl,
} from "@/lib/pdf/templates";
import { overlayBannerOnFirstPage } from "@/lib/pdf/overlay";
import { loadConventionEmailTemplate } from "@/lib/document-templates/loader";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";
import {
  getReferentEmailsForSessionCompany,
  setReferentContactsForSessionCompany,
} from "@/lib/inscriptions/referents";
import {
  computeConventionAmount,
  type SessionPricingConfig,
} from "@/lib/pricing/compute";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Calcule le prix unitaire HT + total HT à appliquer sur la convention
 * d'UNE société pour UNE session (R7 — Gilles 2026-05-14).
 *
 *   • Si la session a la nouvelle tarification cascade (pricing_mode +
 *     price_*), on utilise `computeConventionAmount` qui gère per_learner
 *     ET forfait (avec split proportionnel inter-sociétés en INTRA).
 *   • Si la session est pré-migration (pricing_mode null), on retombe
 *     sur l'ancien calcul : unit (session.amount_ht ou formation.price)
 *     × nbApprenants de la société.
 *
 * Le nombre de jours = count(session_days) — source de vérité du planning,
 * pas l'amplitude start_date → end_date (qui peut inclure des jours non
 * programmés).
 */
async function computeConventionPricing(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  companyId: string,
): Promise<{ unitPrice: number; totalHt: number }> {
  // Session + champs pricing R7 + fallback legacy
  const { data: sessionRow } = await supabase
    .from("sessions")
    .select(
      "amount_ht, pricing_mode, price_per_day_ht, price_forfait_ht, price_extra_per_day_ht, pricing_threshold, formation:formations(public_price_excl_tax, price_company)",
    )
    .eq("id", sessionId)
    .maybeSingle<{
      amount_ht: number | null;
      pricing_mode: "per_learner" | "forfait" | null;
      price_per_day_ht: number | null;
      price_forfait_ht: number | null;
      price_extra_per_day_ht: number | null;
      pricing_threshold: number | null;
      formation: {
        public_price_excl_tax: number | null;
        price_company: number | null;
      } | null;
    }>();

  // Nb d'apprenants de cette société sur cette session (cohort facturable).
  // FIX 2026-05-22 (Gilles) : on prend le MAX entre :
  //   • enrollments avec learner.company_id = companyId
  //   • inscription_requests avec company_id = companyId
  // Cela évite le cas du bug constaté : conventions créées AVANT que les
  // enrollments miroirs soient générés → nbApprenantsCompany = 0 → montant
  // figé à 0. En lisant aussi inscription_requests, on capture l'intention
  // métier même si la sync miroir n'a pas encore eu lieu.
  const [{ count: enrollCount }, { count: reqCount }] = await Promise.all([
    supabase
      .from("session_enrollments")
      .select("id, learner:learners!inner(company_id)", {
        count: "exact",
        head: true,
      })
      .eq("session_id", sessionId)
      .eq("learner.company_id", companyId),
    supabase
      .from("inscription_requests")
      .select("id", { count: "exact", head: true })
      .eq("target_session_id", sessionId)
      .eq("company_id", companyId),
  ]);
  const nbApprenantsCompany = Math.max(enrollCount ?? 0, reqCount ?? 0);

  // Cascade R7 active ?
  if (sessionRow?.pricing_mode) {
    // Nb total d'apprenants sur la session (toutes sociétés confondues)
    const { count: totalCount } = await supabase
      .from("session_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    // Nb réel de jours = count(session_days)
    const { count: daysCount } = await supabase
      .from("session_days")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    const cfg: SessionPricingConfig = {
      mode: sessionRow.pricing_mode,
      pricePerDayHt: sessionRow.price_per_day_ht,
      priceForfaitHt: sessionRow.price_forfait_ht,
      priceExtraPerDayHt: sessionRow.price_extra_per_day_ht,
      threshold: sessionRow.pricing_threshold,
    };
    const { unitHt, totalHt } = computeConventionAmount(
      cfg,
      nbApprenantsCompany,
      totalCount ?? 0,
      daysCount ?? 0,
    );
    return { unitPrice: unitHt, totalHt };
  }

  // ----- Fallback legacy (sessions créées avant la migration 0064) -----
  const legacyUnit =
    sessionRow?.amount_ht ??
    sessionRow?.formation?.price_company ??
    sessionRow?.formation?.public_price_excl_tax ??
    0;
  if (Number(legacyUnit) > 0) {
    return {
      unitPrice: Number(legacyUnit),
      totalHt: Number(legacyUnit) * nbApprenantsCompany,
    };
  }

  // Dernier recours : moyenne des quote_amount_ht des inscriptions de
  // cette société pour cette session (Gilles 2026-05-22 — fix conventions
  // à 0 € quand la session n'a pas de pricing cascade R7 ni prix legacy).
  //
  // FIX 2026-05-22 (Gilles bug Mme TORRES) : on cherche les quotes par
  // 2 voies différentes pour être robuste :
  //   • inscription_requests.company_id (cas habituel)
  //   • via enrollments → learner.company_id (cas inscriptions miroirs
  //     réparées où inscription.company_id peut être différent)
  const quotesFound: number[] = [];

  // Voie 1 : par inscription_requests.company_id
  const { data: quotes1 } = await supabase
    .from("inscription_requests")
    .select("quote_amount_ht")
    .eq("target_session_id", sessionId)
    .eq("company_id", companyId)
    .not("quote_amount_ht", "is", null);
  for (const r of (quotes1 ?? []) as Array<{ quote_amount_ht: number | null }>) {
    if (r.quote_amount_ht) quotesFound.push(Number(r.quote_amount_ht));
  }

  // Voie 2 : par learner.company_id via enrollments + leur inscription_request
  if (quotesFound.length === 0) {
    const { data: enrollWithReq } = await supabase
      .from("session_enrollments")
      .select(
        "inscription_request_id, learner:learners!inner(company_id), request:inscription_requests(quote_amount_ht)",
      )
      .eq("session_id", sessionId);
    for (const row of (enrollWithReq ?? []) as unknown as Array<{
      learner:
        | { company_id: string | null }
        | Array<{ company_id: string | null }>
        | null;
      request:
        | { quote_amount_ht: number | null }
        | Array<{ quote_amount_ht: number | null }>
        | null;
    }>) {
      const l = Array.isArray(row.learner) ? row.learner[0] : row.learner;
      if (l?.company_id !== companyId) continue;
      const req = Array.isArray(row.request) ? row.request[0] : row.request;
      if (req?.quote_amount_ht) quotesFound.push(Number(req.quote_amount_ht));
    }
  }

  if (quotesFound.length > 0) {
    const sum = quotesFound.reduce((acc, n) => acc + n, 0);
    const avg = sum / quotesFound.length;
    if (avg > 0) {
      return {
        unitPrice: avg,
        totalHt: avg * Math.max(nbApprenantsCompany, quotesFound.length),
      };
    }
  }

  console.warn(
    "[computeConventionPricing] aucun montant trouvé — retour 0",
    {
      sessionId,
      companyId,
      nbApprenantsCompany,
      pricingMode: sessionRow?.pricing_mode,
      legacyUnit,
    },
  );
  return { unitPrice: 0, totalHt: 0 };
}

async function getAppOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

async function getCookiesForwarder() {
  const { cookies } = await import("next/headers");
  const c = await cookies();
  return c.getAll().map((x) => ({ name: x.name, value: x.value }));
}

export type CreateConventionResult =
  | { ok: true; conventionId: string }
  | { ok: false; error: string };

/**
 * Crée (ou récupère) la convention pour un couple session × entreprise.
 *
 * Choix du signataire (par ordre de priorité) :
 *  1. Contact RH "principal" de l'entreprise s'il existe avec un email
 *  2. À défaut (cas PME où RH = apprenant) : 1er apprenant de la session
 *     pour cette entreprise — il signera en tant que représentant légal
 *  3. À défaut : convention créée en brouillon mais sans destinataire
 *     (l'utilisateur devra renseigner avant d'envoyer)
 */
export async function ensureConvention(
  sessionId: string,
  companyId: string,
): Promise<CreateConventionResult> {
  const supabase = await createClient();

  // Existe déjà ?
  const { data: existing } = await supabase
    .from("session_conventions")
    .select("id")
    .eq("session_id", sessionId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (existing) return { ok: true, conventionId: existing.id as string };

  // 1) Contact principal de l'entreprise (priorité)
  const { data: contact } = await supabase
    .from("company_contacts")
    .select("id, first_name, last_name, email")
    .eq("company_id", companyId)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }>();

  let contactId: string | null = contact?.id ?? null;
  let contactName: string | null = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(" ")
    : null;
  let contactEmail: string | null = contact?.email ?? null;

  // 2) Fallback : 1er apprenant inscrit de cette entreprise sur cette session
  if (!contactEmail) {
    const { data: enrollments } = await supabase
      .from("session_enrollments")
      .select(
        "id, learner:learners(first_name, last_name, email, company_id)",
      )
      .eq("session_id", sessionId)
      .order("enrolled_at", { ascending: true });

    type Row = {
      id: string;
      learner: {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        company_id: string | null;
      } | null;
    };
    const apprenantSignataire = ((enrollments ?? []) as unknown as Row[]).find(
      (e) => e.learner?.company_id === companyId && e.learner?.email,
    );
    if (apprenantSignataire?.learner) {
      contactId = null;
      contactName = [
        apprenantSignataire.learner.first_name,
        apprenantSignataire.learner.last_name,
      ]
        .filter(Boolean)
        .join(" ");
      contactEmail = apprenantSignataire.learner.email;
    }
  }

  // ----- Calcul du prix HT (R7 — cascade tarification) -----
  // Cascade en place depuis 0064 : on lit pricing_mode + price_* sur la
  // session. Si la session est pré-migration et que ces champs sont nuls,
  // on retombe sur l'ancien fallback (amount_ht / formation.price_*).
  const { unitPrice, totalHt } = await computeConventionPricing(
    supabase,
    sessionId,
    companyId,
  );

  const { data: created, error } = await supabase
    .from("session_conventions")
    .insert({
      session_id: sessionId,
      company_id: companyId,
      status: "draft",
      contact_id: contactId,
      contact_name: contactName,
      contact_email: contactEmail,
      amount_ht_unit: unitPrice,
      amount_ht_total: totalHt,
    })
    .select("id")
    .single();

  if (error || !created) {
    return { ok: false, error: error?.message ?? "Création échouée." };
  }
  revalidatePath(`/sessions/${sessionId}/conventions`);
  return { ok: true, conventionId: created.id as string };
}

export type SendConventionResult =
  | { ok: true; publicUrl: string }
  | { ok: false; error: string };

/**
 * Marque la convention d'une société comme 'obsolete' suite à une
 * modification des inscriptions (annulation, suppression, ajout
 * d'apprenant) — uniquement si la session n'a PAS encore démarré.
 *
 * Règle métier R1 : si la session a commencé, on ne touche pas à la
 * convention (cohérence contractuelle Qualiopi).
 *
 * Appelé depuis les actions d'inscription quand un changement
 * affecte la liste des apprenants d'une société.
 */
export async function invalidateConventionForCompany(
  sessionId: string,
  companyId: string,
  reason: string,
): Promise<{ obsoleted: boolean }> {
  const supabase = await createClient();

  // Vérifier la date de session
  const { data: session } = await supabase
    .from("sessions")
    .select("start_date")
    .eq("id", sessionId)
    .maybeSingle<{ start_date: string }>();

  if (!session) return { obsoleted: false };

  // Si session déjà démarrée, on ne touche pas
  const sessionStart = new Date(session.start_date);
  sessionStart.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (sessionStart < today) {
    return { obsoleted: false };
  }

  // Trouver la convention concernée
  const { data: convention } = await supabase
    .from("session_conventions")
    .select("id, status")
    .eq("session_id", sessionId)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string; status: string }>();

  // Si pas de convention ou déjà obsolete/cancelled, ne rien faire
  if (
    !convention ||
    convention.status === "obsolete" ||
    convention.status === "cancelled"
  ) {
    return { obsoleted: false };
  }

  // Marquer comme obsolete
  await supabase
    .from("session_conventions")
    .update({
      status: "obsolete",
      obsolete_reason: reason,
      obsoleted_at: new Date().toISOString(),
    })
    .eq("id", convention.id);

  revalidatePath(`/sessions/${sessionId}/conventions`);
  return { obsoleted: true };
}

/**
 * Met à jour les champs editable d'une convention (prix unitaire,
 * mode de financement, contact RH).
 */
export async function updateConvention(
  sessionId: string,
  conventionId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const rawUnit = formData.get("amount_ht_unit");
  const amountUnit =
    rawUnit !== null && String(rawUnit).trim() !== ""
      ? Number(String(rawUnit).replace(",", "."))
      : null;
  if (amountUnit !== null && (!Number.isFinite(amountUnit) || amountUnit < 0)) {
    return { ok: false, error: "Prix unitaire invalide." };
  }

  const rawMode = formData.get("financing_mode");
  const financingMode =
    rawMode !== null && String(rawMode).trim() !== "" ? String(rawMode) : null;

  const contactName = formData.get("contact_name");
  const contactEmail = formData.get("contact_email");

  // Récupérer la société pour le recalcul du total HT
  const { data: conv } = await supabase
    .from("session_conventions")
    .select("company_id")
    .eq("id", conventionId)
    .maybeSingle<{ company_id: string }>();
  if (!conv) return { ok: false, error: "Convention introuvable." };

  // Total HT : si l'utilisateur a saisi un prix unitaire manuel, on
  // applique l'ancienne formule unit × nbApprenants (override commercial).
  // Sinon (pas de saisie ou champ vidé), on recalcule depuis la cascade
  // R7 — utile quand on ouvre la convention après avoir ajouté/retiré
  // un apprenant : le total se rafraîchit automatiquement.
  let unitForSave: number | null = amountUnit;
  let totalHt: number | null = null;
  if (amountUnit !== null) {
    const { count: companyCount } = await supabase
      .from("session_enrollments")
      .select("id, learner:learners!inner(company_id)", {
        count: "exact",
        head: true,
      })
      .eq("session_id", sessionId)
      .eq("learner.company_id", conv.company_id);
    totalHt = amountUnit * (companyCount ?? 0);
  } else {
    const computed = await computeConventionPricing(
      supabase,
      sessionId,
      conv.company_id,
    );
    unitForSave = computed.unitPrice;
    totalHt = computed.totalHt;
  }

  const updatePayload: Record<string, unknown> = {};
  if (unitForSave !== null) updatePayload.amount_ht_unit = unitForSave;
  if (totalHt !== null) updatePayload.amount_ht_total = totalHt;
  if (financingMode !== null) updatePayload.financing_mode = financingMode;
  if (contactName !== null)
    updatePayload.contact_name = String(contactName).trim() || null;
  if (contactEmail !== null)
    updatePayload.contact_email = String(contactEmail).trim() || null;

  const { error } = await supabase
    .from("session_conventions")
    .update(updatePayload)
    .eq("id", conventionId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/sessions/${sessionId}/conventions`);
  return { ok: true };
}

/**
 * Met à jour la liste des référents pédagogiques (contacts de la
 * société) pour une session × société. Synchronise la table
 * inscription_referent_contacts pour TOUTES les inscriptions des
 * apprenants de cette société sur cette session. Les référents
 * reçoivent les documents (convention, convocation, attestation…) ;
 * si la liste est vide, c'est l'apprenant qui reçoit par défaut.
 */
export async function saveSessionCompanyReferents(
  sessionId: string,
  companyId: string,
  contactIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const res = await setReferentContactsForSessionCompany(
    supabase,
    sessionId,
    companyId,
    contactIds,
  );
  if (!res.ok) return res;
  revalidatePath(`/sessions/${sessionId}/conventions`);
  return { ok: true };
}

/**
 * Annule une convention (statut 'cancelled'). Utile pour :
 *  - Corriger une faute (orthographe apprenant) → on annule + recrée
 *  - Ajouter un apprenant inscrit après coup → idem
 *
 * Une fois annulée, la société redevient "Non créée" dans la liste et
 * on peut générer une nouvelle convention complète.
 */
/**
 * Garantit l'existence d'un token de signature pour une convention et
 * renvoie l'URL publique de signature à partager (lien direct + QR).
 *
 * Gilles 2026-05-22 : permet de partager le lien hors email (SMS,
 * WhatsApp, téléphone) quand l'email est filtré par Outlook / Mailinblack
 * ou tout autre anti-spam.
 *
 * - Si un token actif existe déjà → on le réutilise (pas de duplication)
 * - Sinon, on en crée un, valable 30 jours
 */
export async function ensureConventionShareLink(
  conventionId: string,
): Promise<
  | { ok: true; url: string; token: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();

  // Token actif existant ?
  const { data: existing } = await supabase
    .from("signature_links")
    .select("token, expires_at")
    .eq("convention_id", conventionId)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ token: string; expires_at: string }>();

  let token = existing?.token ?? null;

  if (!token) {
    const newToken = generateToken();
    const { error } = await supabase.from("signature_links").insert({
      convention_id: conventionId,
      enrollment_id: null,
      token: newToken,
      expires_at: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
    if (error) return { ok: false, error: error.message };
    token = newToken;
  }

  const origin = await getAppOrigin();
  const url = `${origin}/conventions/sign/${token}`;
  return { ok: true, url, token };
}

export async function cancelConvention(
  sessionId: string,
  conventionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  // On supprime la convention (cascade : signature_links rattaches).
  // Solution plus simple que "statut cancelled" qui exigerait des
  // filtres partout dans le code.
  const { error } = await supabase
    .from("session_conventions")
    .delete()
    .eq("id", conventionId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/sessions/${sessionId}/conventions`);
  return { ok: true };
}

/**
 * Génère le PDF de la convention, crée un token de signature et envoie
 * l'email au contact RH avec le PDF en pièce jointe + le lien de signature.
 */
export async function sendConvention(
  sessionId: string,
  conventionId: string,
): Promise<SendConventionResult> {
  if (!isResendConfigured()) {
    return { ok: false, error: "Resend non configuré." };
  }
  const supabase = await createClient();

  // Récupération convention + session + entreprise
  const { data: convention } = await supabase
    .from("session_conventions")
    .select(
      "id, contact_name, contact_email, company_id, amount_ht_unit, amount_ht_total, session:sessions(organization_id, start_date, end_date, modality, location, location_ref:formation_locations!location_id(name, address, postal_code, city), formation:formations(title, duration_hours, duration_days)), company:companies(name)",
    )
    .eq("id", conventionId)
    .maybeSingle<{
      id: string;
      contact_name: string | null;
      contact_email: string | null;
      company_id: string;
      amount_ht_unit: number | null;
      amount_ht_total: number | null;
      session: {
        organization_id: string;
        start_date: string | null;
        end_date: string | null;
        modality: "presentiel" | "distanciel" | "hybride" | null;
        location: string | null;
        location_ref: {
          name: string | null;
          address: string | null;
          postal_code: string | null;
          city: string | null;
        } | null;
        formation: {
          title: string;
          duration_hours: number | null;
          duration_days: number | null;
        } | null;
      } | null;
      company: { name: string } | null;
    }>();

  if (!convention) {
    return { ok: false, error: "Convention introuvable." };
  }
  if (!convention.contact_email) {
    return {
      ok: false,
      error:
        "Le contact RH n'a pas d'email renseigné. Ajoute-le dans la fiche entreprise (contact principal).",
    };
  }

  // Bloquer l'envoi si le montant est 0 € HT (Gilles 2026-05-22).
  // Tente d'abord un auto-recalc avant de bloquer (cas du bug historique
  // où la convention a été créée avant que les enrollments miroirs
  // n'existent → montant figé à 0).
  let unitForCheck = convention.amount_ht_unit;
  let totalForCheck = convention.amount_ht_total;
  if (!unitForCheck || unitForCheck === 0 || !totalForCheck || totalForCheck === 0) {
    const recalc = await computeConventionPricing(
      supabase,
      sessionId,
      convention.company_id,
    );
    if (recalc.unitPrice > 0 && recalc.totalHt > 0) {
      await supabase
        .from("session_conventions")
        .update({
          amount_ht_unit: recalc.unitPrice,
          amount_ht_total: recalc.totalHt,
        })
        .eq("id", conventionId);
      unitForCheck = recalc.unitPrice;
      totalForCheck = recalc.totalHt;
    }
  }
  if (!unitForCheck || unitForCheck === 0 || !totalForCheck || totalForCheck === 0) {
    return {
      ok: false,
      error:
        "Impossible d'envoyer une convention avec un montant à 0 € HT. Vérifie la tarification de la session (Fiche session → Tarification) et le rattachement des apprenants à l'entreprise.",
    };
  }

  // Récupérer toutes les infos organisation pour le PDF (en-tête + pied)
  const orgIdForPdf = convention.session?.organization_id ?? null;
  const { data: orgFull } = orgIdForPdf
    ? await supabase
        .from("organizations")
        .select(
          "name, logo_url, siret, nda, address, postal_code, city, email, phone, legal_mentions, commercial_banner_path",
        )
        .eq("id", orgIdForPdf)
        .maybeSingle<{
          name: string;
          logo_url: string | null;
          siret: string | null;
          nda: string | null;
          address: string | null;
          postal_code: string | null;
          city: string | null;
          email: string | null;
          phone: string | null;
          legal_mentions: string | null;
          commercial_banner_path: string | null;
        }>()
    : { data: null };

  const formationTitleForPdf =
    convention.session?.formation?.title ?? "Formation";
  // Logo : on fetch côté serveur et on embed en data URL base64. Les
  // images distantes dans l'iframe Puppeteer du footer ne se chargent
  // pas fiablement (timing).
  const logoDataUrl = await fetchImageAsDataUrl(orgFull?.logo_url ?? null);
  // R14 — Templates Puppeteer : header (titre + Émis le) + footer
  // (mentions légales HTML riche depuis legal_mentions + Page X/Y).
  const pdfTemplates = orgFull
    ? conventionPdfTemplatesWithLegalHtml(
        {
          name: orgFull.name,
          logoUrl: logoDataUrl ?? orgFull.logo_url,
          siret: orgFull.siret,
          nda: orgFull.nda,
          address: orgFull.address,
          postalCode: orgFull.postal_code,
          city: orgFull.city,
          phone: orgFull.phone,
          email: orgFull.email,
        },
        `Convention — ${formationTitleForPdf}`,
        orgFull.legal_mentions ?? null,
      )
    : null;

  // PDF (avec en-tête et pied de page répétés sur chaque page A4)
  const origin = await getAppOrigin();
  const printUrl = `${origin}/sessions/${sessionId}/conventions/${conventionId}/print?for=pdf`;
  const cookieList = await getCookiesForwarder();

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderPdf({
      url: printUrl,
      cookies: cookieList,
      // R18 (Gilles 2026-05-14, "Première page différente") :
      //   • Header Puppeteer (titre + Émis le) répété sur toutes les pages
      //     (marginTop 18mm = hauteur header).
      //   • Sur la page 1 SEULEMENT, le bandeau commercial est dessiné
      //     PAR-DESSUS via pdf-lib (cf. overlayBannerOnFirstPage ci-dessous).
      //   • Le print/page.tsx réserve un espace blanc en haut du corps
      //     page 1 pour ne pas masquer le contenu textuel par l'overlay.
      headerTemplate: pdfTemplates?.headerTemplate,
      footerTemplate: pdfTemplates?.footerTemplate,
      margin: { top: "18mm", bottom: "25mm", left: "0mm", right: "0mm" },
    });
  } catch (e) {
    return {
      ok: false,
      error: `Génération PDF échouée : ${(e as Error).message}`,
    };
  }

  // R18 — Overlay du bandeau commercial sur la page 1 (post-traitement).
  if (orgFull?.commercial_banner_path) {
    try {
      const { data: bannerBlob } = await supabase.storage
        .from("organization-banners")
        .download(orgFull.commercial_banner_path);
      if (bannerBlob) {
        const bannerBuf = Buffer.from(await bannerBlob.arrayBuffer());
        const bannerType = bannerBlob.type || "image/png";
        pdfBuffer = await overlayBannerOnFirstPage(
          pdfBuffer,
          bannerBuf,
          bannerType,
        );
      }
    } catch (e) {
      console.warn(
        "[sendConvention] Overlay bandeau page 1 échoué :",
        (e as Error).message,
      );
      // On continue avec le PDF brut sans le bandeau plutôt que d'échouer
      // l'envoi complet.
    }
  }

  // Token de signature
  const token = generateToken();
  const { error: linkError } = await supabase.from("signature_links").insert({
    convention_id: conventionId,
    enrollment_id: null,
    token,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (linkError) {
    return { ok: false, error: linkError.message };
  }

  // Email
  const orgId = convention.session?.organization_id ?? null;
  const { data: org } = orgId
    ? await supabase
        .from("organizations")
        .select("name, email")
        .eq("id", orgId)
        .maybeSingle<{ name: string; email: string | null }>()
    : { data: null };
  const orgName = org?.name ?? "Notre organisme";
  const formationTitle =
    convention.session?.formation?.title ?? "votre formation";
  const companyName = convention.company?.name ?? "votre entreprise";

  const publicUrl = `${origin}/conventions/sign/${token}`;

  // Bouton "Signer la convention en ligne" — HTML pré-formaté, injecté
  // dans le corps de l'email via la variable {{signature_button}}.
  const signatureButtonHtml = `<a href="${publicUrl}" style="display:inline-block;background:#1e40af;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;">Signer la convention en ligne</a>`;

  // Charger le modèle d'email (sujet + 3 blocs HTML) personnalisé dans
  // Paramètres → Modèles documents → onglet "Email convention". Si rien
  // n'a été saisi, on retombe sur le texte par défaut (DEFAULT_CONVENTION_EMAIL_BLOCKS).
  const emailTpl = orgId
    ? await loadConventionEmailTemplate(orgId)
    : null;
  const emailBlocks = emailTpl?.blocks;

  // ---- Préparation des variables additionnelles pour le sujet ----
  // Durée / heures de formation (depuis la fiche programme).
  const durationDays = convention.session?.formation?.duration_days;
  const durationHours = convention.session?.formation?.duration_hours;
  const durationDaysStr =
    durationDays != null && durationDays > 0
      ? `${durationDays} jour${durationDays > 1 ? "s" : ""}`
      : "";
  const durationHoursStr =
    durationHours != null && durationHours > 0
      ? `${durationHours} h`
      : "";

  // Date(s) de session (format français).
  const fmtDateFr = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  const startDate = convention.session?.start_date;
  const endDate = convention.session?.end_date;
  let sessionDateStr = "";
  if (startDate && endDate) {
    sessionDateStr =
      startDate === endDate
        ? `Le ${fmtDateFr(startDate)}`
        : `Du ${fmtDateFr(startDate)} au ${fmtDateFr(endDate)}`;
  }

  // Lieu (distanciel, adresse de la salle référencée, ou texte libre).
  let sessionLocationStr = "";
  const sess = convention.session;
  if (sess?.modality === "distanciel") {
    sessionLocationStr = "Distanciel";
  } else if (sess?.location_ref) {
    const parts = [
      sess.location_ref.address,
      [sess.location_ref.postal_code, sess.location_ref.city]
        .filter(Boolean)
        .join(" "),
    ]
      .filter(Boolean)
      .join(", ");
    sessionLocationStr = parts || sess.location_ref.name || "";
  } else if (sess?.location) {
    sessionLocationStr = sess.location;
  }

  // Liste des apprenants de cette société pour cette session (R21 —
  // Gilles 2026-05-14). Affiché dans l'email avec leurs prénom-nom
  // séparés par virgules : "Jean DUPONT, Marie MARTIN".
  const { data: learnersForCompany } = await supabase
    .from("session_enrollments")
    .select("learner:learners(first_name, last_name, company_id)")
    .eq("session_id", sessionId);
  type LearnerRow = {
    learner: {
      first_name: string | null;
      last_name: string | null;
      company_id: string | null;
    } | null;
  };
  const learnerNamesStr = ((learnersForCompany ?? []) as unknown as LearnerRow[])
    .filter((e) => e.learner?.company_id === convention.company_id)
    .map(
      (e) =>
        [e.learner?.first_name, e.learner?.last_name]
          .filter(Boolean)
          .join(" ") || "",
    )
    .filter((n) => n.length > 0)
    .join(", ");

  // Variables substituables dans les 3 blocs HTML et le sujet.
  const emailVars: Record<string, string> = {
    contact_name: convention.contact_name ?? "",
    learner_names: learnerNamesStr,
    formation_title: formationTitle,
    company_name: companyName,
    org_name: orgName,
    public_url: publicUrl,
    signature_button: signatureButtonHtml,
    // Nouvelles variables pour le sujet (R20 — Gilles 2026-05-14)
    duration_days: durationDaysStr,
    duration_hours: durationHoursStr,
    session_date: sessionDateStr,
    session_location: sessionLocationStr,
  };
  const substitute = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => emailVars[k] ?? "");

  const subject = substitute(
    emailBlocks?.subject_template ??
      `Convention de formation à signer — {{formation_title}}`,
  );
  const html = `
    ${substitute(emailBlocks?.intro_html ?? "")}
    ${substitute(emailBlocks?.main_html ?? "")}
    ${substitute(emailBlocks?.closing_html ?? "")}
  `;
  const text = `Bonjour ${convention.contact_name ?? ""},\n\nVeuillez signer la convention de formation : ${publicUrl}\n\nCordialement,\n${orgName}`;

  // R6/R19 — Logique destinataires (décision Gilles 2026-05-14) :
  //   • Si AU MOINS UN référent pédagogique est sélectionné pour cette
  //     session × société, ils deviennent le destinataire principal (TO)
  //     et l'apprenant signataire est mis en CC pour info.
  //   • Si AUCUN référent : on garde le comportement historique
  //     (TO = contact_email de la convention, qui pointe sur l'apprenant
  //     en fallback ou un contact RH primary).
  const referentEmails = await getReferentEmailsForSessionCompany(
    supabase,
    sessionId,
    convention.company_id,
  );
  const hasReferents = referentEmails.length > 0;
  const emailTo = hasReferents ? referentEmails[0] : convention.contact_email;
  const emailToName = hasReferents
    ? undefined
    : convention.contact_name ?? undefined;
  // CC : référents supplémentaires (au-delà du 1er) + apprenant si
  // référents pris en TO. Sinon : aucun CC particulier (on n'enverra
  // pas en CC à l'apprenant si lui-même est déjà en TO).
  const emailCc = hasReferents
    ? [
        ...referentEmails.slice(1),
        ...(convention.contact_email ? [convention.contact_email] : []),
      ]
    : [];

  // ============================================================
  // Pièces jointes additionnelles (Sprint Qualiopi 2026-05-14) :
  //   • Programme de formation officiel de la session
  //     (session_documents.is_training_program = true)
  //   • Certificat Qualiopi de l'organisation
  //     (organizations.qualiopi_certificate_path)
  //
  // On télécharge les fichiers depuis Supabase Storage et on les ajoute
  // à la liste d'attachments envoyée à Resend. En cas d'erreur (fichier
  // introuvable / lecture échouée), on log mais on n'interrompt pas
  // l'envoi de la convention — c'est plus important d'envoyer la
  // convention sans PJ que de bloquer pour une PJ manquante.
  // ============================================================
  const extraAttachments: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }> = [];

  // 1) Programme de formation officiel.
  // PRIORITÉ 1 : document rattaché à la SESSION (session_documents avec
  //   is_training_program = true). Permet de fournir un programme
  //   spécifique à une session (rare mais possible).
  // PRIORITÉ 2 (fallback) : programme PDF rattaché au PROGRAMME de
  //   formation côté Catalogue (formations.programme_pdf_url). C'est le
  //   cas standard : Gilles upload une fois le programme sur la fiche
  //   programme, il est joint à toutes les conventions de toutes les
  //   sessions de cette formation.
  const { data: programDoc } = await supabase
    .from("session_documents")
    .select("file_name, storage_path, mime_type")
    .eq("session_id", sessionId)
    .eq("is_training_program", true)
    .maybeSingle<{
      file_name: string;
      storage_path: string;
      mime_type: string | null;
    }>();
  if (programDoc?.storage_path) {
    const { data: blob, error: blobError } = await supabase.storage
      .from("session-documents")
      .download(programDoc.storage_path);
    if (!blobError && blob) {
      const buf = Buffer.from(await blob.arrayBuffer());
      extraAttachments.push({
        filename: programDoc.file_name,
        content: buf,
        contentType: programDoc.mime_type ?? "application/pdf",
      });
    } else {
      console.warn(
        "[sendConvention] Programme (session) introuvable dans Storage :",
        blobError?.message,
      );
    }
  } else {
    // Fallback : programme PDF rattaché au programme de formation.
    const { data: sessionRow } = await supabase
      .from("sessions")
      .select(
        "formation:formations(programme_pdf_url, programme_pdf_name, title)",
      )
      .eq("id", sessionId)
      .maybeSingle<{
        formation: {
          programme_pdf_url: string | null;
          programme_pdf_name: string | null;
          title: string;
        } | null;
      }>();
    const programPdfUrl = sessionRow?.formation?.programme_pdf_url;
    if (programPdfUrl) {
      try {
        const res = await fetch(programPdfUrl);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const fallbackName =
            sessionRow.formation?.programme_pdf_name ??
            `programme-${(sessionRow.formation?.title ?? "formation")
              .replace(/[^a-z0-9]/gi, "-")
              .toLowerCase()}.pdf`;
          extraAttachments.push({
            filename: fallbackName,
            content: buf,
            contentType: res.headers.get("content-type") ?? "application/pdf",
          });
        } else {
          console.warn(
            "[sendConvention] Programme (formation) HTTP",
            res.status,
          );
        }
      } catch (e) {
        console.warn(
          "[sendConvention] Programme (formation) fetch échec :",
          (e as Error).message,
        );
      }
    }
  }

  // 2) Certificat Qualiopi de l'organisation
  if (orgId) {
    const { data: orgCert } = await supabase
      .from("organizations")
      .select("qualiopi_certificate_path, qualiopi_certificate_filename")
      .eq("id", orgId)
      .maybeSingle<{
        qualiopi_certificate_path: string | null;
        qualiopi_certificate_filename: string | null;
      }>();
    if (orgCert?.qualiopi_certificate_path) {
      const { data: blob, error: blobError } = await supabase.storage
        .from("qualiopi-certificates")
        .download(orgCert.qualiopi_certificate_path);
      if (!blobError && blob) {
        const buf = Buffer.from(await blob.arrayBuffer());
        extraAttachments.push({
          filename:
            orgCert.qualiopi_certificate_filename ?? "certificat-qualiopi.pdf",
          content: buf,
          contentType: "application/pdf",
        });
      } else {
        console.warn(
          "[sendConvention] Certificat Qualiopi introuvable :",
          blobError?.message,
        );
      }
    }
  }

  const result = await sendEmail({
    to: emailTo,
    toName: emailToName,
    subject,
    html,
    text,
    replyTo: org?.email ?? undefined,
    cc: emailCc,
    attachments: [
      {
        filename: `convention-${companyName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
      ...extraAttachments,
    ],
  });

  // Log + maj convention
  await supabase.from("email_log").insert({
    organization_id: orgId,
    enrollment_id: null,
    type: "convention",
    to_email: convention.contact_email,
    to_name: convention.contact_name,
    subject,
    status: result.ok ? "sent" : "failed",
    provider: "resend",
    provider_id: result.ok ? result.providerId : null,
    error: result.ok ? null : result.error,
    sent_at: result.ok ? new Date().toISOString() : null,
  });

  if (result.ok) {
    await supabase
      .from("session_conventions")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_to_email: convention.contact_email,
      })
      .eq("id", conventionId);
  }

  revalidatePath(`/sessions/${sessionId}/conventions`);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, publicUrl };
}
