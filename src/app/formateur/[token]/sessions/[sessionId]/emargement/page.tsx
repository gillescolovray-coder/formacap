import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Info, Printer } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured } from "@/lib/email/resend";
import { healEnrollmentsForSession } from "@/lib/inscriptions/sync";
import { SignaturesDashboard } from "@/app/(app)/sessions/[id]/emargement/_signatures-dashboard";
import { EmargementTabs } from "./_emargement-tabs";
import { TrainerSignatureGrid } from "./_trainer-signature-grid";
import { TrainerQrButton } from "./_trainer-qr-button";
import { TrainerRemoteSignSection } from "./_trainer-remote-sign";
import { TrainerAttendanceGrid } from "./_trainer-attendance-grid";
import type {
  AttendanceMoment,
  AttendanceStatus,
} from "@/lib/attendances/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Émargement formateur — CAP NUMERIQUE",
  robots: "noindex, nofollow",
};

type Params = { token: string; sessionId: string };

/**
 * Page émargement portail formateur — alignée sur l'admin
 * (cf. src/app/(app)/sessions/[id]/emargement/page.tsx).
 *
 * Structure :
 *  1. Header (formation + dates)
 *  2. Bandeau "Action rapide" : signature collective formateur
 *     (raccourci historique pour signer une demi-journée pour tous
 *     les apprenants en 1 clic — non disponible côté admin).
 *  3. Onglets :
 *     - Électronique : QR + dashboard signatures + grille
 *       signatures individuelles + envoi distanciel par email
 *     - Manuel : pointage présent/absent/excusé/retard +
 *       bouton version imprimable
 *
 * Gilles 2026-05-23.
 */
export default async function FormateurEmargementPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token, sessionId } = await params;
  const supabase = createAdminClient();

  // 1. Token + trainer
  const { data: tokenRow } = await supabase
    .from("trainer_portal_tokens")
    .select("trainer_id, trainer:trainers(first_name, last_name)")
    .eq("token", token)
    .maybeSingle<{
      trainer_id: string;
      trainer: { first_name: string; last_name: string } | null;
    }>();
  if (!tokenRow || !tokenRow.trainer) return <NotFound />;
  const trainerName = `${tokenRow.trainer.first_name} ${tokenRow.trainer.last_name}`;

  // 2. Session + appartenance
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, trainer_id, modality, formation:formations(title), start_date, end_date",
    )
    .eq("id", sessionId)
    .maybeSingle<{
      id: string;
      trainer_id: string | null;
      modality: string | null;
      formation: { title: string } | null;
      start_date: string;
      end_date: string;
    }>();
  if (!session || session.trainer_id !== tokenRow.trainer_id) {
    return <NotFound />;
  }

  // 2 bis. Self-healing (identique à admin) — robustifie la synchro
  // inscriptions ↔ enrollments avant émargement.
  try {
    await healEnrollmentsForSession(supabase, sessionId);
  } catch (e) {
    console.warn(
      "[formateur/emargement] healEnrollmentsForSession failed",
      (e as Error).message,
    );
  }

  // 3. Données de session : jours + inscriptions + attendances + signatures
  const [
    { data: enrollments },
    { data: sessionDays },
  ] = await Promise.all([
    supabase
      .from("session_enrollments")
      .select(
        "id, inscription_request_id, learner:learners(civility, first_name, last_name, email, company:companies(name))",
      )
      .eq("session_id", sessionId)
      .order("enrolled_at", { ascending: true }),
    supabase
      .from("session_days")
      .select(
        "day_date, morning_start, morning_end, afternoon_start, afternoon_end",
      )
      .eq("session_id", sessionId)
      .order("day_date", { ascending: true }),
  ]);

  const sessionDaysTyped = ((sessionDays ?? []) as Array<{
    day_date: string;
    morning_start: string | null;
    morning_end: string | null;
    afternoon_start: string | null;
    afternoon_end: string | null;
  }>);

  // OF partenaires (apprenants inscrits via un OF tiers — émargement
  // déclaratif sans signature CAP NUMERIQUE requise)
  const requestIds = Array.from(
    new Set(
      ((enrollments ?? []) as Array<{ inscription_request_id?: string | null }>)
        .map((e) => e.inscription_request_id)
        .filter((x): x is string => Boolean(x)),
    ),
  );
  const partnerOfNameByRequest = new Map<string, string>();
  if (requestIds.length > 0) {
    const { data: reqs } = await supabase
      .from("inscription_requests")
      .select(
        "id, inscription_channel, referrer:companies!inscription_channel_company_id(name, type)",
      )
      .in("id", requestIds);
    for (const r of (reqs ?? []) as Array<{
      id: string;
      inscription_channel: string | null;
      referrer:
        | { name: string; type: string | null }
        | Array<{ name: string; type: string | null }>
        | null;
    }>) {
      const ref = Array.isArray(r.referrer) ? r.referrer[0] : r.referrer;
      if (r.inscription_channel === "of" && ref?.type === "of" && ref?.name) {
        partnerOfNameByRequest.set(r.id, ref.name);
      }
    }
  }

  const enrollmentRows = (enrollments ?? []) as unknown as Array<{
    id: string;
    inscription_request_id?: string | null;
    learner: {
      civility: string | null;
      first_name: string | null;
      last_name: string | null;
      email?: string | null;
      company?: { name: string } | null;
    } | null;
  }>;
  const enrollmentIds = enrollmentRows.map((e) => e.id);

  const [attendancesRes, signaturesRes, fullSignaturesRes] = await Promise.all([
    enrollmentIds.length > 0
      ? supabase
          .from("attendances")
          .select("enrollment_id, period_date, moment, status")
          .in("enrollment_id", enrollmentIds)
      : Promise.resolve({ data: [] }),
    enrollmentIds.length > 0
      ? supabase
          .from("attendance_signatures")
          .select("enrollment_id, period_date, moment, signer_role")
          .in("enrollment_id", enrollmentIds)
      : Promise.resolve({ data: [] }),
    enrollmentIds.length > 0
      ? supabase
          .from("attendance_signatures")
          .select(
            "enrollment_id, period_date, moment, signer_role, signer_name, signature_data, signed_at",
          )
          .in("enrollment_id", enrollmentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const attendances = (attendancesRes.data ?? []) as Array<{
    enrollment_id: string;
    period_date: string;
    moment: AttendanceMoment;
    status: AttendanceStatus;
  }>;
  const signatures = (signaturesRes.data ?? []) as Array<{
    enrollment_id: string;
    period_date: string;
    moment: "morning" | "afternoon";
    signer_role: "learner" | "trainer";
  }>;
  const fullSignatures = (fullSignaturesRes.data ?? []) as Array<{
    enrollment_id: string;
    period_date: string;
    moment: "morning" | "afternoon";
    signer_role: "learner" | "trainer";
    signer_name: string;
    signature_data: string;
    signed_at: string;
  }>;

  // Index signatures pour SignaturesDashboard
  const signaturesIndex = new Map<string, true>();
  for (const s of signatures) {
    if (s.signer_role === "trainer") {
      signaturesIndex.set(`__trainer__|${s.period_date}|${s.moment}`, true);
    } else {
      signaturesIndex.set(
        `${s.enrollment_id}|${s.period_date}|${s.moment}|learner`,
        true,
      );
    }
  }

  // Périodes pour les grilles (uniquement session_days réels)
  const periods = sessionDaysTyped.map((d) => ({
    date: d.day_date,
    morning_start: d.morning_start,
    morning_end: d.morning_end,
    afternoon_start: d.afternoon_start,
    afternoon_end: d.afternoon_end,
  }));

  // Index attendance par enrollment
  const attendanceIndex = new Map<string, Map<string, AttendanceStatus>>();
  for (const a of attendances) {
    if (!attendanceIndex.has(a.enrollment_id)) {
      attendanceIndex.set(a.enrollment_id, new Map());
    }
    attendanceIndex
      .get(a.enrollment_id)!
      .set(`${a.period_date}:${a.moment}`, a.status);
  }

  // Rows pour TrainerAttendanceGrid (toutes lignes, OF partenaires inclus)
  const attendanceRows = enrollmentRows.map((e) => {
    const l = e.learner;
    const base = l ? [l.first_name, l.last_name].filter(Boolean).join(" ") : "";
    const civ = (l?.civility ?? "").trim();
    const prefix = civ === "M." || civ === "Mme" ? `${civ} ` : "";
    const name = base ? `${prefix}${base}` : "Apprenant inconnu";
    const keyMap = attendanceIndex.get(e.id) ?? new Map();
    const attendancesByKey: Record<string, AttendanceStatus> = {};
    for (const p of periods) {
      for (const m of ["morning", "afternoon"] as AttendanceMoment[]) {
        const k = `${p.date}:${m}`;
        attendancesByKey[k] = keyMap.get(k) ?? "not_recorded";
      }
    }
    const partnerOfName = e.inscription_request_id
      ? partnerOfNameByRequest.get(e.inscription_request_id) ?? null
      : null;
    return {
      enrollmentId: e.id,
      learnerName: name,
      email: l?.email ?? null,
      company: l?.company?.name ?? null,
      attendancesByKey,
      partnerOfName,
    };
  });

  // Learners pour SignatureGrid (sans OF partenaires)
  const learnersForGrid = attendanceRows
    .filter((r) => !r.partnerOfName)
    .map((r) => ({
      enrollmentId: r.enrollmentId,
      fullName: r.learnerName,
      company: r.company,
    }));

  // Learners pour RemoteSignSection (toutes, OF avec bouton désactivé)
  const learnersForRemoteSign = attendanceRows.map((r) => ({
    enrollmentId: r.enrollmentId,
    name: r.learnerName,
    email: r.email,
    partnerOfName: r.partnerOfName,
  }));

  const enrollmentCount = enrollmentIds.length;
  const partnerOfCount = attendanceRows.filter((r) => r.partnerOfName).length;
  const resendOn = isResendConfigured();

  const modalityShortLabel = session.modality
    ? session.modality === "distanciel"
      ? "Distanciel"
      : session.modality === "hybride"
        ? "Hybride"
        : "Présentiel"
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-4">
        <Link
          href={`/formateur/${token}/sessions/${sessionId}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour à la session
        </Link>

        <header className="text-center space-y-1">
          <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
            Émargement formateur
          </div>
          <h1 className="text-lg md:text-xl font-bold text-zinc-900">
            {session.formation?.title ?? "Session"}
          </h1>
          <p className="text-xs text-zinc-500">
            {enrollmentCount} apprenant{enrollmentCount > 1 ? "s" : ""} inscrit
            {enrollmentCount > 1 ? "s" : ""}
            {partnerOfCount > 0 && (
              <>
                {" "}
                ·{" "}
                <span className="text-violet-700 font-semibold">
                  {partnerOfCount} via OF partenaire
                </span>
              </>
            )}
          </p>
        </header>

        {/* === Onglets : Électronique vs Manuel === */}
        <EmargementTabs
          electroniqueContent={
            <div className="space-y-4">
              <div className="rounded-xl bg-gradient-to-br from-cyan-50 to-blue-50 border border-cyan-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-[260px]">
                    <h3 className="font-bold text-sm text-cyan-900 mb-1">
                      Émargement électronique
                    </h3>
                    <p className="text-xs text-cyan-800 leading-relaxed">
                      Chaque apprenant signe depuis son téléphone via un QR
                      code (présentiel) ou un lien email (distanciel). Vous
                      pouvez aussi signer pour eux dans la grille ci-dessous
                      si le formateur fait passer son téléphone.
                    </p>
                  </div>
                  <div className="shrink-0">
                    <TrainerQrButton token={token} sessionId={sessionId} />
                  </div>
                </div>
              </div>

              {/* Dashboard signatures (apprenants non-OF) */}
              <SignaturesDashboard
                enrollments={learnersForGrid.map((l) => ({
                  enrollmentId: l.enrollmentId,
                  learnerName: l.fullName,
                }))}
                periodDates={periods.map((p) => p.date)}
                signaturesIndex={signaturesIndex}
              />

              {/* Grille signatures individuelles apprenant + formateur */}
              {periods.length === 0 ? (
                <div className="rounded-xl bg-white border border-zinc-200 p-12 text-center text-sm text-zinc-500">
                  Aucun jour planifié pour cette session.
                </div>
              ) : learnersForGrid.length === 0 ? (
                <div className="rounded-xl bg-white border border-zinc-200 p-12 text-center text-sm text-zinc-500">
                  Aucun apprenant à émarger électroniquement (les apprenants
                  OF partenaires sont gérés dans l&apos;onglet{" "}
                  <strong>Pointage manuel</strong>).
                </div>
              ) : (
                <TrainerSignatureGrid
                  token={token}
                  sessionId={sessionId}
                  periods={periods}
                  learners={learnersForGrid}
                  initialSignatures={fullSignatures}
                  trainerDisplayName={trainerName}
                  modalityShortLabel={modalityShortLabel}
                />
              )}

              {/* Section signature à distance par email */}
              <TrainerRemoteSignSection
                token={token}
                sessionId={sessionId}
                learners={learnersForRemoteSign}
                resendConfigured={resendOn}
              />
            </div>
          }
          manuelContent={
            <div className="space-y-4">
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-2.5">
                <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 leading-relaxed flex-1">
                  <strong>Pointage manuel ou version papier.</strong>{" "}
                  Pointez manuellement la présence ou imprimez la feuille
                  papier. Pour les apprenants inscrits via un OF partenaire,
                  vous pouvez déclarer leur présence sans signature requise.
                  <div className="mt-2">
                    <a
                      href={`/formateur/${token}/sessions/${sessionId}/emargement/print`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-white border border-amber-300 text-amber-900 text-xs font-bold hover:bg-amber-100"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Version imprimable (PDF)
                    </a>
                  </div>
                </div>
              </div>

              <TrainerAttendanceGrid
                token={token}
                sessionId={sessionId}
                periods={periods}
                rows={attendanceRows}
              />
            </div>
          }
        />

        <footer className="text-center text-[11px] text-zinc-400 pt-4">
          Toutes les signatures sont horodatées et tracées (preuve Qualiopi).
          Les apprenants signent quant à eux leur propre présence depuis
          leur portail individuel ou via le QR code / lien email.
        </footer>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md bg-white rounded-xl shadow-md border border-zinc-200 p-6 text-center space-y-3">
        <h1 className="text-lg font-bold">Accès refusé</h1>
        <p className="text-sm text-zinc-600">
          Lien invalide ou session inaccessible.
        </p>
      </div>
    </div>
  );
}
