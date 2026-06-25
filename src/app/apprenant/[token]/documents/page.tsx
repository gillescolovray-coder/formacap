import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  Calendar,
  ChevronRight,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  FolderOpen,
  GraduationCap,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLearnerContext } from "../_resolve";

type Params = { token: string };

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function LearnerDocumentsPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const ctx = await resolveLearnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Toutes les sessions auxquelles l apprenant est inscrit
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, status, session:sessions(id, start_date, end_date, modality, support_drive_url, is_subcontracted, subcontracting_company_id, formation:formations(id, title, programme_pdf_url, support_drive_url))",
    )
    .eq("learner_id", ctx.learner.id)
    .neq("status", "cancelled");

  type Row = {
    id: string;
    status: string | null;
    session: {
      id: string;
      start_date: string | null;
      end_date: string | null;
      modality: string | null;
      support_drive_url: string | null;
      is_subcontracted: boolean | null;
      subcontracting_company_id: string | null;
      formation: {
        id: string;
        title: string;
        programme_pdf_url: string | null;
        support_drive_url: string | null;
      } | Array<{
        id: string;
        title: string;
        programme_pdf_url: string | null;
        support_drive_url: string | null;
      }> | null;
    } | null;
  };

  const items = ((enrollments ?? []) as unknown as Row[])
    .map((r) => {
      const session = Array.isArray(r.session) ? r.session[0] : r.session;
      if (!session) return null;
      const formation = Array.isArray(session.formation)
        ? session.formation[0]
        : session.formation;
      return {
        enrollmentId: r.id,
        sessionId: session.id,
        startDate: session.start_date,
        endDate: session.end_date,
        title: formation?.title ?? "(formation supprimée)",
        programmePdfUrl: formation?.programme_pdf_url ?? null,
        driveUrl: session.support_drive_url ?? formation?.support_drive_url ?? null,
        isPast: session.end_date ? session.end_date < today : false,
        // Sous-traitance = case cochée OU OF donneur d'ordre renseigné (Gilles
        // 2026-06-25) : suffit de sélectionner l'OF pour que le quiz débloque
        // le support, même si la case n'a pas été cochée.
        isSubcontracted:
          session.is_subcontracted === true ||
          session.subcontracting_company_id != null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => {
      const da = a.startDate ?? "9999";
      const db = b.startDate ?? "9999";
      return db.localeCompare(da);
    });

  // Charge les conventions signees ou les conventions concernant l entreprise
  // de l apprenant (consultation uniquement)
  const enrollmentIds = items.map((i) => i.enrollmentId);
  const sessionIds = Array.from(new Set(items.map((i) => i.sessionId)));

  // Conventions signees lies a la company de l apprenant + a une de ses sessions
  const { data: conventions } =
    ctx.learner.company_id && sessionIds.length > 0
      ? await supabase
          .from("session_conventions")
          .select("id, session_id, status, signed_at, amount_ht_total")
          .eq("company_id", ctx.learner.company_id)
          .in("session_id", sessionIds)
      : { data: [] };

  const conventionBySession = new Map<
    string,
    { id: string; status: string | null; signed_at: string | null; amount_ht_total: number | null }
  >();
  for (const c of (conventions ?? []) as Array<{
    id: string;
    session_id: string;
    status: string | null;
    signed_at: string | null;
    amount_ht_total: number | null;
  }>) {
    conventionBySession.set(c.session_id, {
      id: c.id,
      status: c.status,
      signed_at: c.signed_at,
      amount_ht_total: c.amount_ht_total,
    });
  }

  // Documents partagés par le formateur / CAP (par session), avec URLs
  // signées (TTL 1h). Inclut le programme officiel (is_training_program).
  type SharedDoc = {
    id: string;
    file_name: string;
    size_bytes: number | null;
    is_training_program: boolean;
    downloadUrl: string | null;
  };
  const sharedBySession = new Map<string, SharedDoc[]>();
  if (sessionIds.length > 0) {
    const { data: docs } = await supabase
      .from("session_documents")
      .select(
        "id, session_id, file_name, size_bytes, uploaded_at, storage_path, is_training_program, visibility",
      )
      .in("session_id", sessionIds)
      .or("visibility.eq.shared_with_learners,is_training_program.eq.true")
      .order("uploaded_at", { ascending: false });
    const withUrls = await Promise.all(
      ((docs ?? []) as Array<{
        id: string;
        session_id: string;
        file_name: string;
        size_bytes: number | null;
        storage_path: string;
        is_training_program: boolean;
      }>).map(async (d) => {
        const { data: signed } = await supabase.storage
          .from("session-documents")
          .createSignedUrl(d.storage_path, 3600);
        return {
          id: d.id,
          session_id: d.session_id,
          file_name: d.file_name,
          size_bytes: d.size_bytes,
          is_training_program: d.is_training_program,
          downloadUrl: signed?.signedUrl ?? null,
        };
      }),
    );
    for (const d of withUrls) {
      const arr = sharedBySession.get(d.session_id) ?? [];
      arr.push(d);
      sharedBySession.set(d.session_id, arr);
    }
  }

  // Émargement validé par le formateur (≥ 1 créneau signé trainer) par
  // enrollment → conditionne l'accès à la feuille de présence.
  // + signatures APPRENANT (≥1 créneau) -> débloque l'accès aux supports.
  const emargeValidated = new Set<string>(); // formateur (feuille de présence)
  const learnerSignedEnrollments = new Set<string>(); // apprenant (supports)
  if (enrollmentIds.length > 0) {
    const { data: sigs } = await supabase
      .from("attendance_signatures")
      .select("enrollment_id, signer_role")
      .in("enrollment_id", enrollmentIds);
    for (const s of (sigs ?? []) as Array<{
      enrollment_id: string;
      signer_role: string;
    }>) {
      if (s.signer_role === "trainer") emargeValidated.add(s.enrollment_id);
      else learnerSignedEnrollments.add(s.enrollment_id);
    }
  }

  // Sous-traitance (Gilles 2026-06-25) : l'émargement appartient à l'OF -> on
  // débloque les supports dès qu'un quiz a été joué (au moins une tentative).
  const quizPlayedEnrollments = new Set<string>();
  if (enrollmentIds.length > 0) {
    const { data: attempts } = await supabase
      .from("quiz_attempts")
      .select("enrollment_id")
      .in("enrollment_id", enrollmentIds);
    for (const a of (attempts ?? []) as Array<{ enrollment_id: string }>) {
      quizPlayedEnrollments.add(a.enrollment_id);
    }
  }
  const canAccessSupports = (it: {
    enrollmentId: string;
    isSubcontracted: boolean;
  }): boolean =>
    learnerSignedEnrollments.has(it.enrollmentId) ||
    (it.isSubcontracted && quizPlayedEnrollments.has(it.enrollmentId));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 inline-flex items-center gap-2">
          <FileText className="h-6 w-6 text-emerald-600" />
          Mes documents
        </h1>
        <p className="text-sm text-zinc-600 mt-1">
          Téléchargez vos attestations de réalisation, programmes de formation
          et consultez les conventions signées.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-8 text-center">
          <FileText className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm text-zinc-600">
            Aucun document disponible pour le moment.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const conv = conventionBySession.get(item.sessionId);
            const hasAttestation = item.isPast;
            const hasProgramme = !!item.programmePdfUrl;
            const hasConvention = !!conv && conv.status === "signed";
            const sharedDocs = sharedBySession.get(item.sessionId) ?? [];
            const canEmargement =
              item.isPast && emargeValidated.has(item.enrollmentId);
            const hasAnyDoc =
              hasAttestation ||
              hasProgramme ||
              hasConvention ||
              sharedDocs.length > 0 ||
              !!item.driveUrl ||
              canEmargement;

            return (
              <article
                key={item.enrollmentId}
                className="rounded-2xl bg-white border border-zinc-200 p-4 sm:p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/apprenant/${token}/sessions/${item.sessionId}`}
                      className="font-bold text-zinc-900 leading-snug hover:text-cyan-700 inline-flex items-center gap-1"
                    >
                      {item.title}
                      <ChevronRight className="h-3.5 w-3.5 opacity-50" />
                    </Link>
                    <div className="text-xs text-zinc-500 mt-0.5 inline-flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" />
                      {formatDate(item.startDate)}
                      {item.endDate &&
                        item.endDate !== item.startDate &&
                        ` – ${formatDate(item.endDate)}`}
                    </div>
                  </div>
                  {item.isPast && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider border border-amber-200">
                      Terminée
                    </span>
                  )}
                </div>

                {!hasAnyDoc ? (
                  <div className="text-xs text-zinc-500 italic bg-zinc-50 rounded-lg p-3">
                    {item.isPast
                      ? "Aucun document disponible pour cette formation."
                      : "Les documents seront disponibles à la fin de la formation."}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {hasAttestation && (
                      <a
                        href={`/apprenant/${token}/attestations/${item.enrollmentId}/print`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 text-sm font-bold hover:bg-violet-100"
                        title="Ouvrir l'attestation de réalisation (PDF imprimable)"
                      >
                        <Award className="h-4 w-4" />
                        Attestation de réalisation
                      </a>
                    )}
                    {hasProgramme && (
                      <a
                        href={item.programmePdfUrl ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-bold hover:bg-emerald-100"
                      >
                        <FileText className="h-4 w-4" />
                        Programme de formation
                      </a>
                    )}
                    {canEmargement && (
                      <a
                        href={`/apprenant/${token}/sessions/${item.sessionId}/emargement/print`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-cyan-300 bg-cyan-50 text-cyan-700 text-sm font-bold hover:bg-cyan-100"
                        title="Télécharger ma feuille de présence (PDF)"
                      >
                        <ClipboardCheck className="h-4 w-4" />
                        Feuille de présence
                      </a>
                    )}
                    {hasConvention && conv && (
                      <span
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 text-sm font-bold cursor-not-allowed"
                        title="Convention signée — consultation prochainement disponible"
                      >
                        <Eye className="h-4 w-4" />
                        Convention signée (à venir)
                      </span>
                    )}
                  </div>
                )}

                {/* Documents partagés (fichiers + lien Drive) — RÉSERVÉS
                    aux apprenants ayant émargé. Gilles 2026-06-05. */}
                {(sharedDocs.length > 0 || item.driveUrl) &&
                !canAccessSupports(item) ? (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-center">
                    <p className="text-xs font-bold text-zinc-700 inline-flex items-center gap-1.5">
                      🔒 Supports verrouillés
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {item.isSubcontracted
                        ? "Jouez au moins un quiz de la formation pour accéder aux supports."
                        : "Signez votre feuille d'émargement pour accéder aux supports de cette formation."}
                    </p>
                  </div>
                ) : (sharedDocs.length > 0 || item.driveUrl) ? (
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                    <p className="text-xs font-bold text-indigo-800 inline-flex items-center gap-1.5 mb-2">
                      <FolderOpen className="h-4 w-4" />
                      Documents partagés
                    </p>
                    {item.driveUrl && (
                      <a
                        href={item.driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 mb-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        Ouvrir les supports (Google Drive)
                      </a>
                    )}
                    <ul className="space-y-1.5">
                      {sharedDocs.map((doc) => (
                        <li
                          key={doc.id}
                          className="flex items-center gap-2 flex-wrap"
                        >
                          <FileText className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                          <span className="text-sm text-zinc-700 break-all flex-1 min-w-0">
                            {doc.file_name}
                            {doc.is_training_program && (
                              <span className="ml-1.5 text-[10px] uppercase tracking-wider font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-full">
                                📋 Programme
                              </span>
                            )}
                          </span>
                          {doc.downloadUrl ? (
                            <a
                              href={doc.downloadUrl}
                              download={doc.file_name}
                              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Télécharger
                            </a>
                          ) : (
                            <span className="text-xs text-zinc-400 italic shrink-0">
                              Indisponible
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {/* Note pédagogique sur les résultats quiz */}
      <div className="rounded-xl bg-violet-50/40 border border-violet-200 p-3 sm:p-4 flex items-start gap-3">
        <GraduationCap className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-violet-900 font-semibold">
            Et vos résultats de quiz ?
          </p>
          <p className="text-xs text-violet-800 mt-0.5">
            Consultez vos scores aux quiz d&apos;entrée et de sortie + votre
            progression dans l&apos;onglet{" "}
            <Link
              href={`/apprenant/${token}/quiz`}
              className="font-bold underline hover:text-violet-700"
            >
              Mes résultats
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
