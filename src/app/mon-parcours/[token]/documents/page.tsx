import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronLeft,
  Download,
  FileText,
  FolderOpen,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Documents partagés — CAP NUMERIQUE",
  robots: "noindex, nofollow",
};

type Params = { token: string };

/**
 * Page publique : liste des documents partagés par le formateur
 * pour cette session. L'apprenant arrive ici depuis sa carte
 * "Documents partagés" du portail.
 *
 * Sécurité : la possession du token vaut authentification. On
 * affiche uniquement les documents avec visibility =
 * 'shared_with_learners'.
 *
 * Téléchargement : on génère des URLs signées (TTL 1h) avec le
 * client admin (bucket privé), embarquées dans les liens.
 */
export default async function PortailDocumentsPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  // 1. Token → enrollment → session
  const { data: portalRow } = await supabase
    .from("enrollment_portal_tokens")
    .select(
      "enrollment:session_enrollments(id, session_id, session:sessions(support_drive_url, formation:formations(title, programme_pdf_url, programme_pdf_name, support_drive_url), organization:organizations(name, logo_url)))",
    )
    .eq("token", token)
    .maybeSingle<{
      enrollment: {
        id: string;
        session_id: string;
        session: {
          support_drive_url: string | null;
          formation: {
            title: string;
            programme_pdf_url: string | null;
            programme_pdf_name: string | null;
            support_drive_url: string | null;
          } | null;
          organization: { name: string; logo_url: string | null } | null;
        } | null;
      } | null;
    }>();

  if (!portalRow || !portalRow.enrollment) {
    return <NotFoundCard reason="Lien invalide." />;
  }

  const sessionId = portalRow.enrollment.session_id;
  const enrollmentId = portalRow.enrollment.id;
  // Accès supports réservé aux apprenants ayant émargé (≥1 créneau).
  // Gilles 2026-06-05.
  const { data: learnerSigs } = await supabase
    .from("attendance_signatures")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .eq("signer_role", "learner")
    .limit(1);
  const hasSignedEmargement = (learnerSigs ?? []).length > 0;
  const supportDriveUrl =
    portalRow.enrollment.session?.support_drive_url ??
    portalRow.enrollment.session?.formation?.support_drive_url ??
    null;
  const formationTitle =
    portalRow.enrollment.session?.formation?.title ?? "Formation";
  const orgName = portalRow.enrollment.session?.organization?.name ?? "";
  const orgLogo = portalRow.enrollment.session?.organization?.logo_url ?? null;
  const formationProgramUrl =
    portalRow.enrollment.session?.formation?.programme_pdf_url ?? null;
  const formationProgramName =
    portalRow.enrollment.session?.formation?.programme_pdf_name ??
    `programme-${formationTitle.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`;

  // 2. Documents (tout : on inclut le programme officiel même s'il
  //    n'est pas marqué "Partagé apprenants" — règle métier R10
  //    2026-05-17 : le programme doit être accessible à l'apprenant).
  const { data: docs } = await supabase
    .from("session_documents")
    .select(
      "id, file_name, mime_type, size_bytes, description, uploaded_at, storage_path, is_training_program, visibility",
    )
    .eq("session_id", sessionId)
    .or("visibility.eq.shared_with_learners,is_training_program.eq.true")
    .order("uploaded_at", { ascending: false });

  const documents = (docs ?? []) as Array<{
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

  // Trier : programme officiel en premier, puis les autres par date desc.
  documents.sort((a, b) => {
    if (a.is_training_program && !b.is_training_program) return -1;
    if (!a.is_training_program && b.is_training_program) return 1;
    return b.uploaded_at.localeCompare(a.uploaded_at);
  });

  // 3. URLs signées pour le téléchargement (TTL 1h)
  const docsWithUrls = await Promise.all(
    documents.map(async (doc) => {
      const { data: signed } = await supabase.storage
        .from("session-documents")
        .createSignedUrl(doc.storage_path, 3600);
      return {
        ...doc,
        downloadUrl: signed?.signedUrl ?? null,
      };
    }),
  );

  // 4. Fallback programme catalogue : si AUCUN document marqué
  //    "Programme officiel" n'est attaché à la session, on ajoute
  //    le PDF programme du catalogue formation.
  const hasSessionProgram = documents.some((d) => d.is_training_program);
  const catalogProgramEntry =
    !hasSessionProgram && formationProgramUrl
      ? {
          id: "catalog-program",
          file_name: formationProgramName,
          mime_type: "application/pdf" as string | null,
          size_bytes: null as number | null,
          description:
            "Programme officiel de la formation (catalogue).",
          uploaded_at: new Date().toISOString(),
          storage_path: "",
          is_training_program: true,
          visibility: "shared_with_learners",
          downloadUrl: formationProgramUrl,
        }
      : null;
  const allItems = catalogProgramEntry
    ? [catalogProgramEntry, ...docsWithUrls]
    : docsWithUrls;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-4">
        {/* Header */}
        <header className="text-center space-y-2 mb-2">
          {orgLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={orgLogo}
              alt={orgName}
              className="h-12 mx-auto mb-2 object-contain"
            />
          )}
          <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
            Documents partagés
          </div>
          <h1 className="text-xl font-bold text-zinc-900">
            {formationTitle}
          </h1>
        </header>

        <Link
          href={`/mon-parcours/${token}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour à mon espace
        </Link>

        {!hasSignedEmargement ? (
          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-8 text-center">
            <FolderOpen className="h-10 w-10 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-zinc-700">
              🔒 Supports verrouillés
            </p>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
              Signez votre feuille d&apos;émargement pour accéder aux supports
              de la formation.
            </p>
          </div>
        ) : (
          <>
            {supportDriveUrl && (
              <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-4 mb-3">
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
            {allItems.length === 0 ? (
          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-8 text-center">
            <FolderOpen className="h-10 w-10 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-zinc-700">
              Aucun document partagé pour le moment
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Votre formateur déposera les supports ici pendant la session.
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
            <ul className="divide-y divide-zinc-100">
              {allItems.map((doc) => (
                <li key={doc.id} className="p-4">
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
                        <span className="font-medium text-zinc-900 truncate">
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
                        {doc.id !== "catalog-program" && (
                          <span>
                            Ajouté le{" "}
                            {new Date(doc.uploaded_at).toLocaleDateString(
                              "fr-FR",
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    {doc.downloadUrl ? (
                      <a
                        href={doc.downloadUrl}
                        download={doc.file_name}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Télécharger
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-400 italic">
                        Indisponible
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
            )}
          </>
        )}

        <footer className="text-center text-[11px] text-zinc-400 mt-6">
          Les liens de téléchargement sont valables pendant 1 heure.
          <br />
          Rafraîchissez la page si un lien ne fonctionne plus.
        </footer>
      </div>
    </div>
  );
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function NotFoundCard({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md bg-white rounded-xl shadow-md border border-zinc-200 p-6 text-center space-y-3">
        <FileText className="h-12 w-12 text-zinc-400 mx-auto" />
        <h1 className="text-lg font-bold">Documents indisponibles</h1>
        <p className="text-sm text-zinc-600">{reason}</p>
      </div>
    </div>
  );
}
