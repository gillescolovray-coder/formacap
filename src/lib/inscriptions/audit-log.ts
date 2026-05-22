/**
 * Helper pour logger les tentatives d'inscription (pré-inscription
 * publique + portail partenaire) dans `inscription_attempts_log`.
 * Gilles 2026-05-22 — migration 0099.
 *
 * Usage typique :
 *   await logInscriptionAttempt({
 *     source: "preinscription_publique",
 *     referrerCompanyId: ctx.company.id,
 *     organizationId: ctx.company.organization_id,
 *     targetSessionId: input.sessionId,
 *     payload: { learners, company, financing, message },
 *     success: false,
 *     errorMessage: "...",
 *   });
 *
 * Ne JAMAIS faire échouer l'opération parent à cause d'un échec de log.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export type InscriptionAttemptSource =
  | "preinscription_publique"
  | "portail_partenaire_batch"
  | "portail_partenaire_single";

export type InscriptionAttemptInput = {
  organizationId: string | null;
  referrerCompanyId: string | null;
  source: InscriptionAttemptSource;
  targetSessionId?: string | null;
  payload?: unknown;
  success: boolean;
  createdRequestIds?: string[];
  errorMessage?: string | null;
  errorDetails?: unknown;
  clientIp?: string | null;
  userAgent?: string | null;
};

export async function logInscriptionAttempt(
  input: InscriptionAttemptInput,
  supabase?: SupabaseClient,
): Promise<void> {
  const client = supabase ?? createAdminClient();
  try {
    await client.from("inscription_attempts_log").insert({
      organization_id: input.organizationId,
      referrer_company_id: input.referrerCompanyId,
      source: input.source,
      target_session_id: input.targetSessionId ?? null,
      payload: (input.payload ?? null) as never,
      success: input.success,
      created_request_ids:
        input.createdRequestIds && input.createdRequestIds.length > 0
          ? input.createdRequestIds
          : null,
      error_message: input.errorMessage ?? null,
      error_details: (input.errorDetails ?? null) as never,
      client_ip: input.clientIp ?? null,
      user_agent: input.userAgent ?? null,
    });
  } catch (e) {
    console.error(
      "[logInscriptionAttempt] échec log d'audit (non bloquant):",
      (e as Error).message,
    );
  }
}
