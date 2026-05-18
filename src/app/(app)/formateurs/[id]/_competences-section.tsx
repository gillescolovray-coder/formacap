"use client";

import Link from "next/link";
import { Briefcase, Plus, Settings, Trash2 } from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  SkillDomain,
  SkillLevel,
  TrainerCompetenceWithLabels,
} from "@/lib/trainers/types";
import {
  addCompetence,
  removeCompetence,
  updateCompetenceLevel,
} from "./competences/actions";

type Props = {
  trainerId: string;
  domains: SkillDomain[];
  levels: SkillLevel[];
  competences: TrainerCompetenceWithLabels[];
};

export function CompetencesSection({
  trainerId,
  domains,
  levels,
  competences,
}: Props) {
  const add = addCompetence.bind(null, trainerId);
  const usedDomainIds = new Set(competences.map((c) => c.domain_id));
  const availableDomains = domains.filter((d) => !usedDomainIds.has(d.id));

  return (
    <CollapsibleSection
      icon={Briefcase}
      title="Domaines d'intervention"
      description="Compétences du formateur, par couple domaine + niveau."
      accent="blue"
      defaultOpen
      id="domaines-d-intervention"
    >
      <div className="space-y-5">
        {/* Liste des compétences */}
        {competences.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            Aucun domaine de compétence pour l&apos;instant.
          </p>
        ) : (
          <ul className="space-y-2">
            {competences.map((c) => {
              const remove = removeCompetence.bind(null, trainerId, c.id);
              const updateLevel = updateCompetenceLevel.bind(
                null,
                trainerId,
                c.id,
              );
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">
                      {c.domain?.name ?? "—"}
                    </p>
                    {c.notes && (
                      <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">
                        {c.notes}
                      </p>
                    )}
                  </div>
                  <form action={updateLevel}>
                    <select
                      name="level_id"
                      defaultValue={c.level_id}
                      onChange={(e) => e.currentTarget.form?.requestSubmit()}
                      className={cn(
                        "h-8 rounded-md border px-2 text-xs font-semibold cursor-pointer",
                        "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900",
                      )}
                      style={{
                        color: c.level?.color ?? undefined,
                        borderColor: c.level?.color ?? undefined,
                      }}
                    >
                      {levels.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </form>
                  <form action={remove}>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      title="Retirer ce domaine"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        {/* Formulaire d'ajout */}
        {domains.length === 0 || levels.length === 0 ? (
          <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20 p-4 text-sm">
            <p className="text-amber-800 dark:text-amber-300 mb-2">
              Aucun catalogue de domaines ou niveaux n&apos;est configuré.
            </p>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/parametres/competences" />}
            >
              <Settings className="h-4 w-4" />
              Configurer les catalogues
            </Button>
          </div>
        ) : availableDomains.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            Tous les domaines du catalogue sont déjà associés à ce formateur.
          </p>
        ) : (
          <form
            action={add}
            className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 space-y-3"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="domain_id" className="text-xs">
                  Domaine
                </Label>
                <select
                  id="domain_id"
                  name="domain_id"
                  required
                  defaultValue=""
                  className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                >
                  <option value="" disabled>
                    — Choisir un domaine —
                  </option>
                  {availableDomains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="level_id" className="text-xs">
                  Niveau
                </Label>
                <select
                  id="level_id"
                  name="level_id"
                  required
                  defaultValue=""
                  className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                >
                  <option value="" disabled>
                    — Choisir un niveau —
                  </option>
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs">
                Notes (optionnel)
              </Label>
              <Textarea
                id="notes"
                name="notes"
                rows={2}
                placeholder="Précisions sur la maîtrise du domaine."
              />
            </div>
            <div className="flex items-center justify-between">
              <Link
                href="/parametres/competences"
                className="text-xs text-slate-500 hover:text-cyan-700 hover:underline inline-flex items-center gap-1"
              >
                <Settings className="h-3 w-3" />
                Personnaliser les catalogues
              </Link>
              <Button type="submit">
                <Plus className="h-4 w-4" />
                Ajouter
              </Button>
            </div>
          </form>
        )}
      </div>
    </CollapsibleSection>
  );
}
