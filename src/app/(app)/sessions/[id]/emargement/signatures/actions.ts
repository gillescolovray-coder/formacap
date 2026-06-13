"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  assertSessionEditable,
  SESSION_CLOSED_MESSAGE,
} from "@/lib/sessions/lock";

export type AttendanceMoment = "morning" | "afternoon";
export type SignerRole = "learner" | "trainer";

type SaveSignatureInput = {
  sessionId: string;
  enrollmentId: string;
  periodDate: string; // ISO YYYY-MM-DD
  moment: AttendanceMoment;
  signerRole: SignerRole;
  signerName: string;
  /** Image PNG en data URL ("data:image/png;base64,…"). */
  signatureData: string;
};

/** Limite la taille pour éviter de saturer la BDD. ~250 Ko en base64. */
const MAX_SIGNATURE_BYTES = 250 * 1024;

function sanitize(input: string): string {
  return input.trim();
}

/**
 * Enregistre (ou met à jour) une signature pour une demi-journée
 * d'émargement. Met aussi à jour le statut de présence à `present`
 * automatiquement si pas encore renseigné — la présence d'une
 * signature implique la présence de la personne.
 */
export async function saveSignature(input: SaveSignatureInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const lock = await assertSessionEditable(supabase, input.sessionId);
  if (!lock.ok) throw new Error(SESSION_CLOSED_MESSAGE);

  // Validation basique du data URL
  const data = sanitize(input.signatureData);
  if (!data.startsWith("data:image/")) {
    throw new Error("Format de signature invalide");
  }
  if (data.length > MAX_SIGNATURE_BYTES) {
    throw new Error("Signature trop volumineuse");
  }

  const signerName = sanitize(input.signerName);
  if (!signerName) {
    throw new Error("Le nom du signataire est requis");
  }

  // Métadonnées de preuve (IP + User-Agent)
  const h = await headers();
  const ipFromHeader =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent") ?? null;

  const { error } = await supabase.from("attendance_signatures").upsert(
    {
      enrollment_id: input.enrollmentId,
      period_date: input.periodDate,
      moment: input.moment,
      signer_role: input.signerRole,
      signer_name: signerName,
      signature_data: data,
      signed_ip: ipFromHeader,
      signed_user_agent: userAgent,
      signed_at: new Date().toISOString(),
    },
    { onConflict: "enrollment_id,period_date,moment,signer_role" },
  );
  if (error) {
    console.error("saveSignature error:", error, {
      enrollmentId: input.enrollmentId,
      periodDate: input.periodDate,
      moment: input.moment,
      signerRole: input.signerRole,
    });
    throw new Error(error.message);
  }

  // Auto-marquage de présence : si l'apprenant signe, on passe son
  // statut à `present` (sans écraser un statut explicite déjà choisi
  // par le formateur, type "absent" ou "excused").
  if (input.signerRole === "learner") {
    const { data: existing } = await supabase
      .from("attendances")
      .select("status")
      .eq("enrollment_id", input.enrollmentId)
      .eq("period_date", input.periodDate)
      .eq("moment", input.moment)
      .maybeSingle();
    const currentStatus = existing?.status as string | undefined;
    const shouldOverride =
      !currentStatus || currentStatus === "not_recorded";
    if (shouldOverride) {
      await supabase.from("attendances").upsert(
        {
          enrollment_id: input.enrollmentId,
          period_date: input.periodDate,
          moment: input.moment,
          status: "present",
          marked_by: user.id,
        },
        { onConflict: "enrollment_id,period_date,moment" },
      );
    }
  }

  revalidatePath(`/sessions/${input.sessionId}/emargement`);
  revalidatePath(`/sessions/${input.sessionId}/emargement/signatures`);
}

type ClearSignatureInput = {
  sessionId: string;
  enrollmentId: string;
  periodDate: string;
  moment: AttendanceMoment;
  signerRole: SignerRole;
};

/** Supprime une signature précédemment enregistrée. */
export async function clearSignature(input: ClearSignatureInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const lock = await assertSessionEditable(supabase, input.sessionId);
  if (!lock.ok) throw new Error(SESSION_CLOSED_MESSAGE);

  const { error } = await supabase
    .from("attendance_signatures")
    .delete()
    .eq("enrollment_id", input.enrollmentId)
    .eq("period_date", input.periodDate)
    .eq("moment", input.moment)
    .eq("signer_role", input.signerRole);
  if (error) {
    console.error("clearSignature error:", error, input);
    throw new Error(error.message);
  }

  revalidatePath(`/sessions/${input.sessionId}/emargement`);
  revalidatePath(`/sessions/${input.sessionId}/emargement/signatures`);
}
