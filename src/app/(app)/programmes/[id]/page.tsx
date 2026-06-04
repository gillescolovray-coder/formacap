import { notFound, redirect } from "next/navigation";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { BlueprintEditor } from "../_blueprint-editor";
import { ReviewForm } from "../_review-form";
import { BLUEPRINT_STATUS_LABELS, type BloomObjective } from "@/lib/bloom/types";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 border-zinc-200",
  pending_review: "bg-amber-100 text-amber-800 border-amber-300",
  objectives_approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  changes_requested: "bg-rose-100 text-rose-800 border-rose-300",
};

export default async function ProgrammeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: bp } = await supabase
    .from("program_blueprints")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!bp) notFound();

  const blueprint = bp as {
    id: string;
    organization_id: string;
    internal_code: string | null;
    title: string;
    theme: string | null;
    target_audience: string | null;
    duration_hours: number | null;
    duration_days: number | null;
    general_objective: string | null;
    bloom_objectives: BloomObjective[] | null;
    status: string;
  };

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role, organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true);
  const role = (memberships ?? []).find(
    (m) => (m as { organization_id: string }).organization_id ===
      blueprint.organization_id,
  )?.role as string | undefined;
  const canEdit = ["admin", "manager", "pedagogy_lead"].includes(role ?? "");
  const canValidate = ["admin", "pedagogy_lead"].includes(role ?? "");

  const { data: reviews } = await supabase
    .from("program_blueprint_reviews")
    .select("id, decision, comment, created_at")
    .eq("blueprint_id", id)
    .order("created_at", { ascending: false });

  type Review = {
    id: string;
    decision: string;
    comment: string | null;
    created_at: string;
  };
  const reviewList = (reviews ?? []) as Review[];

  return (
    <>
      <PageHeader
        title={blueprint.title}
        description={
          <span
            className={
              "inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border " +
              (STATUS_BADGE[blueprint.status] ?? STATUS_BADGE.draft)
            }
          >
            {BLUEPRINT_STATUS_LABELS[blueprint.status] ?? blueprint.status}
          </span>
        }
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Programmes", href: "/programmes" },
          { label: blueprint.title },
        ]}
        actions={<BackButton fallbackHref="/programmes" />}
      />

      <div className="p-4 sm:p-8 max-w-4xl space-y-5">
        {/* Historique des validations */}
        {reviewList.length > 0 && (
          <section className="rounded-xl bg-zinc-50 border border-zinc-200 p-4 space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Historique de validation
            </h2>
            <ul className="space-y-1.5">
              {reviewList.map((r) => (
                <li key={r.id} className="flex items-start gap-2 text-sm">
                  {r.decision === "approved" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <RotateCcw className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold text-zinc-800">
                      {r.decision === "approved"
                        ? "Objectifs validés"
                        : "Renvoyé pour modification"}
                    </span>
                    <span className="text-xs text-zinc-400 ml-2">
                      {new Date(r.created_at).toLocaleString("fr-FR")}
                    </span>
                    {r.comment && (
                      <p className="text-xs text-zinc-600 italic mt-0.5">
                        «&nbsp;{r.comment}&nbsp;»
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Porte 1 : validation par le référent */}
        {blueprint.status === "pending_review" && canValidate && (
          <ReviewForm blueprintId={blueprint.id} />
        )}

        <BlueprintEditor
          initial={{
            id: blueprint.id,
            internal_code: blueprint.internal_code,
            title: blueprint.title,
            theme: blueprint.theme,
            target_audience: blueprint.target_audience,
            duration_hours: blueprint.duration_hours,
            duration_days: blueprint.duration_days,
            general_objective: blueprint.general_objective,
            bloom_objectives: blueprint.bloom_objectives ?? [],
            status: blueprint.status,
          }}
          canEdit={canEdit}
        />
      </div>
    </>
  );
}
