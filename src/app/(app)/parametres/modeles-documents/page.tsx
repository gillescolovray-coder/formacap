import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ParametresNav } from "../_nav";
import {
  loadConventionDocTemplate,
  loadConventionEmailTemplate,
  loadConvocationEmailTemplate,
  loadConvocationTemplate,
  loadEmargementTemplate,
  loadTrainerConvocationEmailTemplate,
} from "@/lib/document-templates/loader";
import {
  ConventionDocForm,
  ConventionEmailForm,
  ConvocationEmailForm,
  ConvocationForm,
  EmargementForm,
  TrainerConvocationEmailForm,
} from "./_form";

const TABS = [
  { id: "convocation", label: "Convocation (PDF)" },
  { id: "convocation_email", label: "Email convocation" },
  { id: "trainer_convocation_email", label: "Email formateur" },
  { id: "emargement", label: "Feuille d'émargement" },
  { id: "convention", label: "Convention (PDF)" },
  { id: "convention_email", label: "Email convention" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function ModelesDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    saved?: string;
    error?: string;
    reset?: string;
  }>;
}) {
  const params = await searchParams;
  const tab: TabId = (
    TABS.some((t) => t.id === params.tab) ? params.tab : "convocation"
  ) as TabId;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return (
      <>
        <PageHeader title="Modèles de documents" />
        <ParametresNav />
        <div className="p-8">
          <p className="text-sm text-zinc-500">Aucune organisation rattachée.</p>
        </div>
      </>
    );
  }

  const orgId = membership.organization_id as string;
  const [
    convocation,
    emargement,
    conventionDoc,
    conventionEmail,
    convocationEmail,
    trainerConvocationEmail,
  ] = await Promise.all([
    loadConvocationTemplate(orgId),
    loadEmargementTemplate(orgId),
    loadConventionDocTemplate(orgId),
    loadConventionEmailTemplate(orgId),
    loadConvocationEmailTemplate(orgId),
    loadTrainerConvocationEmailTemplate(orgId),
  ]);

  return (
    <>
      <PageHeader
        title="Modèles de documents"
        description="Personnalise les textes et couleurs des convocations et feuilles d'émargement générées par l'application."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres", href: "/parametres/organisation" },
          { label: "Modèles documents" },
        ]}
      />
      <ParametresNav />

      <div className="p-8 max-w-4xl space-y-6">
        {params.saved === "1" && (
          <Toast variant="success">Modifications enregistrées.</Toast>
        )}
        {params.reset === "1" && (
          <Toast variant="info">Modèle réinitialisé aux valeurs par défaut.</Toast>
        )}
        {params.error && <Toast variant="error">{params.error}</Toast>}

        <div className="border-b border-zinc-200 dark:border-zinc-800">
          <nav className="flex gap-1">
            {TABS.map((t) => {
              const active = t.id === tab;
              return (
                <Link
                  key={t.id}
                  href={`/parametres/modeles-documents?tab=${t.id}`}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? "border-cyan-600 text-cyan-700 dark:text-cyan-400"
                      : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {tab === "convocation" && <ConvocationForm initial={convocation} />}
        {tab === "convocation_email" && (
          <ConvocationEmailForm initial={convocationEmail} />
        )}
        {tab === "trainer_convocation_email" && (
          <TrainerConvocationEmailForm initial={trainerConvocationEmail} />
        )}
        {tab === "emargement" && <EmargementForm initial={emargement} />}
        {tab === "convention" && <ConventionDocForm initial={conventionDoc} />}
        {tab === "convention_email" && (
          <ConventionEmailForm initial={conventionEmail} />
        )}
      </div>
    </>
  );
}

function Toast({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: "success" | "error" | "info";
}) {
  const styles = {
    success:
      "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
    error:
      "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900",
    info: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900",
  }[variant];
  const Icon = variant === "error" ? AlertTriangle : CheckCircle2;
  return (
    <div className={`rounded-lg border px-4 py-2.5 text-sm flex items-start gap-2 ${styles}`}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
