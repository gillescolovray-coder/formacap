import { FolderOpen, Info, Upload } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SessionTabs } from "../_session-tabs";
import { SessionHeaderMeta } from "../_session-header-meta";
import { DocumentRow } from "./_doc-row";
import { resendTrainingProgram, uploadSessionDocument } from "./actions";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Doc = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  description: string | null;
  visibility: "internal" | "shared_with_learners";
  is_training_program: boolean;
  uploaded_at: string;
};

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    uploaded?: string;
    deleted?: string;
    programSent?: string;
  }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();
  const query = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, formation:formations(id, title, programme_pdf_url, programme_pdf_name)",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      formation: {
        id: string;
        title: string;
        programme_pdf_url: string | null;
        programme_pdf_name: string | null;
      } | null;
    }>();
  if (!session) notFound();

  const { data: documents } = await supabase
    .from("session_documents")
    .select(
      "id, file_name, mime_type, size_bytes, description, visibility, is_training_program, uploaded_at",
    )
    .eq("session_id", id)
    .order("uploaded_at", { ascending: false });

  const docs = (documents ?? []) as Doc[];
  const title = session.formation?.title ?? "Session";
  const upload = uploadSessionDocument.bind(null, id);

  // Programme effectif : session si présent, sinon catalogue, sinon aucun.
  const sessionProgramDoc = docs.find((d) => d.is_training_program);
  const catalogProgramUrl = session.formation?.programme_pdf_url ?? null;
  const catalogProgramName = session.formation?.programme_pdf_name ?? null;
  let programState: {
    source: "session" | "catalog" | "none";
    label: string;
    fileName: string | null;
    // Pour "Aperçu" :
    sessionDocId: string | null;
    catalogUrl: string | null;
  };
  if (sessionProgramDoc) {
    programState = {
      source: "session",
      label: "Programme spécifique à cette session",
      fileName: sessionProgramDoc.file_name,
      sessionDocId: sessionProgramDoc.id,
      catalogUrl: null,
    };
  } else if (catalogProgramUrl) {
    programState = {
      source: "catalog",
      label: "Programme par défaut (catalogue formation)",
      fileName: catalogProgramName,
      sessionDocId: null,
      catalogUrl: catalogProgramUrl,
    };
  } else {
    programState = {
      source: "none",
      label: "Aucun programme défini",
      fileName: null,
      sessionDocId: null,
      catalogUrl: null,
    };
  }

  const resend = resendTrainingProgram.bind(null, id);

  return (
    <>
      <PageHeader
        title="Documents partagés"
        description={
          <>
            <span className="font-semibold text-zinc-700 dark:text-zinc-300 block">
              {title}
            </span>
            <SessionHeaderMeta sessionId={id} />
          </>
        }
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Sessions", href: "/sessions" },
          { label: title, href: `/sessions/${id}` },
          { label: "Documents" },
        ]}
        actions={<BackButton fallbackHref={`/sessions/${id}`} />}
      />

      <SessionTabs
        sessionId={id}
        counts={{ documents: docs.length }}
      />

      <div className="p-8 max-w-5xl space-y-4">
        {query.error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {query.error}
          </div>
        )}
        {query.uploaded && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Document ajouté.
          </div>
        )}
        {query.deleted && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Document supprimé.
          </div>
        )}
        {query.programSent && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-700">
            ✓ {query.programSent}
          </div>
        )}

        <div className="rounded-lg bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900 p-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-cyan-700 dark:text-cyan-400 shrink-0 mt-0.5" />
          <p className="text-xs text-cyan-900 dark:text-cyan-200 leading-relaxed">
            Centralisez ici tous les documents liés à cette session :
            programme, supports pédagogiques, conventions, devis, etc.
            Formats acceptés : PDF, Word, Excel, PowerPoint, images, CSV.
            Taille max : 10 Mo par fichier.
          </p>
        </div>

        {/* Bloc programme de formation officiel */}
        <section className="rounded-xl bg-amber-50/40 border border-amber-200 p-5 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                📋 Programme de formation officiel
              </h2>
              <p className="text-xs text-zinc-600 mt-0.5">
                Joint automatiquement aux emails de convocation et de
                convention. Visible par l&apos;apprenant dans son portail.
              </p>
            </div>
            <span
              className={
                programState.source === "session"
                  ? "text-xs bg-amber-200 text-amber-900 px-2 py-1 rounded-full font-bold"
                  : programState.source === "catalog"
                    ? "text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded-full font-semibold"
                    : "text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-bold"
              }
            >
              {programState.source === "session" && "Spécifique session"}
              {programState.source === "catalog" && "Par défaut (catalogue)"}
              {programState.source === "none" && "Aucun programme !"}
            </span>
          </div>

          {programState.source !== "none" ? (
            <>
              <div className="rounded-md bg-white border border-amber-200 p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-zinc-900 truncate">
                    {programState.fileName ?? "Programme"}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    {programState.label}
                  </div>
                </div>
                {/* Aperçu */}
                {programState.source === "session" &&
                programState.sessionDocId ? (
                  <a
                    href={`/api/sessions/${id}/documents/${programState.sessionDocId}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs font-semibold text-cyan-700 hover:underline"
                  >
                    Aperçu ↗
                  </a>
                ) : programState.catalogUrl ? (
                  <a
                    href={programState.catalogUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs font-semibold text-cyan-700 hover:underline"
                  >
                    Aperçu ↗
                  </a>
                ) : null}
              </div>

              {/* Formulaire d'envoi */}
              <form action={resend} className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-zinc-700 font-medium">
                  Renvoyer par email à :
                </label>
                <select
                  name="target"
                  defaultValue="learners"
                  className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs"
                >
                  <option value="learners">Apprenants de la session</option>
                  <option value="referents">Référents pédagogiques</option>
                  <option value="both">
                    Apprenants + Référents pédagogiques
                  </option>
                </select>
                <Button type="submit" size="sm" variant="default">
                  ✉ Envoyer le programme
                </Button>
              </form>
            </>
          ) : (
            <div className="rounded-md bg-white border border-red-200 p-3 text-xs text-red-700">
              ⚠️ Aucun programme n&apos;est défini, ni sur cette session, ni
              sur la formation au catalogue. Téléversez un programme
              ci-dessous (en cochant « Programme de formation officiel »)
              ou allez compléter la fiche formation du catalogue.
            </div>
          )}
        </section>

        {/* Formulaire upload */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Ajouter un document
            </h2>
          </div>
          <form action={upload} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="file" className="text-xs">
                  Fichier *
                </Label>
                <input
                  id="file"
                  name="file"
                  type="file"
                  required
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.svg,.txt,.csv"
                  className="block w-full text-sm text-zinc-600 dark:text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-zinc-900 file:text-white hover:file:bg-zinc-800 dark:file:bg-white dark:file:text-zinc-900 cursor-pointer"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visibility" className="text-xs">
                  Visibilité
                </Label>
                <select
                  id="visibility"
                  name="visibility"
                  defaultValue="internal"
                  className="flex h-9 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                >
                  <option value="internal">Interne (équipe OF)</option>
                  <option value="shared_with_learners">
                    Partagé avec les apprenants
                  </option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs">
                Description (optionnelle)
              </Label>
              <Input
                id="description"
                name="description"
                placeholder="Ex : Programme détaillé, support pédagogique session 1…"
              />
            </div>
            {/* Marquage "programme officiel" — joint automatiquement aux
                conventions de formation envoyées par email. Un seul par
                session (contrainte unique en base, migration 0065). */}
            <label className="flex items-start gap-2.5 text-sm cursor-pointer rounded-lg border border-amber-200 bg-amber-50/40 p-3 hover:bg-amber-50">
              <input
                type="checkbox"
                name="is_training_program"
                value="on"
                className="h-4 w-4 mt-0.5 rounded border-amber-300"
              />
              <div>
                <span className="font-medium">
                  📋 Programme de formation officiel
                </span>
                <p className="text-xs text-amber-900/70 mt-0.5">
                  Cochez si ce document est le programme à joindre aux
                  conventions envoyées par email. Un seul programme par
                  session (remplace le précédent si déjà marqué).
                </p>
              </div>
            </label>
            <div className="flex justify-end">
              <Button type="submit">
                <Upload className="h-4 w-4" />
                Téléverser
              </Button>
            </div>
          </form>
        </section>

        {/* Liste des documents */}
        {docs.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
            <p className="text-sm font-medium mb-1">Aucun document</p>
            <p className="text-xs text-zinc-500">
              Ajoutez votre premier fichier ci-dessus.
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Taille</th>
                  <th className="px-4 py-3">Visibilité</th>
                  <th className="px-4 py-3">Ajouté le</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {docs.map((doc) => (
                  <DocumentRow key={doc.id} sessionId={id} doc={doc} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
