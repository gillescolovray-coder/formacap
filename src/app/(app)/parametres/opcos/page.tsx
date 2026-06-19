import Link from "next/link";
import {
  AtSign,
  Building2,
  ExternalLink,
  Landmark,
  MapPin,
  Phone,
  Plus,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ParametresNav } from "../_nav";
import type { Opco } from "@/lib/opcos/types";

export const dynamic = "force-dynamic";

export default async function OpcosSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    created?: string;
    updated?: string;
    deleted?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Récupération des OPCO triés alphabétiquement (Gilles 2026-05-21).
  const { data: opcos } = await supabase
    .from("opcos")
    .select("*")
    .order("name", { ascending: true })
    .returns<Opco[]>();

  const list = opcos ?? [];

  const notifs = [
    params.created && "OPCO créé avec succès.",
    params.updated && "OPCO mis à jour.",
    params.deleted && "OPCO supprimé.",
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader
        title="Référentiel OPCO"
        description="Gérez la liste des Opérateurs de Compétences. Utilisée dans le formulaire d'inscription quand le mode de financement est « OPCO »."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres", href: "/parametres" },
          { label: "OPCO" },
        ]}
        actions={
          <Button nativeButton={false} render={<Link href="/parametres/opcos/new" />}>
            <Plus className="h-4 w-4" />
            Ajouter un OPCO
          </Button>
        }
      />
      <ParametresNav />

      <div className="p-8 space-y-4 max-w-6xl">
        {params.error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {params.error}
          </div>
        )}
        {notifs.map((m, i) => (
          <div
            key={i}
            className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800"
          >
            {m}
          </div>
        ))}

        {list.length === 0 ? (
          <div className="rounded-xl bg-white border border-slate-200 p-12 text-center">
            <Landmark className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-medium mb-1">
              Aucun OPCO dans le référentiel.
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Si la migration vient d&apos;être appliquée, les 11 OPCO
              français devraient apparaître ici. Sinon, ajoutez-en un.
            </p>
            <Button nativeButton={false} render={<Link href="/parametres/opcos/new" />}>
              <Plus className="h-4 w-4" />
              Ajouter un OPCO
            </Button>
          </div>
        ) : (
          <div className="rounded-xl bg-white border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">OPCO</th>
                  <th className="px-4 py-2.5">Secteurs</th>
                  <th className="px-4 py-2.5">Contact</th>
                  <th className="px-4 py-2.5">Portail Web</th>
                  <th className="px-4 py-2.5 w-24">Statut</th>
                  <th className="px-4 py-2.5 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((o) => (
                  <tr key={o.id} className="hover:bg-cyan-50/30">
                    <td className="px-4 py-3 align-top">
                      <div className="font-bold text-slate-900 inline-flex items-center gap-1.5">
                        <Landmark className="h-3.5 w-3.5 text-emerald-600" />
                        {o.name}
                      </div>
                      {o.address && (
                        <p className="text-[11px] text-slate-500 mt-1 inline-flex items-start gap-1">
                          <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="leading-tight">{o.address}</span>
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-slate-600 leading-tight">
                      {o.sectors ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-slate-700 space-y-0.5">
                      {o.phone && (
                        <p className="inline-flex items-center gap-1 font-mono">
                          <Phone className="h-3 w-3 text-slate-400" />
                          {o.phone}
                        </p>
                      )}
                      {o.email && (
                        <p className="inline-flex items-center gap-1">
                          <AtSign className="h-3 w-3 text-slate-400" />
                          {o.email}
                        </p>
                      )}
                      {!o.phone && !o.email && (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-xs">
                      {o.portal_url ? (
                        <a
                          href={o.portal_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-cyan-700 hover:text-cyan-900 hover:underline break-all"
                          title="Ouvrir le portail dans un nouvel onglet"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          <span className="break-all">{o.portal_url}</span>
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {o.is_active ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          Actif
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                          Inactif
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <Link
                        href={`/parametres/opcos/${o.id}`}
                        className="text-xs font-semibold text-cyan-700 hover:text-cyan-900 hover:underline"
                      >
                        Modifier
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-slate-500 italic">
          💡 La liste est triée alphabétiquement et synchronisée automatiquement
          avec le formulaire d&apos;inscription quand le mode de financement
          est « OPCO ».
        </p>
      </div>
    </>
  );
}
