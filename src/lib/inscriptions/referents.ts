/**
 * Helper partagé pour la récupération des emails des référents
 * pédagogiques rattachés à une inscription / un enrollment.
 *
 * Règle métier R6 (Gilles 2026-05-13) : les référents reçoivent en CC
 * tous les emails liés à un apprenant (confirmation, convocation,
 * convention, attestation).
 *
 * Stratégie : on remonte de l'enrollment → inscription_request →
 * inscription_referent_contacts → company_contacts.email. On filtre
 * les emails null/vides.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Renvoie la liste des emails des référents pédagogiques rattachés à
 * une inscription (par enrollment_id). Tableau vide si aucun référent
 * ou si l'enrollment n'a pas de inscription_request liée (cas rare
 * pré-sync 2026-05-13).
 */
export async function getReferentEmailsForEnrollment(
  supabase: SupabaseClient,
  enrollmentId: string,
): Promise<string[]> {
  // 1. Récupérer l'inscription_request liée à l'enrollment
  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select("inscription_request_id")
    .eq("id", enrollmentId)
    .maybeSingle();
  const requestId = (enrollment?.inscription_request_id as string | null) ?? null;
  if (!requestId) return [];
  return getReferentEmailsForInscription(supabase, requestId);
}

/**
 * Renvoie la liste des emails des référents pédagogiques rattachés à
 * une inscription_request (par son id). Tableau vide si aucun référent.
 */
export async function getReferentEmailsForInscription(
  supabase: SupabaseClient,
  inscriptionId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("inscription_referent_contacts")
    .select("contact:company_contacts(email)")
    .eq("inscription_id", inscriptionId);
  const rows = (data ?? []) as unknown as Array<{
    contact: { email: string | null } | null;
  }>;
  return rows
    .map((r) => r.contact?.email)
    .filter((e): e is string => Boolean(e && e.trim().length > 0));
}

/**
 * Renvoie la liste DÉDUPLIQUÉE des emails des référents pour TOUTES
 * les inscriptions d'une session pour une société donnée.
 *
 * Utilisé pour la convention de formation : la convention couvre
 * plusieurs apprenants de la même société, on veut donc envoyer en
 * CC l'union des référents de tous ces apprenants (un référent ne
 * reçoit qu'un seul email, même s'il référence 5 apprenants).
 */
export async function getReferentEmailsForSessionCompany(
  supabase: SupabaseClient,
  sessionId: string,
  companyId: string,
): Promise<string[]> {
  // 1. Récupère toutes les inscription_requests ciblant cette session
  //    pour cette société. On embarque aussi `contact_referent_email`
  //    saisi directement lors de l'inscription (migration 0093) — source
  //    alternative aux référents sélectionnés via le module dédié.
  const { data: requests } = await supabase
    .from("inscription_requests")
    .select("id, contact_referent_email")
    .eq("target_session_id", sessionId)
    .eq("company_id", companyId);
  const reqRows = (requests ?? []) as Array<{
    id: string;
    contact_referent_email: string | null;
  }>;
  const ids = reqRows.map((r) => r.id);
  if (ids.length === 0) return [];

  // 2. Référents explicites (table inscription_referent_contacts)
  const { data } = await supabase
    .from("inscription_referent_contacts")
    .select("contact:company_contacts(email)")
    .in("inscription_id", ids);
  const rows = (data ?? []) as unknown as Array<{
    contact: { email: string | null } | null;
  }>;
  const explicitEmails = rows
    .map((r) => r.contact?.email)
    .filter((e): e is string => Boolean(e && e.trim().length > 0));

  // 3. Emails de contact référent saisis directement à l'inscription
  //    (formulaire pré-inscription publique ou portail prescripteur).
  const inlineEmails = reqRows
    .map((r) => r.contact_referent_email)
    .filter((e): e is string => Boolean(e && e.trim().length > 0));

  // 4. Union dédupliquée (case-insensitive)
  const all = [...explicitEmails, ...inlineEmails];
  return Array.from(new Set(all.map((e) => e.toLowerCase()))).map(
    (lc) => all.find((e) => e.toLowerCase() === lc) ?? lc,
  );
}

/**
 * Renvoie la liste DÉDUPLIQUÉE des contact_id (et email/nom) des
 * référents pour toutes les inscriptions d'une session × société.
 * Utilisé pour afficher les référents actifs sur la page conventions.
 */
export async function getReferentContactsForSessionCompany(
  supabase: SupabaseClient,
  sessionId: string,
  companyId: string,
): Promise<
  Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    job_title: string | null;
  }>
> {
  const { data: requests } = await supabase
    .from("inscription_requests")
    .select("id")
    .eq("target_session_id", sessionId)
    .eq("company_id", companyId);
  const ids = ((requests ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("inscription_referent_contacts")
    .select(
      "contact:company_contacts(id, first_name, last_name, email, job_title)",
    )
    .in("inscription_id", ids);
  const rows = (data ?? []) as unknown as Array<{
    contact: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      job_title: string | null;
    } | null;
  }>;
  // Dédup par contact.id
  const seen = new Set<string>();
  const result: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    job_title: string | null;
  }> = [];
  for (const r of rows) {
    if (!r.contact) continue;
    if (seen.has(r.contact.id)) continue;
    seen.add(r.contact.id);
    result.push(r.contact);
  }
  return result;
}

/**
 * Met à jour les référents pédagogiques pour TOUTES les inscriptions
 * d'une session × société. Synchronise inscription_referent_contacts :
 * supprime les liens existants pour ces inscriptions, puis crée les
 * nouveaux à partir de contactIds. Si contactIds est vide, on supprime
 * tous les référents (et l'apprenant deviendra destinataire par défaut).
 */
export async function setReferentContactsForSessionCompany(
  supabase: SupabaseClient,
  sessionId: string,
  companyId: string,
  contactIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 1. Récupérer toutes les inscriptions de la session × société
  const { data: requests, error: reqErr } = await supabase
    .from("inscription_requests")
    .select("id")
    .eq("target_session_id", sessionId)
    .eq("company_id", companyId);
  if (reqErr) return { ok: false, error: reqErr.message };
  const ids = ((requests ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length === 0) {
    // Pas d'inscriptions → rien à faire (mais ce n'est pas une erreur).
    return { ok: true };
  }

  // 2. Supprimer tous les liens référents existants pour ces inscriptions
  const { error: delErr } = await supabase
    .from("inscription_referent_contacts")
    .delete()
    .in("inscription_id", ids);
  if (delErr) return { ok: false, error: delErr.message };

  // 3. Recréer les liens pour chaque inscription × contact choisi
  if (contactIds.length > 0) {
    const rows: Array<{ inscription_id: string; contact_id: string }> = [];
    for (const inscriptionId of ids) {
      for (const contactId of contactIds) {
        rows.push({ inscription_id: inscriptionId, contact_id: contactId });
      }
    }
    const { error: insErr } = await supabase
      .from("inscription_referent_contacts")
      .insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
  }
  return { ok: true };
}
