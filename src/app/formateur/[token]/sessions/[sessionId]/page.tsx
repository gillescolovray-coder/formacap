import type { Metadata } from "next";
import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Folder,
  Lock,
  Mail,
  MapPin,
  MessageSquareText,
  PenTool,
  Target,
  Users,
  Video,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  geocodeAddressFR,
  haversineKm,
  drivingDistanceKm,
} from "@/lib/geo/geocode";
import { RefreshButton } from "./_refresh-button";
import { AutoRefresh } from "./_auto-refresh";
import { ViewConvocationButton } from "./_view-convocation-button";
import type { QuizAttempt } from "@/lib/quiz/types";
import { labelLevel, type LevelValue } from "@/lib/positioning/types";
import {
  buildEventDateTime,
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
} from "@/lib/calendar/event-links";
import { AudienceBadge, formatScheduleLine } from "../../_session-card";
import {
  isReportEmpty,
  labelObjectives,
  type TrainerReport,
} from "@/lib/trainer-report/types";
import { TrainerReportForm } from "./_trainer-report-form";
import { TrainerQrEvaluationButton } from "./_trainer-qr-evaluation-button";
import { BlankEvaluationButton } from "./_blank-evaluation-button";
import { SubcontractGate } from "./_subcontract-gate";
import { TrainerQrQuizButton } from "./_trainer-qr-quiz-button";
import {
  BlankQuizButton,
  type BlankQuizQuestion,
} from "./_blank-quiz-button";
import { UploadSupportForm } from "./_upload-support-form";
import {
  createExpressLearnerFromPortal,
  deleteExpressLearnerFromPortal,
  deleteQuizAttemptFromPortal,
  deleteSupportAsTrainer,
  generateQuickSignupTokenFromPortal,
  getLearnerPortalLinkFromPortal,
  toggleDocumentVisibilityAsTrainer,
  updateLearnerFromPortal,
} from "./actions";
import { ExpressLearnerActions } from "./_express-learner-actions";
import { LearnerPortalLinkButton } from "./_learner-portal-link-button";
import { QuizAttemptResetButton } from "./_quiz-attempt-reset";
import { ExpressSignupBlock } from "@/components/express-signup-block";

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
 * Page détail d'une session côté formateur. Ordre des blocs aligné
 * avec le workflow réel d'animation (Gilles 2026-05-25, retour terrain
 * apres test en situation reelle) :
 *  1. Convocations envoyées (replié — verifie en premier en debut)
 *  2. Participants
 *  3. Tests de positionnement (replié — secondaire)
 *  4. Émargement
 *  5. Quiz d'évaluation (pré / post)
 *  6. Évaluations à chaud (NPS + satisfaction)
 *  7. Supports partagés
 *  8. Bilan formateur (Qualiopi 11/22/32)
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
    expressOk?: string;
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
      "id, status, start_date, end_date, modality, location, video_link, video_app, trainer_id, quiz_template_id, is_inter, is_subcontracted, subcontractor_name, trainer_show_positionnement, trainer_show_emargement, trainer_show_evaluation, default_morning_start, default_morning_end, default_afternoon_start, default_afternoon_end, formation:formations(title, quiz_template_id), location_ref:formation_locations!location_id(name, address, postal_code, city, latitude, longitude), organization:organizations(name, phone, email)",
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
      video_app: string | null;
      trainer_id: string | null;
      quiz_template_id: string | null;
      is_inter: boolean | null;
      is_subcontracted: boolean | null;
      subcontractor_name: string | null;
      trainer_show_positionnement: boolean | null;
      trainer_show_emargement: boolean | null;
      trainer_show_evaluation: boolean | null;
      default_morning_start: string | null;
      default_morning_end: string | null;
      default_afternoon_start: string | null;
      default_afternoon_end: string | null;
      formation: {
        title: string;
        quiz_template_id: string | null;
      } | null;
      location_ref: {
        name: string;
        address: string | null;
        postal_code: string | null;
        city: string | null;
        latitude: number | null;
        longitude: number | null;
      } | null;
      organization: {
        name: string;
        phone: string | null;
        email: string | null;
      } | null;
    }>();

  // Accès autorisé si formateur principal de la session OU formateur
  // d'au moins un jour du planning détaillé (Gilles 2026-05-24).
  if (!session) {
    return <NotFoundCard reason="Session introuvable." />;
  }
  let isAuthorized = session.trainer_id === tokenRow.trainer_id;
  if (!isAuthorized) {
    const { data: dayAssign } = await supabase
      .from("session_days")
      .select("id")
      .eq("session_id", sessionId)
      .eq("trainer_id", tokenRow.trainer_id)
      .limit(1)
      .maybeSingle();
    isAuthorized = !!dayAssign;
  }
  if (!isAuthorized) {
    return (
      <NotFoundCard reason="Vous n'avez pas accès à cette session." />
    );
  }

  // 2. Inscriptions + apprenants
  // (on charge aussi is_temporary + champs édition pour la saisie express)
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, inscription_request_id, learner:learners(id, civility, first_name, last_name, email, phone, mobile, job_title, is_temporary, company_name_temp, company_siret_temp, company:companies(name))",
    )
    .eq("session_id", sessionId);

  const participants = ((enrollments ?? []) as unknown as Array<{
    id: string;
    inscription_request_id: string | null;
    learner: {
      id: string;
      civility: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      mobile: string | null;
      job_title: string | null;
      is_temporary: boolean | null;
      company_name_temp: string | null;
      company_siret_temp: string | null;
      company: { name: string } | null;
    } | null;
  }>).map((e) => ({
    enrollmentId: e.id,
    inscriptionRequestId: e.inscription_request_id ?? null,
    learnerId: e.learner?.id ?? null,
    fullName: [e.learner?.first_name, e.learner?.last_name]
      .filter(Boolean)
      .join(" "),
    civility: e.learner?.civility ?? "",
    email: e.learner?.email ?? null,
    phone: e.learner?.mobile ?? e.learner?.phone ?? null,
    jobTitle: e.learner?.job_title ?? null,
    isTemporary: e.learner?.is_temporary === true,
    // Société : fiche entreprise officielle OU texte libre temporaire
    company:
      e.learner?.company?.name ??
      e.learner?.company_name_temp ??
      null,
    companyNameTemp: e.learner?.company_name_temp ?? null,
    companySiretTemp: e.learner?.company_siret_temp ?? null,
    firstName: e.learner?.first_name ?? null,
    lastName: e.learner?.last_name ?? null,
  }));

  const enrollmentIds = participants.map((p) => p.enrollmentId);

  // Rattachement quiz ROBUSTE par apprenant (Gilles 2026-06-08) : un quiz
  // joué en saisie express peut être lié à un AUTRE enrollment du même
  // apprenant (doublon, ou mauvaise session le même jour). On récupère donc
  // TOUS les enrollments de ces apprenants pour pouvoir retrouver l'essai par
  // learner_id en secours, en plus du rattachement direct par enrollment.
  const participantLearnerIds = Array.from(
    new Set(
      participants
        .map((p) => p.learnerId)
        .filter((x): x is string => Boolean(x)),
    ),
  );
  const learnerByEnrollment = new Map<string, string>(); // enrollmentId -> learnerId
  for (const p of participants) {
    if (p.learnerId) learnerByEnrollment.set(p.enrollmentId, p.learnerId);
  }
  if (participantLearnerIds.length > 0) {
    const { data: allEnr } = await supabase
      .from("session_enrollments")
      .select("id, learner_id")
      .in("learner_id", participantLearnerIds);
    for (const e of (allEnr ?? []) as Array<{
      id: string;
      learner_id: string | null;
    }>) {
      if (e.learner_id) learnerByEnrollment.set(e.id, e.learner_id);
    }
  }
  // Liste élargie d'enrollments à interroger pour les quiz (direct + secours).
  const quizEnrollmentIds = Array.from(
    new Set([...enrollmentIds, ...learnerByEnrollment.keys()]),
  );

  // Source d'inscription par apprenant (Gilles 2026-06-05) :
  //   'cap'         = inscrit directement par CAP NUMÉRIQUE -> CAP gère la
  //                   convocation (œil de visualisation disponible).
  //   'of'          = inscrit via un OF partenaire -> l'OF gère la convocation.
  //   'prescripteur'= inscrit via un prescripteur -> idem, géré en externe.
  // On ne montre PAS le nom de l'OF/prescripteur (juste la nature de la source).
  const sourceByEnrollment = new Map<
    string,
    "cap" | "of" | "prescripteur"
  >();
  const requestIds = Array.from(
    new Set(
      participants
        .map((p) => p.inscriptionRequestId)
        .filter((x): x is string => Boolean(x)),
    ),
  );
  if (requestIds.length > 0) {
    const { data: reqs } = await supabase
      .from("inscription_requests")
      .select("id, inscription_channel")
      .in("id", requestIds);
    const channelByReq = new Map<string, string | null>();
    for (const r of (reqs ?? []) as Array<{
      id: string;
      inscription_channel: string | null;
    }>) {
      channelByReq.set(r.id, r.inscription_channel);
    }
    for (const p of participants) {
      const ch = p.inscriptionRequestId
        ? channelByReq.get(p.inscriptionRequestId)
        : null;
      const src =
        ch === "of" ? "of" : ch === "prescripteur" ? "prescripteur" : "cap";
      sourceByEnrollment.set(p.enrollmentId, src);
    }
  }

  // 3. Logs convocations envoyées
  const { data: convocationLogs } =
    enrollmentIds.length > 0
      ? await supabase
          .from("email_log")
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

  // 5. Total demi-journées + 1er jour pour les horaires affichés dans le header
  const { data: days } = await supabase
    .from("session_days")
    .select(
      "day_date, morning_start, morning_end, afternoon_start, afternoon_end, trainer_notes",
    )
    .eq("session_id", sessionId)
    .order("day_date", { ascending: true });
  const daysTyped = (days ?? []) as Array<{
    day_date: string;
    morning_start: string | null;
    morning_end: string | null;
    afternoon_start: string | null;
    afternoon_end: string | null;
    trainer_notes: string | null;
  }>;
  // Consignes formateur par jour (Gilles 2026-06-19) — saisies côté
  // back-office, à afficher dans le portail ET dans l'agenda.
  const dayConsignes = daysTyped
    .filter((d) => (d.trainer_notes ?? "").trim().length > 0)
    .map((d) => ({
      date: d.day_date,
      notes: (d.trainer_notes ?? "").trim(),
    }));
  let totalSlots = 0;
  for (const d of daysTyped) {
    if (d.morning_start && d.morning_end) totalSlots++;
    if (d.afternoon_start && d.afternoon_end) totalSlots++;
  }
  const firstDay = daysTyped[0] ?? null;
  // Horaires affichés sous la date : 1er jour de session_days ou
  // valeurs par défaut de la session (modifiables dans /sessions).
  const headerSchedule = firstDay
    ? {
        morning_start: firstDay.morning_start,
        morning_end: firstDay.morning_end,
        afternoon_start: firstDay.afternoon_start,
        afternoon_end: firstDay.afternoon_end,
      }
    : {
        morning_start: session.default_morning_start,
        morning_end: session.default_morning_end,
        afternoon_start: session.default_afternoon_start,
        afternoon_end: session.default_afternoon_end,
      };
  const scheduleLine = formatScheduleLine(headerSchedule);

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

  // 6 ter. Quiz pré/post — on charge maintenant aussi le détail des
  // réponses (`data`) et les questions du quiz pour calculer la
  // progression PAR QUESTION (Gilles 2026-05-24).
  const effectiveQuizId =
    session.quiz_template_id ?? session.formation?.quiz_template_id ?? null;
  const [
    { data: quizAttemptsRaw },
    { data: quizQuestionsRaw },
  ] = await Promise.all([
    effectiveQuizId && enrollmentIds.length > 0
      ? supabase
          .from("quiz_attempts")
          .select(
            "id, enrollment_id, quiz_template_id, phase, score, max_score, started_at, completed_at, data",
          )
          .eq("quiz_template_id", effectiveQuizId)
          .in("enrollment_id", quizEnrollmentIds)
      : Promise.resolve({ data: [] as Array<unknown> }),
    effectiveQuizId
      ? supabase
          .from("quiz_questions")
          .select(
            "id, quiz_template_id, position, type, text, options, correct_answer, points, explanation",
          )
          .eq("quiz_template_id", effectiveQuizId)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] as Array<unknown> }),
  ]);
  const quizAttempts = (quizAttemptsRaw ?? []) as unknown as QuizAttempt[];
  // Questions du quiz (pour la consultation du quiz vierge par le formateur
  // — Gilles 2026-06-09).
  const quizQuestions = (quizQuestionsRaw ?? []) as unknown as BlankQuizQuestion[];
  const quizByEnrollment = new Map<
    string,
    { pre: QuizAttempt | null; post: QuizAttempt | null }
  >();
  for (const eid of enrollmentIds) {
    quizByEnrollment.set(eid, { pre: null, post: null });
  }
  // Rattachement de secours par apprenant (essai lié à un autre enrollment).
  const quizByLearner = new Map<
    string,
    { pre: QuizAttempt | null; post: QuizAttempt | null }
  >();
  const attemptTime = (a: QuizAttempt): number => {
    const t = a.completed_at ?? a.started_at;
    return t ? new Date(t).getTime() : 0;
  };
  for (const a of quizAttempts) {
    // 1) rattachement direct (enrollment affiché)
    const slot = quizByEnrollment.get(a.enrollment_id);
    if (slot) {
      if (a.phase === "pre") slot.pre = a;
      if (a.phase === "post") slot.post = a;
    }
    // 2) index par apprenant (on garde l'essai le plus récent par phase)
    const learnerId = learnerByEnrollment.get(a.enrollment_id);
    if (learnerId) {
      const ls = quizByLearner.get(learnerId) ?? { pre: null, post: null };
      if (a.phase === "pre" && (!ls.pre || attemptTime(a) > attemptTime(ls.pre)))
        ls.pre = a;
      if (
        a.phase === "post" &&
        (!ls.post || attemptTime(a) > attemptTime(ls.post))
      )
        ls.post = a;
      quizByLearner.set(learnerId, ls);
    }
  }
  // Pour chaque participant, on complète le slot enrollment avec le secours
  // apprenant si le rattachement direct n'a rien trouvé.
  for (const p of participants) {
    const slot = quizByEnrollment.get(p.enrollmentId);
    if (!slot) continue;
    const ls = p.learnerId ? quizByLearner.get(p.learnerId) : null;
    if (ls) {
      if (!slot.pre && ls.pre) slot.pre = ls.pre;
      if (!slot.post && ls.post) slot.post = ls.post;
    }
  }

  // 6 ter-bis. Seuil de réussite quiz + apprenants SOUS la moyenne au quiz
  // de sortie -> alerte formateur « faire rejouer » (Gilles 2026-06-23).
  let quizThreshold = 50;
  {
    const { data: srow } = await supabase
      .from("sessions")
      .select("organization_id")
      .eq("id", sessionId)
      .maybeSingle<{ organization_id: string }>();
    if (srow?.organization_id) {
      const { data: o } = await supabase
        .from("organizations")
        .select("quiz_pass_threshold_percent")
        .eq("id", srow.organization_id)
        .maybeSingle<{ quiz_pass_threshold_percent: number | null }>();
      if (o?.quiz_pass_threshold_percent != null)
        quizThreshold = o.quiz_pass_threshold_percent;
    }
  }
  const belowThreshold = participants
    .map((p) => {
      const slot = quizByEnrollment.get(p.enrollmentId);
      const post = slot?.post ?? null;
      if (!post || !post.max_score) return null;
      const pct = Math.round(((post.score ?? 0) / post.max_score) * 100);
      return pct < quizThreshold
        ? { enrollmentId: p.enrollmentId, name: p.fullName, pct }
        : null;
    })
    .filter((x): x is { enrollmentId: string; name: string; pct: number } =>
      Boolean(x),
    );

  // 6 quater. Bilan formateur (Module 7). Fallback silencieux si la
  // table n'existe pas encore en prod (migration 0101 pas appliquée) :
  // la section affichera juste un message d'attente.
  let trainerReportRow: {
    report: TrainerReport;
    signer_name: string | null;
    signed_at: string | null;
    signature_data: string | null;
  } | null = null;
  let trainerReportTableMissing = false;
  try {
    const { data: r, error: rErr } = await supabase
      .from("session_trainer_reports")
      .select("report, signer_name, signed_at, signature_data")
      .eq("session_id", sessionId)
      .maybeSingle<{
        report: TrainerReport;
        signer_name: string | null;
        signed_at: string | null;
        signature_data: string | null;
      }>();
    if (rErr && /relation .* does not exist/i.test(rErr.message)) {
      trainerReportTableMissing = true;
    } else {
      trainerReportRow = r ?? null;
    }
  } catch {
    trainerReportTableMissing = true;
  }

  // Nom complet du formateur (pour pré-remplir signer_name côté formulaire)
  const { data: trainerRow } = await supabase
    .from("trainers")
    .select("first_name, last_name")
    .eq("id", tokenRow.trainer_id)
    .maybeSingle<{ first_name: string; last_name: string }>();
  const trainerFullName = trainerRow
    ? `${trainerRow.first_name} ${trainerRow.last_name}`.trim()
    : "Formateur";

  // 7. Supports
  const { data: docs } = await supabase
    .from("session_documents")
    .select(
      "id, file_name, mime_type, size_bytes, visibility, is_training_program, uploaded_at, uploaded_by, description",
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
    description: string | null;
  }>;
  const sharedDocs = allDocs.filter(
    (d) => d.visibility === "shared_with_learners",
  );
  // Pièces du BILAN déposées par le formateur pour CAP (non partagées aux
  // apprenants) — Gilles 2026-06-19. Visibilité "internal".
  const internalDocs = allDocs.filter((d) => d.visibility === "internal");

  // ============================================================
  // Render
  // ============================================================

  const formationTitle = session.formation?.title ?? "Session";
  const isRemote =
    session.modality === "distanciel" || session.modality === "hybride";
  const ModalityIcon = isRemote ? Video : MapPin;

  // Adresse complète (présentiel)
  let fullAddress: string | null = null;
  if (session.location_ref) {
    const parts = [
      session.location_ref.name,
      session.location_ref.address,
      [session.location_ref.postal_code, session.location_ref.city]
        .filter(Boolean)
        .join(" "),
    ].filter(Boolean);
    fullAddress = parts.length > 0 ? parts.join(", ") : null;
  } else if (session.location) {
    fullAddress = session.location;
  }

  // Libellé visio (distanciel) : on n'affiche le nom de l'application QUE
  // si un lien de connexion est réellement disponible (Gilles 2026-06-05).
  const remoteHeaderLabel =
    session.video_app && session.video_link
      ? `Distanciel via ${session.video_app}`
      : "Distanciel";

  // Lien Google Maps pour le présentiel — facilite l'itinéraire
  const mapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null;

  // Distance entre l'adresse du formateur et le lieu de formation
  // (Gilles 2026-06-26) : ITINÉRAIRE ROUTIER le plus rapide via
  // OpenRouteService ; repli sur le vol d'oiseau si le routing échoue
  // (clé absente / réseau). Actif pour TOUS les formateurs.
  let distanceKm: number | null = null;
  let distanceIsRoad = false;
  if (
    !isRemote &&
    session.location_ref?.latitude != null &&
    session.location_ref?.longitude != null &&
    session.trainer_id
  ) {
    const { data: tr } = await supabase
      .from("trainers")
      .select("company_address, company_postal_code, company_city")
      .eq("id", session.trainer_id)
      .maybeSingle<{
        company_address: string | null;
        company_postal_code: string | null;
        company_city: string | null;
      }>();
    if (tr) {
      const trainerCoords = await geocodeAddressFR(
        tr.company_address,
        tr.company_postal_code,
        tr.company_city,
      );
      if (trainerCoords) {
        const loc = {
          lat: session.location_ref.latitude,
          lng: session.location_ref.longitude,
        };
        const road = await drivingDistanceKm(trainerCoords, loc);
        if (road != null) {
          distanceKm = road;
          distanceIsRoad = true;
        } else {
          distanceKm = haversineKm(loc, trainerCoords);
        }
      }
    }
  }

  // Représentation string utilisée par les liens Google/Outlook + .ics.
  // - distanciel : on privilégie le lien direct (ouvrable depuis l'agenda),
  //   sinon le libellé "Distanciel via {app}" pour que le formateur sache
  //   quelle app lancer.
  // - présentiel : adresse complète.
  const locationForCalendar = isRemote
    ? (session.video_link ?? remoteHeaderLabel)
    : (fullAddress ?? "");

  // === Liens d'ajout au calendrier (Google / Outlook / .ics) ===
  // On utilise les horaires REELS planifies dans session_days (1er
  // jour pour le start, dernier jour pour le end). Bug Gilles
  // 2026-05-26 : avant le calendrier prenait session.default_* qui
  // peut differer des horaires reels planifies par jour (l'utilisateur
  // voyait 8h45 sur la page mais 8h30 dans son agenda Google).
  const lastDay = daysTyped[daysTyped.length - 1] ?? null;
  const orgName = session.organization?.name ?? "";
  const calStart = buildEventDateTime(
    session.start_date,
    headerSchedule.morning_start,
    "09:00",
  );
  const calEnd = buildEventDateTime(
    session.end_date,
    lastDay?.afternoon_end ??
      lastDay?.morning_end ??
      session.default_afternoon_end,
    "17:00",
  );
  const calAppBase =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com";
  const calAgendaUrl = `${calAppBase}/formateur/${token}`;
  const calPortalUrl = `${calAppBase}/formateur/${token}/sessions/${sessionId}`;
  // Description riche pour Google/Outlook/.ics : on inclut les 2 liens
  // utiles (agenda global + cette session) pour que le formateur retombe
  // toujours sur son portail sans avoir a rechercher l'email d'invitation
  // (Gilles 2026-05-24).
  const calDescription = [
    `Vous animez cette session pour ${orgName}.`,
    `${participants.length} apprenant${participants.length > 1 ? "s" : ""} inscrit${participants.length > 1 ? "s" : ""}.`,
    session.organization?.phone
      ? `Contact OF : ${session.organization.phone}`
      : null,
    session.organization?.email
      ? `Email OF : ${session.organization.email}`
      : null,
    // Consignes formateur (code salle, accès…) reprises dans l'agenda
    // (Gilles 2026-06-19).
    ...(dayConsignes.length > 0
      ? [
          "",
          "--- Consignes ---",
          ...dayConsignes.map((c) =>
            daysTyped.length > 1
              ? `${new Date(c.date + "T00:00:00").toLocaleDateString("fr-FR")} : ${c.notes}`
              : c.notes,
          ),
        ]
      : []),
    "",
    "--- Acces a mon portail formateur ---",
    `Mon agenda : ${calAgendaUrl}`,
    `Cette session (participants, emargement, supports, bilan) : ${calPortalUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
  const calEvent = {
    title: formationTitle,
    start: calStart,
    end: calEnd,
    description: calDescription,
    location: locationForCalendar,
  };
  const googleCalUrl = buildGoogleCalendarUrl(calEvent);
  const outlookCalUrl = buildOutlookCalendarUrl(calEvent);
  const icsCalUrl = `/api/public/formateur/${token}/sessions/${sessionId}/calendar.ics`;

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
        {sp.expressOk && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
            ✓ Apprenant ajouté en saisie express.
          </div>
        )}

        {/* En-tête session */}
        <header className="rounded-xl bg-white shadow-sm border border-zinc-200 p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={
                "inline-block px-2.5 py-0.5 rounded-full text-[11px] uppercase tracking-wider font-bold border " +
                (STATUS_BADGE[session.status ?? "draft"] ?? STATUS_BADGE.draft)
              }
            >
              {STATUS_LABEL[session.status ?? "draft"] ?? "Statut inconnu"}
            </span>
            <AudienceBadge
              modality={session.modality}
              isInter={session.is_inter}
            />
            <div className="ml-auto flex items-center gap-2">
              <AutoRefresh />
              <RefreshButton label="Rafraîchir" />
            </div>
          </div>
          <h1 className="text-lg md:text-xl font-bold text-zinc-900">
            {formationTitle}
          </h1>
          <div className="space-y-1.5 text-xs text-zinc-600 mt-2">
            {/* Date + horaires */}
            <div className="flex items-start gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-zinc-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-bold text-sm text-zinc-900">
                  {formatDateRange(session.start_date, session.end_date)}
                </div>
                {scheduleLine && (
                  <div className="text-xs font-bold text-zinc-800 tabular-nums">
                    {scheduleLine}
                  </div>
                )}
              </div>
            </div>

            {/* Lieu : distanciel (app + lien) ou présentiel (adresse + maps) */}
            <div className="flex items-start gap-1.5">
              <ModalityIcon className="h-3.5 w-3.5 text-zinc-400 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                {isRemote ? (
                  <>
                    <div className="font-medium text-zinc-800">
                      {remoteHeaderLabel}
                    </div>
                    {session.video_link ? (
                      <a
                        href={session.video_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-cyan-700 hover:underline break-all"
                        title="Ouvrir le lien de visio"
                      >
                        🔗 {session.video_link}
                      </a>
                    ) : (
                      <div className="text-[11px] text-zinc-400 italic">
                        Aucun lien de connexion renseigné
                      </div>
                    )}
                  </>
                ) : fullAddress ? (
                  <>
                    <div className="font-medium text-zinc-800 break-words">
                      {fullAddress}
                    </div>
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-cyan-700 hover:underline"
                        title="Ouvrir dans Google Maps"
                      >
                        🗺 Itinéraire Google Maps
                      </a>
                    )}
                    {distanceKm != null && (
                      <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700">
                        📍 {distanceIsRoad ? "" : "≈ "}
                        {Math.round(distanceKm)} km
                        {distanceIsRoad
                          ? " par la route"
                          : " (à vol d'oiseau)"}{" "}
                        depuis votre adresse
                      </div>
                    )}
                  </>
                ) : (
                  <span className="italic text-zinc-400">Lieu non renseigné</span>
                )}
              </div>
            </div>
          </div>

          {/* Ajouter à mon agenda : 3 voies au choix */}
          <div className="pt-3 mt-2 border-t border-zinc-100 space-y-1.5">
            <p className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 inline-flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              Ajouter à mon agenda
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={googleCalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border-2 border-zinc-300 text-zinc-800 text-xs font-bold hover:bg-zinc-50 hover:border-blue-400 transition-colors"
                title="Ouvre Google Calendar dans un nouvel onglet avec l'événement pré-rempli"
              >
                <span className="text-base leading-none">📅</span>
                Google Calendar
              </a>
              <a
                href={outlookCalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border-2 border-zinc-300 text-zinc-800 text-xs font-bold hover:bg-zinc-50 hover:border-blue-400 transition-colors"
                title="Ouvre Outlook (Office 365) avec l'événement pré-rempli"
              >
                <span className="text-base leading-none">📨</span>
                Outlook
              </a>
              <a
                href={icsCalUrl}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border-2 border-zinc-300 text-zinc-800 text-xs font-bold hover:bg-zinc-50 hover:border-blue-400 transition-colors"
                title="Télécharge un fichier .ics universel (Apple Calendar, Outlook desktop, Thunderbird…)"
              >
                <span className="text-base leading-none">💾</span>
                Fichier .ics
              </a>
            </div>
          </div>

          {/* Voir ma convocation — régénérée à partir des données à jour de la
              session (Gilles 2026-06-19). */}
          <div className="pt-3 mt-2 border-t border-zinc-100">
            <a
              href={`/formateur/${token}/sessions/${sessionId}/convocation`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold"
              title="Consulter votre convocation (toujours à jour)"
            >
              <Mail className="h-4 w-4" />
              Voir ma convocation
            </a>
          </div>
        </header>

        {/* Consignes transmises par l'organisme (code salle, accès, matériel…)
            saisies côté back-office, par jour — Gilles 2026-06-19. */}
        {dayConsignes.length > 0 && (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-900 flex items-center gap-1.5 mb-1.5">
              <span className="text-base leading-none">📋</span>
              Consignes pour cette session
            </p>
            <ul className="space-y-1.5">
              {dayConsignes.map((c) => (
                <li key={c.date} className="text-sm text-amber-900">
                  {daysTyped.length > 1 && (
                    <span className="font-semibold">
                      {new Date(c.date + "T00:00:00").toLocaleDateString(
                        "fr-FR",
                        { weekday: "long", day: "numeric", month: "long" },
                      )}{" "}
                      :{" "}
                    </span>
                  )}
                  <span className="whitespace-pre-line">{c.notes}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Saisie express — sous-traitance (Phase 1 MVP, Gilles 2026-05-24) */}
        {session.is_subcontracted && (
          <ExpressSignupBlock
            subcontractorName={session.subcontractor_name}
            participantCount={participants.length}
            helpText="L'OF donneur d'ordre n'a pas transmis la liste ? Au démarrage, affichez le QR code pendant le tour de table : chaque apprenant scanne, remplit sa fiche, puis arrive direct sur le quiz pré-formation (pas de double saisie). Vous pouvez aussi saisir vous-même un apprenant ponctuel."
            createAction={async (formData) => {
              "use server";
              await createExpressLearnerFromPortal(
                token,
                sessionId,
                formData,
              );
            }}
            generateQuickSignupAction={async () => {
              "use server";
              return await generateQuickSignupTokenFromPortal(
                token,
                sessionId,
              );
            }}
          />
        )}

        {/* Bloc 1 — Convocations envoyées (Gilles 2026-05-25 :
            place en 1er, replie par defaut, info secondaire mais
            verifiee en premier en debut de session). */}
        <Module
          icon={<Mail className="h-5 w-5" />}
          color="indigo"
          title="Convocations envoyées"
          description="État d'envoi des convocations apprenants par email."
          subcontractedManagedByOf={session.is_subcontracted === true}
          collapsible
        >
          {participants.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">
              Aucun apprenant à convoquer.
            </p>
          ) : (
            <ul className="space-y-1 text-xs">
              {participants.map((p) => {
                const log = convocationByEnrollment.get(p.enrollmentId);
                const src = sourceByEnrollment.get(p.enrollmentId) ?? "cap";
                const sourceLabel =
                  src === "of"
                    ? "OF"
                    : src === "prescripteur"
                      ? "Prescripteur"
                      : "CAP NUMÉRIQUE";
                const sourceCls =
                  src === "of"
                    ? "bg-violet-100 text-violet-800 border-violet-300"
                    : src === "prescripteur"
                      ? "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300"
                      : "bg-cyan-100 text-cyan-800 border-cyan-300";
                const capManaged = src === "cap";
                return (
                  <li
                    key={p.enrollmentId}
                    className="flex items-center justify-between gap-2 py-1"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-zinc-700 truncate">
                        {p.fullName}
                      </span>
                      <span
                        className={
                          "inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold border whitespace-nowrap " +
                          sourceCls
                        }
                        title={`Source d'inscription : ${sourceLabel}`}
                      >
                        {sourceLabel}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {capManaged ? (
                        <>
                          {log ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Envoyée le{" "}
                              {new Date(log.sent_at).toLocaleDateString("fr-FR")}
                            </span>
                          ) : (
                            <span className="text-amber-700">
                              ⏳ Non envoyée
                            </span>
                          )}
                          <ViewConvocationButton
                            token={token}
                            sessionId={sessionId}
                            enrollmentId={p.enrollmentId}
                          />
                        </>
                      ) : (
                        <span className="text-zinc-500 italic">
                          Convocation gérée par{" "}
                          {src === "of" ? "l'OF" : "le prescripteur"}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Module>

        {/* Bloc 2 — Participants */}
        <Module
          icon={<Users className="h-5 w-5" />}
          color="cyan"
          title={`Participants (${participants.length})`}
          description="Liste des apprenants inscrits à cette session."
        >
          {/* Encart "Bon a savoir" pour le formateur : explique l'usage
              du QR personnel pour donner acces a un apprenant sans son
              lien email (Gilles 2026-05-25). */}
          <div className="mb-3 rounded-lg bg-cyan-50 border border-cyan-200 p-3 text-[12px] text-cyan-900 leading-relaxed">
            <strong className="block mb-1 text-cyan-800">
              💡 Vos apprenants n&apos;ont pas besoin de créer un compte
            </strong>
            Ils reçoivent leur lien personnel dans leur convocation par
            email. Si un apprenant n&apos;a pas sa convocation avec lui,
            cliquez sur l&apos;icône{" "}
            <span className="inline-block px-1.5 py-0.5 rounded bg-white border border-cyan-300 text-cyan-700 text-[10px] font-bold align-middle">
              QR
            </span>{" "}
            à droite de son nom et faites-le scanner avec son téléphone —
            il accède immédiatement à <strong>son espace personnel</strong>.
            {/* Frise du parcours : chiffre au-dessus, libellé complet dessous.
                6 colonnes de largeur égale sur UNE ligne, sans scroll — le
                texte peut passer sur 2 lignes dans sa colonne (Gilles 2026-06-05). */}
            <div className="mt-2 flex items-start gap-0.5">
              {[
                "Test de positionnement",
                "Émargement",
                "Quiz",
                "Évaluation à chaud",
                "Support de formation",
                "Certificat de réalisation",
              ].flatMap((step, i, arr) => {
                const col = (
                  <div
                    key={`step-${i}`}
                    className="flex flex-col items-center text-center flex-1 min-w-0 px-0.5"
                  >
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-cyan-600 text-white text-[10px] font-bold shrink-0">
                      {i + 1}
                    </span>
                    <span className="mt-1 text-[10px] font-semibold text-cyan-800 leading-tight">
                      {step}
                    </span>
                  </div>
                );
                if (i === arr.length - 1) return [col];
                return [
                  col,
                  <span
                    key={`arr-${i}`}
                    className="text-cyan-400 font-bold text-xs mt-1.5 shrink-0"
                  >
                    →
                  </span>,
                ];
              })}
            </div>
          </div>
          {participants.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">
              Aucun apprenant inscrit pour le moment.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 -mx-4">
              {participants.map((p) => {
                // Badge "espace utilisateur dispo" : on considere que
                // l'apprenant a recu son lien d'acces si une convocation
                // a ete envoyee (la convocation contient le lien vers son
                // portail). Sinon, il faut lui scanner le QR personnel
                // (icone a droite). Gilles 2026-05-25.
                const hasConvocation = convocationByEnrollment.has(
                  p.enrollmentId,
                );
                return (
                <li
                  key={p.enrollmentId}
                  className="px-4 py-2 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-zinc-900 flex items-center gap-1.5 flex-wrap">
                      <span>
                        {p.civility ? `${p.civility} ` : ""}
                        {p.fullName}
                      </span>
                      {p.isTemporary && (
                        <span
                          className="text-[9px] uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-bold"
                          title="Apprenant saisi en express le jour J (sous-traitance)"
                        >
                          Express
                        </span>
                      )}
                      {hasConvocation ? (
                        <span
                          className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold"
                          title="Convocation envoyée par email — l'apprenant a son lien d'accès personnel dans sa boîte mail."
                        >
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Lien envoyé
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-bold"
                          title="Aucune convocation envoyée à cet apprenant — utilisez l'icône QR code à droite pour lui donner accès à son espace personnel."
                        >
                          ⚠ Sans lien
                        </span>
                      )}
                    </div>
                    {p.company && (
                      <div className="text-[11px] text-zinc-500 truncate">
                        {p.company}
                      </div>
                    )}
                    {p.email && (
                      <a
                        href={`mailto:${p.email}`}
                        className="text-[11px] text-cyan-700 hover:underline truncate block"
                      >
                        {p.email}
                      </a>
                    )}
                    {/* Téléphone : affiché UNIQUEMENT pour les sessions en
                        distanciel (le formateur peut avoir besoin d'appeler
                        un apprenant absent de la visio). Gilles 2026-06-05. */}
                    {session.modality === "distanciel" && p.phone && (
                      <a
                        href={`tel:${p.phone}`}
                        className="text-[11px] font-semibold text-zinc-700 hover:text-cyan-700 tabular-nums block"
                      >
                        ☎ {p.phone}
                      </a>
                    )}
                  </div>
                  <div className="flex items-start gap-0.5 shrink-0">
                    {/* (L'œil de visualisation de la convocation a été déplacé
                        dans le bloc « Convocations envoyées » — Gilles 2026-06-05.) */}
                    {/* Lien personnel apprenant (QR + URL) : disponible
                        pour TOUS les apprenants — utile quand le formateur
                        a saisi l'apprenant lui-meme ou qu'un apprenant a
                        perdu sa convocation (Gilles 2026-05-24). */}
                    <LearnerPortalLinkButton
                      learnerName={p.fullName || "l'apprenant"}
                      getLinkAction={async () => {
                        "use server";
                        return await getLearnerPortalLinkFromPortal(
                          token,
                          sessionId,
                          p.enrollmentId,
                        );
                      }}
                    />
                  {p.learnerId && (
                    <ExpressLearnerActions
                      learnerId={p.learnerId}
                      isTemporary={p.isTemporary}
                      initial={{
                        civility: p.civility || null,
                        firstName: p.firstName,
                        lastName: p.lastName,
                        email: p.email,
                        jobTitle: p.jobTitle,
                        companyNameTemp: p.companyNameTemp,
                        companySiretTemp: p.companySiretTemp,
                      }}
                      updateAction={async (learnerId, formData) => {
                        "use server";
                        return await updateLearnerFromPortal(
                          token,
                          sessionId,
                          learnerId,
                          formData,
                        );
                      }}
                      deleteAction={async (learnerId) => {
                        "use server";
                        return await deleteExpressLearnerFromPortal(
                          token,
                          sessionId,
                          learnerId,
                        );
                      }}
                    />
                  )}
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </Module>


        {/* Module 2 — Test de positionnement (replié par défaut,
            Gilles 2026-05-25 : info secondaire pour le formateur en
            cours de session). */}
        <Module
          icon={<Target className="h-5 w-5" />}
          color="amber"
          title={`Tests de positionnement (${positioningRows?.length ?? 0}/${participants.length})`}
          description="Auto-évaluations remplies par les apprenants avant la formation."
          subcontractedManagedByOf={
            session.is_subcontracted === true &&
            !session.trainer_show_positionnement
          }
          subcontractGate={{ token, sessionId, block: "positionnement" }}
          collapsible
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

        {/* Module 4 — Émargement */}
        <Module
          icon={<PenTool className="h-5 w-5" />}
          color="cyan"
          title="Émargement"
          description={`Signatures recueillies (${totalSlots} demi-journées par apprenant).`}
          subcontractedManagedByOf={
            session.is_subcontracted === true &&
            !session.trainer_show_emargement
          }
          subcontractGate={{ token, sessionId, block: "emargement" }}
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

        {/* Module 5 bis — Quiz pré/post (refonte 2026-05-24 :
            tableau par apprenant avec horodatage + progression %).
            Pliable, ouvert par defaut Gilles 2026-05-25. */}
        {effectiveQuizId && (
          <Module
            icon={<Target className="h-5 w-5" />}
            color="amber"
            title="Quiz d'évaluation (pré / post)"
            description="Pour chaque apprenant : date et score du quiz d'entrée, du quiz de sortie, et progression mesurée."
            collapsible
            defaultOpen
          >
            {/* Consultation du quiz vierge — AU-DESSUS du QR et discret, pour
                que le QR (à lancer devant les apprenants) reste l'action
                principale. Gilles 2026-06-09. */}
            {quizQuestions.length > 0 && (
              <div className="mb-2">
                <BlankQuizButton questions={quizQuestions} />
              </div>
            )}

            {/* Alerte : apprenants sous la moyenne au quiz de sortie
                -> proposition de rejeu (Gilles 2026-06-23). */}
            {belowThreshold.length > 0 && (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                <div className="text-sm font-bold text-rose-800">
                  ⚠️ {belowThreshold.length} apprenant
                  {belowThreshold.length > 1 ? "s" : ""} sous la moyenne (
                  {quizThreshold} %)
                </div>
                <p className="text-xs text-rose-700 mt-1">
                  Ces apprenants n&apos;ont pas atteint la moyenne au quiz de
                  sortie. Vous pouvez leur faire <strong>rejouer le quiz</strong>{" "}
                  (leur 1er résultat est conservé).
                </p>
                <ul className="mt-2 space-y-1.5">
                  {belowThreshold.map((b) => (
                    <li
                      key={b.enrollmentId}
                      className="flex items-center justify-between gap-2 text-sm flex-wrap"
                    >
                      <span className="text-rose-900 font-medium">
                        {b.name} — {b.pct} %
                      </span>
                      <QuizAttemptResetButton
                        learnerName={b.name}
                        phaseLabel="du quiz de sortie"
                        resetAction={async () => {
                          "use server";
                          return await deleteQuizAttemptFromPortal(
                            token,
                            sessionId,
                            b.enrollmentId,
                            "post",
                          );
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Bandeau QR code partagé : un seul QR pour toute la session,
                chaque apprenant choisit son nom puis joue (Gilles 2026-05-25,
                remplace le QR par participant). Anti-rejeu pre/post hérité
                de /mon-parcours/[token]/quiz. */}
            <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 p-4 space-y-2 mb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-[260px]">
                  <div className="text-[10px] uppercase tracking-widest text-amber-700 font-bold mb-0.5">
                    Quiz partagé — 1 seul QR pour toute la session
                  </div>
                  <h3 className="font-bold text-base text-amber-900 mb-1">
                    QR code quiz entrée / sortie
                  </h3>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Affichez ce QR code en{" "}
                    <strong>plein écran</strong> en début et en fin de session.
                    Chaque apprenant scanne, choisit son nom dans la liste,
                    puis répond aux questions. Le système empêche
                    automatiquement de jouer 2 fois le même quiz.
                  </p>
                </div>
                <div className="shrink-0">
                  <TrainerQrQuizButton token={token} sessionId={sessionId} />
                </div>
              </div>
            </div>

            {participants.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">Aucun apprenant.</p>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-xs sm:text-sm min-w-[640px]">
                  <thead className="bg-zinc-50 text-left text-[10px] uppercase tracking-wider text-zinc-500 font-bold border-b border-zinc-200">
                    <tr>
                      <th className="px-2 py-2">Apprenant</th>
                      <th className="px-2 py-2">Quiz d&apos;entrée</th>
                      <th className="px-2 py-2">Quiz de sortie</th>
                      <th className="px-2 py-2 text-right">Progression</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {participants.map((p) => {
                      const slot = quizByEnrollment.get(p.enrollmentId);
                      const pre = slot?.pre ?? null;
                      const post = slot?.post ?? null;
                      const prePct =
                        pre && pre.max_score
                          ? Math.round(
                              ((pre.score ?? 0) / pre.max_score) * 100,
                            )
                          : null;
                      const postPct =
                        post && post.max_score
                          ? Math.round(
                              ((post.score ?? 0) / post.max_score) * 100,
                            )
                          : null;
                      const delta =
                        prePct !== null && postPct !== null
                          ? postPct - prePct
                          : null;
                      // Gilles 2026-05-25 : progression en pts ET en %
                      const deltaPoints =
                        pre &&
                        post &&
                        pre.score !== null &&
                        post.score !== null
                          ? (post.score ?? 0) - (pre.score ?? 0)
                          : null;
                      return (
                        <tr key={p.enrollmentId}>
                          <td className="px-2 py-2 align-top font-medium text-zinc-900">
                            {p.fullName}
                          </td>
                          <td className="px-2 py-2 align-top">
                            <div className="flex items-start gap-2">
                              <AttemptCell attempt={pre} />
                              {pre && (
                                <Link
                                  href={`/formateur/${token}/sessions/${sessionId}/quiz/${p.enrollmentId}`}
                                  title="Voir le détail des réponses (pré + post)"
                                  className="p-1 rounded text-amber-700 hover:bg-amber-50 shrink-0"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Link>
                              )}
                            </div>
                            {pre && (
                              <QuizAttemptResetButton
                                learnerName={p.fullName}
                                phaseLabel="du quiz d'entrée"
                                resetAction={async () => {
                                  "use server";
                                  return await deleteQuizAttemptFromPortal(
                                    token,
                                    sessionId,
                                    p.enrollmentId,
                                    "pre",
                                  );
                                }}
                              />
                            )}
                          </td>
                          <td className="px-2 py-2 align-top">
                            <div className="flex items-start gap-2">
                              <AttemptCell attempt={post} />
                              {post && (
                                <Link
                                  href={`/formateur/${token}/sessions/${sessionId}/quiz/${p.enrollmentId}`}
                                  title="Voir le détail des réponses (pré + post)"
                                  className="p-1 rounded text-amber-700 hover:bg-amber-50 shrink-0"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Link>
                              )}
                            </div>
                            {post && (
                              <QuizAttemptResetButton
                                learnerName={p.fullName}
                                phaseLabel="du quiz de sortie"
                                resetAction={async () => {
                                  "use server";
                                  return await deleteQuizAttemptFromPortal(
                                    token,
                                    sessionId,
                                    p.enrollmentId,
                                    "post",
                                  );
                                }}
                              />
                            )}
                          </td>
                          <td className="px-2 py-2 align-top text-right tabular-nums">
                            {delta === null ? (
                              <span className="text-zinc-300">—</span>
                            ) : (
                              <div
                                className={
                                  delta > 0
                                    ? "text-emerald-700"
                                    : delta < 0
                                      ? "text-rose-700"
                                      : "text-zinc-600"
                                }
                              >
                                {/* Gilles 2026-06-03 : on bascule le %
                                    en chiffre principal (plus parlant que
                                    pts), les pts en sous-titre discret. */}
                                <div className="text-sm font-bold">
                                  {delta > 0 ? "+" : ""}
                                  {delta} %
                                </div>
                                {deltaPoints !== null && (
                                  <div className="text-[11px] opacity-70">
                                    ({deltaPoints > 0 ? "+" : ""}
                                    {deltaPoints} pts)
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Module>
        )}


        {/* Module 5 — Évaluations à chaud (pliable, ouvert par defaut
            Gilles 2026-05-25). */}
        <Module
          icon={<ClipboardList className="h-5 w-5" />}
          color="violet"
          title={`Évaluations à chaud (${hotEvals?.length ?? 0})`}
          description={
            npsAvg !== null
              ? `Note de recommandation moyenne : ${npsAvg}/10`
              : "Évaluations remplies par les apprenants en fin de session."
          }
          /* En sous-traitance, masqué par défaut (géré par l'OF) mais
             déverrouillable par le formateur (Gilles 2026-06-26). */
          subcontractedManagedByOf={
            session.is_subcontracted === true &&
            !session.trainer_show_evaluation
          }
          subcontractGate={{ token, sessionId, block: "evaluation" }}
          collapsible
          defaultOpen
        >
          {/* Consultation de l'éval à chaud vierge — AU-DESSUS du QR et
              discrète (le QR reste l'action principale). Gilles 2026-06-09. */}
          <div className="mb-2">
            <BlankEvaluationButton />
          </div>

          {/* Bandeau QR code à projeter en fin de session
              (Gilles 2026-05-25). Affichage identique à celui du QR
              émargement, en violet pour rester cohérent avec le code
              couleur Évaluation à chaud. */}
          <div className="rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 border-2 border-violet-300 p-4 space-y-2 mb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1 min-w-[260px]">
                <div className="text-[10px] uppercase tracking-widest text-violet-700 font-bold mb-0.5">
                  Fin de session
                </div>
                <h3 className="font-bold text-base text-violet-900 mb-1">
                  QR code évaluation à chaud
                </h3>
                <p className="text-xs text-violet-800 leading-relaxed">
                  Affichez ce QR code à vos apprenants en{" "}
                  <strong>plein écran</strong> sur votre ordinateur ou
                  vidéo-projecteur. Chacun le scanne avec son téléphone,
                  sélectionne son nom et remplit le questionnaire Qualiopi
                  avant de quitter la salle.
                </p>
              </div>
              <div className="shrink-0">
                <TrainerQrEvaluationButton
                  token={token}
                  sessionId={sessionId}
                />
              </div>
            </div>
          </div>

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
                              "inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold border-2 transition shadow-sm cursor-pointer " +
                              (isShared
                                ? "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200"
                                : "bg-amber-100 text-amber-800 border-amber-400 hover:bg-amber-200")
                            }
                            title={
                              isShared
                                ? "Cliquer pour rendre INTERNE (invisible apprenants)"
                                : "Cliquer pour PARTAGER avec les apprenants"
                            }
                          >
                            {isShared ? (
                              <>
                                <Eye className="h-3 w-3" />
                                Partagé
                              </>
                            ) : (
                              <>
                                <EyeOff className="h-3 w-3" />
                                Interne — cliquer pour partager
                              </>
                            )}
                          </button>
                        </form>
                      ) : isShared ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <Eye className="h-3 w-3" />
                          Partagé
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-300">
                          <EyeOff className="h-3 w-3" />
                          Interne
                        </span>
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

          {/* Formulaire d'upload — composant client avec cle
              d'idempotence, bouton desactive pendant l'upload et
              regeneration de cle apres succes (Gilles 2026-05-28
              fix double-upload). */}
          <UploadSupportForm token={token} sessionId={sessionId} />
        </Module>

        {/* Module 7 — Bilan formateur (Qualiopi 11/22/32) */}
        <Module
          icon={<MessageSquareText className="h-5 w-5" />}
          color="violet"
          title="Bilan formateur"
          description={
            trainerReportTableMissing
              ? "Module bientôt disponible (migration en attente d'application)."
              : trainerReportRow?.signed_at
                ? `Signé le ${new Date(trainerReportRow.signed_at).toLocaleDateString("fr-FR")} — modifiable.`
                : isReportEmpty(trainerReportRow?.report)
                  ? "Votre retour de fin de session (atteinte des objectifs, adaptations, améliorations…). Exigence Qualiopi."
                  : "Bilan en brouillon — pensez à signer pour valider."
          }
        >
          {trainerReportTableMissing ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
              ⚠ La table <code>session_trainer_reports</code> n&apos;est pas
              encore créée. Appliquez la migration{" "}
              <code>0101_session_trainer_reports.sql</code> dans le SQL
              Editor Supabase pour activer cette section.
            </p>
          ) : (
            <>
            <details className="group" open={isReportEmpty(trainerReportRow?.report)}>
              <summary className="cursor-pointer list-none flex items-center justify-between gap-2 py-1 text-xs font-semibold text-zinc-700 hover:text-zinc-900">
                <span className="inline-flex items-center gap-1.5">
                  {trainerReportRow && !isReportEmpty(trainerReportRow.report) ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Voir / modifier le bilan
                    </>
                  ) : (
                    "Remplir le bilan"
                  )}
                </span>
                <span className="text-cyan-600 text-[10px] font-bold uppercase tracking-wider group-open:hidden">
                  Ouvrir
                </span>
                <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider hidden group-open:inline">
                  Replier
                </span>
              </summary>

              {/* Récap rapide quand replié + bilan déjà rempli */}
              {trainerReportRow && !isReportEmpty(trainerReportRow.report) && (
                <div className="mt-2 mb-2 text-[11px] text-zinc-600 group-open:hidden space-y-0.5">
                  {trainerReportRow.report.objectives_reached && (
                    <div>
                      <span className="font-semibold">Objectifs :</span>{" "}
                      {labelObjectives(trainerReportRow.report.objectives_reached)}
                    </div>
                  )}
                  {trainerReportRow.report.group_level && (
                    <div className="truncate">
                      <span className="font-semibold">Groupe :</span>{" "}
                      {trainerReportRow.report.group_level}
                    </div>
                  )}
                </div>
              )}

              <TrainerReportForm
                token={token}
                sessionId={sessionId}
                trainerName={trainerFullName}
                initial={trainerReportRow?.report ?? {}}
                initialSignedAt={trainerReportRow?.signed_at ?? null}
                initialSignature={trainerReportRow?.signature_data ?? null}
              />
            </details>

            {/* Pièces jointes au bilan, à destination de CAP NUMÉRIQUE —
                NON partagées aux apprenants (Gilles 2026-06-19). */}
            <div className="mt-4 pt-3 border-t border-zinc-200">
              <p className="text-xs font-bold text-zinc-800 inline-flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-violet-600" />
                Pièces pour CAP NUMÉRIQUE (non partagées aux apprenants)
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Joignez ici des documents destinés UNIQUEMENT à l&apos;organisme
                (feuille de route, notes, justificatifs…). Les apprenants ne les
                voient pas.
              </p>
              {internalDocs.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {internalDocs.map((d) => {
                    const deleteInternal = deleteSupportAsTrainer.bind(
                      null,
                      token,
                      sessionId,
                      d.id,
                    );
                    return (
                      <li
                        key={d.id}
                        className="flex items-start justify-between gap-2 rounded-md bg-violet-50/60 border border-violet-100 px-2 py-1.5"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-zinc-800 font-medium">
                            <FileText className="h-3 w-3 text-violet-500 shrink-0" />
                            <span className="truncate">{d.file_name}</span>
                          </span>
                          {d.description && (
                            <span className="block text-[11px] text-zinc-500 pl-4.5">
                              {d.description}
                            </span>
                          )}
                        </span>
                        <form action={deleteInternal} className="shrink-0">
                          <button
                            type="submit"
                            className="text-red-500 hover:text-red-700"
                            title="Supprimer cette pièce"
                            aria-label="Supprimer"
                          >
                            ✕
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-1">
                <UploadSupportForm
                  token={token}
                  sessionId={sessionId}
                  visibility="internal"
                  title="Joindre un document pour CAP (non partagé aux apprenants)"
                  successText="Pièce ajoutée au bilan (visible uniquement par CAP NUMÉRIQUE)."
                />
              </div>
            </div>
            </>
          )}
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

// Pastille colorée par statut (lisibilité d'un coup d'œil).
const STATUS_BADGE: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 border-zinc-300",
  planned: "bg-sky-100 text-sky-800 border-sky-300",
  confirmed: "bg-emerald-100 text-emerald-800 border-emerald-300",
  in_progress: "bg-cyan-100 text-cyan-800 border-cyan-300",
  completed: "bg-zinc-100 text-zinc-600 border-zinc-300",
  postponed: "bg-amber-100 text-amber-800 border-amber-400",
  cancelled: "bg-rose-100 text-rose-800 border-rose-300",
  archived: "bg-zinc-100 text-zinc-500 border-zinc-300",
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
  /** En mode sous-traitance, certains blocs sont gérés par l'OF
   *  donneur d'ordre — on les grise visuellement pour que le formateur
   *  comprenne qu'il n'a rien à faire ici. Gilles 2026-05-24. */
  subcontractedManagedByOf,
  /** Si fourni en mode sous-traitance : affiche un volet déverrouillable
   *  (case à cocher + confirmation) au lieu d'un verrou total. Gilles
   *  2026-06-26. */
  subcontractGate,
  /** Plie le bloc derrière un <details>. Par défaut replié — le
   *  formateur clique sur le header pour voir le contenu. Utilisé pour
   *  les modules secondaires (positionnement, convocations) que le
   *  formateur n'a pas besoin de voir à chaque ouverture de la page.
   *  Gilles 2026-05-25. */
  collapsible,
  defaultOpen,
}: {
  icon: React.ReactNode;
  color: ModuleColor;
  title: string;
  description: string;
  actionButton?: React.ReactNode;
  children: React.ReactNode;
  subcontractedManagedByOf?: boolean;
  subcontractGate?: {
    token: string;
    sessionId: string;
    block: "positionnement" | "emargement" | "evaluation";
  };
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const colors = MODULE_COLORS[color];
  if (subcontractedManagedByOf) {
    // Volet déverrouillable (case à cocher + confirmation) si demandé.
    if (subcontractGate) {
      return (
        <SubcontractGate
          token={subcontractGate.token}
          sessionId={subcontractGate.sessionId}
          block={subcontractGate.block}
          icon={icon}
          title={title}
          description={description}
        />
      );
    }
    return (
      <section className="rounded-xl bg-zinc-50 border border-zinc-200 p-4 opacity-70">
        <div className="flex items-start gap-3 mb-2">
          <div className="shrink-0 h-10 w-10 rounded-lg bg-zinc-200 text-zinc-500 flex items-center justify-center">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-zinc-700 text-sm">{title}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
          </div>
        </div>
        <div className="rounded-md bg-white border border-dashed border-zinc-300 p-2.5 text-[11px] text-zinc-600 italic">
          🔒 Géré par l&apos;OF donneur d&apos;ordre — vous n&apos;avez pas
          à intervenir sur ce bloc en sous-traitance.
        </div>
      </section>
    );
  }

  if (collapsible) {
    return (
      <section className="rounded-xl bg-white shadow-sm border border-zinc-200">
        <details open={defaultOpen} className="group">
          <summary className="flex items-start gap-3 p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <div
              className={`shrink-0 h-10 w-10 rounded-lg ${colors.bg} ${colors.text} flex items-center justify-center`}
            >
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-zinc-900 text-sm">{title}</h2>
              <p className="text-xs text-zinc-600 mt-0.5">{description}</p>
            </div>
            {actionButton && (
              <div
                className="shrink-0"
                onClick={(e) => e.preventDefault()}
              >
                {actionButton}
              </div>
            )}
            <ChevronDown className="h-4 w-4 text-zinc-400 mt-3 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4 pt-1 border-t border-zinc-100">
            {children}
          </div>
        </details>
      </section>
    );
  }

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

/**
 * Cellule d'un quiz (pré ou post) côté portail formateur : badge score
 * + horodatage de la complétion. Lit `completed_at` en priorité, sinon
 * `started_at`. Gilles 2026-05-24.
 */
function AttemptCell({
  attempt,
}: {
  attempt: QuizAttempt | null | undefined;
}) {
  if (!attempt) {
    return <span className="text-zinc-400 text-[11px]">⏳ Non joué</span>;
  }
  const at = attempt.completed_at ?? attempt.started_at;
  // Fix Gilles 2026-05-25 : sans timeZone explicite, le formateur
  // toLocaleString s'aligne sur le fuseau du serveur (UTC sur Vercel)
  // -> ecart de 2h en ete / 1h en hiver vs heure Paris reelle.
  const dateLabel = at
    ? new Date(at).toLocaleString("fr-FR", {
        timeZone: "Europe/Paris",
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  if (attempt.score === null || !attempt.max_score) {
    return (
      <div className="space-y-0.5">
        <span className="text-[11px] text-amber-700">En cours</span>
        {dateLabel && (
          <div className="text-[10px] text-zinc-400 tabular-nums">
            démarré {dateLabel}
          </div>
        )}
      </div>
    );
  }
  const pct = Math.round((attempt.score / attempt.max_score) * 100);
  const color =
    pct >= 75
      ? "bg-emerald-100 text-emerald-800"
      : pct >= 50
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";
  return (
    <div className="space-y-0.5">
      <span
        className={
          "inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full " +
          color
        }
      >
        {attempt.score}/{attempt.max_score}
        <span className="text-[10px] font-normal opacity-80">({pct} %)</span>
      </span>
      {dateLabel && (
        <div className="text-[10px] text-zinc-500 tabular-nums">
          {dateLabel}
        </div>
      )}
    </div>
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
