"use server";

import { revalidatePath } from "next/cache";
import {
  loadAndComputeBillingForInscription,
  persistComputedBilling,
} from "@/lib/billing/compute-billing";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { findEligibleItems, sendForItems } from "@/lib/google-review/send";
import { recomputeConventionAmount } from "./[id]/conventions/actions";
import type { FormationModality } from "@/lib/formations/types";
import type { SessionActionType, SessionStatus } from "@/lib/sessions/types";
import {
  syncSessionCalendar,
  purgeAllCalendarEvents,
  deleteSessionCalendarEvents,
  syncSessionsNeedingUpdate,
} from "@/lib/google-calendar/sync";
import { isCalendarConfigured } from "@/lib/google-calendar/client";
import { assertSessionEditable } from "@/lib/sessions/lock";
import {
  sendTrainerConvocation,
  type TrainerConvocationResult,
} from "@/lib/sessions/trainer-convocation";

async function getCurrentOrganizationId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Aucune organisation rattachée à ce compte");
  return { organizationId: data.organization_id, userId: user.id };
}

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

function parseInt(raw: FormDataEntryValue | null): number | null {
  const s = parseText(raw);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

function parseDecimal(raw: FormDataEntryValue | null): number | null {
  const s = parseText(raw);
  if (!s) return null;
  // Tolère la virgule française ("1 234,50") ou le format anglais.
  const normalized = s.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function buildPayload(formData: FormData) {
  return {
    formation_id: parseText(formData.get("formation_id")),
    start_date: parseText(formData.get("start_date")),
    end_date: parseText(formData.get("end_date")),
    start_time: parseText(formData.get("start_time")),
    end_time: parseText(formData.get("end_time")),
    default_morning_start: parseText(formData.get("default_morning_start")),
    default_morning_end: parseText(formData.get("default_morning_end")),
    default_afternoon_start: parseText(formData.get("default_afternoon_start")),
    default_afternoon_end: parseText(formData.get("default_afternoon_end")),
    modality:
      (parseText(formData.get("modality")) as FormationModality | null) ??
      null,
    presentiel_percent: parseInt(formData.get("presentiel_percent")),
    location: parseText(formData.get("location")),
    location_id: parseText(formData.get("location_id")),
    video_app: parseText(formData.get("video_app")),
    video_link: parseText(formData.get("video_link")),
    video_instructions: parseText(formData.get("video_instructions")),
    // Override du lien Drive des supports (NULL = hérite de la formation).
    support_drive_url: parseText(formData.get("support_drive_url")),
    trainer_id: parseText(formData.get("trainer_id")),
    trainer_name: parseText(formData.get("trainer_name")),
    trainer_notes: parseText(formData.get("trainer_notes")),
    quiz_template_id: parseText(formData.get("quiz_template_id")),
    positioning_template_id: parseText(
      formData.get("positioning_template_id"),
    ),
    min_participants: parseInt(formData.get("min_participants")),
    max_participants: parseInt(formData.get("max_participants")),
    status:
      (parseText(formData.get("status")) as SessionStatus | null) ?? "draft",
    internal_code: parseText(formData.get("internal_code")),
    action_type:
      (parseText(formData.get("action_type")) as SessionActionType | null) ??
      "action_formation",
    nsf_specialty: parseText(formData.get("nsf_specialty")),
    target_diploma: parseText(formData.get("target_diploma")),
    target_certification: parseText(formData.get("target_certification")),
    // is_inter : compatible avec l'ancienne checkbox ("on") et le
    // nouveau toggle radio (valeur "inter"). "intra" → false.
    is_inter:
      formData.get("is_inter") === "on" ||
      formData.get("is_inter") === "inter",
    is_subcontracted: formData.get("is_subcontracted") === "on",
    subcontractor_name: parseText(formData.get("subcontractor_name")),
    // FK vers companies — Gilles 2026-06-01 — permet au portail de cet OF
    // d afficher la session dans son catalogue.
    subcontracting_company_id: parseText(
      formData.get("subcontracting_company_id"),
    ),
    prescriber_company_id: parseText(formData.get("prescriber_company_id")),
    amount_ht: parseDecimal(formData.get("amount_ht")),
    // ----- Tarification cascade (R7) -----
    // pricing_mode est déduit par le composant PricingBlock à partir
    // de is_inter (INTER → per_learner, INTRA → forfait). On le lit
    // tel quel pour rester cohérent avec ce qui s'affiche à l'écran.
    pricing_mode: (() => {
      const v = parseText(formData.get("pricing_mode"));
      return v === "per_learner" || v === "forfait" ? v : null;
    })(),
    price_per_day_ht: parseDecimal(formData.get("price_per_day_ht")),
    price_forfait_ht: parseDecimal(formData.get("price_forfait_ht")),
    price_extra_per_day_ht: parseDecimal(
      formData.get("price_extra_per_day_ht"),
    ),
    pricing_threshold: parseInt(formData.get("pricing_threshold")),
    pedagogy_lead: parseText(formData.get("pedagogy_lead")),
    accessibility_notes: parseText(formData.get("accessibility_notes")),
    financing_mode: parseText(formData.get("financing_mode")),
  };
}

function enumerateDates(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const start = new Date(startIso);
  const end = new Date(endIso);
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

type CustomDay = {
  date: string;
  enabled: boolean;
  morning_start: string;
  morning_end: string;
  afternoon_start: string;
  afternoon_end: string;
  /** Formateur du jour. "" = utiliser le formateur par défaut de la session. */
  trainer_id: string;
  /** Consignes destinées au formateur pour ce jour (texte libre). */
  trainer_notes: string;
};

/**
 * Lit le champ `custom_days` (JSON sérialisé par PlanningSection) et
 * retourne la liste typée. Renvoie null si absent ou invalide.
 */
function parseCustomDays(formData: FormData): CustomDay[] | null {
  const raw = formData.get("custom_days");
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((d): CustomDay | null => {
        if (!d || typeof d !== "object") return null;
        const date = typeof d.date === "string" ? d.date : null;
        if (!date) return null;
        return {
          date,
          enabled: Boolean(d.enabled),
          morning_start:
            typeof d.morning_start === "string" ? d.morning_start : "",
          morning_end:
            typeof d.morning_end === "string" ? d.morning_end : "",
          afternoon_start:
            typeof d.afternoon_start === "string" ? d.afternoon_start : "",
          afternoon_end:
            typeof d.afternoon_end === "string" ? d.afternoon_end : "",
          trainer_id:
            typeof d.trainer_id === "string" ? d.trainer_id : "",
          trainer_notes:
            typeof d.trainer_notes === "string" ? d.trainer_notes : "",
        };
      })
      .filter((d): d is CustomDay => d !== null);
  } catch {
    return null;
  }
}

/**
 * Aligne la liste des session_days sur les dates actuelles de la session :
 * - ajoute les jours manquants (avec horaires par défaut 9h-12h / 14h-17h)
 * - supprime ceux hors-range
 * - si `customDays` fourni : applique les horaires individuels (et ne crée
 *   PAS les jours désactivés).
 */
async function reconcileSessionDays(
  supabase: SupabaseClient,
  sessionId: string,
  startDate: string,
  endDate: string,
  defaults?: {
    morning_start?: string | null;
    morning_end?: string | null;
    afternoon_start?: string | null;
    afternoon_end?: string | null;
  },
  customDays?: CustomDay[] | null,
) {
  const { data: existing } = await supabase
    .from("session_days")
    .select("day_date")
    .eq("session_id", sessionId);

  const existingDates = new Set(
    (existing ?? []).map((d) => d.day_date as string),
  );
  // Map des plans custom indexés par date (vide si pas de plan custom).
  const customByDate = new Map<string, CustomDay>();
  if (customDays) {
    for (const c of customDays) customByDate.set(c.date, c);
  }
  // Liste des jours réellement à conserver dans la session :
  //   - si plan custom fourni : on prend EXACTEMENT les dates `enabled`
  //     du plan (autorise les dates non consécutives, ignore start/end)
  //   - sinon : tous les jours entre start et end (cas legacy)
  const needed =
    customDays && customDays.length > 0
      ? customDays
          .filter((c) => c.enabled && c.date)
          .map((c) => c.date)
      : enumerateDates(startDate, endDate);
  const neededSet = new Set(needed);

  const toAdd = needed.filter((d) => !existingDates.has(d));
  const toRemove = [...existingDates].filter((d) => !neededSet.has(d));
  const toUpdate = needed.filter((d) => existingDates.has(d));

  // Helper : retourne les horaires + le formateur d'un jour (custom
  // prioritaire, sinon les défauts passés, sinon fallback).
  function hoursFor(date: string) {
    const c = customByDate.get(date);
    return {
      morning_start:
        c?.morning_start || defaults?.morning_start || "08:30",
      morning_end: c?.morning_end || defaults?.morning_end || "12:00",
      afternoon_start:
        c?.afternoon_start || defaults?.afternoon_start || "13:30",
      afternoon_end:
        c?.afternoon_end || defaults?.afternoon_end || "17:00",
      // trainer_id : "" → null (utilise le formateur par défaut de la session)
      trainer_id: c?.trainer_id ? c.trainer_id : null,
      // trainer_notes : "" → null (rien à stocker)
      trainer_notes: c?.trainer_notes ? c.trainer_notes : null,
    };
  }

  if (toAdd.length > 0) {
    const { error: insertError } = await supabase
      .from("session_days")
      .insert(
        toAdd.map((d) => ({
          session_id: sessionId,
          day_date: d,
          ...hoursFor(d),
        })),
      );
    if (insertError) {
      console.error(
        "reconcileSessionDays insert error:",
        insertError,
        { sessionId, toAdd },
      );
    }
  }

  // Mise à jour des horaires des jours déjà existants si custom fourni.
  if (customDays && toUpdate.length > 0) {
    for (const date of toUpdate) {
      const { error: updateError } = await supabase
        .from("session_days")
        .update(hoursFor(date))
        .eq("session_id", sessionId)
        .eq("day_date", date);
      if (updateError) {
        console.error("reconcileSessionDays update error:", updateError, {
          sessionId,
          date,
        });
      }
    }
  }

  if (toRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from("session_days")
      .delete()
      .eq("session_id", sessionId)
      .in("day_date", toRemove);
    if (deleteError) {
      console.error(
        "reconcileSessionDays delete error:",
        deleteError,
        { sessionId, toRemove },
      );
    }
  }

  // Resynchro du formateur PRINCIPAL de la session sur le formateur du
  // PLANNING (Gilles 2026-06-17). L'UI « formateur principal » a été
  // supprimée : le formateur du jour est la source de vérité. On aligne
  // sessions.trainer_id (et on efface trainer_name) sur le 1er jour ayant
  // un formateur, pour que la convocation ET l'affichage pointent vers le
  // bon formateur (et plus vers l'ancien trainer_id figé).
  await syncPrincipalTrainerFromDays(supabase, sessionId);
}

/**
 * Aligne sessions.trainer_id sur le formateur du 1er jour (chronologique)
 * ayant un formateur défini. Efface trainer_name (texte libre) pour que
 * l'affichage utilise la jointure formateur. Ne touche à rien si aucun
 * jour n'a de formateur (sessions legacy sans planning détaillé).
 */
async function syncPrincipalTrainerFromDays(
  supabase: SupabaseClient,
  sessionId: string,
) {
  const { data: days } = await supabase
    .from("session_days")
    .select("trainer_id")
    .eq("session_id", sessionId)
    .not("trainer_id", "is", null)
    .order("day_date", { ascending: true })
    .limit(1);
  const dayTrainerId = (days?.[0]?.trainer_id as string | null) ?? null;
  if (dayTrainerId) {
    await supabase
      .from("sessions")
      .update({ trainer_id: dayTrainerId, trainer_name: null })
      .eq("id", sessionId);
  }
}

export async function createSession(formData: FormData) {
  const { organizationId, userId } = await getCurrentOrganizationId();
  const payload = buildPayload(formData);

  if (!payload.formation_id) {
    redirect("/sessions/new?error=Choisissez+une+formation");
  }
  if (!payload.start_date || !payload.end_date) {
    redirect("/sessions/new?error=Les+dates+sont+obligatoires");
  }

  const supabase = await createClient();

  // Formateur par défaut (Gilles 2026-05-22) : si aucun formateur n'a été
  // sélectionné dans le formulaire, on assigne par défaut le formateur dont
  // l'email correspond à l'utilisateur connecté (créateur de la session).
  // Sinon, on prend le SEUL formateur de l'organisation si elle n'en a
  // qu'un. Évite l'erreur "Aucun formateur assigné" à la confirmation.
  if (!payload.trainer_id) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email ?? null;
    let defaultTrainerId: string | null = null;
    if (email) {
      const { data: byEmail } = await supabase
        .from("trainers")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("email", email)
        .limit(1)
        .maybeSingle<{ id: string }>();
      if (byEmail?.id) defaultTrainerId = byEmail.id;
    }
    if (!defaultTrainerId) {
      const { data: trainers } = await supabase
        .from("trainers")
        .select("id")
        .eq("organization_id", organizationId)
        .limit(2);
      if (trainers && trainers.length === 1) {
        defaultTrainerId = trainers[0].id as string;
      }
    }
    if (defaultTrainerId) {
      payload.trainer_id = defaultTrainerId;
    }
  }

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      ...payload,
      organization_id: organizationId,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/sessions/new?error=${encodeURIComponent(error.message)}`);
  }

  // Auto-création des jours, avec respect du planning détaillé saisi
  // par l'utilisateur dans le formulaire si fourni.
  await reconcileSessionDays(
    supabase,
    data.id,
    payload.start_date!,
    payload.end_date!,
    {
      morning_start: payload.default_morning_start,
      morning_end: payload.default_morning_end,
      afternoon_start: payload.default_afternoon_start,
      afternoon_end: payload.default_afternoon_end,
    },
    parseCustomDays(formData),
  );

  // Synchro Google Agenda (best-effort, ne bloque pas la création).
  await syncSessionCalendar(data.id);

  revalidatePath("/sessions");
  redirect(`/sessions/${data.id}?created=1`);
}

export async function updateSession(id: string, formData: FormData) {
  const payload = buildPayload(formData);

  if (!payload.formation_id) {
    redirect(`/sessions/${id}?error=Choisissez+une+formation`);
  }
  if (!payload.start_date || !payload.end_date) {
    redirect(`/sessions/${id}?error=Les+dates+sont+obligatoires`);
  }

  const supabase = await createClient();
  // Verrou session clôturée (Gilles 2026-06-13).
  const lock = await assertSessionEditable(supabase, id);
  if (!lock.ok) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(lock.error)}`);
  }
  const { error } = await supabase
    .from("sessions")
    .update(payload)
    .eq("id", id);

  if (error) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  }

  // Synchronisation des jours en cas de changement de dates, avec
  // respect du planning détaillé saisi par l'utilisateur si fourni.
  await reconcileSessionDays(
    supabase,
    id,
    payload.start_date!,
    payload.end_date!,
    {
      morning_start: payload.default_morning_start,
      morning_end: payload.default_morning_end,
      afternoon_start: payload.default_afternoon_start,
      afternoon_end: payload.default_afternoon_end,
    },
    parseCustomDays(formData),
  );

  // Recalcul AUTO des montants des inscriptions au prix actuel de la
  // session (Gilles 2026-06-05). Évite que les montants stockés divergent
  // du prix après un changement de tarif/durée. persistComputedBilling
  // respecte les montants saisis MANUELLEMENT (billing_manually_overridden).
  // Best-effort : un échec ne bloque pas l'enregistrement.
  try {
    const { data: reqs } = await supabase
      .from("inscription_requests")
      .select("id")
      .eq("target_session_id", id);
    for (const r of (reqs ?? []) as Array<{ id: string }>) {
      try {
        const billing = await loadAndComputeBillingForInscription(
          supabase,
          r.id,
        );
        await persistComputedBilling(supabase, r.id, billing);
      } catch (e) {
        console.warn(
          "[updateSession] recalcul facturation inscription échoué",
          { inscriptionId: r.id, error: (e as Error).message },
        );
      }
    }
  } catch (e) {
    console.warn(
      "[updateSession] recalcul facturation session échoué",
      (e as Error).message,
    );
  }

  // Recalcul AUTO des conventions de la session (« la fiche fait foi » —
  // Gilles 2026-06-25) : après recalcul des inscriptions, on réaligne les
  // montants des conventions existantes. Best-effort.
  try {
    const { data: convs } = await supabase
      .from("session_conventions")
      .select("id")
      .eq("session_id", id);
    for (const c of (convs ?? []) as Array<{ id: string }>) {
      try {
        await recomputeConventionAmount(id, c.id);
      } catch {
        /* best-effort */
      }
    }
  } catch (e) {
    console.warn(
      "[updateSession] recalcul conventions échoué",
      (e as Error).message,
    );
  }

  // Synchro Google Agenda (horaires, lieu, statut… mis à jour en temps réel).
  await syncSessionCalendar(id);

  revalidatePath("/sessions");
  revalidatePath(`/sessions/${id}`);
  redirect(`/sessions/${id}?updated=1`);
}

export async function deleteSession(id: string) {
  const supabase = await createClient();
  const lock = await assertSessionEditable(supabase, id);
  if (!lock.ok) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(lock.error)}`);
  }
  // On récupère l'événement agenda AVANT suppression de la session.
  const { data: sess } = await supabase
    .from("sessions")
    .select("google_calendar_event_id")
    .eq("id", id)
    .maybeSingle<{ google_calendar_event_id: string | null }>();
  const { error } = await supabase.from("sessions").delete().eq("id", id);
  if (error) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  }
  // Suppression des événements Google Agenda associés (best-effort, gère la
  // liste de jours).
  await deleteSessionCalendarEvents(sess?.google_calendar_event_id ?? null);
  revalidatePath("/sessions");
  redirect("/sessions");
}

/**
 * Change rapidement le statut d'une session depuis le tableau (Gilles
 * 2026-06-12). Met à jour sessions.status (synchronisé avec la fiche session)
 * + l'agenda Google. Override manuel : n'envoie pas d'email (contrairement à
 * « Confirmer l'ouverture » / annulation guidée).
 */
export async function updateSessionStatusQuick(
  id: string,
  status: SessionStatus,
): Promise<{
  ok: boolean;
  error?: string;
  /** Résultat de l'envoi de la convocation formateur quand on passe en
   *  « Confirmée » (Gilles 2026-06-16) — permet au tableau d'afficher un
   *  retour clair (« convocation envoyée à X » / « formateur sans email »). */
  trainerConvocation?: TrainerConvocationResult;
}> {
  const supabase = await createClient();
  const lock = await assertSessionEditable(supabase, id);
  if (!lock.ok) return { ok: false, error: lock.error };
  const { error } = await supabase
    .from("sessions")
    .update({ status })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await syncSessionCalendar(id);

  // Passage en « Confirmée » depuis le tableau : on envoie AUSSI la
  // convocation formateur (même logique que la fiche) pour un comportement
  // identique partout. Best-effort : on ne bloque pas le changement de statut.
  let trainerConvocation: TrainerConvocationResult | undefined;
  if (status === "confirmed") {
    trainerConvocation = await sendTrainerConvocation(supabase, id);
  }

  revalidatePath("/sessions");
  revalidatePath(`/sessions/${id}`);
  revalidatePath("/inscriptions");
  return { ok: true, trainerConvocation };
}

/**
 * Clôture / réouvre administrativement le DOSSIER d'une session
 * (Gilles 2026-06-13). INDÉPENDANT du statut : la session reste
 * Confirmée/Terminée et reste comptée dans le CA / les tableaux de bord.
 * Sert uniquement à marquer "post-formation géré, dossier traité"
 * (et plus tard : prêt à facturer).
 */
export async function toggleSessionAdminClosed(
  id: string,
  closed: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Clôturer passe AUTOMATIQUEMENT le statut en « Terminée » (Gilles
  // 2026-06-13), SAUF si la session est Annulée/Reportée (ou pas encore
  // engagée) : on ne force Terminée que pour une session qui a tourné
  // (Confirmée / En cours / déjà Terminée).
  const update: Record<string, unknown> = {
    admin_closed_at: closed ? new Date().toISOString() : null,
    admin_closed_by: closed ? user?.id ?? null : null,
  };
  let statusChanged = false;
  if (closed) {
    const { data: cur } = await supabase
      .from("sessions")
      .select("status")
      .eq("id", id)
      .maybeSingle<{ status: string | null }>();
    if (
      cur?.status === "confirmed" ||
      cur?.status === "in_progress"
    ) {
      update.status = "completed";
      statusChanged = true;
    }
  }
  const { error } = await supabase.from("sessions").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (statusChanged) await syncSessionCalendar(id);

  // Avis Google : envoi automatique à la clôture si activé (Gilles 2026-06-23).
  if (closed) {
    const { data: srow } = await supabase
      .from("sessions")
      .select("organization_id")
      .eq("id", id)
      .maybeSingle<{ organization_id: string }>();
    const orgId = srow?.organization_id;
    if (orgId) {
      const { data: org } = await supabase
        .from("organizations")
        .select("google_review_auto_on_close, google_review_url")
        .eq("id", orgId)
        .maybeSingle<{
          google_review_auto_on_close: boolean | null;
          google_review_url: string | null;
        }>();
      if (org?.google_review_auto_on_close && org?.google_review_url?.trim()) {
        try {
          const items = await findEligibleItems(supabase, orgId, {
            sessionId: id,
          });
          await sendForItems(supabase, {
            orgId,
            items,
            channel: "auto",
            sentBy: user?.id ?? null,
          });
        } catch {
          // best-effort : ne bloque pas la clôture si l'envoi échoue.
        }
      }
    }
  }

  revalidatePath("/sessions");
  revalidatePath(`/sessions/${id}`);
  revalidatePath("/inscriptions");
  return { ok: true };
}

/**
 * Bascule manuellement le statut « archived » d'une session :
 *  - si déjà archivée → repasse à `completed` (statut revenu à actif)
 *  - sinon → archive la session (la masque du tableau d'inscriptions)
 *
 * La fiche reste accessible directement par /sessions/{id} pour
 * permettre la réédition de documents (convention, attestation…)
 * a posteriori.
 */
export async function toggleArchiveSession(id: string) {
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("sessions")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  const isArchived = current?.status === "archived";
  const newStatus: SessionStatus = isArchived ? "completed" : "archived";
  const { error } = await supabase
    .from("sessions")
    .update({ status: newStatus })
    .eq("id", id);
  if (error) {
    redirect(`/sessions/${id}?error=${encodeURIComponent(error.message)}`);
  }
  // Synchro Google Agenda : archivage -> retire l'événement ;
  // désarchivage (-> completed) -> le recrée.
  await syncSessionCalendar(id);
  revalidatePath("/sessions");
  revalidatePath(`/sessions/${id}`);
  revalidatePath("/inscriptions");
  redirect(
    `/sessions/${id}?${isArchived ? "unarchived=1" : "archived=1"}`,
  );
}

/**
 * Duplique une session existante :
 * - copie tous les champs (formation, lieu, formateur, horaires, modalité…)
 * - remet le statut à "draft"
 * - vide l'internal_code et préfixe le nom dans les notes
 * - ne copie PAS les inscriptions ni les jours (régénérés via reconcile)
 */
export async function duplicateSession(id: string) {
  const { organizationId, userId } = await getCurrentOrganizationId();
  const supabase = await createClient();

  const { data: source, error: loadError } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (loadError || !source) {
    redirect(
      `/sessions/${id}?error=${encodeURIComponent(
        loadError?.message ?? "Session source introuvable",
      )}`,
    );
  }

  // On retire les champs auto-gérés par la base
  const {
    id: _id,
    created_at: _created,
    updated_at: _updated,
    created_by: _by,
    organization_id: _org,
    internal_code: _code,
    status: _status,
    notes: sourceNotes,
    ...rest
  } = source as Record<string, unknown>;

  void _id;
  void _created;
  void _updated;
  void _by;
  void _org;
  void _code;
  void _status;

  const duplicatedNotes = [
    sourceNotes ? String(sourceNotes) : "",
    `[Copie créée le ${new Date().toLocaleDateString("fr-FR")} depuis la session ${id}]`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { data: created, error: insertError } = await supabase
    .from("sessions")
    .insert({
      ...rest,
      organization_id: organizationId,
      created_by: userId,
      status: "draft",
      internal_code: null,
      notes: duplicatedNotes,
    })
    .select("id, start_date, end_date, default_morning_start, default_morning_end, default_afternoon_start, default_afternoon_end")
    .single();

  if (insertError || !created) {
    redirect(
      `/sessions/${id}?error=${encodeURIComponent(insertError?.message ?? "Erreur lors de la duplication")}`,
    );
  }

  // Recrée les session_days avec les horaires par défaut copiés
  await reconcileSessionDays(
    supabase,
    created.id,
    created.start_date as string,
    created.end_date as string,
    {
      morning_start: created.default_morning_start as string | null,
      morning_end: created.default_morning_end as string | null,
      afternoon_start: created.default_afternoon_start as string | null,
      afternoon_end: created.default_afternoon_end as string | null,
    },
  );

  revalidatePath("/sessions");
  redirect(`/sessions/${created.id}?duplicated=1`);
}

/**
 * Pousse en une fois TOUTES les sessions de l'organisation vers Google
 * Agenda (utile pour la 1re synchro / rattrapage des sessions existantes).
 * Les sessions archivées sont ignorées (et leur éventuel événement retiré).
 */
export async function syncAllSessionsToCalendar(): Promise<{
  ok: boolean;
  count: number;
  remaining?: number;
  error?: string;
  lastSyncAt?: string;
}> {
  if (!isCalendarConfigured()) {
    const hasServiceAccount = Boolean(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64,
    );
    const hasCalendarId = Boolean(process.env.GOOGLE_CALENDAR_ID);
    const missing = [
      !hasServiceAccount && "compte de service Google (GOOGLE_SERVICE_ACCOUNT_JSON)",
      !hasCalendarId && "GOOGLE_CALENDAR_ID",
    ]
      .filter(Boolean)
      .join(" + ");
    return {
      ok: false,
      count: 0,
      error: `Configuration Google manquante sur Vercel : ${missing}. (Vérifiez la variable puis redéployez.)`,
    };
  }
  // Synchro INCRÉMENTALE + bornée en temps (Gilles 2026-06-25) : ne traite que
  // les sessions à (re)synchroniser et s'arrête avant le timeout serverless.
  // `remaining` > 0 -> il faut recliquer pour finir (cas d'une grosse reprise).
  const res = await syncSessionsNeedingUpdate({ budgetMs: 45_000 });
  if (!res.ok) {
    return { ok: false, count: 0, error: res.error ?? "Échec de la synchronisation." };
  }
  revalidatePath("/sessions");
  return {
    ok: true,
    count: res.synced,
    remaining: res.remaining,
    lastSyncAt: res.lastSyncAt,
    error: res.failed > 0 ? `${res.failed} session(s) en échec.` : undefined,
  };
}

/**
 * Réinitialise l'agenda Google : SUPPRIME tous les événements existants
 * (l'agenda est dédié aux sessions) puis reconstruit proprement à partir
 * de zéro. Corrige les doublons. À utiliser via le bouton dédié.
 */
export async function resetAndResyncCalendar(): Promise<{
  ok: boolean;
  count: number;
  deleted: number;
  remaining?: number;
  error?: string;
  lastSyncAt?: string;
}> {
  if (!isCalendarConfigured()) {
    return {
      ok: false,
      count: 0,
      deleted: 0,
      error:
        "Google Agenda non configuré (variables manquantes sur Vercel).",
    };
  }

  // 1) Vider l'agenda (supprime tout, y compris les doublons). La purge
  //    efface aussi les références en base (ids + état de synchro), donc
  //    toutes les sessions deviennent « à re-synchroniser ».
  const purge = await purgeAllCalendarEvents();
  if (!purge.ok) {
    return {
      ok: false,
      count: 0,
      deleted: 0,
      error: `Échec du vidage de l'agenda : ${purge.error ?? "inconnu"}`,
    };
  }

  // 2) Reconstruire en mode INCRÉMENTAL + borné en temps. Si tout ne tient
  //    pas dans une exécution, `remaining` > 0 -> l'utilisateur reclique
  //    « Synchroniser », et le cron horaire termine de toute façon.
  const res = await syncSessionsNeedingUpdate({ budgetMs: 45_000 });
  revalidatePath("/sessions");
  return {
    ok: true,
    count: res.synced,
    deleted: purge.deleted,
    remaining: res.remaining,
    lastSyncAt: res.lastSyncAt,
    error: res.failed > 0 ? `${res.failed} session(s) en échec.` : undefined,
  };
}
