import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LocationForm } from "../_form";
import { createLocation } from "../actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default async function NewLocationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const role = (membership?.role as string | undefined) ?? "";
  const showCosts = role === "admin" || role === "manager";

  const params = await searchParams;

  return (
    <>
      <PageHeader
        title="Nouveau lieu de formation"
        description="Référencez une nouvelle salle, un local client ou une visioconférence."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Lieux", href: "/lieux" },
          { label: "Nouveau" },
        ]}
      />

      <div className="p-8 max-w-5xl">
        {params.error && (
          <div className="mb-6 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {params.error}
          </div>
        )}

        <form action={createLocation}>
          <LocationForm showCosts={showCosts} />

          <div className="mt-8 flex items-center justify-end gap-3">
            <Button
              variant="outline"
              type="button"
              nativeButton={false}
              render={<Link href="/lieux" />}
            >
              Annuler
            </Button>
            <Button type="submit">Créer le lieu</Button>
          </div>
        </form>
      </div>
    </>
  );
}
