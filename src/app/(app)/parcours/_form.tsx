import {
  BookOpen,
  ClipboardList,
  Route as RouteIcon,
} from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PARCOURS_STATUS_LABELS,
  type Parcours,
} from "@/lib/parcours/types";

type Props = {
  parcours?: Parcours;
};

export function ParcoursForm({ parcours }: Props) {
  return (
    <div className="space-y-4">
      {/* 1 — Identification */}
      <CollapsibleSection
        icon={RouteIcon}
        title="Identification"
        description="Nom du parcours et code interne."
        accent="emerald"
        defaultOpen
        id="identification"
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[3fr_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="name" required>
                Nom du parcours
              </Label>
              <Input
                id="name"
                name="name"
                required
                defaultValue={parcours?.name ?? ""}
                placeholder="Ex: Parcours digitalisation des marchés publics"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="internal_code">Code interne</Label>
              <Input
                id="internal_code"
                name="internal_code"
                defaultValue={parcours?.internal_code ?? ""}
                placeholder="Ex: PAR-2026-01"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description courte</Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={parcours?.description ?? ""}
              placeholder="Présentation du parcours en quelques lignes."
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* 2 — Pédagogie */}
      <CollapsibleSection
        icon={BookOpen}
        title="Objectifs & public"
        description="Public visé, objectif général et prérequis du parcours."
        accent="blue"
        id="pedagogie"
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="general_objective">Objectif général</Label>
            <Textarea
              id="general_objective"
              name="general_objective"
              rows={3}
              defaultValue={parcours?.general_objective ?? ""}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="target_audience">Public visé</Label>
              <Textarea
                id="target_audience"
                name="target_audience"
                rows={3}
                defaultValue={parcours?.target_audience ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prerequisites">Prérequis</Label>
              <Textarea
                id="prerequisites"
                name="prerequisites"
                rows={3}
                defaultValue={parcours?.prerequisites ?? ""}
              />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 3 — Statut */}
      <CollapsibleSection
        icon={ClipboardList}
        title="Statut & gestion"
        description="État du parcours dans votre catalogue."
        accent="zinc"
        id="statut"
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="status">Statut</Label>
              <select
                id="status"
                name="status"
                defaultValue={parcours?.status ?? "draft"}
                className="flex h-9 w-full rounded-md border border-slate-300 bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {Object.entries(PARCOURS_STATUS_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-7">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={parcours?.is_active ?? true}
                className="h-4 w-4 rounded border-slate-300 text-cyan-600"
              />
              <span>Parcours actif</span>
            </label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes internes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={parcours?.notes ?? ""}
            />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
