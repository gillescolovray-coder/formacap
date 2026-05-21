"use client";

import { useState } from "react";
import { Plus, Trash2, User, UserPlus } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";

type LearnerOption = {
  id: string;
  first_name: string | null;
  last_name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  job_title: string | null;
  civility: string | null;
  company_id: string | null;
  company_name: string | null;
};

type AdditionalLearner = {
  /** Si un apprenant existant est sélectionné dans le picker. */
  learner_id: string;
  /** Champs prospect (saisie d'un nouveau learner ou édition). */
  civility: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  mobile: string;
  job_title: string;
};

function emptyLearner(): AdditionalLearner {
  return {
    learner_id: "",
    civility: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    mobile: "",
    job_title: "",
  };
}

/**
 * Bloc « Inscrire d'autres apprenants à cette même session »
 * (Gilles 2026-05-21).
 *
 * Permet de saisir N apprenants supplémentaires lors d'une inscription.
 * À la sauvegarde, le serveur crée une inscription_request additionnelle
 * pour chacun (même entreprise, même financement, même session que
 * l'apprenant principal).
 *
 * Convention FormData :
 *   - additional_learners_count : N
 *   - additional_learner_<i>_learner_id, _civility, _first_name, _last_name,
 *     _email, _phone, _mobile, _job_title
 */
export function AdditionalLearners({
  learners,
}: {
  learners: LearnerOption[];
}) {
  const [rows, setRows] = useState<AdditionalLearner[]>([]);
  // Picker : texte en cours de saisie par ligne (id → query)
  const [pickerQuery, setPickerQuery] = useState<Record<number, string>>({});
  const [pickerOpen, setPickerOpen] = useState<Record<number, boolean>>({});

  function addRow() {
    setRows((prev) => [...prev, emptyLearner()]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setPickerQuery((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
    setPickerOpen((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  }

  function updateRow(idx: number, patch: Partial<AdditionalLearner>) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  }

  function pickLearner(idx: number, l: LearnerOption) {
    updateRow(idx, {
      learner_id: l.id,
      civility: l.civility ?? "",
      first_name: l.first_name ?? "",
      last_name: (l.last_name ?? "").toLocaleUpperCase("fr-FR"),
      email: l.email ?? "",
      phone: l.phone ?? "",
      mobile: l.mobile ?? "",
      job_title: l.job_title ?? "",
    });
    setPickerQuery((prev) => ({ ...prev, [idx]: "" }));
    setPickerOpen((prev) => ({ ...prev, [idx]: false }));
  }

  function clearLearner(idx: number) {
    updateRow(idx, { learner_id: "" });
  }

  // Filtrage du picker
  function filteredOptions(idx: number): LearnerOption[] {
    const q = (pickerQuery[idx] ?? "").trim().toLowerCase();
    if (!q) return learners.slice(0, 30);
    return learners
      .filter((l) => {
        const txt = [
          l.first_name ?? "",
          l.last_name,
          l.email ?? "",
          l.company_name ?? "",
          l.job_title ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return txt.includes(q);
      })
      .slice(0, 30);
  }

  return (
    <div className="space-y-3">
      <input
        type="hidden"
        name="additional_learners_count"
        value={String(rows.length)}
      />

      {rows.length === 0 ? (
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center">
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
            Vous pouvez inscrire plusieurs apprenants en même temps. Ils
            seront tous rattachés à <strong>la même entreprise</strong>,{" "}
            <strong>la même session</strong> et le{" "}
            <strong>même mode de financement</strong>.
          </p>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold shadow-sm"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Ajouter un apprenant
          </button>
        </div>
      ) : (
        <>
          {rows.map((row, idx) => {
            const opts = filteredOptions(idx);
            const open = pickerOpen[idx] ?? false;
            const selectedLearner = row.learner_id
              ? learners.find((l) => l.id === row.learner_id)
              : null;

            return (
              <div
                key={idx}
                className="rounded-lg bg-cyan-50/40 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900 p-3.5 space-y-3"
              >
                {/* Bandeau ligne */}
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cyan-800 dark:text-cyan-300">
                    <User className="h-3.5 w-3.5" />
                    Apprenant supplémentaire #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-800 text-[11px] font-semibold"
                    title="Retirer cet apprenant"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Retirer
                  </button>
                </div>

                {/* Hidden inputs */}
                <input
                  type="hidden"
                  name={`additional_learner_${idx}_learner_id`}
                  value={row.learner_id}
                />

                {/* Picker apprenant existant */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Apprenant existant (optionnel)
                  </label>
                  {selectedLearner ? (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-cyan-300 bg-white dark:bg-slate-900 px-3 py-2">
                      <div className="text-sm">
                        <span className="font-bold">
                          {selectedLearner.last_name.toUpperCase()}
                        </span>{" "}
                        {selectedLearner.first_name}
                        {selectedLearner.email && (
                          <span className="text-slate-500 ml-2 text-[11px]">
                            {selectedLearner.email}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => clearLearner(idx)}
                        className="text-rose-600 hover:text-rose-800 text-xs"
                        title="Déselectionner"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="search"
                        value={pickerQuery[idx] ?? ""}
                        onChange={(e) => {
                          setPickerQuery((prev) => ({
                            ...prev,
                            [idx]: e.target.value,
                          }));
                          setPickerOpen((prev) => ({ ...prev, [idx]: true }));
                        }}
                        onFocus={() =>
                          setPickerOpen((prev) => ({ ...prev, [idx]: true }))
                        }
                        onBlur={() =>
                          // Délai pour laisser le clic sur option se faire
                          setTimeout(
                            () =>
                              setPickerOpen((prev) => ({
                                ...prev,
                                [idx]: false,
                              })),
                            150,
                          )
                        }
                        placeholder="Tapez nom, prénom, email…"
                        className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm"
                      />
                      {open && opts.length > 0 && (
                        <ul className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                          {opts.map((l) => (
                            <li key={l.id}>
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => pickLearner(idx, l)}
                                className="w-full text-left px-3 py-2 hover:bg-cyan-50 border-b border-slate-100 last:border-0"
                              >
                                <p className="text-sm font-semibold">
                                  {l.last_name.toUpperCase()}{" "}
                                  <span className="font-normal">
                                    {l.first_name}
                                  </span>
                                </p>
                                {(l.email || l.company_name) && (
                                  <p className="text-[11px] text-slate-500">
                                    {l.email}
                                    {l.email && l.company_name && " · "}
                                    {l.company_name}
                                  </p>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500 italic">
                    💡 Laissez vide pour créer un nouvel apprenant ci-dessous.
                  </p>
                </div>

                {/* Ligne 1 : Civilité + Prénom + Nom */}
                <div className="grid gap-2 md:grid-cols-[auto_1fr_1fr]">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Civilité
                    </label>
                    <select
                      name={`additional_learner_${idx}_civility`}
                      value={row.civility}
                      onChange={(e) =>
                        updateRow(idx, { civility: e.target.value })
                      }
                      data-filled={row.civility ? "true" : "false"}
                      className="flex h-9 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm"
                    >
                      <option value="">—</option>
                      <option value="M.">M.</option>
                      <option value="Mme">Mme</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Prénom <span className="text-red-600">*</span>
                    </label>
                    <input
                      name={`additional_learner_${idx}_first_name`}
                      required={!row.learner_id}
                      value={row.first_name}
                      onChange={(e) =>
                        updateRow(idx, { first_name: e.target.value })
                      }
                      placeholder=" "
                      className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Nom <span className="text-red-600">*</span>
                    </label>
                    <input
                      name={`additional_learner_${idx}_last_name`}
                      required={!row.learner_id}
                      value={row.last_name}
                      onChange={(e) =>
                        updateRow(idx, {
                          last_name: e.target.value.toLocaleUpperCase("fr-FR"),
                        })
                      }
                      placeholder=" "
                      className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm uppercase"
                    />
                  </div>
                </div>

                {/* Ligne 2 : Email full width */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Email
                  </label>
                  <input
                    name={`additional_learner_${idx}_email`}
                    type="email"
                    value={row.email}
                    onChange={(e) => updateRow(idx, { email: e.target.value })}
                    placeholder=" "
                    className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm"
                  />
                </div>

                {/* Ligne 3 : Tel fixe + mobile */}
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Téléphone fixe
                    </label>
                    <PhoneInput
                      key={`add-phone-${idx}-${row.learner_id || "new"}`}
                      name={`additional_learner_${idx}_phone`}
                      defaultValue={row.phone}
                      onValueChange={(v) => updateRow(idx, { phone: v })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Téléphone mobile
                    </label>
                    <PhoneInput
                      key={`add-mobile-${idx}-${row.learner_id || "new"}`}
                      name={`additional_learner_${idx}_mobile`}
                      defaultValue={row.mobile}
                      onValueChange={(v) => updateRow(idx, { mobile: v })}
                    />
                  </div>
                </div>

                {/* Ligne 4 : Fonction */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Fonction
                  </label>
                  <input
                    name={`additional_learner_${idx}_job_title`}
                    value={row.job_title}
                    onChange={(e) =>
                      updateRow(idx, { job_title: e.target.value })
                    }
                    placeholder="Ex: Conducteur de travaux…"
                    className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm"
                  />
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-cyan-600 text-cyan-700 bg-white hover:bg-cyan-50 text-xs font-bold"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter encore un apprenant
          </button>
        </>
      )}
    </div>
  );
}
