import type { Metadata } from "next";
import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Clock,
  FileText,
  Folder,
  Lock,
  Mail,
  MapPin,
  PenTool,
  Target,
  Users,
  Video,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { labelLevel, type LevelValue } from "@/lib/positioning/types";
import {
  deleteSupportAsTrainer,
  toggleDocumentVisibilityAsTrainer,
  uploadSupportAsTrainer,
} from "./actions";

function labelPositioningLevel(v: string | undefined): string {
  if (!v) return "—";
  return labelLevel(v as LevelValue);
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Session — Espace formateur",
  robots: "noindex, nofollow",
};

type Params = { token: string; sessionId: string };

/**
 * Page détail d'une session côté formateur. Affiche 6 sections :
 *  1. Participants
 *  2. Tests de positionnement (à venir, Sprint D)
 *  3. Convocations envoyées (logs email)
 *  4. Émargement (signatures par jour × moment)
 *  5. Évaluations à chaud (NPS + satisfaction)
 *  6. Supports partagés (avec apprenants)
 *
 * V1 lecture seule. V2 ajoutera : upload supports, signer émargement,
 * remplir observation positionnement.
 */
export default async function FormateurSessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{
    uploaded?: string;
    deleted?: string;
    signed?: string;
    error?: string;
  }>;
}) {
  const { token, sessionId } = await params;
  const sp = await searchParams;
  const supabase = createAdminClient();

  // 1. Vérifier que ce formateur a bien accès à cette session
  const { data: tokenRow } = await supabase
    .from("trainer_portal_tokens")
    .select("trainer_id, trainer:trainers(first_name, last_name)")
    .eq("token", token)
    .maybeSingle<{
      trainer_id: string;
      trainer: { first_name: string; last_name: string } | null;
    }>();

  if (!tokenRow) {
    return <NotFoundCard reason="Lien invalide." />;
  }

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, status, start_date, end_date, modality, location, video_link, trainer_id, quiz_template_id, formation:formations(title, quiz_template_id), location_ref:formation_locations!location_id(name, address, postal_code, city)",
    )
    .eq("id", sessionId)
    .maybeSingle<{
      id: string;
      status: string | null;
      start_date: string;
      end_date: string;
      modality: string | null;
      location: string | null;
      video_link: string | null;
      trainer_id: string | null;
      quiz_template_id: string | null;
      formation: {
        title: string;
        quiz_template_id: string | null;
      } | null;
      location_ref: {
        name: string;
        address: string | null;
        postal_code: string | null;
        city: string | null;
      } | null;
    }>();

  if (!session || session.trainer_id !== tokenRow.trainer_id) {
    return (
      <NotFoundCard reason="Vous n'avez pas accès à cette session." />
    );
  }

  // 2. Inscriptions + apprenants
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(civility, first_name, last_name, email, company:companies(name))",
    )
    .eq("session_id", sessionId);

  const participants = ((enrollments ?? []) as unknown as Array<{
    id: string;
    learner: {
      civility: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      company: { name: string } | null;
    } | null;
  }>).map((e) => ({
    enrollmentId: e.id,
    fullName: [e.learner?.first_name, e.learner?.last_name]
      .filter(Boolean)
      .join(" "),
    civility: e.learner?.civility ?? "",
    email: e.learner?.email ?? null,
    company: e.learner?.company?.name ?? null,
  }));

  const enrollmentIds = participants.map((p) => p.enrollmentId);

  // 3. Logs convocations envoyées
  const { data: convocationLogs } =
    enrollmentIds.length > 0
      ? await supabase
          .from("email_logs")
          .select("enrollment_id, sent_at, status, to_email")
          .in("enrollment_id", enrollmentIds)
          .eq("type", "convocation")
          .order("sent_at", { ascending: false })
      : { data: [] };

  const convocationByEnrollment = new Map<
    string,
    { sent_at: string; status: string; to_email: string }
  >();
  for (const row of (convocationLogs ?? []) as Array<{
    enrollment_id: string;
    sent_at: string | null;
    status: string;
    to_email: string;
  }>) {
    if (row.sent_at && !convocationByEnrollment.has(row.enrollment_id)) {
      convocationByEnrollment.set(row.enrollment_id, {
        sent_at: row.sent_at,
        status: row.status,
        to_email: row.to_email,
      });
    }
  }

  // 4. Émargement : compter les signatures par enrollment
  const { data: signatures } =
    enrollmentIds.length > 0
      ? await supabase
          .from("attendance_signatures")
          .select("enrollment_id, signer_role")
          .in("enrollment_id", enrollmentIds)
      : { data: [] };

  const signedCountByEnrollment = new Map<string, number>();
  for (const sig of (signatures ?? []) as Array<{
    enrollment_id: string;
    signer_role: string;
  }>) {
    if (sig.signer_role === "learner") {
      signedCountByEnrollment.set(
        sig.enrollment_id,
        (signedCountByEnrollment.get(sig.enrollment_id) ?? 0) + 1,
      );
    }
  }

  // 5. Total demi-journées
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

  // 6. Évaluations à chaud
  const { data: hotEvals } =
    enrollmentIds.length > 0
      ? await supabase
          .from("evaluation_responses")
          .select("enrollment_id, nps_score, satisfaction_overall, submitted_at")
          .in("enrollment_id", enrollmentIds)
          .eq("evaluation_type", "hot")
      : { data: [] };

  // 6 bis. Tests de positionnement
  const { data: positioningRows } =
    enrollmentIds.length > 0
      ? await supabase
          .from("positioning_responses")
          .select("enrollment_id, data, learner_submitted_at")
          .in("enrollment_id", enrollmentIds)
      : { data: [] };

  const positioningByEnrollment = new Map<
    string,
    {
      submitted_at: string;
      data: {
        current_level?: string;
        has_adaptation_need?: boolean;
        adequacy?: string;
      };
    }
  >();
  for (const row of (positioningRows ?? []) as Array<{
    enrollment_id: string;
    data: {
      current_level?: string;
      has_adaptation_need?: boolean;
      adequacy?: string;
    };
    learner_submitted_at: string;
  }>) {
    positioningByEnrollment.set(row.enrollment_id, {
      submitted_at: row.learner_submitted_at,
      data: row.data,
    });
  }

  const evalByEnrollment = new Map<
    string,
    { nps_score: number | null; satisfaction_overall: string; submitted_at: string }
  >();
  for (const ev of (hotEvals ?? []) as Array<{
    enrollment_id: string;
    nps_score: number | null;
    satisfaction_overall: string;
    submitted_at: string;
  }>) {
    evalByEnrollment.set(ev.enrollment_id, ev);
  }

  // Agrégat NPS / satisfaction
  const npsScores = ((hotEvals ?? []) as Array<{ nps_score: number | null }>)
    .map((e) => e.nps_score)
    .filter((s): s is number => s !== null);
  const npsAvg =
    npsScores.length > 0
      ? Math.round(
          (npsScores.reduce((a, b) => a + b, 0) / npsScores.length) * 10,
        ) / 10
      : null;

  // 6 ter. Quiz pré/post
  const effectiveQuizId =
    session.quiz_template_id ?? session.formation?.quiz_template_id ?? null;
  const { data: quizAttemptsRaw } =
    effectiveQuizId && enrollmentIds.length > 0
      ? await supabase
          .from("quiz_attempts")
          .select("enrollment_id, phase, score, max_score")
          .eq("quiz_template_id", effectiveQuizId)
          .in("enrollment_id", enrollmentIds)
      : { data: [] };
  const quizByEnrollment = new Map<
    string,
    {
      pre: { score: number; max: number } | null;
      post: { score: number; max: number } | null;
    }
  >();
  for (const eid of enrollmentIds) {
    quizByEnrollment.set(eid, { pre: null, post: null });
  }
  for (const a of (quizAttemptsRaw ?? []) as Array<{
    enrollment_id: string;
    phase: string;
    score: number | null;
    max_score: number | null;
  }>) {
    const slot = quizByEnrollment.get(a.enrollment_id);
    if (!slot) continue;
    if (a.score === null || a.max_score === null) continue;
    if (a.phase === "pre")
      slot.pre = { score: a.score, max: a.max_score };
    if (a.phase === "post")
      slot.post = { score: a.score, max: a.max_score };
  }

  // 7. Supports
  const { data: docs } = await supabase
    .from("session_documents")
    .select(
      "id, file_name, mime_type, size_bytes, visibility, is_training_program, uploaded_at, uploaded_by",
    )
    .eq("session_id", sessionId)
    .order("uploaded_at", { ascending: false });

  const allDocs = (docs ?? []) as Array<{
    id: string;
    file_name: string;
    mime_type: string | null;
    size_bytes: number | null;
    visibility: string;
    is_training_program: boolean;
    uploaded_at: string;
    uploaded_by: string | null;
  }>;
  const sharedDocs = allDocs.filter(
    (d) => d.visibility === "shared_with_learners",
  );

  // ============================================================
  // Render
  // ============================================================

  const formationTitle = session.formation?.title ?? "Session";
  const ModalityIcon = session.modality === "distanciel" ? Video : MapPin;
  let locationLabel = "—";
  if (session.modality === "distanciel") {
    locationLabel = session.video_link ?? "Distanciel";
  } else if (session.location_ref) {
    const parts = [
      session.location_ref.name,
      session.location_ref.address,
      [session.location_ref.postal_code, session.location_ref.city]
        .filter(Boolean)
        .join(" "),
    ].filter(Boolean);
    locationLabel = parts.join(", ");
  } else if (session.location) {
    locationLabel = session.location;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-4">
        <Link
          href={`/formateur/${token}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour à l&apos;agenda
        </Link>

        {/* Messages */}
        {sp.uploaded && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
            ✓ Support ajouté et partagé avec les apprenants.
          </div>
        )}
        {sp.deleted && (
          <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-sm text-zinc-700">
            Document supprimé.
          </div>
        )}
        {sp.signed && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
            ✓ Signatures enregistrées.
          </div>
        )}
        {sp.error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {sp.error}
          </div>
        )}

        {/* En-tête session */}
        <header className="rounded-xl bg-white shadow-sm border border-zinc-200 p-4 space-y-2">
          <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
            {STATUS_LABEL[session.status ?? "draft"] ?? "Statut inconnu"}
          </div>
          <h1 className="text-lg md:text-xl font-bold text-zinc-900">
            {formationTitle}
          </h1>
          <div className="space-y-1 text-xs text-zinc-600 mt-2">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-zinc-400" />
              <span>{formatDateRange(session.start_date, session.end_date)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ModalityIcon className="h-3.5 w-3.5 text-zinc-400" />
              <span>{locationLabel}</span>
            </div>
          </div>
        </header>

        {/* Module 1 — Participants */}
        <Module
          icon={<Users className="h-5 w-5" />}
          color="cyan"
          title={`Participants (${participants.length})`}
          description="Liste des apprenants inscrits à cette session."
        >
          {participants.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">
              Aucun apprenant inscrit pour le moment.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 -mx-4">
              {participants.map((p) => (
                <li
                  key={p.enrollmentId}
                  className="px-4 py-2 flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm font-medium text-zinc-900">
                      {p.civility ? `${p.civility} ` : ""}
                      {p.fullName}
                    </div>
                    {p.company && (
                      <div className="text-[11px] text-zinc-500">
                        {p.company}
                      </div>
                    )}
                  </div>
                  {p.email && (
                    <a
                      href={`mailto:${p.email}`}
                      className="text-xs text-cyan-700 hover:underline"
                    >
                      {p.email}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Module>

        {/* Module 2 — Test de positionnement */}
        <Module
          icon={<Target className="h-5 w-5" />}
          color="amber"
          title={`Tests de positionnement (${positioningRows?.length ?? 0}/${participants.length})`}
          description="Auto-évaluations remplies par les apprenants avant la formation."
        >
          {participants.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">Aucun apprenant.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {participants.map((p) => {
                const pos = positioningByEnrollment.get(p.enrollmentId);
                return (
                  <li
                    key={p.enrollmentId}
                    className="flex items-center justify-between py-1 gap-2"
                  >
                    <span className="text-zinc-700 truncate">{p.fullName}</span>
                    {pos ? (
                      <Link
                        href={`/formateur/${token}/sessions/${sessionId}/positionnement/${p.enrollmentId}`}
                        className="inline-flex items-center gap-1.5 shrink-0 hover:opacity-80"
                        title="Cliquer pour voir le détail du test"
                      >
                        <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">
                          {labelPositioningLevel(pos.data.current_level)}
                        </span>
                        {pos.data.has_adaptation_need && (
                          <span
                            className="bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                            title="Cet apprenant a déclaré un besoin d'adaptation"
                          >
                            ⚠ Adaptation
                          </span>
                        )}
                        <span className="text-cyan-700 text-[10px] font-semibold">
                          Voir →
                        </span>
                      </Link>
                    ) : (
                      <span className="text-zinc-400 shrink-0">⏳ Non rempli</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {/* Lecture détaillée : V2 ajoutera une modale ou sous-page
              avec toutes les réponses + champ observation formateur. */}
        </Module>

        {/* Module 3 — Convocations envoyées */}
        <Module
          icon={<Mail className="h-5 w-5" />}
          color="indigo"
          title="Convocations envoyées"
          description="État d'envoi des convocations apprenants par email."
        >
          {participants.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">
              Aucun apprenant à convoquer.
            </p>
          ) : (
            <ul className="space-y-1 text-xs">
              {participants.map((p) => {
                const log = convocationByEnrollment.get(p.enrollmentId);
                return (
                  <li
                    key={p.enrollmentId}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-zinc-700">{p.fullName}</span>
                    {log ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Envoyée le{" "}
                        {new Date(log.sent_at).toLocaleDateString("fr-FR")}
                      </span>
                    ) : (
                      <span className="text-amber-700">⏳ Non envoyée</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Module>

        {/* Module 4 — Émargement */}
        <Module
          icon={<PenTool className="h-5 w-5" />}
          color="cyan"
          title="Émargement"
          description={`Signatures recueillies (${totalSlots} demi-journées par apprenant).`}
          actionButton={
            <Link
              href={`/formateur/${token}/sessions/${sessionId}/emargement`}
              className="text-xs px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-700 text-white font-semibold inline-flex items-center gap-1"
            >
              <PenTool className="h-3 w-3" />
              Signer mes demi-journées
            </Link>
          }
        >
          {participants.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">Aucun apprenant.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {participants.map((p) => {
                const signed = signedCountByEnrollment.get(p.enrollmentId) ?? 0;
                const complete = totalSlots > 0 && signed >= totalSlots;
                return (
                  <li
                    key={p.enrollmentId}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-zinc-700">{p.fullName}</span>
                    <span
                      className={
                        complete
                          ? "inline-flex items-center gap-1 text-emerald-700 font-semibold"
                          : signed > 0
                            ? "text-cyan-700"
                            : "text-zinc-400"
                      }
                    >
                      {complete && <CheckCircle2 className="h-3 w-3" />}
                      {signed}/{totalSlots}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Module>

        {/* Module 5 — Évaluations à chaud */}
        <Module
          icon={<ClipboardList className="h-5 w-5" />}
          color="violet"
          title={`Évaluations à chaud (${hotEvals?.length ?? 0})`}
          description={
            npsAvg !== null
              ? `Note de recommandation moyenne : ${npsAvg}/10`
              : "Évaluations remplies par les apprenants en fin de session."
          }
        >
          {(hotEvals?.length ?? 0) === 0 ? (
            <p className="text-xs text-zinc-500 italic">
              Aucune évaluation remplie pour le moment.
            </p>
          ) : (
            <ul className="space-y-1 text-xs">
              {participants.map((p) => {
                const ev = evalByEnrollment.get(p.enrollmentId);
                return (
                  <li
                    key={p.enrollmentId}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-zinc-700">{p.fullName}</span>
                    {ev ? (
                      <span className="inline-flex items-center gap-2 text-violet-700">
                        <span className="font-semibold">
                          {ev.nps_score}/10
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {labelSatisfaction(ev.satisfaction_overall)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-zinc-400">⏳ En attente</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Module>

        {/* Module 5 bis — Quiz pré/post */}
        {effectiveQuizId && (
          <Module
            icon={<Target className="h-5 w-5" />}
            color="amber"
            title="Quiz d'évaluation (pré / post)"
            description="Scores avant / après la formation et progression individuelle."
          >
            {participants.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">Aucun apprenant.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {participants.map((p) => {
                  const slot = quizByEnrollment.get(p.enrollmentId);
                  const pre = slot?.pre;
                  const post = slot?.post;
                  const delta =
                    pre && post
                      ? Math.round(
                          ((post.score / post.max) * 100) -
                            ((pre.score / pre.max) * 100),
                        )
                      : null;
                  return (
                    <li
                      key={p.enrollmentId}
                      className="flex items-center justify-between py-1 gap-2"
                    >
                      <span className="text-zinc-700 truncate">
                        {p.fullName}
                      </span>
                      <span className="inline-flex items-center gap-1.5 shrink-0 text-[10px]">
                        <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-semibold">
                          Pré : {pre ? `${pre.score}/${pre.max}` : "—"}
                        </span>
                        <span className="bg-cyan-100 text-cyan-800 px-1.5 py-0.5 rounded-full font-semibold">
                          Post : {post ? `${post.score}/${post.max}` : "—"}
                        </span>
                        {delta !== null && (
                          <span
                            className={
                              "px-1.5 py-0.5 rounded-full font-bold " +
                              (delta > 0
                                ? "bg-emerald-100 text-emerald-800"
                                : delta < 0
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-zinc-100 text-zinc-700")
                            }
                          >
                            {delta > 0 ? "+" : ""}
                            {delta} pts
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Module>
        )}

        {/* Module 6 — Supports */}
        <Module
          icon={<Folder className="h-5 w-5" />}
          color="indigo"
          title={`Supports (${allDocs.length})`}
          description={
            sharedDocs.length > 0
              ? `${sharedDocs.length} support${sharedDocs.length > 1 ? "s" : ""} partagé${sharedDocs.length > 1 ? "s" : ""} avec les apprenants.`
              : "Aucun support partagé avec les apprenants pour l'instant."
          }
        >
          {allDocs.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">
              Aucun document pour cette session.
            </p>
          ) : (
            <ul className="space-y-1 text-xs">
              {allDocs.map((d) => {
                const isShared = d.visibility === "shared_with_learners";
                const deleteAction = deleteSupportAsTrainer.bind(
                  null,
                  token,
                  sessionId,
                  d.id,
                );
                return (
                  <li
                    key={d.id}
                    className="flex items-center justify-between py-1 gap-2"
                  >
                    <span className="flex items-center gap-1.5 text-zinc-700 truncate min-w-0">
                      <FileText className="h-3 w-3 text-zinc-400 shrink-0" />
                      <span className="truncate">{d.file_name}</span>
                    </span>
                    <span className="text-[10px] text-zinc-500 shrink-0 flex items-center gap-1.5">
                      {d.is_training_program && (
                        <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                          Programme
                        </span>
                      )}
                      {d.uploaded_by === null ? (
                        <form
                          action={toggleDocumentVisibilityAsTrainer.bind(
                            null,
                            token,
                            sessionId,
                            d.id,
                          )}
                        >
                          <button
                            type="submit"
                            className={
                              isShared
                                ? "text-indigo-700 underline cursor-pointer hover:text-indigo-900"
                                : "text-zinc-500 underline cursor-pointer hover:text-zinc-800"
                            }
                            title={
                              isShared
                                ? "Cliquer pour rendre INTERNE (invisible apprenants)"
                                : "Cliquer pour PARTAGER avec les apprenants"
                            }
                          >
                            {isShared ? "Partagé" : "Interne"}
                          </button>
                        </form>
                      ) : isShared ? (
                        <span className="text-indigo-700">Partagé</span>
                      ) : (
                        <span className="text-zinc-400">Interne</span>
                      )}
                      {isShared && (
                        <form action={deleteAction}>
                          <button
                            type="submit"
                            className="text-red-500 hover:text-red-700"
                            title="Supprimer ce support"
                            aria-label="Supprimer"
                          >
                            ✕
                          </button>
                        </form>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Formulaire d'upload — auto-marqué "Partagé avec apprenants" */}
          <form
            action={uploadSupportAsTrainer.bind(null, token, sessionId)}
            className="mt-4 pt-3 border-t border-zinc-100 space-y-2"
          >
            <label className="text-xs font-medium text-zinc-700 block">
              Ajouter un support (partagé automatiquement avec les apprenants)
            </label>
            <input
              type="file"
              name="file"
              required
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt,.csv"
              className="block w-full text-xs text-zinc-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-medium file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
            />
            <input
              type="text"
              name="description"
              placeholder="Description (optionnel)"
              className="block w-full text-xs rounded border border-zinc-300 px-2 py-1"
            />
            <button
              type="submit"
              className="text-xs px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              Téléverser
            </button>
          </form>
        </Module>
      </div>
    </div>
  );
}

// ============================================================
// Sous-composants
// ============================================================

const STATUS_LABEL: Record<string, string> = {
  draft: "Brouillon",
  planned: "Planifiée",
  confirmed: "Confirmée",
  in_progress: "En cours",
  completed: "Terminée",
  postponed: "Reportée",
  cancelled: "Annulée",
  archived: "Archivée",
};

type ModuleColor = "amber" | "cyan" | "indigo" | "violet";
const MODULE_COLORS: Record<ModuleColor, { bg: string; text: string }> = {
  amber: { bg: "bg-amber-50", text: "text-amber-700" },
  cyan: { bg: "bg-cyan-50", text: "text-cyan-700" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-700" },
  violet: { bg: "bg-violet-50", text: "text-violet-700" },
};

function Module({
  icon,
  color,
  title,
  description,
  actionButton,
  children,
}: {
  icon: React.ReactNode;
  color: ModuleColor;
  title: string;
  description: string;
  actionButton?: React.ReactNode;
  children: React.ReactNode;
}) {
  const colors = MODULE_COLORS[color];
  return (
    <section className="rounded-xl bg-white shadow-sm border border-zinc-200 p-4">
      <div className="flex items-start gap-3 mb-3">
        <div
          className={`shrink-0 h-10 w-10 rounded-lg ${colors.bg} ${colors.text} flex items-center justify-center`}
        >
          {icon}
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-zinc-900 text-sm">{title}</h2>
          <p className="text-xs text-zinc-600 mt-0.5">{description}</p>
        </div>
        {actionButton && <div className="shrink-0">{actionButton}</div>}
      </div>
      {children}
    </section>
  );
}

function formatDateRange(start: string, end: string): string {
  if (start === end) {
    return new Date(start).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  return `${new Date(start).toLocaleDateString("fr-FR")} → ${new Date(end).toLocaleDateString("fr-FR")}`;
}

function labelSatisfaction(v: string): string {
  if (v === "very_satisfied") return "Très satisfait";
  if (v === "satisfied") return "Satisfait";
  if (v === "medium") return "Moyen";
  if (v === "unsatisfied") return "Insatisfait";
  return v;
}

function NotFoundCard({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md bg-white rounded-xl shadow-md border border-zinc-200 p-6 text-center space-y-3">
        <Calendar className="h-12 w-12 text-zinc-400 mx-auto" />
        <h1 className="text-lg font-bold">Session indisponible</h1>
        <p className="text-sm text-zinc-600">{reason}</p>
      </div>
    </div>
  );
}
