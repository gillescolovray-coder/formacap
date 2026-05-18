"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SireneLookup } from "../entreprises/_sirene-lookup";
import { PostalCodeCity } from "@/components/postal-code-city";
import {
  SIRENE_STATUS_BADGE_CLASSES,
  SIRENE_STATUS_LABELS,
  type SireneLegalStatus,
} from "@/lib/sirene/types";

type CompanyOption = {
  id: string;
  name: string;
  postal_code?: string | null;
  city?: string | null;
};

type Props = {
  companies: CompanyOption[];
  defaultCompanyId?: string | null;
  /**
   * Si fourni : nom de l'entreprise actuellement rattachée (pour
   * l'affichage initial même si elle n'apparaît pas dans la liste).
   */
  defaultCompanyName?: string | null;
};

/**
 * Sélecteur d'entreprise pour la fiche apprenant :
 * - Recherche dans la liste des entreprises existantes (combobox)
 * - Option "+ Créer X" pour basculer en mode création
 * - Mode création : panneau inline avec auto-remplissage SIRENE +
 *   CP/Ville + champs cachés transmis à l'action serveur.
 *
 * Champs envoyés au formulaire :
 *   - `company_id` (string ou vide)
 *   - `new_company_name` (string ou vide) — si non vide, l'action crée
 *     l'entreprise et utilise son ID.
 *   - `new_company_siret`, `new_company_siren`, `new_company_legal_form`,
 *     `new_company_industry`, `new_company_naf_code`,
 *     `new_company_legal_status`, `new_company_pappers_url`,
 *     `new_company_address`, `new_company_postal_code`, `new_company_city`.
 */
export function CompanyPicker({
  companies,
  defaultCompanyId = null,
  defaultCompanyName = null,
}: Props) {
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? "");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  // Position du dropdown rendu dans un portail (sinon il est clippé par
  // l'`overflow-hidden` du CollapsibleSection parent).
  const [dropRect, setDropRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  useEffect(() => {
    if (!open) {
      setDropRect(null);
      return;
    }
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setDropRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Mode "création d'une nouvelle entreprise"
  const [newName, setNewName] = useState("");
  const [siret, setSiret] = useState("");
  const [siren, setSiren] = useState("");
  const [legalForm, setLegalForm] = useState("");
  const [industry, setIndustry] = useState("");
  const [nafCode, setNafCode] = useState("");
  const [legalStatus, setLegalStatus] = useState<SireneLegalStatus | "">("");
  const [pappersUrl, setPappersUrl] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");

  const selected = companies.find((c) => c.id === companyId);
  const selectedLabel =
    selected?.name ??
    (companyId === defaultCompanyId ? defaultCompanyName : null) ??
    null;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return companies.slice(0, 30);
    const q = query.toLowerCase();
    return companies.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 30);
  }, [companies, query]);

  function pick(c: CompanyOption) {
    setCompanyId(c.id);
    setNewName("");
    resetCreateFields();
    setQuery("");
    setOpen(false);
  }

  function clearSelection() {
    setCompanyId("");
    setNewName("");
    resetCreateFields();
    setQuery("");
  }

  function startCreating(typed: string) {
    setCompanyId("");
    setNewName(typed);
    setQuery("");
    setOpen(false);
  }

  function cancelCreating() {
    setNewName("");
    resetCreateFields();
  }

  function resetCreateFields() {
    setSiret("");
    setSiren("");
    setLegalForm("");
    setIndustry("");
    setNafCode("");
    setLegalStatus("");
    setPappersUrl("");
    setAddress("");
    setPostalCode("");
    setCity("");
  }

  const isCreating = newName.length > 0 && !companyId;

  return (
    <div className="space-y-2">
      {/* Champs cachés envoyés au formulaire parent */}
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="new_company_name" value={isCreating ? newName : ""} />
      {isCreating && (
        <>
          <input type="hidden" name="new_company_siret" value={siret} />
          <input type="hidden" name="new_company_siren" value={siren} />
          <input type="hidden" name="new_company_legal_form" value={legalForm} />
          <input type="hidden" name="new_company_industry" value={industry} />
          <input type="hidden" name="new_company_naf_code" value={nafCode} />
          <input type="hidden" name="new_company_legal_status" value={legalStatus} />
          <input type="hidden" name="new_company_pappers_url" value={pappersUrl} />
          <input type="hidden" name="new_company_address" value={address} />
        </>
      )}

      {/* Combobox sélection entreprise existante */}
      <div ref={wrapRef} className="relative">
        <div
          ref={triggerRef}
          className={cn(
            "flex items-center gap-2 h-9 w-full rounded-md border bg-white dark:bg-slate-900 px-3 cursor-text",
            open
              ? "border-cyan-500 ring-1 ring-cyan-500"
              : "border-slate-300 dark:border-slate-700",
          )}
          onClick={() => !isCreating && setOpen(true)}
        >
          <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
          {!open && (companyId || isCreating) ? (
            <>
              {companyId && !isCreating ? (
                <Link
                  href={`/entreprises/${companyId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm flex-1 truncate font-medium text-cyan-700 hover:underline inline-flex items-center gap-2"
                  title="Ouvrir la fiche de l'entreprise"
                >
                  <span className="truncate">{selectedLabel ?? "—"}</span>
                  {(() => {
                    const sel = companies.find((c) => c.id === companyId);
                    const cpVille = [sel?.postal_code, sel?.city]
                      .filter(Boolean)
                      .join(" ");
                    return cpVille ? (
                      <span className="text-[11px] text-slate-500 font-normal whitespace-nowrap">
                        · {cpVille}
                      </span>
                    ) : null;
                  })()}
                </Link>
              ) : (
                <span className="text-sm flex-1 truncate font-medium">
                  {newName} (à créer)
                </span>
              )}
            </>
          ) : (
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Rechercher une entreprise existante…"
              className="flex-1 bg-transparent text-sm outline-none"
              disabled={isCreating}
            />
          )}
          {companyId && !isCreating && !open && (
            <Link
              href={`/entreprises/${companyId}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center justify-center h-6 w-6 rounded text-cyan-700 hover:bg-cyan-50"
              title="Ouvrir la fiche de l'entreprise"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          {(companyId || isCreating) && !open && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearSelection();
              }}
              className="text-xs text-slate-400 hover:text-red-600"
              title="Aucune entreprise (particulier)"
            >
              ✕
            </button>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-slate-400 shrink-0 transition-transform",
              open && "rotate-180",
            )}
          />
        </div>

        {open &&
          dropRect &&
          typeof window !== "undefined" &&
          createPortal(
            <div
              style={{
                position: "fixed",
                top: dropRect.top,
                left: dropRect.left,
                width: dropRect.width,
                zIndex: 9999,
              }}
              className="max-h-72 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500 italic">
                  Aucune entreprise trouvée. Tapez le nom complet pour la
                  créer.
                </div>
              ) : (
                <ul>
                  {filtered.map((c) => {
                    const cpVille = [c.postal_code, c.city]
                      .filter(Boolean)
                      .join(" ");
                    return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => pick(c)}
                        className="w-full text-left px-3 py-2 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 border-b border-slate-100 dark:border-slate-800 last:border-0 text-sm flex items-center gap-2"
                      >
                        <span className="font-medium truncate">{c.name}</span>
                        {cpVille && (
                          <span className="text-[11px] text-slate-500 ml-auto whitespace-nowrap">
                            {cpVille}
                          </span>
                        )}
                      </button>
                    </li>
                    );
                  })}
                </ul>
              )}
              {/* Bouton "Créer nouveau" */}
              {query.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => startCreating(query.trim())}
                  className="w-full text-left px-3 py-2.5 border-t border-slate-200 dark:border-slate-700 bg-cyan-50 dark:bg-cyan-950/30 hover:bg-cyan-100 dark:hover:bg-cyan-950/50 text-cyan-800 dark:text-cyan-300 font-semibold text-xs inline-flex items-center gap-1.5"
                >
                  <span className="text-lg leading-none">+</span>
                  Créer « {query.trim()} » comme nouvelle entreprise
                </button>
              )}
            </div>,
            document.body,
          )}
      </div>

      {/* Panneau de création inline */}
      {isCreating && (
        <div className="rounded-md bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-cyan-800 dark:text-cyan-300 inline-flex items-center gap-1.5">
              <span className="text-base leading-none">+</span>
              <span>
                <strong>{newName}</strong> sera créée dans le module Entreprises
              </span>
              {legalStatus && (
                <span
                  className={cn(
                    "inline-block px-1.5 py-0.5 rounded text-[10px] font-bold",
                    SIRENE_STATUS_BADGE_CLASSES[legalStatus],
                  )}
                >
                  {SIRENE_STATUS_LABELS[legalStatus]}
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={cancelCreating}
              className="text-cyan-600 hover:text-red-600 underline text-[11px]"
            >
              Annuler
            </button>
          </div>

          {/* Auto-remplissage SIRENE */}
          <SireneLookup
            compact
            initialQuery={newName}
            onPick={(c) => {
              setNewName(c.name);
              setSiret(c.siret ?? "");
              setSiren(c.siren);
              setLegalForm(c.legal_form ?? "");
              setIndustry(c.industry ?? c.naf_code ?? "");
              setNafCode(c.naf_code ?? "");
              setAddress(c.address ?? "");
              setPostalCode(c.postal_code ?? "");
              setCity(c.city ?? "");
              setLegalStatus(c.legal_status);
              setPappersUrl(c.pappers_url);
            }}
          />

          <p className="text-[11px] text-slate-600 italic">
            Renseignez (ou ajustez) les informations légales :
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700">
                SIRET
              </label>
              <input
                value={siret}
                onChange={(e) => setSiret(e.target.value)}
                placeholder="14 chiffres"
                className="flex h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700">
                Adresse
              </label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="N°, rue, complément…"
                className="flex h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
              />
            </div>
            <div className="md:col-span-2">
              <PostalCodeCity
                postalCodeName="new_company_postal_code"
                cityName="new_company_city"
                postalCodeValue={postalCode}
                cityValue={city}
                onPostalCodeChange={setPostalCode}
                onCityChange={setCity}
                size="sm"
                showLabels={false}
                gridClassName="grid gap-2 grid-cols-[1fr_3fr]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
