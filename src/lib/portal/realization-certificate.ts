/**
 * Helper : calcul du ratio de présence d'un apprenant + éligibilité
 * au certificat de réalisation.
 *
 * Règle métier :
 *  - Présence = nombre de demi-journées signées par l'apprenant
 *    (`attendance_signatures` avec `signer_role = 'learner'`)
 *  - Total = nombre de demi-journées prévues sur la session
 *    (matin + après-midi de chaque `session_days`)
 *  - Éligible si :
 *    1. La session est terminée (end_date < aujourd'hui)
 *    2. Le ratio présence ≥ seuil paramétré par l'organisation
 *       (`organizations.realization_certificate_threshold_percent`,
 *        défaut 80 %)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type AttendanceRatio = {
  signedSlots: number;
  totalSlots: number;
  /** Pourcentage entre 0 et 100. */
  percent: number;
};

export async function computeAttendanceRatio(
  supabase: SupabaseClient,
  enrollmentId: string,
  sessionId: string,
): Promise<AttendanceRatio> {
  // Jours de la session → total demi-journées
  const { data: days } = await supabase
    .from("session_days")
    .select("morning_start, morning_end, afternoon_start, afternoon_end")
    .eq("session_id", sessionId);

  let totalSlots = 0;
  for (const d of (days ?? []) as Array<{
    morning_start: string | null;
    morning_end: string | null;
    afternoon_start: string | null;
    afternoon_end: string | null;
  }>) {
    if (d.morning_start && d.morning_end) totalSlots++;
    if (d.afternoon_start && d.afternoon_end) totalSlots++;
  }

  // Signatures de l'apprenant
  const { count: signedCount } = await supabase
    .from("attendance_signatures")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", enrollmentId)
    .eq("signer_role", "learner");

  const signedSlots = Math.min(signedCount ?? 0, totalSlots);
  const percent =
    totalSlots > 0 ? Math.round((signedSlots / totalSlots) * 100) : 0;

  return { signedSlots, totalSlots, percent };
}

export type CertificateEligibility =
  | { kind: "eligible"; ratio: AttendanceRatio }
  | {
      kind: "session_not_ended";
      endDate: string;
      ratio: AttendanceRatio;
    }
  | {
      kind: "below_threshold";
      ratio: AttendanceRatio;
      thresholdPercent: number;
    };

export async function checkCertificateEligibility(
  supabase: SupabaseClient,
  enrollmentId: string,
  sessionId: string,
  endDate: string,
  thresholdPercent: number,
): Promise<CertificateEligibility> {
  const ratio = await computeAttendanceRatio(
    supabase,
    enrollmentId,
    sessionId,
  );

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  const sessionEnded = end.getTime() < Date.now();

  if (!sessionEnded) {
    return { kind: "session_not_ended", endDate, ratio };
  }

  if (ratio.percent < thresholdPercent) {
    return { kind: "below_threshold", ratio, thresholdPercent };
  }

  return { kind: "eligible", ratio };
}

/**
 * Calcule la durée totale prévue en HEURES à partir des session_days.
 * Utile pour afficher "X heures de formation" sur le certificat.
 */
export function computeTotalHours(
  days: Array<{
    morning_start: string | null;
    morning_end: string | null;
    afternoon_start: string | null;
    afternoon_end: string | null;
  }>,
): number {
  const toMin = (t: string | null) => {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };
  let totalMin = 0;
  for (const d of days) {
    const ms = toMin(d.morning_start);
    const me = toMin(d.morning_end);
    if (ms !== null && me !== null && me > ms) totalMin += me - ms;
    const as = toMin(d.afternoon_start);
    const ae = toMin(d.afternoon_end);
    if (as !== null && ae !== null && ae > as) totalMin += ae - as;
  }
  return totalMin / 60;
}
