import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { BlueprintEditor } from "../_blueprint-editor";
import { ImportBlueprint } from "../_import-blueprint";

export const dynamic = "force-dynamic";

export default async function NewProgrammePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("is_active", true);
  const role = (memberships ?? [])[0]?.role as string | undefined;
  if (!["admin", "manager", "pedagogy_lead"].includes(role ?? "")) {
    redirect("/programmes");
  }

  return (
    <>
      <PageHeader
        title="Nouveau programme"
        description="Renseignez les informations puis laissez l'IA proposer les objectifs Bloom."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Programmes", href: "/programmes" },
          { label: "Nouveau" },
        ]}
        actions={<BackButton fallbackHref="/programmes" />}
      />
      <div className="p-4 sm:p-8 max-w-4xl space-y-5">
        <ImportBlueprint />

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-200" />
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            ou partez de zéro
          </span>
          <div className="h-px flex-1 bg-zinc-200" />
        </div>

        <BlueprintEditor initial={{}} canEdit />
      </div>
    </>
  );
}
