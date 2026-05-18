import Link from "next/link";
import { GraduationCap, Plus, Trash2 } from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { linkFormation, unlinkFormation } from "../actions";

type FormationOption = {
  id: string;
  title: string;
};

type LinkedFormation = {
  formation_id: string;
  justification: string | null;
  formation: { id: string; title: string } | null;
};

type Props = {
  trainerId: string;
  allFormations: FormationOption[];
  linked: LinkedFormation[];
};

export function FormationsSection({
  trainerId,
  allFormations,
  linked,
}: Props) {
  const linkedIds = new Set(linked.map((l) => l.formation_id));
  const available = allFormations.filter((f) => !linkedIds.has(f.id));

  async function linkAction(formData: FormData) {
    "use server";
    const formationId = String(formData.get("formation_id") ?? "");
    const justification =
      String(formData.get("justification") ?? "").trim() || null;
    if (!formationId) return;
    await linkFormation(trainerId, formationId, justification);
  }

  return (
    <CollapsibleSection
      icon={GraduationCap}
      title="Formations animables"
      description="Adéquation formateur ↔ formations (Qualiopi indic. 21)."
      accent="emerald"
      defaultOpen
    >
      <div className="space-y-5">
        {linked.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            Aucune formation liée pour l&apos;instant.
          </p>
        ) : (
          <ul className="space-y-2">
            {linked.map((l) => {
              const unlink = unlinkFormation.bind(
                null,
                trainerId,
                l.formation_id,
              );
              return (
                <li
                  key={l.formation_id}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/formations/${l.formation_id}`}
                        className="text-sm font-semibold text-cyan-700 dark:text-cyan-400 hover:underline"
                      >
                        {l.formation?.title ?? "Formation supprimée"}
                      </Link>
                      {l.justification && (
                        <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">
                          {l.justification}
                        </p>
                      )}
                    </div>
                    <form action={unlink}>
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        title="Retirer cette formation"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {available.length > 0 && (
          <form
            action={linkAction}
            className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="formation_id" className="text-xs">
                Ajouter une formation
              </Label>
              <select
                id="formation_id"
                name="formation_id"
                required
                className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              >
                <option value="">— Choisir une formation —</option>
                {available.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="justification" className="text-xs">
                Justification de la compétence
              </Label>
              <Textarea
                id="justification"
                name="justification"
                rows={2}
                placeholder="Pourquoi ce formateur est-il compétent pour cette formation précise ?"
              />
            </div>
            <Button type="submit">
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </form>
        )}
      </div>
    </CollapsibleSection>
  );
}
