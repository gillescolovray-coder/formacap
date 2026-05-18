import { ChevronDown, ChevronUp, Plus, Tag, Trash2 } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  SESSION_STATUS_COLOR_BADGE_CLASSES,
  SESSION_STATUS_COLOR_KEYS,
  type SessionStatusDef,
} from "@/lib/sessions/types";
import {
  addSessionStatus,
  deleteSessionStatus,
  moveSessionStatus,
  updateSessionStatus,
} from "./actions";
import { ParametresNav } from "../_nav";

const COLOR_LABELS: Record<string, string> = {
  zinc: "Gris (neutre)",
  slate: "Ardoise (archive)",
  amber: "Ambre",
  blue: "Bleu",
  cyan: "Cyan",
  violet: "Violet",
  rose: "Rose",
  emerald: "Vert",
  orange: "Orange",
  red: "Rouge",
};

export default async function SessionStatusesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    added?: string;
    updated?: string;
    deleted?: string;
    moved?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role, organization:organizations(id, name)")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const org =
    (membership?.organization as unknown as { id: string; name: string } | null) ??
    null;
  if (!membership || !org) {
    return (
      <>
        <PageHeader
          title="Statuts de session"
          breadcrumbs={[
            { label: "Tableau de bord", href: "/dashboard" },
            { label: "Paramètres" },
            { label: "Statuts de session" },
          ]}
        />
        <ParametresNav />
        <div className="p-8 max-w-3xl">
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 p-4 text-sm text-amber-700 dark:text-amber-300">
            Accès réservé aux membres d&apos;une organisation.
          </div>
        </div>
      </>
    );
  }

  const { data: statusesRaw } = await supabase
    .from("session_statuses")
    .select("*")
    .eq("organization_id", org.id)
    .order("position", { ascending: true });
  const statuses = (statusesRaw ?? []) as SessionStatusDef[];

  return (
    <>
      <PageHeader
        title="Statuts de session"
        description={org.name}
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres" },
          { label: "Statuts de session" },
        ]}
      />
      <ParametresNav />
      <div className="p-8 max-w-3xl space-y-6">
        {params.error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {params.error}
          </div>
        )}
        {params.added && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Statut ajouté.
          </div>
        )}
        {params.updated && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Statut mis à jour.
          </div>
        )}
        {params.deleted && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Statut supprimé.
          </div>
        )}
        {params.moved && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Ordre mis à jour.
          </div>
        )}

        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Vos statuts de session
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Définissez les étapes du cycle de vie d&apos;une session selon
              votre organisation. Les flèches permettent de réordonner —
              l&apos;ordre est repris dans les sélecteurs.
            </p>
          </div>

          {statuses.length === 0 ? (
            <p className="text-sm text-zinc-500 italic">
              Aucun statut défini. Ajoutez-en un ci-dessous.
            </p>
          ) : (
            <ul className="space-y-3">
              {statuses.map((s, idx) => {
                const updateBound = updateSessionStatus.bind(null, s.id);
                const deleteBound = deleteSessionStatus.bind(null, s.id);
                const moveUp = moveSessionStatus.bind(null, s.id, "up");
                const moveDown = moveSessionStatus.bind(null, s.id, "down");
                const isFirst = idx === 0;
                const isLast = idx === statuses.length - 1;
                const colorKey = s.color ?? "zinc";
                return (
                  <li
                    key={s.id}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col gap-1 pt-1">
                        <form action={moveUp}>
                          <button
                            type="submit"
                            disabled={isFirst}
                            title="Monter"
                            aria-label="Monter ce statut"
                            className="inline-flex items-center justify-center h-6 w-6 rounded text-zinc-500 hover:text-cyan-700 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                        </form>
                        <form action={moveDown}>
                          <button
                            type="submit"
                            disabled={isLast}
                            title="Descendre"
                            aria-label="Descendre ce statut"
                            className="inline-flex items-center justify-center h-6 w-6 rounded text-zinc-500 hover:text-cyan-700 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </form>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 rounded text-xs font-bold mb-2",
                            SESSION_STATUS_COLOR_BADGE_CLASSES[colorKey] ??
                              SESSION_STATUS_COLOR_BADGE_CLASSES.zinc,
                          )}
                        >
                          {s.label}
                        </span>
                        <form action={updateBound} className="space-y-3">
                          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                            <div className="space-y-1.5">
                              <Label htmlFor={`label_${s.id}`} className="text-xs">
                                Libellé
                              </Label>
                              <Input
                                id={`label_${s.id}`}
                                name="label"
                                defaultValue={s.label}
                                required
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`color_${s.id}`} className="text-xs">
                                Couleur
                              </Label>
                              <select
                                id={`color_${s.id}`}
                                name="color"
                                defaultValue={colorKey}
                                className="flex h-9 w-44 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                              >
                                {SESSION_STATUS_COLOR_KEYS.map((k) => (
                                  <option key={k} value={k}>
                                    {COLOR_LABELS[k] ?? k}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label
                              htmlFor={`description_${s.id}`}
                              className="text-xs"
                            >
                              Description (info-bulle pour l&apos;utilisateur)
                            </Label>
                            <Textarea
                              id={`description_${s.id}`}
                              name="description"
                              rows={2}
                              defaultValue={s.description ?? ""}
                              placeholder="Ex : Session validée, le seuil de participants est atteint."
                            />
                          </div>
                          <div className="flex justify-between items-center pt-1">
                            <p className="text-xs text-zinc-400 font-mono">
                              code : {s.code}
                            </p>
                            <div className="flex gap-2">
                              <Button type="submit" size="sm">
                                Enregistrer
                              </Button>
                            </div>
                          </div>
                        </form>
                      </div>
                      <form action={deleteBound}>
                        <button
                          type="submit"
                          title="Supprimer ce statut"
                          aria-label="Supprimer ce statut"
                          className="inline-flex items-center justify-center h-7 w-7 rounded text-zinc-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Ajout d'un nouveau statut */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Ajouter un statut
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Créez un statut sur mesure (ex : « En attente de signature »,
              « À facturer »…). Le code interne est généré automatiquement à
              partir du libellé.
            </p>
          </div>
          <form action={addSessionStatus} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="new_label" className="text-xs">
                  Libellé *
                </Label>
                <Input
                  id="new_label"
                  name="label"
                  required
                  placeholder="Ex : À facturer"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new_color" className="text-xs">
                  Couleur
                </Label>
                <select
                  id="new_color"
                  name="color"
                  defaultValue="zinc"
                  className="flex h-9 w-44 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                >
                  {SESSION_STATUS_COLOR_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {COLOR_LABELS[k] ?? k}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new_description" className="text-xs">
                Description (info-bulle pour l&apos;utilisateur)
              </Label>
              <Textarea
                id="new_description"
                name="description"
                rows={2}
                placeholder="Ex : La session est terminée et la facture peut être émise."
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit">
                <Plus className="h-4 w-4" />
                Ajouter le statut
              </Button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
