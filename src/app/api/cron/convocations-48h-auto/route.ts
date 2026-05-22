/**
 * CRON quotidien : envoi auto des convocations 48h avant la session.
 * Gilles 2026-05-22.
 *
 * Cible : UNIQUEMENT les apprenants inscrits via un OF partenaire
 * (inscription_channel = 'of') qui n'ont pas encore reçu leur
 * convocation. Filet de sécurité Qualiopi si Gilles oublie d'envoyer
 * manuellement.
 *
 * Pour les apprenants directs CAP NUMÉRIQUE, l'envoi reste manuel
 * (Gilles veut piloter au cas par cas).
 *
 * Logique :
 *   1. Cherche les sessions démarrant dans 47-49h (fenêtre 48h ±1)
 *   2. Pour chaque session : récupère les apprenants OF non convoqués
 *   3. Envoie la convocation à chacun via sendConvocationEmail
 *   4. Log les envois dans email_logs pour traçabilité Qualiopi
 *
 * Cron Vercel : tous les jours à 7h (UTC) = 9h FR été / 8h hiver.
 *
 * Sécurité : route protégée par CRON_SECRET (header Authorization).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendConvocationEmail } from "@/app/(app)/sessions/[id]/convocations/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type SessionRow = {
  id: string;
  start_date: string | null;
};

type EnrollmentRow = {
  id: string;
  session_id: string;
  convocation_sent_at: string | null;
  inscription_request_id: string | null;
};

type InscriptionRequestRow = {
  id: string;
  inscription_channel: string | null;
  referrer:
    | { type: string | null; name: string | null }
    | Array<{ type: string | null; name: string | null }>
    | null;
};

export async function GET(req: NextRequest) {
  // Vérif simple : header Authorization = Bearer <CRON_SECRET>
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null;
  if (expected && auth !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, {
      status: 401,
    });
  }

  const supabase = createAdminClient();

  // Fenêtre 47-49h à partir de maintenant (UTC ; on calcule sur la date
  // de démarrage de la session — toutes les sessions démarrent
  // typiquement le matin donc fenêtre 48h ± buffer).
  const now = new Date();
  const startMin = new Date(now.getTime() + 47 * 3600 * 1000);
  const startMax = new Date(now.getTime() + 49 * 3600 * 1000);
  const startMinIso = startMin.toISOString().slice(0, 10);
  const startMaxIso = startMax.toISOString().slice(0, 10);

  // 1. Sessions démarrant dans la fenêtre
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, start_date")
    .gte("start_date", startMinIso)
    .lte("start_date", startMaxIso)
    .in("status", ["confirmed", "planned"]);

  const sessionRows = (sessions ?? []) as SessionRow[];
  if (sessionRows.length === 0) {
    return NextResponse.json({
      ok: true,
      checked: 0,
      sent: 0,
      message: "Aucune session dans la fenêtre 48h",
    });
  }

  const sessionIds = sessionRows.map((s) => s.id);

  // 2. Enrollments non convoqués sur ces sessions
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("id, session_id, convocation_sent_at, inscription_request_id")
    .in("session_id", sessionIds)
    .is("convocation_sent_at", null);

  const enrollmentRows = (enrollments ?? []) as EnrollmentRow[];
  if (enrollmentRows.length === 0) {
    return NextResponse.json({
      ok: true,
      checked: sessionRows.length,
      sent: 0,
      message: "Aucune convocation manquante",
    });
  }

  // 3. Filtre : seulement les apprenants OF (inscription_channel='of' +
  //    referrer.type='of'). On charge les inscription_requests pertinentes.
  const requestIds = enrollmentRows
    .map((e) => e.inscription_request_id)
    .filter((x): x is string => Boolean(x));
  let partnerOfRequestIds = new Set<string>();
  if (requestIds.length > 0) {
    const { data: reqs } = await supabase
      .from("inscription_requests")
      .select(
        "id, inscription_channel, referrer:companies!inscription_channel_company_id(type, name)",
      )
      .in("id", requestIds);
    for (const r of (reqs ?? []) as InscriptionRequestRow[]) {
      const ref = Array.isArray(r.referrer) ? r.referrer[0] : r.referrer;
      if (r.inscription_channel === "of" && ref?.type === "of") {
        partnerOfRequestIds.add(r.id);
      }
    }
  }

  const enrollmentsToConvoke = enrollmentRows.filter(
    (e) =>
      e.inscription_request_id &&
      partnerOfRequestIds.has(e.inscription_request_id),
  );

  if (enrollmentsToConvoke.length === 0) {
    return NextResponse.json({
      ok: true,
      checked: enrollmentRows.length,
      sent: 0,
      message: "Aucun apprenant OF à convoquer (tous déjà fait)",
    });
  }

  // 4. Envoi un par un (avec sendConvocationEmail qui gère déjà email
  //    + log + marquage convocation_sent_at)
  let sent = 0;
  const failures: Array<{ enrollmentId: string; error: string }> = [];
  for (const e of enrollmentsToConvoke) {
    const res = await sendConvocationEmail(e.session_id, e.id);
    if (res.ok) {
      sent += 1;
    } else {
      failures.push({
        enrollmentId: e.id,
        error: res.error ?? "Erreur inconnue",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: enrollmentsToConvoke.length,
    sent,
    failures: failures.length > 0 ? failures : undefined,
    sessions: sessionRows.length,
  });
}
