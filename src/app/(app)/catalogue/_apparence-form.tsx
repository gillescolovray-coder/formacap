"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FONT_FAMILIES, type Catalog } from "@/lib/catalog/types";
import { saveCatalogApparence } from "./actions";

const PALETTES: Array<{
  name: string;
  primary: string;
  secondary: string;
  text: string;
}> = [
  // Reprend l'identité CAP NUMÉRIQUE : bleu marine profond + cyan électrique
  { name: "CAP Numérique", primary: "#1e40af", secondary: "#06b6d4", text: "#0f172a" },
  { name: "Marine sobre",  primary: "#1e3a8a", secondary: "#0e7490", text: "#0f172a" },
  { name: "Bleu / Cyan",   primary: "#1d4ed8", secondary: "#0891b2", text: "#18181b" },
  { name: "Cyan vif",      primary: "#0891b2", secondary: "#06b6d4", text: "#18181b" },
  { name: "Violet",        primary: "#7c3aed", secondary: "#a855f7", text: "#18181b" },
  { name: "Émeraude",      primary: "#059669", secondary: "#10b981", text: "#18181b" },
  { name: "Rose pro",      primary: "#be185d", secondary: "#db2777", text: "#18181b" },
  { name: "Anthracite",    primary: "#27272a", secondary: "#52525b", text: "#18181b" },
];

export function ApparenceForm({ catalog }: { catalog: Catalog }) {
  const [primary, setPrimary] = useState(catalog.color_primary);
  const [secondary, setSecondary] = useState(catalog.color_secondary);
  const [text, setText] = useState(catalog.color_text);

  const applyPalette = (p: (typeof PALETTES)[number]) => {
    setPrimary(p.primary);
    setSecondary(p.secondary);
    setText(p.text);
  };

  return (
    <form action={saveCatalogApparence} className="space-y-8">
      {/* Identité publique */}
      <section className="space-y-4 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900">
        <div>
          <h3 className="text-sm font-semibold">Identité publique</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Ce qui apparaît en couverture et dans l&apos;URL publique.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="hero_title">Titre principal</Label>
            <Input
              id="hero_title"
              name="hero_title"
              defaultValue={catalog.hero_title ?? ""}
              placeholder="ex. Catalogue de formations"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="hero_subtitle">Sous-titre (optionnel)</Label>
            <Input
              id="hero_subtitle"
              name="hero_subtitle"
              defaultValue={catalog.hero_subtitle ?? ""}
              placeholder="ex. Marchés publics, DAO et bureautique"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hero_year">Année / millésime</Label>
            <Input
              id="hero_year"
              name="hero_year"
              defaultValue={catalog.hero_year ?? ""}
              placeholder="2026"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug (URL publique)</Label>
            <Input
              id="slug"
              name="slug"
              defaultValue={catalog.slug}
              required
              pattern="[a-z0-9-]+"
              placeholder="cap-numerique"
            />
            <p className="text-[11px] text-zinc-500">
              URL publique :{" "}
              <code className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-[11px]">
                /c/{catalog.slug}
              </code>
            </p>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="cover_image_url">
              Image de couverture (URL, optionnel)
            </Label>
            <Input
              id="cover_image_url"
              name="cover_image_url"
              type="url"
              defaultValue={catalog.cover_image_url ?? ""}
              placeholder="https://…"
            />
            <p className="text-[11px] text-zinc-500">
              Format paysage 16:9 idéal. Tu peux héberger l&apos;image dans
              ton Drive (lien public direct) ou un service d&apos;images.
            </p>
          </div>
        </div>
      </section>

      {/* Palette de couleurs */}
      <section className="space-y-4 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900">
        <div>
          <h3 className="text-sm font-semibold">Couleurs</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Clique sur une palette suggérée ou ajuste les couleurs à la main.
          </p>
        </div>

        {/* Palettes suggérées */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {PALETTES.map((p) => {
            const active =
              p.primary === primary && p.secondary === secondary;
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPalette(p)}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left ${
                  active
                    ? "border-zinc-900 dark:border-white ring-2 ring-zinc-900 dark:ring-white"
                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
                }`}
              >
                <div className="flex gap-0.5">
                  <span
                    className="block h-6 w-3 rounded-l"
                    style={{ background: p.primary }}
                  />
                  <span
                    className="block h-6 w-3 rounded-r"
                    style={{ background: p.secondary }}
                  />
                </div>
                <span className="text-xs font-medium">{p.name}</span>
              </button>
            );
          })}
        </div>

        {/* Sélecteurs personnalisés */}
        <div className="grid md:grid-cols-3 gap-4 pt-2">
          <ColorPicker
            label="Couleur principale"
            name="color_primary"
            value={primary}
            onChange={setPrimary}
          />
          <ColorPicker
            label="Couleur secondaire"
            name="color_secondary"
            value={secondary}
            onChange={setSecondary}
          />
          <ColorPicker
            label="Couleur du texte"
            name="color_text"
            value={text}
            onChange={setText}
          />
        </div>

        {/* Aperçu */}
        <div
          className="rounded-lg p-5 mt-2"
          style={{
            background: `linear-gradient(135deg, ${primary}, ${secondary})`,
            color: "white",
          }}
        >
          <div className="text-xs uppercase tracking-widest opacity-80">
            Aperçu
          </div>
          <div className="text-2xl font-black mt-1">
            {catalog.hero_title ?? "Catalogue de formations"}
          </div>
          <div className="text-sm opacity-90 mt-1">
            {catalog.hero_subtitle ?? "Sous-titre du catalogue"}
          </div>
        </div>
      </section>

      {/* Police */}
      <section className="space-y-4 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900">
        <div>
          <h3 className="text-sm font-semibold">Typographie</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Police principale du catalogue.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-2">
          {FONT_FAMILIES.map((f) => {
            const checked = catalog.font_family === f;
            const stack =
              f === "Inter"
                ? "Inter, sans-serif"
                : f === "Lato"
                  ? "Lato, sans-serif"
                  : "Georgia, serif";
            return (
              <label
                key={f}
                className={`cursor-pointer rounded-lg border p-4 transition-all ${
                  checked
                    ? "border-zinc-900 dark:border-white ring-2 ring-zinc-900 dark:ring-white"
                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
                }`}
              >
                <input
                  type="radio"
                  name="font_family"
                  value={f}
                  defaultChecked={checked}
                  className="sr-only"
                />
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {f}
                </div>
                <div
                  className="text-xl mt-1"
                  style={{ fontFamily: stack }}
                >
                  Aa Catalogue 2026
                </div>
              </label>
            );
          })}
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="submit">Enregistrer l&apos;apparence</Button>
      </div>
    </form>
  );
}

function ColorPicker({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={name}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent cursor-pointer"
        />
        <Input
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          pattern="^#[0-9a-fA-F]{6}$"
          required
          className="font-mono"
        />
      </div>
    </div>
  );
}
