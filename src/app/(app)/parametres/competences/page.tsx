import Link from "next/link";
import { Briefcase, Layers, Plus, Trash2, Users, Video } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ParametresNav } from "../_nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addAudience,
  addDomain,
  addLevel,
  addModality,
  deleteAudience,
  deleteDomain,
  deleteLevel,
  deleteModality,
  updateAudience,
  updateDomain,
  updateLevel,
  updateModality,
} from "./actions";
import { SimpleCatalogSection } from "./_simple-catalog-section";
import type {
  AudienceCatalogItem,
  ModalityCatalogItem,
  SkillDomain,
  SkillLevel,
} from "@/lib/trainers/types";

export default async function CompetencesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    domainAdded?: string;
    domainUpdated?: string;
    domainDeleted?: string;
    levelAdded?: string;
    levelUpdated?: string;
    levelDeleted?: string;
    audienceAdded?: string;
    audienceUpdated?: string;
    audienceDeleted?: string;
    modalityAdded?: string;
    modalityUpdated?: string;
    modalityDeleted?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: domains },
    { data: levels },
    { data: audiences },
    { data: modalities },
  ] = await Promise.all([
    supabase
      .from("skill_domains")
      .select("*")
      .order("position", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("skill_levels").select("*").order("rank", { ascending: true }),
    supabase
      .from("audience_catalog")
      .select("*")
      .order("position", { ascending: true }),
    supabase
      .from("modality_catalog")
      .select("*")
      .order("position", { ascending: true }),
  ]);

  const notifs = [
    params.domainAdded && "Domaine ajouté.",
    params.domainUpdated && "Domaine mis à jour.",
    params.domainDeleted && "Domaine supprimé.",
    params.levelAdded && "Niveau ajouté.",
    params.levelUpdated && "Niveau mis à jour.",
    params.levelDeleted && "Niveau supprimé.",
    params.audienceAdded && "Public ajouté.",
    params.audienceUpdated && "Public mis à jour.",
    params.audienceDeleted && "Public supprimé.",
    params.modalityAdded && "Modalité ajoutée.",
    params.modalityUpdated && "Modalité mise à jour.",
    params.modalityDeleted && "Modalité supprimée.",
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader
        title="Catalogues de compétences"
        description="Domaines d'intervention et niveaux utilisés pour qualifier vos formateurs."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres" },
          { label: "Compétences" },
        ]}
      />
      <ParametresNav />

      <div className="p-8 max-w-5xl space-y-6">
        {notifs.map((msg, i) => (
          <div
            key={i}
            className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-3 text-sm text-cyan-700 dark:text-cyan-300"
          >
            {msg}
          </div>
        ))}
        {params.error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
            {params.error}
          </div>
        )}

        {/* DOMAINES */}
        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 flex items-center justify-center">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">
                Domaines de compétence
              </h2>
              <p className="text-sm text-slate-500">
                Les domaines apparaissent dans la fiche de chaque formateur.
              </p>
            </div>
          </div>

          {(domains as SkillDomain[] | null)?.length ? (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
              {(domains as SkillDomain[]).map((d) => {
                const update = updateDomain.bind(null, d.id);
                const remove = deleteDomain.bind(null, d.id);
                return (
                  <li
                    key={d.id}
                    className="px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50"
                  >
                    <form action={update} className="space-y-2">
                      <div className="grid gap-3 md:grid-cols-[2fr_3fr_auto_auto_auto] items-end">
                        <div>
                          <Label className="text-[10px] uppercase tracking-wider text-slate-500">
                            Nom
                          </Label>
                          <Input
                            name="name"
                            defaultValue={d.name}
                            required
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wider text-slate-500">
                            Description
                          </Label>
                          <Input
                            name="description"
                            defaultValue={d.description ?? ""}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wider text-slate-500">
                            Ordre
                          </Label>
                          <Input
                            name="position"
                            type="number"
                            defaultValue={d.position}
                            className="h-8 w-20 text-sm"
                          />
                        </div>
                        <label className="flex items-center gap-1 text-xs cursor-pointer pb-1.5">
                          <input
                            type="checkbox"
                            name="is_active"
                            defaultChecked={d.is_active}
                            className="h-4 w-4 rounded border-slate-300 text-cyan-600"
                          />
                          Actif
                        </label>
                        <div className="flex gap-1">
                          <Button type="submit" size="sm" variant="outline">
                            Enregistrer
                          </Button>
                        </div>
                      </div>
                    </form>
                    <form action={remove} className="mt-1 flex justify-end">
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Supprimer
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 italic">
              Aucun domaine. Ajoutez-en ci-dessous.
            </p>
          )}

          <form
            action={addDomain}
            className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 space-y-3"
          >
            <div className="grid gap-3 md:grid-cols-[2fr_3fr_auto_auto] items-end">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs">
                  Nom du domaine
                </Label>
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder="Ex: Cybersécurité"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs">
                  Description (optionnel)
                </Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={1}
                  className="min-h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="position" className="text-xs">
                  Ordre
                </Label>
                <Input
                  id="position"
                  name="position"
                  type="number"
                  defaultValue={
                    ((domains as SkillDomain[] | null)?.length ?? 0) * 10 + 10
                  }
                  className="w-20"
                />
              </div>
              <Button type="submit">
                <Plus className="h-4 w-4" />
                Ajouter
              </Button>
            </div>
          </form>
        </section>

        {/* NIVEAUX */}
        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 flex items-center justify-center">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">
                Niveaux d&apos;intervention
              </h2>
              <p className="text-sm text-slate-500">
                Échelle utilisée pour qualifier la maîtrise (ex: Débutant →
                Expert).
              </p>
            </div>
          </div>

          {(levels as SkillLevel[] | null)?.length ? (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
              {(levels as SkillLevel[]).map((l) => {
                const update = updateLevel.bind(null, l.id);
                const remove = deleteLevel.bind(null, l.id);
                return (
                  <li
                    key={l.id}
                    className="px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50"
                  >
                    <form action={update} className="space-y-2">
                      <div className="grid gap-3 md:grid-cols-[2fr_auto_auto_auto_auto] items-end">
                        <div>
                          <Label className="text-[10px] uppercase tracking-wider text-slate-500">
                            Nom
                          </Label>
                          <Input
                            name="name"
                            defaultValue={l.name}
                            required
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wider text-slate-500">
                            Rang
                          </Label>
                          <Input
                            name="rank"
                            type="number"
                            min={1}
                            max={5}
                            defaultValue={l.rank}
                            className="h-8 w-16 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wider text-slate-500">
                            Couleur
                          </Label>
                          <Input
                            name="color"
                            type="color"
                            defaultValue={l.color ?? "#06b6d4"}
                            className="h-8 w-16"
                          />
                        </div>
                        <label className="flex items-center gap-1 text-xs cursor-pointer pb-1.5">
                          <input
                            type="checkbox"
                            name="is_active"
                            defaultChecked={l.is_active}
                            className="h-4 w-4 rounded border-slate-300 text-cyan-600"
                          />
                          Actif
                        </label>
                        <Button type="submit" size="sm" variant="outline">
                          Enregistrer
                        </Button>
                      </div>
                    </form>
                    <form action={remove} className="mt-1 flex justify-end">
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Supprimer
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 italic">
              Aucun niveau. Ajoutez-en ci-dessous.
            </p>
          )}

          <form
            action={addLevel}
            className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 space-y-3"
          >
            <div className="grid gap-3 md:grid-cols-[2fr_auto_auto_auto] items-end">
              <div className="space-y-1.5">
                <Label htmlFor="lname" className="text-xs">
                  Nom du niveau
                </Label>
                <Input
                  id="lname"
                  name="name"
                  required
                  placeholder="Ex: Référent"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lrank" className="text-xs">
                  Rang (1-5)
                </Label>
                <Input
                  id="lrank"
                  name="rank"
                  type="number"
                  min={1}
                  max={5}
                  defaultValue={
                    ((levels as SkillLevel[] | null)?.length ?? 0) + 1
                  }
                  className="w-16"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lcolor" className="text-xs">
                  Couleur
                </Label>
                <Input
                  id="lcolor"
                  name="color"
                  type="color"
                  defaultValue="#06b6d4"
                  className="w-16 h-9"
                />
              </div>
              <Button type="submit">
                <Plus className="h-4 w-4" />
                Ajouter
              </Button>
            </div>
          </form>
        </section>

        {/* PUBLICS VISÉS */}
        <SimpleCatalogSection
          title="Publics visés"
          description="Profils d'apprenants que vos formateurs peuvent accueillir."
          icon={Users}
          accent="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          items={(audiences ?? []) as AudienceCatalogItem[]}
          updateAction={updateAudience}
          deleteAction={deleteAudience}
          addAction={addAudience}
          placeholder="Ex: Apprentis, Demandeurs d'emploi…"
        />

        {/* MODALITÉS */}
        <SimpleCatalogSection
          title="Modalités d'animation"
          description="Présentiel, distanciel, hybride, intra, inter, etc."
          icon={Video}
          accent="bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300"
          items={(modalities ?? []) as ModalityCatalogItem[]}
          updateAction={updateModality}
          deleteAction={deleteModality}
          addAction={addModality}
          placeholder="Ex: Coaching, Atelier collectif…"
        />

        <div className="text-xs text-slate-500">
          <Link
            href="/formateurs"
            className="text-cyan-700 hover:underline"
          >
            ← Retour aux formateurs
          </Link>
        </div>
      </div>
    </>
  );
}
