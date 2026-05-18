import { Mail } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { ImportEmailWizard } from "./_import-wizard";

export default async function ImportEmailPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-cyan-700" />
            Importer depuis un email
          </span>
        }
        description="Collez le contenu d'un email reçu (signature comprise) — l'app extrait automatiquement le contact et l'entreprise."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Entreprises", href: "/entreprises" },
          { label: "Importer depuis email" },
        ]}
        actions={<BackButton fallbackHref="/entreprises" />}
      />

      <div className="p-8 max-w-4xl">
        <ImportEmailWizard />
      </div>
    </>
  );
}
