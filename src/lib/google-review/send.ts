/**
 * Logique d'envoi des demandes d'avis Google (Étape 2 — Gilles 2026-06-23).
 * Partagée par : l'envoi manuel (onglet Évaluation), l'écran de pilotage,
 * le CRON hebdomadaire et le déclencheur à la clôture de session.
 *
 * Le bouton de l'email pointe vers un lien TRACÉ (/api/r/gr/<id>) qui
 * enregistre le clic puis redirige vers le vrai lien Google.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { sendEmail } from "@/lib/email/resend";
import { buildGoogleReviewEmail } from "./email";

export type EligibleItem = {
  enrollmentId: string;
  sessionId: string | null;
  learnerId: string | null;
  firstName: string | null;
  name: string;
  email: string | null;
};

export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com").replace(
    /\/+$/,
    "",
  );
}

/**
 * Apprenants éligibles à une demande d'avis Google pour une organisation :
 * éval à chaud « Très satisfait » + email présent + PAS déjà sollicités.
 * `opts.sessionId` restreint à une session.
 */
export async function findEligibleItems(
  supabase: any,
  orgId: string,
  opts?: { sessionId?: string },
): Promise<EligibleItem[]> {
  let sq = supabase.from("sessions").select("id").eq("organization_id", orgId);
  if (opts?.sessionId) sq = sq.eq("id", opts.sessionId);
  const { data: sess } = await sq;
  const sessionIds = ((sess ?? []) as Array<{ id: string }>).map((s) => s.id);
  if (sessionIds.length === 0) return [];

  const { data: enr } = await supabase
    .from("session_enrollments")
    .select(
      "id, session_id, learner_id, learner:learners(first_name, last_name, email)",
    )
    .in("session_id", sessionIds)
    .neq("status", "cancelled");
  const enrollments = (enr ?? []) as Array<{
    id: string;
    session_id: string;
    learner_id: string | null;
    learner: any;
  }>;
  const enrollmentIds = enrollments.map((e) => e.id);
  if (enrollmentIds.length === 0) return [];

  const { data: ev } = await supabase
    .from("evaluation_responses")
    .select("enrollment_id")
    .eq("evaluation_type", "hot")
    .eq("satisfaction_overall", "very_satisfied")
    .in("enrollment_id", enrollmentIds);
  const verySatisfied = new Set(
    ((ev ?? []) as Array<{ enrollment_id: string }>).map((r) => r.enrollment_id),
  );

  const { data: gr } = await supabase
    .from("google_review_requests")
    .select("enrollment_id")
    .in("enrollment_id", enrollmentIds);
  const alreadySent = new Set(
    ((gr ?? []) as Array<{ enrollment_id: string }>).map((r) => r.enrollment_id),
  );

  return enrollments
    .filter((e) => verySatisfied.has(e.id) && !alreadySent.has(e.id))
    .map((e) => {
      const l = Array.isArray(e.learner) ? e.learner[0] : e.learner;
      return {
        enrollmentId: e.id,
        sessionId: e.session_id,
        learnerId: e.learner_id,
        firstName: l?.first_name ?? null,
        name:
          [l?.first_name, l?.last_name].filter(Boolean).join(" ").trim() || "—",
        email: l?.email ?? null,
      };
    })
    .filter((i) => Boolean(i.email));
}

/**
 * Envoie l'email d'avis Google à une liste d'apprenants + trace chaque envoi.
 * Anti-doublon garanti par l'index unique sur enrollment_id (un échec
 * d'insertion = déjà sollicité -> ignoré). En cas d'échec d'envoi, la ligne
 * est supprimée pour permettre une nouvelle tentative.
 */
export async function sendForItems(
  supabase: any,
  params: {
    orgId: string;
    items: EligibleItem[];
    channel: "manual" | "auto";
    sentBy?: string | null;
  },
): Promise<{ sent: number; skipped: number; error?: string }> {
  const { orgId, items, channel, sentBy } = params;
  if (items.length === 0) return { sent: 0, skipped: 0 };

  const { data: org } = await supabase
    .from("organizations")
    .select("name, logo_url, email, google_review_url")
    .eq("id", orgId)
    .maybeSingle();
  const reviewUrl = (org?.google_review_url ?? "").trim();
  if (!reviewUrl) return { sent: 0, skipped: items.length, error: "no_url" };

  let sent = 0;
  let skipped = 0;
  for (const it of items) {
    if (!it.email) {
      skipped += 1;
      continue;
    }
    // Insertion d'abord (récupère l'id pour le lien tracé + anti-doublon).
    const { data: row, error: insErr } = await supabase
      .from("google_review_requests")
      .insert({
        organization_id: orgId,
        enrollment_id: it.enrollmentId,
        session_id: it.sessionId,
        learner_id: it.learnerId,
        email: it.email,
        channel,
        sent_by: sentBy ?? null,
        status: "sent",
      })
      .select("id")
      .maybeSingle();
    if (insErr || !row) {
      skipped += 1; // déjà sollicité (unique) ou erreur
      continue;
    }
    const tracked = `${appBaseUrl()}/api/r/gr/${row.id}`;
    const { subject, html } = buildGoogleReviewEmail({
      learnerFirstName: it.firstName,
      orgName: org?.name ?? "CAP NUMERIQUE",
      orgLogoUrl: org?.logo_url ?? null,
      reviewUrl,
      buttonUrl: tracked,
    });
    const res = await sendEmail({
      to: it.email,
      toName: it.name,
      subject,
      html,
      replyTo: org?.email ?? undefined,
    });
    if (!res.ok) {
      await supabase.from("google_review_requests").delete().eq("id", row.id);
      skipped += 1;
      continue;
    }
    await supabase
      .from("google_review_requests")
      .update({ resend_message_id: res.providerId || null })
      .eq("id", row.id);
    sent += 1;
  }
  return { sent, skipped };
}
