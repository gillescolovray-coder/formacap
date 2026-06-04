import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Plus, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { BLUEPRINT_STATUS_LABELS } from "@/lib/bloom/types";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 border-zinc-200",
  pending_review: "bg-amber-100 text-amber-800 border-amber-300",
  objectives_approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  changes_requested: "bg-rose-100 text-rose-800 border-rose-300",
};

export default async function ProgrammesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("profile_id", user.id)
    .eq("is_active", true);
  const role = (memberships ?? [])[0]?.role as string | undefined;
  const canCreate = ["admin", "manager", "pedagogy_lead"].includes(role ?? "");

  const { data: blueprints } = await supabase
    .from("program_blueprints")
    .select(
      "id, internal_code, title, theme, status, bloom_objectives, updated_at",
    )
    .order("updated_at", { ascending: false });

  type Row = {
    id: string;
    internal_code: string | null;
    title: string;
    theme: string | null;
    status: string;
    bloom_objectives: unknown[] | null;
    updated_at: string;
  };
  const rows = (blueprints ?? []) as Row[];
  const pendingCount = rows.filter((r) => r.status === "pending_review").length;

  return (
    <>
      <PageHeader
        title="Programmes"
        description="Conception de programmes de formation (taxonomie de Bloom) avant mise au catalogue."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Programmes" },
        ]}
        actions={
          canCreate ? (
            <Button
              nativeButton={false}
              render={<Link href="/programmes/new" />}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              <Plus className="h-4 w-4" />
              Nouveau programme
            </Button>
          ) : undefined
        }
      />

      <div className="p-4 sm:p-8 max-w-5xl space-y-4">
        {pendingCount > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800">
            {pendingCount} programme{pendingCount > 1 ? "s" : ""} en attente de
            validation par le référent pédagogique.
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rounded-2xl bg-white border border-zinc-200 p-10 text-center">
            <Sparkles className="h-10 w-10 text-violet-300 mx-auto mb-3" />
            <p className="text-sm text-zinc-600">
              Aucun programme en conception pour le moment.
            </p>
            {canCreate && (
              <Link
                href="/programmes/new"
                className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-700"
              >
                <Plus className="h-4 w-4" />
                Créer mon premier programme
              </Link>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-zinc-200 overflow-hidden divide-y divide-zinc-100">
            {rows.map((r) => {
              const nbObj = Array.isArray(r.bloom_objectives)
                ? r.bloom_objectives.length
                : 0;
              return (
                <Link
                  key={r.id}
                  href={`/programmes/${r.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-cyan-50/40"
                >
                  <ClipboardList className="h-5 w-5 text-cyan-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-zinc-900 truncate">
                      {r.internal_code ? (
                        <span className="text-zinc-400 font-mono mr-1.5">
                          {r.internal_code}
                        </span>
                      ) : null}
                      {r.title}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {r.theme ? `${r.theme} · ` : ""}
                      {nbObj} objectif{nbObj > 1 ? "s" : ""}
                    </p>
                  </div>
                  <span
                    className={
                      "inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap " +
                      (STATUS_BADGE[r.status] ?? STATUS_BADGE.draft)
                    }
                  >
                    {BLUEPRINT_STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
