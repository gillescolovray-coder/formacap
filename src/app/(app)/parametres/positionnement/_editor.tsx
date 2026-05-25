"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Plus, Star, Target, X } from "lucide-react";

type Choice = { key: string; label: string };

type Row = {
  /** UUID local (utilisé en clé React, pas envoyé au serveur) */
  uid: string;
  /** Clé persistée. Pour les rows existants : verrouillée. Pour les
   *  nouveaux : auto-générée depuis le label, modifiable en mode avancé. */
  key: string;
  /** Si vrai : la clé n'a jamais été persistée → modifiable librement.
   *  Sinon : verrouillée (la modifier casserait l'affichage des réponses
   *  apprenants déjà enregistrées). */
  isNew: boolean;
  label: string;
};

type Props = {
  mode: "new" | "edit";
  initial: {
    title: string;
    description: string;
    isDefault: boolean;
    expectationChoices: Choice[];
    masteryCriteria: Choice[];
  };
  /** Indique si le template courant est DÉJÀ marqué default (édition).
   *  Permet d'afficher l'avertissement de basculement uniquement quand
   *  on PASSE de non-default à default. */
  initiallyDefault?: boolean;
  /** Action serveur à appeler au submit. */
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  initialError?: string;
};

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function makeUid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function fromChoice(c: Choice): Row {
  return { uid: makeUid(), key: c.key, label: c.label, isNew: false };
}

function toPayload(rows: Row[]): Choice[] {
  return rows
    .filter((r) => r.label.trim() !== "")
    .map((r) => ({
      key: r.key.trim() || slugify(r.label),
      label: r.label.trim(),
    }));
}

export function PositioningTemplateEditor({
  mode,
  initial,
  initiallyDefault = false,
  action,
  submitLabel,
  initialError,
}: Props) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [isDefault, setIsDefault] = useState(initial.isDefault);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pending, startTransition] = useTransition();

  const [expectations, setExpectations] = useState<Row[]>(() =>
    initial.expectationChoices.map(fromChoice),
  );
  const [criteria, setCriteria] = useState<Row[]>(() =>
    initial.masteryCriteria.map(fromChoice),
  );

  const isBecomingDefault = useMemo(
    () => isDefault && !initiallyDefault,
    [isDefault, initiallyDefault],
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("expectation_choices", JSON.stringify(toPayload(expectations)));
    fd.set("mastery_criteria", JSON.stringify(toPayload(criteria)));
    startTransition(async () => {
      await action(fd);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {initialError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {initialError}
        </div>
      )}

      {/* Identification */}
      <section className="rounded-xl bg-white border border-zinc-200 p-4 sm:p-5 space-y-3">
        <header>
          <h2 className="text-sm font-bold text-zinc-900">Identification</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Nom interne de ce template (visible dans les dropdowns
            formation/session).
          </p>
        </header>
        <label className="space-y-1 block">
          <span className="text-xs font-medium text-zinc-700">
            Titre <span className="text-red-500">*</span>
          </span>
          <input
            name="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex : Test BTP — Marchés publics"
            className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
          />
        </label>
        <label className="space-y-1 block">
          <span className="text-xs font-medium text-zinc-700">
            Description (optionnelle)
          </span>
          <textarea
            name="description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="À quoi sert ce template, à quelles formations le rattacher…"
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none resize-none"
          />
        </label>
        <label className="flex items-start gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            name="is_default"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-amber-600 cursor-pointer"
          />
          <span className="text-xs text-zinc-700 flex-1">
            <span className="font-semibold flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-amber-600" />
              Définir ce template comme « par défaut » de l&apos;organisation
            </span>
            <span className="text-zinc-500 block mt-0.5">
              Le template par défaut s&apos;applique automatiquement à toutes
              les sessions sans template spécifique.
              {isBecomingDefault && (
                <span className="block text-amber-700 font-semibold mt-1">
                  ⚠ L&apos;ancien template par défaut sera automatiquement
                  déclassé (il restera dans la bibliothèque).
                </span>
              )}
            </span>
          </span>
        </label>
      </section>

      {/* Section 2 — Attentes */}
      <ChoiceListEditor
        title="Attentes proposées (Section 2)"
        description="Multi-choix proposés à l'apprenant pour décrire ce qu'il attend de la formation."
        accent="cyan"
        rows={expectations}
        setRows={setExpectations}
        showAdvanced={showAdvanced}
        placeholderLabel="Ex : Découvrir le sujet"
      />

      {/* Section 5 — Compétences */}
      <ChoiceListEditor
        title="Compétences à auto-évaluer (Section 5)"
        description="Pour chaque compétence l'apprenant indiquera Non maîtrisé / Partiellement / Maîtrisé."
        accent="amber"
        rows={criteria}
        setRows={setCriteria}
        showAdvanced={showAdvanced}
        placeholderLabel="Ex : Identifier les règles du Code des marchés publics"
      />

      {/* Mode avancé : afficher les clés (réservé experts) */}
      <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer">
        <input
          type="checkbox"
          checked={showAdvanced}
          onChange={(e) => setShowAdvanced(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        <span>
          Mode avancé : afficher les clés techniques (pour debugging
          uniquement, ne modifiez pas les clés existantes sous peine de
          casser l&apos;affichage des réponses apprenants déjà enregistrées)
        </span>
      </label>

      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-5 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : submitLabel}
        </button>
      </div>
      {mode === "edit" && (
        <p className="text-[11px] text-zinc-400 text-right">
          Note : les clés techniques des items existants sont verrouillées
          (icône cadenas) — modifier une clé casserait les réponses déjà
          enregistrées.
        </p>
      )}
    </form>
  );
}

// ============================================================
// Sous-composant : éditeur d'une liste de choices
// ============================================================

function ChoiceListEditor({
  title,
  description,
  accent,
  rows,
  setRows,
  showAdvanced,
  placeholderLabel,
}: {
  title: string;
  description: string;
  accent: "cyan" | "amber";
  rows: Row[];
  setRows: (rows: Row[]) => void;
  showAdvanced: boolean;
  placeholderLabel: string;
}) {
  const bgClass =
    accent === "cyan"
      ? "bg-cyan-50 border-cyan-200"
      : "bg-amber-50 border-amber-200";
  const iconClass =
    accent === "cyan"
      ? "bg-cyan-100 text-cyan-700"
      : "bg-amber-100 text-amber-700";

  function addRow() {
    setRows([
      ...rows,
      { uid: makeUid(), key: "", label: "", isNew: true },
    ]);
  }

  function updateRow(uid: string, patch: Partial<Row>) {
    setRows(rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }

  function removeRow(uid: string) {
    setRows(rows.filter((r) => r.uid !== uid));
  }

  function move(uid: string, dir: -1 | 1) {
    const idx = rows.findIndex((r) => r.uid === uid);
    if (idx === -1) return;
    const target = idx + dir;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[idx], next[target]] = [next[target], next[idx]];
    setRows(next);
  }

  return (
    <section className={`rounded-xl border ${bgClass} p-4 sm:p-5 space-y-3`}>
      <header className="flex items-start gap-3">
        <div
          className={`shrink-0 h-9 w-9 rounded-lg ${iconClass} flex items-center justify-center`}
        >
          <Target className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-zinc-900">{title}</h2>
          <p className="text-xs text-zinc-600 mt-0.5">{description}</p>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 italic">
          Aucun élément. Cliquez sur « + Ajouter » pour commencer.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r, idx) => (
            <li
              key={r.uid}
              className="bg-white rounded-md border border-zinc-200 p-2 grid grid-cols-[auto_1fr_auto] gap-2 items-center"
            >
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => move(r.uid, -1)}
                  disabled={idx === 0}
                  className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 h-5 w-5 flex items-center justify-center"
                  title="Monter"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(r.uid, 1)}
                  disabled={idx === rows.length - 1}
                  className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 h-5 w-5 flex items-center justify-center"
                  title="Descendre"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-w-0">
                <input
                  type="text"
                  value={r.label}
                  onChange={(e) => updateRow(r.uid, { label: e.target.value })}
                  placeholder={placeholderLabel}
                  className="w-full h-8 rounded border border-zinc-200 px-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-200 outline-none"
                />
                {showAdvanced && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-zinc-400 font-mono">
                      key:
                    </span>
                    <input
                      type="text"
                      value={r.key}
                      onChange={(e) =>
                        updateRow(r.uid, { key: slugify(e.target.value) })
                      }
                      disabled={!r.isNew}
                      placeholder={slugify(r.label) || "auto"}
                      className="flex-1 h-6 rounded border border-zinc-200 px-1.5 text-[11px] font-mono focus:border-amber-500 outline-none disabled:bg-zinc-50 disabled:text-zinc-500"
                      title={
                        r.isNew
                          ? "Clé technique (auto-générée depuis le libellé si vide)"
                          : "Clé verrouillée — la modifier casserait l'affichage des réponses déjà enregistrées avec cette clé."
                      }
                    />
                    {!r.isNew && (
                      <span className="text-[10px] text-zinc-400">🔒</span>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeRow(r.uid)}
                className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded p-1"
                title="Retirer cet élément"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-white border border-dashed border-amber-400 hover:border-amber-500 hover:bg-amber-50 px-3 py-1.5 rounded-md"
      >
        <Plus className="h-3.5 w-3.5" />
        Ajouter un élément
      </button>
    </section>
  );
}
