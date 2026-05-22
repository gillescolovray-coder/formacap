"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export type SignConventionInput = {
  token: string;
  conventionId: string;
  signerName: string;
  signatureDataUrl: string;
  /** Mention « Bon pour accord » obligatoire (Gilles 2026-05-22). */
  goodForAgreement: boolean;
};

export type SignConventionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function signConvention(
  input: SignConventionInput,
): Promise<SignConventionResult> {
  if (!input.signatureDataUrl.startsWith("data:image/png;base64,")) {
    return { ok: false, error: "Format de signature invalide." };
  }
  if (input.signerName.trim().length < 2) {
    return { ok: false, error: "Merci de saisir votre nom complet." };
  }
  // Mention « Bon pour accord » obligatoire (Gilles 2026-05-22).
  if (!input.goodForAgreement) {
    return {
      ok: false,
      error:
        "Vous devez cocher la case « Bon pour accord » pour engager l'entreprise.",
    };
  }

  // FIX 2026-05-22 (bug Mme TORRES) : on utilise l'admin client (RLS bypass)
  // car cette server action est appelée depuis une page publique sans user
  // authentifié. Sans ça, les policies RLS de session_conventions bloquaient
  // l'UPDATE silencieusement → le statut restait Brouillon. Le token de
  // signature reste l'authentification effective (vérifié juste après).
  const supabase = createAdminClient();

  // Vérifier le token
  const { data: link } = await supabase
    .from("signature_links")
    .select("id, convention_id, expires_at, used_at")
    .eq("token", input.token)
    .eq("convention_id", input.conventionId)
    .maybeSingle<{
      id: string;
      convention_id: string;
      expires_at: string;
      used_at: string | null;
    }>();

  if (!link) return { ok: false, error: "Lien invalide." };
  if (new Date(link.expires_at) < new Date()) {
    return { ok: false, error: "Ce lien a expiré." };
  }

  // Audit
  const h = await headers();
  const userAgent = h.get("user-agent") ?? null;
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]?.trim() : null;

  // Marquer la convention comme signée
  const { error: convError } = await supabase
    .from("session_conventions")
    .update({
      status: "signed",
      signed_at: new Date().toISOString(),
      signed_by_name: input.signerName.trim(),
      signed_ip: ip,
      signed_user_agent: userAgent,
      signature_data: input.signatureDataUrl,
    })
    .eq("id", input.conventionId);

  if (convError) {
    console.error("[signConvention] update échec", {
      conventionId: input.conventionId,
      error: convError.message,
    });
    return { ok: false, error: convError.message };
  }

  // Marquer le lien utilisé
  await supabase
    .from("signature_links")
    .update({
      used_at: new Date().toISOString(),
      used_ip: ip,
      used_user_agent: userAgent,
    })
    .eq("id", link.id)
    .is("used_at", null);

  // Récupérer le session_id de la convention pour revalider la page admin
  // (sans ça le tableau Conventions garde le statut Brouillon en cache).
  const { data: conv } = await supabase
    .from("session_conventions")
    .select("session_id")
    .eq("id", input.conventionId)
    .maybeSingle<{ session_id: string }>();

  revalidatePath(`/conventions/sign/${input.token}`);
  if (conv?.session_id) {
    revalidatePath(`/sessions/${conv.session_id}/conventions`);
  }
  return { ok: true };
}
