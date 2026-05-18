"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getAppOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export type SessionEvaluationTokenResult = {
  ok: boolean;
  error?: string;
  publicUrl?: string;
  token?: string;
  expiresAt?: string;
};

/**
 * Renvoie le token d'évaluation actif de la session s'il existe et
 * n'est pas expiré, sinon en crée un nouveau. Le TTL utilise la même
 * configuration organisation que l'émargement
 * (`emargement_token_ttl_days`) — pertinent car les deux QR sont
 * affichés au même moment (fin de session).
 */
export async function getOrCreateSessionEvaluationToken(
  sessionId: string,
): Promise<SessionEvaluationTokenResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };

  const { data: session } = await supabase
    .from("sessions")
    .select("id, organization_id, end_date")
    .eq("id", sessionId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      end_date: string;
    }>();
  if (!session) return { ok: false, error: "Session introuvable." };

  // Token déjà actif ?
  const { data: existing } = await supabase
    .from("session_evaluation_tokens")
    .select("token, expires_at")
    .eq("session_id", sessionId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ token: string; expires_at: string }>();

  const origin = await getAppOrigin();

  if (existing) {
    return {
      ok: true,
      token: existing.token,
      publicUrl: `${origin}/evaluation/${existing.token}`,
      expiresAt: existing.expires_at,
    };
  }

  // Lire le TTL paramétré (mutualisé avec l'émargement)
  const { data: org } = await supabase
    .from("organizations")
    .select("emargement_token_ttl_days")
    .eq("id", session.organization_id)
    .maybeSingle<{ emargement_token_ttl_days: number | null }>();
  const ttlDays = org?.emargement_token_ttl_days ?? 7;

  const endDate = new Date(session.end_date);
  endDate.setHours(23, 59, 59, 999);
  const expiresAt = new Date(
    endDate.getTime() + ttlDays * 24 * 60 * 60 * 1000,
  );

  const token = generateToken();
  const { error: insertError } = await supabase
    .from("session_evaluation_tokens")
    .insert({
      session_id: sessionId,
      token,
      expires_at: expiresAt.toISOString(),
      created_by: user.id,
    });
  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  return {
    ok: true,
    token,
    publicUrl: `${origin}/evaluation/${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Force la création d'un nouveau token : expire les actifs puis crée
 * un nouveau. Utile si l'OF veut invalider l'ancien QR.
 */
export async function regenerateSessionEvaluationToken(
  sessionId: string,
): Promise<SessionEvaluationTokenResult> {
  const supabase = await createClient();

  await supabase
    .from("session_evaluation_tokens")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("session_id", sessionId)
    .gt("expires_at", new Date().toISOString());

  const result = await getOrCreateSessionEvaluationToken(sessionId);
  if (result.ok) {
    revalidatePath(`/sessions/${sessionId}/emargement`);
  }
  return result;
}
