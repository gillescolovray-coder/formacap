"use client";

import Link from "next/link";
import { useState } from "react";
import { Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type {
  AudienceCatalogItem,
  ModalityCatalogItem,
  Trainer,
} from "@/lib/trainers/types";

type Props = {
  trainer?: Trainer;
  audiences: AudienceCatalogItem[];
  modalities: ModalityCatalogItem[];
};

function MultiCheckbox({
  name,
  options,
  defaultSelected,
}: {
  name: string;
  options: Array<{ id: string; name: string }>;
  defaultSelected: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(defaultSelected),
  );

  function toggle(value: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isSelected = selected.has(opt.name);
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => toggle(opt.name)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
              isSelected
                ? "bg-cyan-600 text-white border-cyan-600 shadow-sm"
                : "bg-white text-slate-700 border-slate-300 hover:border-cyan-400 hover:bg-cyan-50",
            )}
          >
            <span
              className={cn(
                "h-3.5 w-3.5 rounded border flex items-center justify-center",
                isSelected
                  ? "bg-white border-white"
                  : "border-slate-400",
              )}
            >
              {isSelected && (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  className="text-cyan-600"
                >
                  <path
                    d="M2 6.5L5 9.5L10 3.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            {opt.name}
          </button>
        );
      })}
      {/* Champs hidden pour soumettre les valeurs sélectionnées */}
      {Array.from(selected).map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
    </div>
  );
}

export function PublicsModalitesEditor({
  trainer,
  audiences,
  modalities,
}: Props) {
  const [nationwide, setNationwide] = useState(
    trainer?.intervention_nationwide ?? false,
  );

  return (
    <div className="space-y-5">
      {/* Publics visés */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Publics visés</Label>
          <Link
            href="/parametres/competences"
            className="text-[11px] text-slate-500 hover:text-cyan-700 inline-flex items-center gap-1"
          >
            <Settings className="h-3 w-3" />
            Personnaliser la liste
          </Link>
        </div>
        {audiences.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            Aucun public dans le catalogue. Ajoutez-en dans Paramètres &gt;
            Compétences.
          </p>
        ) : (
          <MultiCheckbox
            name="target_audiences"
            options={audiences}
            defaultSelected={trainer?.target_audiences ?? []}
          />
        )}
      </div>

      {/* Modalités */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Modalités d&apos;animation</Label>
          <Link
            href="/parametres/competences"
            className="text-[11px] text-slate-500 hover:text-cyan-700 inline-flex items-center gap-1"
          >
            <Settings className="h-3 w-3" />
            Personnaliser la liste
          </Link>
        </div>
        {modalities.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            Aucune modalité dans le catalogue.
          </p>
        ) : (
          <MultiCheckbox
            name="modalities"
            options={modalities}
            defaultSelected={trainer?.modalities ?? []}
          />
        )}
      </div>

      {/* Rayon ou France entière */}
      <div className="space-y-2">
        <Label className="text-xs">Zone d&apos;intervention en présentiel</Label>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            name="intervention_nationwide"
            checked={nationwide}
            onChange={(e) => setNationwide(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
          />
          <span className="font-medium">France entière</span>
          <span className="text-xs text-slate-500">
            (le formateur se déplace partout)
          </span>
        </label>

        <div
          className={cn(
            "transition-opacity",
            nationwide && "opacity-40 pointer-events-none",
          )}
        >
          <Label htmlFor="intervention_radius_km" className="text-xs">
            Sinon, rayon maximum (km)
          </Label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              id="intervention_radius_km"
              name="intervention_radius_km"
              type="number"
              min={0}
              defaultValue={trainer?.intervention_radius_km ?? ""}
              placeholder="Ex: 100"
              disabled={nationwide}
              className="w-32"
            />
            <span className="text-sm text-slate-500">km autour de sa ville</span>
          </div>
        </div>
      </div>
    </div>
  );
}
