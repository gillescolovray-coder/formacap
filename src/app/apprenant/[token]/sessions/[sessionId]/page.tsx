import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  FileText,
  FolderOpen,
  Globe,
  GraduationCap,
  Hash,
  Lock,
  MapPin,
  User,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLearnerContext } from "../../_resolve";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { token: string; sessionId: string };

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(s: string | null): string {
  if (!s) return "—";
  return s.slice(0, 5);
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default async function LearnerSessionDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token, sessionId } = await params;
  if (!UUID_REGEX.test(sessionId)) notFound();
  const ctx = await resolveLearnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();

  // Verifie que l apprenant est bien inscrit a cette session
  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select("id, status")
    .eq("session_id", sessionId)
    .eq("learner_id", ctx.learner.id)
    .neq("status", "cancelled")
    .maybeSingle();
  if (!enrollment) notFound();

  // Charge les details de la session
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, internal_code, start_date, end_date, is_inter, modality, status, location, video_app, video_link, support_drive_url, is_subcontracted, quiz_template_id, location_obj:formation_locations!location_id(name, address, postal_code, city), formation:formations(id, title, subtitle, duration_hours, duration_days, programme_pdf_url, support_drive_url, quiz_template_id), trainer:trainers!trainer_id(first_name, last_name)",
    )
    .eq("id", sessionId)
    .eq("organization_id", ctx.learner.organization_id)
    .maybeSingle();
  if (!session) notFound();

  type LocObj = {
    name: string | null;
    address: string | null;
    postal_code: string | null;
    city: string | null;
  };
  const sess = session as unknown as {
    id: string;
    internal_code: string | null;
    start_date: string | null;
    end_date: string | null;
    is_inter: boolean | null;
    modality: string | null;
    status: string | null;
    location: string | null;
    video_app: string | null;
    video_link: string | null;
    support_drive_url: string | null;
    is_subcontracted: boolean | null;
    quiz_template_id: string | null;
    location_obj: LocObj | LocObj[] | null;
    formation:
      | {
          id: string;
          title: string;
          subtitle: string | null;
          duration_hours: number | null;
          duration_days: number | null;
          programme_pdf_url: string | null;
          support_drive_url: string | null;
          quiz_template_id: string | null;
        }
      | Array<{
          id: string;
          title: string;
          subtitle: string | null;
          duration_hours: number | null;
          duration_days: number | null;
          programme_pdf_url: string | null;
          support_drive_url: string | null;
          quiz_template_id: string | null;
        }>
      | null;
    trainer:
      | { first_name: string; last_name: string }
      | Array<{ first_name: string; last_name: string }>
      | null;
  };
  const formation = Array.isArray(sess.formation)
    ? sess.formation[0] ?? null
    : sess.formation;
  const trainer = Array.isArray(sess.trainer)
    ? sess.trainer[0] ?? null
    : sess.trainer;
  const locObj = Array.isArray(sess.location_obj)
    ? sess.location_obj[0] ?? null
    : sess.location_obj;

  // Horaires détaillés
  const { data: sessionDays } = await supabase
    .from("session_days")
    .select("day_date, morning_start, morning_end, afternoon_start, afternoon_end")
    .eq("session_id", sessionId)
    .order("day_date", { ascending: true });

  const days = (sessionDays ?? []) as Array<{
    day_date: string;
    morning_start: string | null;
    morning_end: string | null;
    afternoon_start: string | null;
    afternoon_end: string | null;
  }>;

  const today = new Date().toISOString().slice(0, 10);

  // Documents partagés par le formateur / CAP pour cette session
  // (visibility = 'shared_with_learners' + le programme officiel).
  // Même règle que le portail mon-parcours. URLs signées TTL 1h.
  const { data: sharedDocsRaw } = await supabase
    .from("session_documents")
    .select(
      "id, file_name, mime_type, size_bytes, description, uploaded_at, storage_path, is_training_program, visibility",
    )
    .eq("session_id", sessionId)
    .or("visibility.eq.shared_with_learners,is_training_program.eq.true")
    .order("uploaded_at", { ascending: false });

  const sharedDocs = (sharedDocsRaw ?? []) as Array<{
    id: string;
    file_name: string;
    mime_type: string | null;
    size_bytes: number | null;
    description: string | null;
    uploaded_at: string;
    storage_path: string;
    is_training_program: boolean;
    visibility: string;
  }>;
  sharedDocs.sort((a, b) => {
    if (a.is_training_program && !b.is_training_program) return -1;
    if (!a.is_training_program && b.is_training_program) return 1;
    return b.uploaded_at.localeCompare(a.uploaded_at);
  });
  const sharedDocsWithUrls = await Promise.all(
    sharedDocs.map(async (doc) => {
      const { data: signed } = await supabase.storage
        .from("session-documents")
        .createSignedUrl(doc.storage_path, 3600);
      return { ...doc, downloadUrl: signed?.signedUrl ?? null };
    }),
  );

  // Émargement : signatures de CET apprenant (matin/après-midi par jour).
  // Un créneau n'est montré que s'il a été validé par le FORMATEUR
  // (signer_role='trainer' present). La feuille de presence n'est
  // telechargeable qu'une fois la formation terminee (cf. plus bas).
  const { data: emargeRaw } = await supabase
    .from("attendance_signatures")
    .select("period_date, moment, signer_role, signed_at")
    .eq("enrollment_id", enrollment.id);
  const emarge = (emargeRaw ?? []) as Array<{
    period_date: string;
    moment: "morning" | "afternoon";
    signer_role: "learner" | "trainer";
    signed_at: string;
  }>;
  const trainerSigned = new Set<string>();
  const learnerSigned = new Set<string>();
  for (const s of emarge) {
    const key = `${s.period_date}:${s.moment}`;
    if (s.signer_role === "trainer") trainerSigned.add(key);
    else learnerSigned.add(key);
  }
  // Accès aux supports réservé aux apprenants ayant émargé au moins 1
  // créneau (Gilles 2026-06-05). Lien Drive effectif = session sinon formation.
  const hasSignedEmargement = learnerSigned.size > 0;

  // Sous-traitance (Gilles 2026-06-25) : l'émargement appartient à l'OF (hors
  // FORMACAP), l'apprenant ne peut donc jamais signer ici -> on débloque les
  // supports dès qu'il a joué AU MOINS un quiz (entrée ou sortie).
  const isSubcontracted = sess.is_subcontracted === true;
  let hasPlayedQuiz = false;
  if (isSubcontracted) {
    const { data: anyAttempt } = await supabase
      .from("quiz_attempts")
      .select("id")
      .eq("enrollment_id", enrollment.id)
      .limit(1);
    hasPlayedQuiz = (anyAttempt ?? []).length > 0;
  }
  const canAccessSupports =
    hasSignedEmargement || (isSubcontracted && hasPlayedQuiz);
  const supportDriveUrl =
    sess.support_drive_url ?? formation?.support_drive_url ?? null;
  // Liste des creneaux planifies (jour x moment) avec un horaire.
  type Slot = { date: string; moment: "morning" | "afternoon" };
  const slots: Slot[] = [];
  for (const d of days) {
    if (d.morning_start && d.morning_end)
      slots.push({ date: d.day_date, moment: "morning" });
    if (d.afternoon_start && d.afternoon_end)
      slots.push({ date: d.day_date, moment: "afternoon" });
  }
  const hasAnyValidated = slots.some((s) =>
    trainerSigned.has(`${s.date}:${s.moment}`),
  );
  // La formation est-elle terminee ? (gate du telechargement)
  const isFinished = Boolean(sess.end_date && sess.end_date < today);

  const isPast = sess.end_date && sess.end_date < today;
  const modalityLabel =
    sess.modality === "presentiel"
      ? "Présentiel"
      : sess.modality === "distanciel"
        ? "Distanciel"
        : sess.modality === "hybride"
          ? "Hybride"
          : "—";

  return (
    <div className="space-y-4">
      <Link
        href={`/apprenant/${token}/sessions`}
        className="inline-flex items-center gap-1.5 text-xs text-cyan-700 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Retour à mes formations
      </Link>

      {/* Header session */}
      <div className="rounded-2xl bg-gradient-to-br from-cyan-50 to-indigo-50 border border-cyan-200 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-cyan-100 text-cyan-700">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-zinc-900 leading-snug">
              {formation?.title ?? "Session"}
            </h1>
            {formation?.subtitle && (
              <p className="text-xs sm:text-sm text-zinc-600 mt-1">
                {formation.subtitle}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {sess.modality && (
                <span
                  className={
                    sess.modality === "presentiel"
                      ? "inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider"
                      : sess.modality === "hybride"
                        ? "inline-flex items-center gap-1 px-2 py-1 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold uppercase tracking-wider"
                        : "inline-flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold uppercase tracking-wider"
                  }
                >
                  {sess.modality === "presentiel" ? (
                    <MapPin className="h-3 w-3" />
                  ) : (
                    <Globe className="h-3 w-3" />
                  )}
                  {modalityLabel}
                </span>
              )}
              {sess.is_inter !== null && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 text-[10px] font-bold uppercase tracking-wider">
                  {sess.is_inter ? "INTER" : "INTRA"}
                </span>
              )}
              {isPast && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider border border-amber-200">
                  <CheckCircle2 className="h-3 w-3" />
                  Terminée
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Informations clés */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <InfoCard icon={Calendar} label="Date(s)" color="cyan">
          <div className="font-bold text-zinc-900">
            {formatDate(sess.start_date)}
            {sess.end_date &&
              sess.end_date !== sess.start_date &&
              ` – ${formatDate(sess.end_date)}`}
          </div>
        </InfoCard>

        <InfoCard icon={Clock} label="Durée" color="indigo">
          <div className="font-bold text-zinc-900">
            {formation?.duration_days && formation.duration_days > 0
              ? `${formation.duration_days} jour${formation.duration_days > 1 ? "s" : ""}`
              : "—"}
            {formation?.duration_hours
              ? ` · ${formation.duration_hours} h`
              : ""}
          </div>
        </InfoCard>

        {sess.internal_code && (
          <InfoCard icon={Hash} label="Code session" color="zinc">
            <div className="font-mono text-xs text-zinc-700">
              {sess.internal_code}
            </div>
          </InfoCard>
        )}

        {trainer && (
          <InfoCard icon={User} label="Formateur" color="amber">
            <div className="font-bold text-zinc-900">
              {trainer.first_name} {trainer.last_name}
            </div>
          </InfoCard>
        )}

        {(sess.modality === "presentiel" || sess.modality === "hybride") &&
          (locObj || sess.location) && (
            <InfoCard icon={Building2} label="Lieu" color="emerald">
              <div className="text-zinc-900">
                {locObj?.name && (
                  <div className="font-bold">{locObj.name}</div>
                )}
                {locObj
                  ? [
                      locObj.address,
                      [locObj.postal_code, locObj.city]
                        .filter(Boolean)
                        .join(" "),
                    ]
                      .filter((x) => x && x.length > 0)
                      .map((line, i) => (
                        <div key={i} className="text-xs text-zinc-600">
                          {line}
                        </div>
                      ))
                  : sess.location && (
                      <div className="text-xs text-zinc-600">
                        {sess.location}
                      </div>
                    )}
              </div>
            </InfoCard>
          )}

        {sess.modality === "distanciel" && (sess.video_app || sess.video_link) && (
          <InfoCard icon={Globe} label="Visioconférence" color="cyan">
            <div className="text-zinc-900">
              {sess.video_app && (
                <div className="font-bold">{sess.video_app}</div>
              )}
              {sess.video_link && !isPast && (
                <a
                  href={sess.video_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-700 hover:underline break-all"
                >
                  {sess.video_link}
                </a>
              )}
            </div>
          </InfoCard>
        )}
      </div>

      {/* Programme PDF */}
      {formation?.programme_pdf_url && (
        <div className="rounded-2xl bg-white border border-zinc-200 p-4">
          <h2 className="text-sm font-bold text-zinc-700 mb-2 inline-flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-emerald-600" />
            Programme de la formation
          </h2>
          <a
            href={formation.programme_pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-bold hover:bg-emerald-100"
          >
            <FileText className="h-4 w-4" />
            Télécharger le programme (PDF)
          </a>
        </div>
      )}

      {/* Horaires détaillés */}
      {days.length > 0 && (
        <div className="rounded-2xl bg-white border border-zinc-200 overflow-hidden">
          <h2 className="px-4 py-2 border-b border-zinc-200 bg-zinc-50 text-sm font-bold text-zinc-700 inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Horaires de la formation
          </h2>
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] uppercase tracking-wider text-zinc-500 font-bold">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Matin</th>
                <th className="px-3 py-2 text-left">Après-midi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {days.map((d) => (
                <tr key={d.day_date}>
                  <td className="px-3 py-2 font-semibold text-zinc-900">
                    {formatDate(d.day_date)}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">
                    {d.morning_start && d.morning_end
                      ? `${formatTime(d.morning_start)} – ${formatTime(d.morning_end)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">
                    {d.afternoon_start && d.afternoon_end
                      ? `${formatTime(d.afternoon_start)} – ${formatTime(d.afternoon_end)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Documents partagés par le formateur / CAP pour cette session */}
      <div className="rounded-2xl bg-white border border-zinc-200 overflow-hidden">
        <h2 className="px-4 py-2 border-b border-zinc-200 bg-zinc-50 text-sm font-bold text-zinc-700 inline-flex items-center gap-1.5">
          <FolderOpen className="h-4 w-4 text-indigo-600" />
          Documents partagés
        </h2>
        {!canAccessSupports ? (
          <div className="px-4 py-6 text-center">
            <Lock className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-zinc-700">
              Supports verrouillés
            </p>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
              {isSubcontracted
                ? "Jouez au moins un quiz de la formation pour accéder aux supports."
                : "Signez votre feuille d'émargement pour accéder aux supports de la formation."}
            </p>
          </div>
        ) : (
          <>
            {supportDriveUrl && (
              <div className="px-4 py-3 border-b border-zinc-100">
                <a
                  href={supportDriveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-bold hover:bg-emerald-100"
                >
                  <FolderOpen className="h-4 w-4" />
                  Ouvrir les supports (Google Drive)
                </a>
              </div>
            )}
            {sharedDocsWithUrls.length === 0 ? (
          !supportDriveUrl ? (
          <div className="px-4 py-6 text-center">
            <FolderOpen className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-zinc-600">
              Aucun document partagé pour le moment.
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Votre formateur déposera les supports ici pendant la formation.
            </p>
          </div>
          ) : null
        ) : (
          <ul className="divide-y divide-zinc-100">
            {sharedDocsWithUrls.map((doc) => (
              <li key={doc.id} className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div
                    className={
                      doc.is_training_program
                        ? "shrink-0 h-10 w-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"
                        : "shrink-0 h-10 w-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"
                    }
                  >
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-zinc-900 break-all">
                        {doc.file_name}
                      </span>
                      {doc.is_training_program && (
                        <span className="text-[10px] uppercase tracking-wider font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-full">
                          📋 Programme officiel
                        </span>
                      )}
                    </div>
                    {doc.description && (
                      <p className="text-xs text-zinc-600 mt-0.5">
                        {doc.description}
                      </p>
                    )}
                    <div className="text-[11px] text-zinc-400 mt-1 flex flex-wrap gap-x-3">
                      {doc.size_bytes !== null && (
                        <span>{formatSize(doc.size_bytes)}</span>
                      )}
                      <span>
                        Ajouté le{" "}
                        {new Date(doc.uploaded_at).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                  </div>
                  {doc.downloadUrl ? (
                    <a
                      href={doc.downloadUrl}
                      download={doc.file_name}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold min-h-[36px]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Télécharger</span>
                    </a>
                  ) : (
                    <span className="text-xs text-zinc-400 italic shrink-0">
                      Indisponible
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
            {sharedDocsWithUrls.length > 0 && (
              <div className="mx-4 my-3 rounded-lg bg-amber-50 border border-amber-300 px-3 py-2.5 flex items-start gap-2">
                <span className="text-base leading-none">⏱️</span>
                <p className="text-xs sm:text-sm font-semibold text-amber-800">
                  Les liens de téléchargement sont valables 1 heure. Si un
                  téléchargement ne fonctionne plus, <strong>rafraîchissez la
                  page</strong> (ou rouvrez le lien) pour en générer un nouveau.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Feuille d'émargement : créneaux validés par le formateur */}
      {slots.length > 0 && (
        <div className="rounded-2xl bg-white border border-zinc-200 overflow-hidden">
          <h2 className="px-4 py-2 border-b border-zinc-200 bg-zinc-50 text-sm font-bold text-zinc-700 inline-flex items-center gap-1.5">
            <ClipboardCheck className="h-4 w-4 text-cyan-600" />
            Feuille d&apos;émargement
          </h2>

          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] uppercase tracking-wider text-zinc-500 font-bold">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Matin</th>
                <th className="px-3 py-2 text-left">Après-midi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {days.map((d) => (
                <tr key={d.day_date}>
                  <td className="px-3 py-2 font-semibold text-zinc-900 align-top">
                    {formatDate(d.day_date)}
                  </td>
                  {(["morning", "afternoon"] as const).map((moment) => {
                    const hasSlot =
                      moment === "morning"
                        ? d.morning_start && d.morning_end
                        : d.afternoon_start && d.afternoon_end;
                    const key = `${d.day_date}:${moment}`;
                    const validated = trainerSigned.has(key);
                    const meSigned = learnerSigned.has(key);
                    return (
                      <td key={moment} className="px-3 py-2 align-top">
                        {!hasSlot ? (
                          <span className="text-zinc-300">—</span>
                        ) : validated ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-xs">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Émargé
                            </span>
                            <div className="text-[11px] text-zinc-500">
                              {meSigned
                                ? "Votre signature enregistrée"
                                : "Validé par le formateur"}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-zinc-400 text-xs italic">
                            <Clock className="h-3.5 w-3.5" />
                            En attente du formateur
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Téléchargement de la feuille de présence */}
          <div className="px-4 py-3 border-t border-zinc-200 bg-zinc-50/60">
            {!hasAnyValidated ? (
              <p className="text-xs text-zinc-500">
                La feuille d&apos;émargement sera disponible au fur et à mesure
                de sa validation par le formateur.
              </p>
            ) : isFinished ? (
              <a
                href={`/apprenant/${token}/sessions/${sessionId}/emargement/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold min-h-[40px]"
              >
                <ClipboardCheck className="h-4 w-4" />
                Télécharger ma feuille de présence (PDF)
              </a>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-100 border border-zinc-200 text-zinc-500 text-sm font-medium">
                <Lock className="h-4 w-4" />
                Feuille de présence téléchargeable à la fin de la formation
              </div>
            )}
          </div>
        </div>
      )}

      {/* Documents + quiz : liens vers les autres onglets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link
          href={`/apprenant/${token}/documents`}
          className="group rounded-2xl bg-white border border-zinc-200 p-4 hover:border-emerald-400 hover:shadow-md transition-all"
        >
          <FileText className="h-6 w-6 text-emerald-600 mb-2" />
          <div className="font-bold text-zinc-900 group-hover:text-emerald-700">
            Mes documents pour cette formation
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            Attestation, programme, convention…
          </div>
        </Link>
        <Link
          href={`/apprenant/${token}/quiz`}
          className="group rounded-2xl bg-white border border-zinc-200 p-4 hover:border-violet-400 hover:shadow-md transition-all"
        >
          <GraduationCap className="h-6 w-6 text-violet-600 mb-2" />
          <div className="font-bold text-zinc-900 group-hover:text-violet-700">
            Mes résultats de quiz
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            Scores pré et post + progression
          </div>
        </Link>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  color,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: "cyan" | "indigo" | "emerald" | "amber" | "zinc";
  children: React.ReactNode;
}) {
  const ring = {
    cyan: "border-cyan-200 bg-cyan-50/40",
    indigo: "border-indigo-200 bg-indigo-50/40",
    emerald: "border-emerald-200 bg-emerald-50/40",
    amber: "border-amber-200 bg-amber-50/40",
    zinc: "border-zinc-200 bg-zinc-50/40",
  }[color];
  const iconColor = {
    cyan: "text-cyan-600",
    indigo: "text-indigo-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    zinc: "text-zinc-600",
  }[color];
  return (
    <div className={`rounded-xl border p-3 ${ring}`}>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1 inline-flex items-center gap-1">
        <Icon className={`h-3 w-3 ${iconColor}`} />
        {label}
      </div>
      {children}
    </div>
  );
}
