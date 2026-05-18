"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/rich-text-editor";
import type { Catalog, CatalogBlocks } from "@/lib/catalog/types";
import { saveCatalogBlocks } from "./actions";

export function BlocksEditor({ catalog }: { catalog: Catalog }) {
  const [blocks, setBlocks] = useState<CatalogBlocks>(catalog.blocks);

  const updateBlock = <K extends keyof CatalogBlocks>(
    key: K,
    patch: Partial<CatalogBlocks[K]>,
  ) => {
    setBlocks((b) => ({ ...b, [key]: { ...b[key], ...patch } }));
  };

  return (
    <form action={saveCatalogBlocks} className="space-y-6">
      <input type="hidden" name="blocks_json" value={JSON.stringify(blocks)} />

      {/* Présentation */}
      <BlockShell
        title="Présentation"
        subtitle="Le texte d'introduction de votre cabinet."
        enabled={blocks.presentation.enabled}
        onToggle={(v) => updateBlock("presentation", { enabled: v })}
      >
        <div className="space-y-3">
          <FieldRow label="Titre du bloc">
            <Input
              value={blocks.presentation.title}
              onChange={(e) =>
                updateBlock("presentation", { title: e.target.value })
              }
            />
          </FieldRow>
          <FieldRow label="Contenu (texte enrichi)">
            <RichTextEditor
              value={blocks.presentation.html}
              onChange={(html) => updateBlock("presentation", { html })}
              minHeight={140}
            />
          </FieldRow>
        </div>
      </BlockShell>

      {/* À propos */}
      <BlockShell
        title="À propos / Le fondateur"
        subtitle="Photo et bio du fondateur ou de l'équipe."
        enabled={blocks.about.enabled}
        onToggle={(v) => updateBlock("about", { enabled: v })}
      >
        <div className="space-y-3">
          <FieldRow label="Titre du bloc">
            <Input
              value={blocks.about.title}
              onChange={(e) => updateBlock("about", { title: e.target.value })}
            />
          </FieldRow>
          <FieldRow label="URL de la photo (optionnel)">
            <Input
              type="url"
              value={blocks.about.photo_url ?? ""}
              onChange={(e) =>
                updateBlock("about", { photo_url: e.target.value || null })
              }
              placeholder="https://…"
            />
          </FieldRow>
          <FieldRow label="Bio (texte enrichi)">
            <RichTextEditor
              value={blocks.about.html}
              onChange={(html) => updateBlock("about", { html })}
              minHeight={140}
            />
          </FieldRow>
        </div>
      </BlockShell>

      {/* Engagements */}
      <BlockShell
        title="Engagements & Garanties"
        subtitle="Liste de garanties (Qualiopi, recommandation, etc.) — affichées en cartes."
        enabled={blocks.engagements.enabled}
        onToggle={(v) => updateBlock("engagements", { enabled: v })}
      >
        <div className="space-y-3">
          <FieldRow label="Titre du bloc">
            <Input
              value={blocks.engagements.title}
              onChange={(e) =>
                updateBlock("engagements", { title: e.target.value })
              }
            />
          </FieldRow>
          <FieldRow label="Phrase d'introduction">
            <Input
              value={blocks.engagements.intro}
              onChange={(e) =>
                updateBlock("engagements", { intro: e.target.value })
              }
            />
          </FieldRow>
          <ItemList
            label="Engagements"
            items={blocks.engagements.items}
            onChange={(items) => updateBlock("engagements", { items })}
            renderEmpty="Ajoutez vos garanties (Qualiopi, expertise, recommandation…)."
            fields={[
              { key: "title", label: "Titre", placeholder: "Certification Qualiopi" },
              {
                key: "description",
                label: "Description",
                placeholder: "Processus certifié pour la catégorie « Action de Formation »…",
                multiline: true,
              },
            ]}
            newItem={() => ({ title: "", description: "" })}
          />
        </div>
      </BlockShell>

      {/* Modalités */}
      <BlockShell
        title="Modalités pédagogiques"
        subtitle="Présentiel, distanciel, blended, e-learning — affichées en cartes."
        enabled={blocks.modalities.enabled}
        onToggle={(v) => updateBlock("modalities", { enabled: v })}
      >
        <div className="space-y-3">
          <FieldRow label="Titre du bloc">
            <Input
              value={blocks.modalities.title}
              onChange={(e) =>
                updateBlock("modalities", { title: e.target.value })
              }
            />
          </FieldRow>
          <FieldRow label="Phrase d'introduction">
            <Input
              value={blocks.modalities.intro}
              onChange={(e) =>
                updateBlock("modalities", { intro: e.target.value })
              }
            />
          </FieldRow>
          <ItemList
            label="Modalités"
            items={blocks.modalities.items}
            onChange={(items) => updateBlock("modalities", { items })}
            renderEmpty="Ajoutez vos modalités (Présentiel, Classe virtuelle, Blended…)."
            fields={[
              { key: "label", label: "Modalité", placeholder: "Classe virtuelle" },
              {
                key: "description",
                label: "Description",
                placeholder: "De 3 à 7 personnes en visio…",
                multiline: true,
              },
            ]}
            newItem={() => ({ label: "", description: "" })}
          />
        </div>
      </BlockShell>

      {/* Témoignages */}
      <BlockShell
        title="Témoignages clients"
        subtitle="Citations de clients satisfaits — facultatif."
        enabled={blocks.testimonials.enabled}
        onToggle={(v) => updateBlock("testimonials", { enabled: v })}
      >
        <div className="space-y-3">
          <FieldRow label="Titre du bloc">
            <Input
              value={blocks.testimonials.title}
              onChange={(e) =>
                updateBlock("testimonials", { title: e.target.value })
              }
            />
          </FieldRow>
          <FieldRow label="Phrase d'introduction">
            <Input
              value={blocks.testimonials.intro}
              onChange={(e) =>
                updateBlock("testimonials", { intro: e.target.value })
              }
            />
          </FieldRow>
          <ItemList
            label="Témoignages"
            items={blocks.testimonials.items}
            onChange={(items) => updateBlock("testimonials", { items })}
            renderEmpty="Pas encore de témoignages. Ajoutez-en pour rassurer vos prospects."
            fields={[
              { key: "author", label: "Auteur", placeholder: "Marie Dupont" },
              { key: "role", label: "Rôle / Société", placeholder: "Directrice RH, Entreprise X" },
              {
                key: "quote",
                label: "Citation",
                placeholder: "Une formation de grande qualité, des intervenants experts…",
                multiline: true,
              },
            ]}
            newItem={() => ({ author: "", role: "", quote: "" })}
          />
        </div>
      </BlockShell>

      {/* CTA */}
      <BlockShell
        title="Appel à l'action"
        subtitle="Boutons d'inscription / contact placés en fin de catalogue."
        enabled={blocks.cta.enabled}
        onToggle={(v) => updateBlock("cta", { enabled: v })}
      >
        <div className="space-y-3">
          <FieldRow label="Titre">
            <Input
              value={blocks.cta.title}
              onChange={(e) => updateBlock("cta", { title: e.target.value })}
            />
          </FieldRow>
          <FieldRow label="Description">
            <Input
              value={blocks.cta.description}
              onChange={(e) =>
                updateBlock("cta", { description: e.target.value })
              }
            />
          </FieldRow>
          <div className="grid md:grid-cols-2 gap-3">
            <FieldRow label="Bouton principal — texte">
              <Input
                value={blocks.cta.primary_label}
                onChange={(e) =>
                  updateBlock("cta", { primary_label: e.target.value })
                }
              />
            </FieldRow>
            <FieldRow label="Bouton principal — URL">
              <Input
                value={blocks.cta.primary_url}
                onChange={(e) =>
                  updateBlock("cta", { primary_url: e.target.value })
                }
                placeholder="https://… ou mailto:…"
              />
            </FieldRow>
            <FieldRow label="Bouton secondaire — texte">
              <Input
                value={blocks.cta.secondary_label}
                onChange={(e) =>
                  updateBlock("cta", { secondary_label: e.target.value })
                }
              />
            </FieldRow>
            <FieldRow label="Bouton secondaire — URL">
              <Input
                value={blocks.cta.secondary_url}
                onChange={(e) =>
                  updateBlock("cta", { secondary_url: e.target.value })
                }
                placeholder="https://… ou mailto:…"
              />
            </FieldRow>
          </div>
        </div>
      </BlockShell>

      {/* Mentions légales */}
      <BlockShell
        title="Mentions légales (pied de page)"
        subtitle="Texte libre repris en bas de chaque page. Les infos d'organisation (SIRET, NDA…) sont automatiquement injectées."
        enabled={blocks.legal.enabled}
        onToggle={(v) => updateBlock("legal", { enabled: v })}
      >
        <FieldRow label="Texte additionnel (optionnel)">
          <RichTextEditor
            value={blocks.legal.html}
            onChange={(html) => updateBlock("legal", { html })}
            minHeight={120}
          />
        </FieldRow>
      </BlockShell>

      <div className="flex justify-end pt-2">
        <Button type="submit">Enregistrer le contenu</Button>
      </div>
    </form>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function BlockShell({
  title,
  subtitle,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section
      className={`rounded-xl border bg-white dark:bg-zinc-900 transition-opacity ${
        enabled
          ? "border-zinc-200 dark:border-zinc-800"
          : "border-zinc-200 dark:border-zinc-800 opacity-60"
      }`}
    >
      <header className="flex items-center justify-between gap-3 p-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {!enabled && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                Masqué
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onToggle(!enabled)}
            title={enabled ? "Masquer ce bloc" : "Afficher ce bloc"}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {enabled ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            title={open ? "Replier" : "Déplier"}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {open ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>
      {open && <div className="p-4">{children}</div>}
    </section>
  );
}

type Field = {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
};

function ItemList<T extends Record<string, string>>({
  label,
  items,
  onChange,
  fields,
  newItem,
  renderEmpty,
}: {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  fields: Field[];
  newItem: () => T;
  renderEmpty: string;
}) {
  const update = (idx: number, patch: Partial<T>) => {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };
  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {items.length === 0 ? (
        <p className="text-xs italic text-zinc-500 px-2 py-3 rounded bg-zinc-50 dark:bg-zinc-950 border border-dashed border-zinc-300 dark:border-zinc-700">
          {renderEmpty}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30 p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                  #{idx + 1}
                </span>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="h-7 w-7 inline-flex items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
                    title="Monter"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={idx === items.length - 1}
                    className="h-7 w-7 inline-flex items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
                    title="Descendre"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {fields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-[11px] text-zinc-500">{f.label}</Label>
                  {f.multiline ? (
                    <textarea
                      value={item[f.key] ?? ""}
                      onChange={(e) =>
                        update(idx, { [f.key]: e.target.value } as Partial<T>)
                      }
                      placeholder={f.placeholder}
                      rows={3}
                      className="flex w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                    />
                  ) : (
                    <Input
                      value={item[f.key] ?? ""}
                      onChange={(e) =>
                        update(idx, { [f.key]: e.target.value } as Partial<T>)
                      }
                      placeholder={f.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, newItem()])}
      >
        <Plus className="h-3.5 w-3.5" /> Ajouter
      </Button>
    </div>
  );
}
