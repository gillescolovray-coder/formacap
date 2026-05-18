"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Briefcase, Building2, ChevronDown, Search, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type LearnerOption = {
  id: string;
  first_name: string | null;
  last_name: string;
  email?: string | null;
  job_title?: string | null;
  company?: { name: string | null } | null;
};

type Props = {
  learners: LearnerOption[];
  name?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  required?: boolean;
};

/**
 * Picker d'apprenant avec recherche. Filtre sur Nom, Prénom, Société et
 * email. Tri alphabétique par NOM puis Prénom.
 *
 * Le panneau dropdown est rendu via React Portal directement dans
 * document.body — cela évite tout problème de z-index / stacking-context
 * avec les composants parents (cards, sections, etc.).
 */
export function LearnerSearchPicker({
  learners,
  name = "learner_id",
  defaultValue = "",
  onChange,
  required = false,
}: Props) {
  const [selectedId, setSelectedId] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
  }>({ top: 0, left: 0, width: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Marqueur "monté côté client" pour autoriser createPortal (SSR safe)
  useEffect(() => {
    setMounted(true);
  }, []);

  const sorted = useMemo(() => {
    return [...learners].sort((a, b) => {
      const an = `${a.last_name ?? ""} ${a.first_name ?? ""}`
        .trim()
        .toLowerCase();
      const bn = `${b.last_name ?? ""} ${b.first_name ?? ""}`
        .trim()
        .toLowerCase();
      return an.localeCompare(bn, "fr");
    });
  }, [learners]);

  // Normalise une chaîne pour la recherche : minuscules + sans accents.
  // Ainsi "prenom" matche "Prénom", "société" matche "societe", etc.
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return sorted;
    return sorted.filter((l) => {
      const haystack = normalize(
        [
          l.last_name ?? "",
          l.first_name ?? "",
          l.company?.name ?? "",
          l.email ?? "",
          l.job_title ?? "",
        ].join(" "),
      );
      return haystack.includes(q);
    });
  }, [sorted, query]);

  const selected = learners.find((l) => l.id === selectedId);

  // Calcule (et recalcule) la position du dropdown selon le trigger
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Fermeture sur clic extérieur (en tenant compte du dropdown porté)
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function pick(id: string) {
    setSelectedId(id);
    onChange?.(id);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    setSelectedId("");
    onChange?.("");
    setQuery("");
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selectedId} required={required} />

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-white dark:bg-slate-900 px-3 py-1 text-sm shadow-sm transition-colors",
          selected
            ? "border-cyan-300 hover:border-cyan-400"
            : "border-slate-300 hover:border-slate-400 text-slate-500",
          open && "ring-2 ring-cyan-300 border-cyan-400",
        )}
      >
        {selected ? (
          <span className="flex items-center gap-1.5 truncate">
            <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="font-bold text-slate-900 dark:text-slate-100">
              {(selected.last_name ?? "").toUpperCase()}
            </span>
            <span className="text-slate-700 dark:text-slate-300">
              {selected.first_name ?? ""}
            </span>
            {selected.company?.name && (
              <span className="text-slate-500 truncate">
                · {selected.company.name}
              </span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5 shrink-0" />
            Rechercher un apprenant…
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-slate-400 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {selected && !open && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-8 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full hover:bg-slate-100 inline-flex items-center justify-center text-slate-400 hover:text-red-600"
          title="Effacer la sélection"
          aria-label="Effacer"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {/* Dropdown rendu en portail dans document.body pour echapper a
          tous les overflow / stacking-context des parents. */}
      {mounted && open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              width: `${position.width}px`,
            }}
          >
            <div className="px-2 py-2 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tapez nom, prénom, société…"
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1 px-1">
                {filtered.length} apprenant{filtered.length > 1 ? "s" : ""}
                {query ? ` (sur ${sorted.length})` : ""}
              </p>
            </div>
            <ul className="max-h-72 overflow-y-auto">
              {filtered.length === 0 && (
                <li className="px-3 py-4 text-xs text-slate-400 italic text-center">
                  Aucun apprenant ne correspond à « {query} ».
                </li>
              )}
              {filtered.map((l) => {
                const isActive = l.id === selectedId;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => pick(l.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 transition-colors flex items-start gap-2 border-l-2",
                        isActive
                          ? "border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/20"
                          : "border-transparent",
                      )}
                    >
                      <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {`${l.first_name?.[0] ?? ""}${l.last_name?.[0] ?? ""}`.toUpperCase() ||
                          "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-tight">
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {(l.last_name ?? "").toUpperCase()}
                          </span>{" "}
                          <span className="text-slate-700 dark:text-slate-300">
                            {l.first_name ?? ""}
                          </span>
                        </p>
                        <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500 mt-0.5">
                          {l.job_title && (
                            <span className="inline-flex items-center gap-1">
                              <Briefcase className="h-3 w-3" />
                              {l.job_title}
                            </span>
                          )}
                          {l.company?.name && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {l.company.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
