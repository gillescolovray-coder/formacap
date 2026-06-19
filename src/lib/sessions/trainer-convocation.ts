import "server-only";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";
import { loadTrainerConvocationEmailTemplate } from "@/lib/document-templates/loader";
import {
  buildTrainerPortalUrl,
  getTrainerPortalToken,
} from "@/lib/portal/trainer-token";

/**
 * Envoi de la convocation FORMATEUR + traçabilité (Gilles 2026-06-16).
 *
 * Source UNIQUE utilisée par les deux chemins de confirmation :
 *   - fiche session « Confirmer / Renvoyer convocation formateur » (confirmSession) ;
 *   - menu statut rapide du tableau (updateSessionStatusQuick) quand on
 *     passe une session en « Confirmée ».
 *
 * Enregistre systématiquement le résultat sur la session :
 *   - succès  -> trainer_convocation_sent_at + trainer_convocation_to, erreur effacée ;
 *   - échec   -> trainer_convocation_error renseignée (sent_at conservé tel quel).
 */

export type TrainerConvocationReason =
  | "ok"
  | "no_trainer"
  | "no_email"
  | "not_configured"
  | "send_failed";

export type TrainerConvocationResult = {
  sent: boolean;
  reason: TrainerConvocationReason;
  error?: string;
  to?: string;
};

type Db = SupabaseClient;

async function getAppOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

type SessionForConvocation = {
  id: string;
  organization_id: string;
  start_date: string;
  end_date: string;
  modality: string | null;
  location: string | null;
  trainer_id: string | null;
  video_link: string | null;
  formation: { title: string; duration_hours: number | null } | null;
  trainer: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  } | null;
  location_ref: {
    name: string;
    address: string | null;
    postal_code: string | null;
    city: string | null;
  } | null;
};

/** Enregistre le résultat de l'envoi sur la session (trace persistante). */
async function recordTrace(
  supabase: Db,
  sessionId: string,
  patch: {
    sent_at?: string | null;
    to?: string | null;
    error?: string | null;
  },
) {
  const update: Record<string, unknown> = {};
  if ("sent_at" in patch) update.trainer_convocation_sent_at = patch.sent_at;
  if ("to" in patch) update.trainer_convocation_to = patch.to;
  if ("error" in patch) update.trainer_convocation_error = patch.error;
  if (Object.keys(update).length === 0) return;
  await supabase.from("sessions").update(update).eq("id", sessionId);
}

/**
 * Charge la session + formateur. Promeut au besoin le formateur d'un jour
 * comme formateur principal (cohérent avec l'ancienne logique de confirmation).
 */
async function loadSession(
  supabase: Db,
  sessionId: string,
): Promise<SessionForConvocation | null> {
  const { data } = await supabase
    .from("sessions")
    .select(
      "id, organization_id, start_date, end_date, modality, location, trainer_id, video_link, formation:formations(title, duration_hours), trainer:trainers!trainer_id(id, first_name, last_name, email), location_ref:formation_locations!location_id(name, address, postal_code, city)",
    )
    .eq("id", sessionId)
    .maybeSingle<SessionForConvocation>();
  if (!data) return null;

  if (!data.trainer_id || !data.trainer) {
    const { data: dayTrainer } = await supabase
      .from("session_days")
      .select(
        "trainer_id, trainer:trainers!trainer_id(id, first_name, last_name, email)",
      )
      .eq("session_id", sessionId)
      .not("trainer_id", "is", null)
      .order("day_date", { ascending: true })
      .limit(1)
      .maybeSingle<{
        trainer_id: string | null;
        trainer: SessionForConvocation["trainer"];
      }>();
    if (dayTrainer?.trainer_id && dayTrainer.trainer) {
      await supabase
        .from("sessions")
        .update({ trainer_id: dayTrainer.trainer_id })
        .eq("id", sessionId);
      data.trainer_id = dayTrainer.trainer_id;
      data.trainer = dayTrainer.trainer;
    }
  }
  return data;
}

export async function sendTrainerConvocation(
  supabase: Db,
  sessionId: string,
): Promise<TrainerConvocationResult> {
  const session = await loadSession(supabase, sessionId);
  if (!session || !session.trainer) {
    await recordTrace(supabase, sessionId, {
      error: "Aucun formateur assigné à la session.",
    });
    return { sent: false, reason: "no_trainer", error: "Aucun formateur assigné." };
  }
  if (!session.trainer.email) {
    await recordTrace(supabase, sessionId, {
      error: "Le formateur n'a pas d'adresse email renseignée.",
    });
    return {
      sent: false,
      reason: "no_email",
      error: "Le formateur n'a pas d'email.",
    };
  }
  if (!isResendConfigured()) {
    await recordTrace(supabase, sessionId, {
      error: "Service email (Resend) non configuré.",
    });
    return {
      sent: false,
      reason: "not_configured",
      error: "Resend non configuré.",
    };
  }

  const { subject, html, text, orgEmail } = await composeConvocation(
    supabase,
    session,
  );

  const result = await sendEmail({
    to: session.trainer.email,
    toName: `${session.trainer.first_name} ${session.trainer.last_name}`,
    subject,
    html,
    text,
    replyTo: orgEmail ?? undefined,
    // Copie (CC) à l'organisation (Paramètres → Organisation) pour que
    // l'OF garde une trace de chaque convocation envoyée au formateur
    // (Gilles 2026-06-17). En mode test (EMAIL_REDIRECT_TO) le CC est ignoré.
    cc: orgEmail ? [orgEmail] : undefined,
  });

  if (!result.ok) {
    await recordTrace(supabase, sessionId, {
      error: `Échec de l'envoi : ${result.error}`,
    });
    return {
      sent: false,
      reason: "send_failed",
      error: result.error,
      to: session.trainer.email,
    };
  }

  await recordTrace(supabase, sessionId, {
    sent_at: new Date().toISOString(),
    to: session.trainer.email,
    error: null,
  });
  return { sent: true, reason: "ok", to: session.trainer.email };
}

/**
 * Compose le contenu de la convocation formateur (sujet + HTML + texte) à
 * partir des DONNÉES ACTUELLES de la session. Utilisé pour l'envoi email ET
 * pour l'affichage « Voir ma convocation » dans le portail formateur
 * (Gilles 2026-06-19) — donc toujours à jour si la session est modifiée.
 */
async function composeConvocation(
  supabase: Db,
  session: SessionForConvocation,
): Promise<{ subject: string; html: string; text: string; orgEmail: string | null }> {
  const trainerName = session.trainer
    ? `${session.trainer.first_name} ${session.trainer.last_name}`
    : "Formateur";
  const formationTitle = session.formation?.title ?? "—";

  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("learner:learners(company:companies(name))")
    .eq("session_id", session.id);
  const companyNames = Array.from(
    new Set(
      ((enrollments ?? []) as unknown as Array<{
        learner: { company: { name: string } | null } | null;
      }>)
        .map((e) => e.learner?.company?.name)
        .filter((n): n is string => !!n),
    ),
  );
  const clientName = companyNames.length > 0 ? companyNames.join(", ") : "—";
  const nbParticipants = (enrollments ?? []).length;

  const { data: days } = await supabase
    .from("session_days")
    .select(
      "day_date, morning_start, morning_end, afternoon_start, afternoon_end, trainer_notes",
    )
    .eq("session_id", session.id)
    .order("day_date", { ascending: true });

  const sessionDateLabel = formatDateRange(session.start_date, session.end_date);
  const sessionHoursLabel = computeHoursLabel(
    days as Array<{
      morning_start: string | null;
      morning_end: string | null;
      afternoon_start: string | null;
      afternoon_end: string | null;
    }> | null,
  );
  const durationHoursLabel = session.formation?.duration_hours
    ? `${session.formation.duration_hours} h`
    : sessionHoursLabel.totalHours
      ? `${sessionHoursLabel.totalHours} h`
      : "—";

  const modalityLabel =
    session.modality === "presentiel"
      ? "Présentiel"
      : session.modality === "distanciel"
        ? "Distanciel"
        : session.modality === "hybride"
          ? "Hybride"
          : "—";

  let locationLabel = "—";
  if (session.modality === "distanciel" && session.video_link) {
    locationLabel = session.video_link;
  } else if (session.location_ref) {
    const parts = [
      session.location_ref.name,
      session.location_ref.address,
      [session.location_ref.postal_code, session.location_ref.city]
        .filter(Boolean)
        .join(" "),
    ].filter(Boolean);
    locationLabel = parts.join(" — ");
  } else if (session.location) {
    locationLabel = session.location;
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("name, email")
    .eq("id", session.organization_id)
    .maybeSingle<{ name: string; email: string | null }>();
  const orgName = org?.name ?? "—";

  const portal = session.trainer
    ? await getTrainerPortalToken(supabase, session.trainer.id)
    : null;
  const origin = await getAppOrigin();
  const portalUrl = portal ? buildTrainerPortalUrl(origin, portal.token) : "";

  const { blocks } = await loadTrainerConvocationEmailTemplate(
    session.organization_id,
  );

  const vars: Record<string, string> = {
    trainer_name: trainerName,
    formation_title: formationTitle,
    client_name: clientName,
    session_date: sessionDateLabel,
    session_hours: sessionHoursLabel.hoursLabel,
    duration_hours: durationHoursLabel,
    session_modality: modalityLabel,
    session_location: locationLabel,
    nb_participants: String(nbParticipants),
    org_name: orgName,
    portal_url: portalUrl,
  };

  // Encart « Consignes pour cette session » (code salle, accès, matériel…)
  // saisies par jour côté back-office — Gilles 2026-06-19. Inséré dans la
  // convocation (email ET page « Voir ma convocation »), style proche de
  // l'encart « Accès apprenant ».
  const consigneItems = ((days ?? []) as Array<{
    day_date: string;
    trainer_notes: string | null;
  }>)
    .filter((d) => (d.trainer_notes ?? "").trim().length > 0)
    .map((d) => {
      const note = escapeHtml((d.trainer_notes ?? "").trim());
      const dateLabel =
        (days?.length ?? 0) > 1
          ? `<strong>${new Date(d.day_date + "T00:00:00").toLocaleDateString("fr-FR")} :</strong> `
          : "";
      return `<li style="margin:0 0 4px;">${dateLabel}${note}</li>`;
    });
  const consignesBox =
    consigneItems.length > 0
      ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:8px;padding:12px 14px;margin:16px 0;font-family:Arial,Helvetica,sans-serif;">` +
        `<p style="margin:0 0 6px;font-weight:bold;color:#92400e;font-size:14px;">📋 Consignes pour cette session</p>` +
        `<ul style="margin:0;padding-left:18px;color:#78350f;font-size:13px;line-height:1.5;">${consigneItems.join("")}</ul>` +
        `</div>`
      : "";

  const subject = substituteVars(blocks.subject_template, vars);
  const html = [
    substituteVars(blocks.intro_html, vars),
    substituteVars(blocks.main_html, vars),
    consignesBox,
    substituteVars(blocks.closing_html, vars),
  ].join("\n");
  const text = htmlToText(html);
  return { subject, html, text, orgEmail: org?.email ?? null };
}

/**
 * Construit le HTML de la convocation formateur pour AFFICHAGE (page « Voir ma
 * convocation »). Renvoie null si la session/formateur est introuvable.
 */
export async function buildTrainerConvocationHtml(
  supabase: Db,
  sessionId: string,
): Promise<{ subject: string; html: string } | null> {
  const session = await loadSession(supabase, sessionId);
  if (!session || !session.trainer) return null;
  const { subject, html } = await composeConvocation(supabase, session);
  return { subject, html };
}

// ── Helpers locaux (repris de confirm/actions.ts) ───────────────────────────

function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

/** Échappe le texte libre des consignes avant injection HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatDateRange(start: string, end: string): string {
  if (start === end) {
    return new Date(start).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  return `du ${new Date(start).toLocaleDateString("fr-FR")} au ${new Date(end).toLocaleDateString("fr-FR")}`;
}

function computeHoursLabel(
  days:
    | Array<{
        morning_start: string | null;
        morning_end: string | null;
        afternoon_start: string | null;
        afternoon_end: string | null;
      }>
    | null,
): { hoursLabel: string; totalHours: number } {
  if (!days || days.length === 0) return { hoursLabel: "—", totalHours: 0 };
  const d = days[0];
  const trim = (t: string | null) =>
    t ? (t.length >= 5 ? t.slice(0, 5) : t) : "—";
  const hoursLabel = `${trim(d.morning_start)}–${trim(d.morning_end)} et ${trim(d.afternoon_start)}–${trim(d.afternoon_end)}`;

  const toMin = (t: string | null) => {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };
  let totalMin = 0;
  for (const day of days) {
    const ms = toMin(day.morning_start);
    const me = toMin(day.morning_end);
    if (ms !== null && me !== null && me > ms) totalMin += me - ms;
    const as = toMin(day.afternoon_start);
    const ae = toMin(day.afternoon_end);
    if (as !== null && ae !== null && ae > as) totalMin += ae - as;
  }
  return { hoursLabel, totalHours: Math.round((totalMin / 60) * 10) / 10 };
}
