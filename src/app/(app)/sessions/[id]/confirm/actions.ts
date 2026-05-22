"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";
import { loadTrainerConvocationEmailTemplate } from "@/lib/document-templates/loader";
import {
  buildTrainerPortalUrl,
  getOrCreateTrainerPortalToken,
} from "@/lib/portal/trainer-token";

async function getAppOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export type ConfirmSessionResult = {
  ok: boolean;
  error?: string;
  /** True si le formateur a bien été notifié par email. */
  trainerEmailSent?: boolean;
  /** True si le formateur n'avait pas d'email (statut quand même passé à confirmed). */
  noTrainerEmail?: boolean;
};

/**
 * Confirme une session :
 *  1. Vérifie qu'un formateur est assigné
 *  2. Passe le statut à 'confirmed'
 *  3. Crée le token portail formateur (idempotent)
 *  4. Envoie l'email de convocation au formateur avec le lien vers
 *     son portail (modèle éditable trainer_convocation_email)
 *
 * L'envoi email est non-bloquant : si Resend n'est pas configuré
 * ou si le formateur n'a pas d'email, on confirme quand même la
 * session mais on signale le problème au caller.
 */
export async function confirmSession(
  sessionId: string,
): Promise<ConfirmSessionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };

  // 1. Charger la session avec toutes les infos nécessaires
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, organization_id, status, start_date, end_date, modality, location, trainer_id, video_link, formation:formations(title, duration_hours), trainer:trainers!trainer_id(id, first_name, last_name, email), location_ref:formation_locations!location_id(name, address, postal_code, city)",
    )
    .eq("id", sessionId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      status: string | null;
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
    }>();

  if (!session) return { ok: false, error: "Session introuvable." };

  // Auto-promotion (Gilles 2026-05-22) : si la session n'a pas de
  // trainer_id défini MAIS qu'un jour de session a un formateur assigné,
  // on promeut ce formateur comme formateur principal de la session.
  // Évite l'erreur "Aucun formateur assigné" alors qu'un formateur est
  // bien défini au niveau des jours.
  if (!session.trainer_id || !session.trainer) {
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
        trainer: {
          id: string;
          first_name: string;
          last_name: string;
          email: string | null;
        } | null;
      }>();

    if (dayTrainer?.trainer_id && dayTrainer.trainer) {
      // Promotion : on met à jour la session pour cohérence ultérieure.
      await supabase
        .from("sessions")
        .update({ trainer_id: dayTrainer.trainer_id })
        .eq("id", sessionId);
      session.trainer_id = dayTrainer.trainer_id;
      session.trainer = dayTrainer.trainer;
    } else {
      return {
        ok: false,
        error:
          "Aucun formateur n'est assigné à cette session. Veuillez d'abord en désigner un (sur la fiche session ou sur au moins un jour).",
      };
    }
  }

  // 2. Passer le statut à 'confirmed' (et seulement si pas déjà confirmé)
  if (session.status !== "confirmed") {
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ status: "confirmed" })
      .eq("id", sessionId);
    if (updateError) {
      return { ok: false, error: updateError.message };
    }
  }

  // 3. Token portail formateur (idempotent)
  const portal = await getOrCreateTrainerPortalToken(
    supabase,
    session.trainer.id,
  );
  const origin = await getAppOrigin();
  const portalUrl = buildTrainerPortalUrl(origin, portal.token);

  // 4. Envoyer l'email convocation formateur
  if (!session.trainer.email) {
    revalidatePath(`/sessions/${sessionId}`);
    return { ok: true, trainerEmailSent: false, noTrainerEmail: true };
  }
  if (!isResendConfigured()) {
    revalidatePath(`/sessions/${sessionId}`);
    return {
      ok: true,
      trainerEmailSent: false,
      error: "Resend non configuré : email non envoyé.",
    };
  }

  // Préparer les variables pour le template
  const trainerName = `${session.trainer.first_name} ${session.trainer.last_name}`;
  const formationTitle = session.formation?.title ?? "—";

  // Client = entreprises liées via inscriptions
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("learner:learners(company:companies(name))")
    .eq("session_id", sessionId);
  const companyNames = Array.from(
    new Set(
      ((enrollments ?? []) as unknown as Array<{
        learner: { company: { name: string } | null } | null;
      }>)
        .map((e) => e.learner?.company?.name)
        .filter((n): n is string => !!n),
    ),
  );
  const clientName =
    companyNames.length > 0 ? companyNames.join(", ") : "—";
  const nbParticipants = (enrollments ?? []).length;

  // Dates / horaires : on récupère les jours pour calculer l'amplitude
  const { data: days } = await supabase
    .from("session_days")
    .select(
      "day_date, morning_start, morning_end, afternoon_start, afternoon_end",
    )
    .eq("session_id", sessionId)
    .order("day_date", { ascending: true });

  const sessionDateLabel = formatDateRange(
    session.start_date,
    session.end_date,
  );
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

  // Charger le template + substituer
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

  const subject = substituteVars(blocks.subject_template, vars);
  const html = [
    substituteVars(blocks.intro_html, vars),
    substituteVars(blocks.main_html, vars),
    substituteVars(blocks.closing_html, vars),
  ].join("\n");
  const text = htmlToText(html);

  const result = await sendEmail({
    to: session.trainer.email,
    toName: trainerName,
    subject,
    html,
    text,
    replyTo: org?.email ?? undefined,
  });

  revalidatePath(`/sessions/${sessionId}`);

  if (!result.ok) {
    return {
      ok: true,
      trainerEmailSent: false,
      error: `Statut passé à confirmé, mais email non envoyé : ${result.error}`,
    };
  }
  return { ok: true, trainerEmailSent: true };
}

/**
 * Variante "form-friendly" : appelable depuis un <form action={}> sur
 * la page session. Redirige avec un message en query string.
 */
export async function confirmSessionFormAction(sessionId: string) {
  const res = await confirmSession(sessionId);
  const q = new URLSearchParams();
  if (!res.ok) {
    q.set("error", res.error ?? "Erreur lors de la confirmation.");
  } else if (res.noTrainerEmail) {
    q.set(
      "warning",
      "Session confirmée mais le formateur n'a pas d'email renseigné — convocation non envoyée.",
    );
  } else if (!res.trainerEmailSent) {
    q.set("warning", res.error ?? "Session confirmée, email non envoyé.");
  } else {
    q.set("confirmed", "1");
  }
  redirect(`/sessions/${sessionId}?${q.toString()}`);
}

// ============================================================
// Helpers locaux
// ============================================================

function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
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
  // Plage la plus courante (utilise le 1er jour)
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
