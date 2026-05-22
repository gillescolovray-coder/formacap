"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateEnrollmentPortalToken } from "@/lib/portal/enrollment-token";

async function getAppOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

/**
 * Crée (ou récupère) le lien public partageable pour le PDF de
 * convocation d'un apprenant. Utilisé par le bouton « Gmail » qui
 * inclut ce lien dans le body du brouillon Gmail compose, pour que
 * le destinataire puisse récupérer le PDF en 1 clic (Option B Gilles
 * 2026-05-22 — Gmail ne permet pas d'attacher un fichier via URL).
 *
 * Le token réutilisé est celui du portail apprenant (1 token par
 * enrollment, persistant, sans expiration → preuve Qualiopi).
 */
export async function getConvocationPublicLink(
  enrollmentId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié" };

  try {
    const { token } = await getOrCreateEnrollmentPortalToken(
      supabase,
      enrollmentId,
    );
    const origin = await getAppOrigin();
    const url = `${origin}/api/public/convocations/${encodeURIComponent(token)}/pdf`;
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
