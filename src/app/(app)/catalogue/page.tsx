import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  Globe,
  RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { normalizeBlocks } from "@/lib/catalog/defaults";
import type { Catalog } from "@/lib/catalog/types";
import { ApparenceForm } from "./_apparence-form";
import { BlocksEditor } from "./_blocks-editor";
import {
  ensureCatalog,
  invalidateCatalogPdf,
  toggleCatalogPublication,
} from "./actions";
import { CopyLinkButton } from "./_copy-link-button";

const TABS = [
  { id: "apparence", label: "Apparence" },
  { id: "contenu", label: "Contenu éditorial" },
  { id: "publication", label: "Publication" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    saved?: string;
    error?: string;
    published?: string;
    unpublished?: string;
    pdf_invalidated?: string;
  }>;
}) {
  const params = await searchParams;
  const tab: TabId = (
    TABS.some((t) => t.id === params.tab) ? params.tab : "apparence"
  ) as TabId;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Création paresseuse au premier accès
  const ensured = await ensureCatalog();
  if (!ensured.ok) {
    return (
      <>
        <PageHeader
          title="Catalogue en ligne"
          breadcrumbs={[
            { label: "Tableau de bord", href: "/dashboard" },
            { label: "Catalogue en ligne" },
          ]}
        />
        <div className="p-8">
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-6 text-sm space-y-3 max-w-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  Module catalogue non initialisé
                </p>
                <p className="text-amber-800/90 dark:text-amber-300/90">
                  {ensured.error}
                </p>
                {ensured.hint && (
                  <p className="text-amber-800/90 dark:text-amber-300/90">
                    <strong>À faire :</strong> {ensured.hint}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const { data: row, error } = await supabase
    .from("catalog")
    .select("*")
    .limit(1)
    .single();

  if (error || !row) {
    return (
      <>
        <PageHeader title="Catalogue en ligne" />
        <div className="p-8">
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            Erreur lors du chargement du catalogue : {error?.message}
          </div>
        </div>
      </>
    );
  }

  const catalog: Catalog = {
    ...(row as unknown as Catalog),
    blocks: normalizeBlocks((row as { blocks: unknown }).blocks),
  };

  const publicUrl = `/c/${catalog.slug}`;

  return (
    <>
      <PageHeader
        title="Catalogue en ligne"
        description="Votre brochure commerciale publique, alimentée en temps réel par les fiches formation publiées."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Catalogue en ligne" },
        ]}
        actions={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={publicUrl} target="_blank" />}
            >
              <Eye className="h-4 w-4" />
              Aperçu public
            </Button>
            <Button
              nativeButton={false}
              render={
                <Link
                  href={`/api/catalog/${catalog.slug}/pdf`}
                  target="_blank"
                />
              }
            >
              <Download className="h-4 w-4" />
              Télécharger le PDF
            </Button>
          </>
        }
      />

      <div className="p-8 space-y-6">
        {/* Toasts de succès / erreur */}
        {params.saved === "1" && (
          <Toast variant="success">Modifications enregistrées.</Toast>
        )}
        {params.published === "1" && (
          <Toast variant="success">
            Catalogue publié — il est désormais accessible publiquement.
          </Toast>
        )}
        {params.unpublished === "1" && (
          <Toast variant="info">
            Catalogue dépublié — il n&apos;est plus accessible publiquement.
          </Toast>
        )}
        {params.pdf_invalidated === "1" && (
          <Toast variant="info">
            Cache PDF vidé — il sera régénéré au prochain téléchargement.
          </Toast>
        )}
        {params.error && <Toast variant="error">{params.error}</Toast>}

        {/* État de publication */}
        <PublicationBanner catalog={catalog} />

        {/* Onglets */}
        <div className="border-b border-zinc-200 dark:border-zinc-800">
          <nav className="flex gap-1">
            {TABS.map((t) => {
              const active = t.id === tab;
              return (
                <Link
                  key={t.id}
                  href={`/catalogue?tab=${t.id}`}
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

        {tab === "apparence" && <ApparenceForm catalog={catalog} />}
        {tab === "contenu" && <BlocksEditor catalog={catalog} />}
        {tab === "publication" && (
          <PublicationTab catalog={catalog} publicUrl={publicUrl} />
        )}
      </div>
    </>
  );
}

function PublicationBanner({ catalog }: { catalog: Catalog }) {
  if (catalog.is_published) {
    return (
      <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-4 flex items-start gap-3">
        <Globe className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            Catalogue publié et accessible
          </p>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
            URL publique :{" "}
            <code className="px-1 py-0.5 bg-white/70 dark:bg-emerald-950/60 rounded">
              /c/{catalog.slug}
            </code>{" "}
            — toute modification d&apos;une fiche formation publiée en ligne y
            apparaîtra immédiatement.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Catalogue non publié
        </p>
        <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
          Personnalisez l&apos;apparence et le contenu, puis publiez-le depuis
          l&apos;onglet « Publication » pour le rendre accessible à vos
          prospects.
        </p>
      </div>
    </div>
  );
}

function PublicationTab({
  catalog,
  publicUrl,
}: {
  catalog: Catalog;
  publicUrl: string;
}) {
  return (
    <div className="space-y-6">
      {/* Carte publication */}
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">État de publication</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Tant que le catalogue n&apos;est pas publié, l&apos;URL publique
            renvoie une erreur. Une fois publié, il est consultable par
            n&apos;importe qui ayant le lien (et indexable par les moteurs de
            recherche).
          </p>
        </div>
        <form
          action={toggleCatalogPublication}
          className="flex flex-wrap items-center gap-3"
        >
          <input
            type="hidden"
            name="publish"
            value={catalog.is_published ? "0" : "1"}
          />
          {catalog.is_published ? (
            <Button type="submit" variant="outline">
              Dépublier le catalogue
            </Button>
          ) : (
            <Button type="submit">
              <Globe className="h-4 w-4" />
              Publier le catalogue
            </Button>
          )}
          {catalog.is_published && catalog.published_at && (
            <span className="text-xs text-zinc-500">
              Publié le{" "}
              {new Date(catalog.published_at).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </span>
          )}
        </form>
      </section>

      {/* URL publique + bouton copier */}
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
        <h3 className="text-sm font-semibold">Lien public à partager</h3>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 rounded-md bg-zinc-100 dark:bg-zinc-800 text-sm font-mono break-all">
            {publicUrl}
          </code>
          <CopyLinkButton path={publicUrl} />
          <Button
            variant="outline"
            size="default"
            nativeButton={false}
            render={<Link href={publicUrl} target="_blank" />}
          >
            <ExternalLink className="h-4 w-4" />
            Ouvrir
          </Button>
        </div>
        <p className="text-xs text-zinc-500">
          Le lien est rattaché au slug défini dans l&apos;onglet « Apparence ».
          Modifie-le si tu veux une URL plus parlante (ex.{" "}
          <code>/c/cap-numerique-2026</code>).
        </p>
      </section>

      {/* PDF */}
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">PDF téléchargeable</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Le PDF est généré automatiquement au premier téléchargement, puis
            mis en cache. Toute modification de l&apos;apparence ou du contenu
            invalide automatiquement ce cache.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            nativeButton={false}
            render={
              <Link
                href={`/api/catalog/${catalog.slug}/pdf`}
                target="_blank"
              />
            }
          >
            <Download className="h-4 w-4" />
            Télécharger maintenant
          </Button>
          <form action={invalidateCatalogPdf}>
            <Button type="submit" variant="outline">
              <RefreshCw className="h-4 w-4" />
              Forcer la régénération
            </Button>
          </form>
          {catalog.pdf_generated_at && (
            <span className="text-xs text-zinc-500">
              Dernière génération :{" "}
              {new Date(catalog.pdf_generated_at).toLocaleString("fr-FR")}
            </span>
          )}
        </div>
      </section>
    </div>
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
    info:
      "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900",
  }[variant];
  const Icon = variant === "error" ? AlertTriangle : CheckCircle2;
  return (
    <div className={`rounded-lg border px-4 py-2.5 text-sm flex items-start gap-2 ${styles}`}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
