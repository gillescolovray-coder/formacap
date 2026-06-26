/**
 * Saisie express — sous-traitance (Phase 1 MVP, Gilles 2026-05-24)
 *
 * Logique partagée admin + portail formateur + page publique QR.
 * Crée un apprenant "temporaire" (is_temporary = true) avec son
 * entreprise stockée en texte libre, l'inscrit à la session, et
 * génère un token portail pour qu'il puisse jouer le quiz.
 *
 * Pas de fiche `companies` créée à ce stade : la promotion vers
 * Entreprises est différée (Phase 2 du chantier sous-traitance).
 */

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMirroredRequestForEnrollment } from "@/lib/inscriptions/sync";
import { normalizeCompanyName } from "@/lib/companies/dedup";

/**
 * Rapproche un nom d'entreprise saisi (texte libre) d'une fiche existante
 * par nom NORMALISÉ exact (Gilles 2026-06-08). On ne crée PAS de fiche ici
 * (risque de doublons sur les franchises type "AVIPUR …") : si aucune
 * correspondance exacte, on renvoie null et le nom reste en texte libre.
 */
async function findExistingCompanyId(
  supabase: SupabaseClient,
  organizationId: string,
  companyName: string,
): Promise<string | null> {
  const target = normalizeCompanyName(companyName);
  if (!target) return null;
  const { data } = await supabase
    .from("companies")
    .select("id, name")
    .eq("organization_id", organizationId);
  for (const c of (data ?? []) as Array<{ id: string; name: string | null }>) {
    if (normalizeCompanyName(c.name) === target) return c.id;
  }
  return null;
}

export type ExpressLearnerInput = {
  /** Optionnel : Mme / M. */
  civility?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  jobTitle?: string | null;
  /** Texte libre, obligatoire (donneur d'ordre / société de l'apprenant) */
  companyNameTemp: string;
  companySiretTemp?: string | null;
};

export type ExpressLearnerResult = {
  ok: boolean;
  error?: string;
  learnerId?: string;
  enrollmentId?: string;
  portalToken?: string;
};

function generateToken(): string {
  return randomBytes(24).toString("hex");
}

function cleanText(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

function cleanSiret(s: string | null | undefined): string | null {
  const t = cleanText(s);
  if (!t) return null;
  // Garde seulement les chiffres (SIRET = 14 chiffres en France)
  return t.replace(/\D/g, "") || null;
}

/**
 * Crée l'apprenant temporaire + session_enrollment + token portail.
 * Si l'apprenant est déjà inscrit (même nom/prénom/société sur la
 * session), on renvoie son token existant pour éviter les doublons.
 */
export async function createExpressLearnerForSession(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    organizationId: string;
    input: ExpressLearnerInput;
    /** Qui crée — null pour la page publique QR (apprenant lui-même) */
    createdBy: string | null;
  },
): Promise<ExpressLearnerResult> {
  const { sessionId, organizationId, input, createdBy } = params;

  const firstName = cleanText(input.firstName);
  const lastName = cleanText(input.lastName);
  const companyName = cleanText(input.companyNameTemp);

  if (!firstName || !lastName || !companyName) {
    return {
      ok: false,
      error: "Nom, prénom et société sont obligatoires.",
    };
  }

  // 1. Déduplication : un même nom+prénom+société sur la session ?
  const { data: existingEnrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(id, first_name, last_name, is_temporary, company_name_temp)",
    )
    .eq("session_id", sessionId);

  type ExistingRow = {
    id: string;
    learner: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      is_temporary: boolean | null;
      company_name_temp: string | null;
    } | null;
  };
  const existing = (existingEnrollments ?? []) as unknown as ExistingRow[];

  const norm = (s: string | null | undefined) =>
    (s ?? "").trim().toLowerCase();

  const dupe = existing.find((e) => {
    const l = e.learner;
    if (!l) return false;
    return (
      norm(l.first_name) === norm(firstName) &&
      norm(l.last_name) === norm(lastName) &&
      norm(l.company_name_temp) === norm(companyName)
    );
  });

  if (dupe && dupe.learner) {
    // Réutilise / crée le token portail pour cet enrollment existant.
    const portalToken = await ensureEnrollmentPortalToken(supabase, dupe.id);
    return {
      ok: true,
      learnerId: dupe.learner.id,
      enrollmentId: dupe.id,
      portalToken,
    };
  }

  // 2. Création du learner temporaire
  const { data: newLearner, error: learnerErr } = await supabase
    .from("learners")
    .insert({
      organization_id: organizationId,
      civility: cleanText(input.civility),
      first_name: firstName,
      last_name: lastName,
      email: cleanText(input.email),
      job_title: cleanText(input.jobTitle),
      is_temporary: true,
      company_name_temp: companyName,
      company_siret_temp: cleanSiret(input.companySiretTemp),
      // Pas de company_id : la fiche entreprise sera créée à la promotion.
      company_id: null,
      created_by: createdBy,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (learnerErr || !newLearner) {
    return {
      ok: false,
      error: learnerErr?.message ?? "Création de l'apprenant impossible.",
    };
  }

  // 3. Inscription à la session — statut 'confirmed' car l'apprenant
  // est physiquement présent le jour J (sous-traitance).
  const { data: newEnrollment, error: enrollErr } = await supabase
    .from("session_enrollments")
    .insert({
      session_id: sessionId,
      learner_id: newLearner.id,
      status: "confirmed",
      enrolled_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (enrollErr || !newEnrollment) {
    // Rollback partiel : on supprime le learner pour ne pas laisser
    // une fiche orpheline qui apparaîtrait plus tard.
    await supabase.from("learners").delete().eq("id", newLearner.id);
    return {
      ok: false,
      error:
        enrollErr?.message ?? "Inscription à la session impossible.",
    };
  }

  // 3 bis. Création miroir d'une inscription_request liée
  // (Gilles 2026-05-31 : sans ça, ces enrollments etaient orphelins
  // et n apparaissaient pas dans l onglet Participants ni dans le
  // module Inscriptions, alors qu ils etaient comptes dans le CA).
  // Pattern identique a enrollLearner — voir
  // /sessions/[id]/enrollments/actions.ts ligne 118.
  try {
    const requestId = await createMirroredRequestForEnrollment(supabase, {
      id: newEnrollment.id,
      session_id: sessionId,
      learner_id: newLearner.id,
      status: "confirmed",
      enrolled_at: new Date().toISOString(),
    });
    if (requestId) {
      await supabase
        .from("session_enrollments")
        .update({ inscription_request_id: requestId })
        .eq("id", newEnrollment.id);

      // Entreprise (Gilles 2026-06-08) : on reprend le nom saisi sur la
      // request (company_name_freetext) pour qu'il s'affiche dans le module
      // Inscriptions au lieu de "Particulier". Si une fiche entreprise existe
      // déjà (nom normalisé exact), on rattache aussi company_id (apprenant +
      // request) pour un lien cliquable.
      const matchedCompanyId = await findExistingCompanyId(
        supabase,
        organizationId,
        companyName,
      );
      const reqUpdate: Record<string, string | null> = {
        company_name_freetext: companyName,
      };
      if (matchedCompanyId) reqUpdate.company_id = matchedCompanyId;
      await supabase
        .from("inscription_requests")
        .update(reqUpdate)
        .eq("id", requestId);
      if (matchedCompanyId) {
        await supabase
          .from("learners")
          .update({ company_id: matchedCompanyId })
          .eq("id", newLearner.id);
      }
    }
  } catch (e) {
    // Best-effort : si la creation de la request miroir echoue,
    // on log mais on continue (l enrollment principal est cree, le
    // mismatch sera reparable par le self-healing).
    console.warn(
      "[createExpressLearnerForSession] mirror request failed",
      (e as Error).message,
    );
  }

  // 4. Token portail apprenant (pour quiz + émargement)
  const portalToken = await ensureEnrollmentPortalToken(
    supabase,
    newEnrollment.id,
  );

  return {
    ok: true,
    learnerId: newLearner.id,
    enrollmentId: newEnrollment.id,
    portalToken,
  };
}

/**
 * Inscrit un apprenant DÉJÀ EXISTANT à la session (chemin « c'est moi » de
 * l'anti-doublon à la saisie express, Gilles 2026-06-26). Réutilise l'apprenant
 * (pas de nouvelle fiche) + crée l'enrollment + request miroir + token portail.
 * Si déjà inscrit, renvoie le token existant.
 */
export async function enrollExistingLearnerForSession(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    organizationId: string;
    learnerId: string;
    createdBy: string | null;
  },
): Promise<ExpressLearnerResult> {
  const { sessionId, organizationId, learnerId } = params;

  const { data: learner } = await supabase
    .from("learners")
    .select("id, organization_id")
    .eq("id", learnerId)
    .maybeSingle<{ id: string; organization_id: string }>();
  if (!learner || learner.organization_id !== organizationId) {
    return { ok: false, error: "Apprenant introuvable." };
  }

  // Déjà inscrit (hors annulé) ? -> on réutilise.
  const { data: existing } = await supabase
    .from("session_enrollments")
    .select("id")
    .eq("session_id", sessionId)
    .eq("learner_id", learnerId)
    .neq("status", "cancelled")
    .maybeSingle<{ id: string }>();

  let enrollmentId = existing?.id ?? null;
  if (!enrollmentId) {
    const { data: newEnrollment, error: enrollErr } = await supabase
      .from("session_enrollments")
      .insert({
        session_id: sessionId,
        learner_id: learnerId,
        status: "confirmed",
        enrolled_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (enrollErr || !newEnrollment) {
      return {
        ok: false,
        error: enrollErr?.message ?? "Inscription à la session impossible.",
      };
    }
    enrollmentId = newEnrollment.id;
    // Request miroir (best-effort) pour cohérence Inscriptions/Participants.
    try {
      const requestId = await createMirroredRequestForEnrollment(supabase, {
        id: enrollmentId,
        session_id: sessionId,
        learner_id: learnerId,
        status: "confirmed",
        enrolled_at: new Date().toISOString(),
      });
      if (requestId) {
        await supabase
          .from("session_enrollments")
          .update({ inscription_request_id: requestId })
          .eq("id", enrollmentId);
      }
    } catch (e) {
      console.warn(
        "[enrollExistingLearnerForSession] mirror request failed",
        (e as Error).message,
      );
    }
  }

  const portalToken = await ensureEnrollmentPortalToken(supabase, enrollmentId);
  return { ok: true, learnerId, enrollmentId, portalToken };
}

/**
 * Récupère le token existant pour cet enrollment, sinon en crée un.
 */
export async function ensureEnrollmentPortalToken(
  supabase: SupabaseClient,
  enrollmentId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("enrollment_portal_tokens")
    .select("token")
    .eq("enrollment_id", enrollmentId)
    .maybeSingle<{ token: string }>();
  if (existing?.token) return existing.token;

  const token = generateToken();
  await supabase
    .from("enrollment_portal_tokens")
    .insert({ enrollment_id: enrollmentId, token });
  return token;
}

/**
 * Récupère / crée le token QR d'inscription rapide pour une session.
 * Expiration : 7 jours après la fin de la session (large pour couvrir
 * les retards de saisie).
 */
export async function ensureQuickSignupToken(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    sessionEndDate: string;
    createdBy: string | null;
  },
): Promise<string> {
  const { sessionId, sessionEndDate, createdBy } = params;

  // Token actif déjà existant ?
  const { data: existing } = await supabase
    .from("session_quick_signup_tokens")
    .select("token, expires_at")
    .eq("session_id", sessionId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ token: string; expires_at: string }>();
  if (existing?.token) return existing.token;

  const expiresAt = new Date(sessionEndDate);
  expiresAt.setDate(expiresAt.getDate() + 7);

  const token = generateToken();
  await supabase.from("session_quick_signup_tokens").insert({
    session_id: sessionId,
    token,
    expires_at: expiresAt.toISOString(),
    created_by: createdBy,
  });
  return token;
}
