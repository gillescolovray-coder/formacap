/**
 * CRON : rappel quiz au formateur si les apprenants n'ont pas joué le
 * quiz dans la fenêtre attendue.
 *
 * - À 12h00 Paris : on alerte sur les quiz d'entrée (pre) NON joués
 *   le jour même, alors qu'une session est en cours aujourd'hui.
 * - À 16h00 Paris : on alerte sur les quiz de sortie (post) NON joués.
 *
 * Gilles 2026-05-25 : "envoyer egalement un message au formateur si
 * le quiz du matin n'a pas été réalisé avant 12H00 et pour celui de
 * l'après-midi avant 16h00".
 *
 * Implémentation Vercel : un seul handler /api/cron/quiz-reminder
 * appelé 2 fois par jour. Il lit l'heure Paris courante pour decider
 * quelle phase verifier. Cela permet d'absorber automatiquement les
 * passages CET <-> CEST sans devoir reconfigurer le cron.
 *
 * Schedules dans vercel.json :
 *   { "path": "/api/cron/quiz-reminder", "schedule": "0 10 * * *" }
 *      -> 10h UTC = 12h Paris en ete / 11h Paris en hiver -> verif pre
 *   { "path": "/api/cron/quiz-reminder", "schedule": "0 14 * * *" }
 *      -> 14h UTC = 16h Paris en ete / 15h Paris en hiver -> verif post
 *
 * Securite : Bearer CRON_SECRET (mode test sans token si non defini).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function getParisHourMinute(): { hour: number; minute: number; iso: string } {
  const now = new Date();
  const parisString = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [h, m] = parisString.split(":").map((x) => Number(x));
  // Date du jour au format YYYY-MM-DD a l'heure de Paris (utile pour
  // filtrer session_days.day_date).
  const dayString = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return { hour: h, minute: m, iso: dayString };
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
  }

  // Mode test : permet d'appeler /api/cron/quiz-reminder?phase=pre
  // ou ?phase=post manuellement, sans dependre de l'heure courante.
  const url = new URL(request.url);
  const phaseOverride = url.searchParams.get("phase") as
    | "pre"
    | "post"
    | null;

  const { hour, iso: today } = getParisHourMinute();

  // Determine la phase a verifier selon l'heure Paris.
  // Tolerance d'1 heure pour absorber le passage CET <-> CEST :
  //   - hour ∈ {11, 12} -> verif pre
  //   - hour ∈ {15, 16} -> verif post
  let phase: "pre" | "post" | null = phaseOverride;
  if (!phase) {
    if (hour === 11 || hour === 12) phase = "pre";
    else if (hour === 15 || hour === 16) phase = "post";
  }

  if (!phase) {
    return NextResponse.json({
      ok: true,
      message: `Hors creneau (Paris ${hour}h). Aucune verification effectuee.`,
      sent: 0,
    });
  }

  if (!isResendConfigured()) {
    return NextResponse.json({
      ok: true,
      message: "Resend non configure, rien a envoyer.",
      sent: 0,
      phase,
    });
  }

  const supabase = createAdminClient();

  // 1. Sessions ayant un jour planifie aujourd'hui (Paris).
  //    On recupere aussi le quiz_template_id effectif + le formateur.
  const { data: days, error: daysErr } = await supabase
    .from("session_days")
    .select(
      "session_id, day_date, session:sessions!inner(id, trainer_id, quiz_template_id, organization_id, formation:formations(title, quiz_template_id), trainer:trainers!trainer_id(first_name, last_name, email))",
    )
    .eq("day_date", today);
  if (daysErr) {
    return NextResponse.json(
      { ok: false, error: daysErr.message },
      { status: 500 },
    );
  }

  type SessionRow = {
    id: string;
    trainer_id: string | null;
    quiz_template_id: string | null;
    organization_id: string;
    formation: { title: string; quiz_template_id: string | null } | null;
    trainer: {
      first_name: string;
      last_name: string;
      email: string | null;
    } | null;
  };
  type DayRow = {
    session_id: string;
    day_date: string;
    session: SessionRow | SessionRow[] | null;
  };
  // Dedupe par session_id (au cas ou plusieurs jours seraient
  // remontes pour la meme session — normalement 1 seul pour aujourd'hui).
  const sessionMap = new Map<string, SessionRow>();
  ((days ?? []) as unknown as DayRow[]).forEach((d) => {
    const s = Array.isArray(d.session) ? d.session[0] : d.session;
    if (s) sessionMap.set(s.id, s);
  });

  if (sessionMap.size === 0) {
    return NextResponse.json({
      ok: true,
      message: `Aucune session planifiee pour aujourd'hui (${today}).`,
      sent: 0,
      phase,
    });
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com";

  // 2. Pour chaque session : trouver les apprenants sans tentative
  //    sur la phase visee, puis envoyer un email au formateur.
  let sent = 0;
  const errors: string[] = [];
  const skipped: string[] = [];

  for (const session of sessionMap.values()) {
    const effectiveQuizId =
      session.quiz_template_id ?? session.formation?.quiz_template_id ?? null;
    if (!effectiveQuizId) {
      skipped.push(`${session.id}: aucun quiz rattache`);
      continue;
    }
    if (!session.trainer?.email) {
      skipped.push(
        `${session.id}: formateur sans email (${session.trainer_id ?? "no trainer"})`,
      );
      continue;
    }

    // 2a. Liste des inscrits + nom learner
    const { data: enrolls } = await supabase
      .from("session_enrollments")
      .select(
        "id, learner:learners(first_name, last_name)",
      )
      .eq("session_id", session.id);
    type EnrRow = {
      id: string;
      learner: {
        first_name: string | null;
        last_name: string | null;
      } | null;
    };
    const list = ((enrolls ?? []) as unknown as EnrRow[]).filter(
      (e) => e.learner,
    );
    if (list.length === 0) continue;

    const enrollmentIds = list.map((e) => e.id);

    // 2b. Tentatives existantes sur la phase visee
    const { data: attempts } = await supabase
      .from("quiz_attempts")
      .select("enrollment_id, phase, completed_at")
      .in("enrollment_id", enrollmentIds)
      .eq("quiz_template_id", effectiveQuizId)
      .eq("phase", phase);
    const doneSet = new Set(
      ((attempts ?? []) as Array<{
        enrollment_id: string;
        completed_at: string | null;
      }>)
        .filter((a) => a.completed_at)
        .map((a) => a.enrollment_id),
    );

    // 2c. Apprenants qui n'ont PAS joue cette phase
    const missing = list.filter((e) => !doneSet.has(e.id));
    if (missing.length === 0) continue;

    // 2d. Trainer portal token pour lien direct
    const { data: trainerToken } = session.trainer_id
      ? await supabase
          .from("trainer_portal_tokens")
          .select("token")
          .eq("trainer_id", session.trainer_id)
          .maybeSingle<{ token: string }>()
      : { data: null };
    const sessionUrl = trainerToken
      ? `${origin}/formateur/${trainerToken.token}/sessions/${session.id}`
      : `${origin}/formateur`;

    const phaseLabel =
      phase === "pre" ? "quiz du matin (entree)" : "quiz de l'apres-midi (sortie)";
    const cutoffLabel = phase === "pre" ? "12h00" : "16h00";
    const formationTitle = session.formation?.title ?? "Formation";
    const trainerName = `${session.trainer.first_name} ${session.trainer.last_name}`;

    const missingHtml = missing
      .map((m) => {
        const fn = [m.learner?.first_name, m.learner?.last_name]
          .filter(Boolean)
          .join(" ");
        return `<li>${fn || "Apprenant"}</li>`;
      })
      .join("");

    const subject = `[FORMACAP] ${missing.length} apprenant${missing.length > 1 ? "s n'ont" : " n'a"} pas joue le ${phaseLabel}`;
    const html = `
      <p>Bonjour ${trainerName},</p>
      <p>Il est ${cutoffLabel} et ${missing.length} apprenant${missing.length > 1 ? "s n'ont" : " n'a"} pas encore joue le
      <strong>${phaseLabel}</strong> sur la session <strong>${formationTitle}</strong>
      du ${new Date(today).toLocaleDateString("fr-FR")}.</p>
      <ul>${missingHtml}</ul>
      <p>Pour leur rappeler : affichez le QR code quiz a vos apprenants depuis le portail formateur.</p>
      <p style="margin:20px 0;">
        <a href="${sessionUrl}"
           style="display:inline-block;background:#f59e0b;color:white;
                  text-decoration:none;padding:10px 18px;border-radius:8px;
                  font-weight:bold;">
          Ouvrir ma session
        </a>
      </p>
      <p style="font-size:12px;color:#666;">Email automatique CAP NUMERIQUE.</p>
    `;
    const text = `Bonjour ${trainerName},\n\nIl est ${cutoffLabel} et ${missing.length} apprenant${missing.length > 1 ? "s n'ont" : " n'a"} pas encore joue le ${phaseLabel} sur la session ${formationTitle} du ${new Date(today).toLocaleDateString("fr-FR")}.\n\nApprenants concernes :\n${missing.map((m) => `- ${[m.learner?.first_name, m.learner?.last_name].filter(Boolean).join(" ")}`).join("\n")}\n\nLien session : ${sessionUrl}\n`;

    const res = await sendEmail({
      to: session.trainer.email,
      toName: trainerName,
      subject,
      html,
      text,
    });

    if (res.ok) {
      sent += 1;
    } else {
      errors.push(`${session.id} -> ${res.error}`);
    }
    // Note : pas d'insertion dans email_log -> la CHECK contraint le
    // champ type a ('convocation', 'emargement') et la valeur
    // 'quiz_reminder' echouerait. Le suivi se fait via les logs Vercel
    // du cron (JSON renvoye en bout de route).
  }

  return NextResponse.json({
    ok: true,
    phase,
    today,
    sessionsChecked: sessionMap.size,
    sent,
    skipped,
    errors,
  });
}
