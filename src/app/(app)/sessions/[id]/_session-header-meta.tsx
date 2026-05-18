import {
  CalendarDays,
  Clock,
  MapPin,
  Monitor,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  MODALITY_LABELS,
  type FormationModality,
} from "@/lib/formations/types";

/**
 * Encart méta-infos d'une session (date, modalité, lieu, durée).
 * Composant serveur partagé entre TOUS les onglets de session (Fiche,
 * Participants, Conventions, Convocations, Émargement, Documents,
 * Attestations…) pour que ces infos restent visibles en permanence,
 * peu importe l'onglet.
 *
 * Décision UX 2026-05-13 : avant ce refactor, ces infos n'étaient
 * affichées que sur l'onglet Fiche. L'utilisateur perdait le contexte
 * en naviguant entre onglets.
 *
 * À utiliser comme `description` du `PageHeader` parent.
 */
export async function SessionHeaderMeta({ sessionId }: { sessionId: string }) {
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "start_date, end_date, modality, location, location_id, is_inter, location_full:formation_locations(name)",
    )
    .eq("id", sessionId)
    .maybeSingle<{
      start_date: string;
      end_date: string;
      modality: FormationModality | null;
      location: string | null;
      location_id: string | null;
      is_inter: boolean | null;
      location_full: { name: string | null } | null;
    }>();
  if (!session) return null;

  const { data: sessionDays } = await supabase
    .from("session_days")
    .select("morning_start, morning_end, afternoon_start, afternoon_end")
    .eq("session_id", sessionId);

  // Date label : 1 jour ou plage
  const formatDateShort = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  const dateLabel =
    session.start_date === session.end_date
      ? formatDateShort(session.start_date)
      : `Du ${formatDateShort(session.start_date)} au ${formatDateShort(
          session.end_date,
        )}`;

  const modalityLabel = session.modality
    ? MODALITY_LABELS[session.modality]
    : null;

  // Lieu : nom du formation_locations si défini, sinon texte libre
  const locationLabel =
    session.location_full?.name ?? session.location ?? null;

  // Durée : somme des matin + après-midi de chaque jour planifié
  const parseHHmm = (t: string | null): number | null => {
    if (!t) return null;
    const [h, m] = t.split(":");
    const hh = parseInt(h, 10);
    const mm = parseInt(m, 10);
    return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
  };
  const totalMinutes = (sessionDays ?? []).reduce(
    (acc: number, d: Record<string, string | null>) => {
      const m1 = parseHHmm(d.morning_start);
      const m2 = parseHHmm(d.morning_end);
      const a1 = parseHHmm(d.afternoon_start);
      const a2 = parseHHmm(d.afternoon_end);
      const mat = m1 !== null && m2 !== null && m2 > m1 ? m2 - m1 : 0;
      const apm = a1 !== null && a2 !== null && a2 > a1 ? a2 - a1 : 0;
      return acc + mat + apm;
    },
    0,
  );
  const durationLabel =
    totalMinutes > 0
      ? totalMinutes % 60 === 0
        ? `${totalMinutes / 60} h`
        : `${Math.floor(totalMinutes / 60)} h ${totalMinutes % 60}`
      : null;

  // Type de session : INTER (ouverte à plusieurs entreprises) ou
  // INTRA (dédiée à une seule entreprise). Affichage en badge pour
  // que l'utilisateur identifie instantanément le contexte commercial.
  const interIntraBadge =
    session.is_inter === null
      ? null
      : session.is_inter
        ? { label: "INTER", tone: "cyan" as const }
        : { label: "INTRA", tone: "amber" as const };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1">
      {/* Ordre demandé par Gilles 2026-05-13 :
          INTER/INTRA → Modalité → Date → Durée → Lieu */}
      {interIntraBadge && (
        <span
          className={
            interIntraBadge.tone === "cyan"
              ? "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-200"
              : "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200"
          }
          title={
            interIntraBadge.label === "INTER"
              ? "Session INTER : ouverte à plusieurs entreprises / particuliers."
              : "Session INTRA : dédiée à une seule entreprise."
          }
        >
          <Users className="h-3 w-3" />
          {interIntraBadge.label}
        </span>
      )}
      {modalityLabel && (
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
          <Monitor className="h-3.5 w-3.5 text-cyan-700" />
          {modalityLabel}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
        <CalendarDays className="h-3.5 w-3.5 text-cyan-700" />
        {dateLabel}
      </span>
      {durationLabel && (
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
          <Clock className="h-3.5 w-3.5 text-cyan-700" />
          {durationLabel}
        </span>
      )}
      {locationLabel && (
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
          <MapPin className="h-3.5 w-3.5 text-cyan-700" />
          {locationLabel}
        </span>
      )}
    </div>
  );
}
