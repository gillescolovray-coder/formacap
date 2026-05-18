"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type SubmitSignatureInput = {
  token: string;
  enrollmentId: string;
  signerName: string;
  periodDate: string;
  moment: "morning" | "afternoon";
  signatureDataUrl: string;
};

export type SubmitSignatureResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Action serveur appelée depuis la page publique /signer/[token].
 *
 * Vérifie que le token est valide (existe, non expiré) et qu'il pointe sur
 * la bonne inscription. Insère la signature dans `attendance_signatures`
 * (la RLS publique autorise cet INSERT si un signature_link valide existe
 * pour l'inscription) et marque le lien comme `used_at` à la première
 * signature. Met aussi le statut de présence à 'present' si pas déjà fait.
 */
export async function submitRemoteSignature(
  input: SubmitSignatureInput,
): Promise<SubmitSignatureResult> {
  if (!input.signatureDataUrl.startsWith("data:image/png;base64,")) {
    return { ok: false, error: "Format de signature invalide." };
  }
  if (input.signerName.trim().length < 2) {
    return { ok: false, error: "Merci de saisir votre nom complet." };
  }

  const supabase = await createClient();

  // 1. Vérifier le token
  const { data: link } = await supabase
    .from("signature_links")
    .select("id, enrollment_id, expires_at")
    .eq("token", input.token)
    .eq("enrollment_id", input.enrollmentId)
    .maybeSingle<{ id: string; enrollment_id: string; expires_at: string }>();

  if (!link) {
    return { ok: false, error: "Lien invalide." };
  }
  if (new Date(link.expires_at) < new Date()) {
    return { ok: false, error: "Ce lien a expiré." };
  }

  // 2. Récupérer IP et user-agent pour audit
  const h = await headers();
  const userAgent = h.get("user-agent") ?? null;
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]?.trim() : null;

  // 3. Insérer la signature (RLS publique autorise cet INSERT)
  const { error: sigError } = await supabase.from("attendance_signatures").upsert(
    {
      enrollment_id: input.enrollmentId,
      period_date: input.periodDate,
      moment: input.moment,
      signer_role: "learner",
      signer_name: input.signerName.trim(),
      signature_data: input.signatureDataUrl,
      signed_ip: ip,
      signed_user_agent: userAgent,
      signed_at: new Date().toISOString(),
    },
    { onConflict: "enrollment_id,period_date,moment,signer_role" },
  );

  if (sigError) {
    return {
      ok: false,
      error: `Échec de l'enregistrement : ${sigError.message}`,
    };
  }

  // 4. Marquer la présence à "present" si pas déjà renseignée
  await supabase.from("attendances").upsert(
    {
      enrollment_id: input.enrollmentId,
      period_date: input.periodDate,
      moment: input.moment,
      status: "present",
    },
    { onConflict: "enrollment_id,period_date,moment", ignoreDuplicates: false },
  );

  // 5. Marquer le lien comme utilisé (première signature)
  await supabase
    .from("signature_links")
    .update({
      used_at: new Date().toISOString(),
      used_ip: ip,
      used_user_agent: userAgent,
    })
    .eq("id", link.id)
    .is("used_at", null);

  revalidatePath(`/signer/${input.token}`);
  return { ok: true };
}
