"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2, Search, Sparkles, UserPlus, Users, X } from "lucide-react";
import { searchSireneAction } from "@/lib/sirene/actions";
import {
  SIRENE_STATUS_BADGE_CLASSES,
  type SireneCompany,
} from "@/lib/sirene/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Mappe la qualité du dirigeant (texte libre INSEE/INPI) vers un rôle
 * de contact dans notre référentiel. Tous les dirigeants reconnus
 * sont rattachés au rôle "direction" par défaut.
 */
function mapDirigeantToRole(): "direction" {
  return "direction";
}

/**
 * Widget de recherche INSEE Sirene placé en haut du formulaire entreprise.
 *
 * - Recherche par raison sociale, SIRET ou SIREN.
 * - Renvoie jusqu'à 10 résultats avec état (active/cessée/procédure).
 * - Sur sélection : par défaut auto-remplissage des champs du formulaire
 *   parent via leurs `id` (name, legal_form, siret, siren, industry,
 *   naf_code, address, postal_code, city, legal_status, pappers_url).
 *   Si un callback `onPick` est fourni, on l'appelle à la place pour que
 *   le parent gère lui-même l'application des données (utile dans un
 *   formulaire React contrôlé).
 *
 * Variante compacte (`compact`) : style plus discret pour s'intégrer dans
 * un panneau secondaire (inscription, etc.).
 */
export function SireneLookup({
  initialQuery = "",
  onPick,
  compact = false,
}: {
  initialQuery?: string;
  onPick?: (company: SireneCompany) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SireneCompany[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<SireneCompany | null>(null);
  const [isPending, startTransition] = useTransition();
  // Suivi des dirigeants déjà ajoutés comme contacts (clé = index dans
  // la liste des dirigeants du dernier `picked`).
  const [addedDirectors, setAddedDirectors] = useState<Set<number>>(
    new Set(),
  );
  // Vrai si un ContactsBuilder est monté quelque part dans la page :
  // dans ce cas on affiche le bouton "Ajouter aux contacts".
  const [contactsBuilderReady, setContactsBuilderReady] = useState(false);

  useEffect(() => {
    function onReady() {
      setContactsBuilderReady(true);
    }
    window.addEventListener("sirene:contacts-builder-ready", onReady);
    // Au cas où le ContactsBuilder se monte avant nous, on émet une
    // demande de signalement à laquelle il pourrait répondre.
    window.dispatchEvent(new CustomEvent("sirene:ping-contacts-builder"));
    return () => {
      window.removeEventListener("sirene:contacts-builder-ready", onReady);
    };
  }, []);

  function addDirectorToContacts(
    d: SireneCompany["directors"][number],
    idx: number,
  ) {
    window.dispatchEvent(
      new CustomEvent("sirene:add-director", {
        detail: {
          first_name: d.first_name ?? "",
          last_name: d.last_name ?? "",
          job_title: d.role ?? "",
          role: mapDirigeantToRole(),
        },
      }),
    );
    setAddedDirectors((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  }

  function runSearch(q: string) {
    setError(null);
    setPicked(null);
    if (q.trim().length < 3) {
      setError("Saisissez au moins 3 caractères.");
      setResults(null);
      return;
    }
    startTransition(async () => {
      const res = await searchSireneAction(q);
      if (!res.ok) {
        setError(res.error);
        setResults(null);
        return;
      }
      setResults(res.results);
      if (res.results.length === 0) {
        setError("Aucune entreprise trouvée.");
      }
    });
  }

  function applyToForm(c: SireneCompany) {
    setPicked(c);
    setResults(null);
    setAddedDirectors(new Set()); // Reset à chaque nouvelle sélection
    // Mode 1 : callback parent (formulaire React contrôlé)
    if (onPick) {
      onPick(c);
      return;
    }
    // Mode 2 : on patche directement les inputs du formulaire parent
    // via leurs `id` (mode DOM, formulaire non contrôlé).
    const setValue = (id: string, value: string | null) => {
      const el = document.getElementById(id) as
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement
        | null;
      if (!el) return;
      el.value = value ?? "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };

    setValue("name", c.name);
    setValue("legal_form", c.legal_form);
    setValue("siret", c.siret);
    setValue("siren", c.siren);
    setValue("industry", c.industry ?? c.naf_code);
    setValue("naf_code", c.naf_code);
    setValue("address", c.address);
    setValue("postal_code", c.postal_code);
    setValue("city", c.city);
    setValue("legal_status", c.legal_status);
    setValue("pappers_url", c.pappers_url);
  }

  return (
    <div
      className={cn(
        "rounded-lg border space-y-3",
        compact
          ? "bg-cyan-50 border-cyan-200 p-3"
          : "bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-200 p-4",
      )}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 text-cyan-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "font-bold text-cyan-900",
              compact ? "text-xs" : "text-sm",
            )}
          >
            Auto-remplissage INSEE Sirene
          </p>
          {!compact && (
            <p className="text-xs text-cyan-700">
              Saisissez une raison sociale, un SIREN ou un SIRET. Les données
              officielles (forme juridique, adresse, dirigeants, état) sont
              récupérées gratuitement auprès du registre national.
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          type="search"
          placeholder="Ex : CAP NUMERIQUE, 504123456, ou un SIRET 14 chiffres…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch(query);
            }
          }}
          className="bg-white"
        />
        <Button
          type="button"
          onClick={() => runSearch(query)}
          disabled={isPending}
          size="sm"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Rechercher
        </Button>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {error}
        </p>
      )}

      {/* Liste des résultats */}
      {results && results.length > 0 && (
        <ul className="space-y-1.5 max-h-72 overflow-y-auto">
          {results.map((c) => (
            <li key={c.siren}>
              <button
                type="button"
                onClick={() => applyToForm(c)}
                className="w-full text-left rounded-md bg-white border border-slate-200 hover:border-cyan-400 hover:shadow-sm px-3 py-2 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      SIREN {c.siren}
                      {c.legal_form && ` · ${c.legal_form}`}
                      {c.city && ` · ${c.city}`}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-block px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap",
                      SIRENE_STATUS_BADGE_CLASSES[c.legal_status],
                    )}
                  >
                    {c.legal_status_label}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Résumé de la sélection */}
      {picked && (
        <div className="rounded-md bg-white border border-emerald-300 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm inline-flex items-center gap-2">
                {picked.name}
                <span
                  className={cn(
                    "inline-block px-1.5 py-0.5 rounded text-[10px] font-bold",
                    SIRENE_STATUS_BADGE_CLASSES[picked.legal_status],
                  )}
                >
                  {picked.legal_status_label}
                </span>
              </p>
              <p className="text-[11px] text-slate-500">
                Données importées dans le formulaire ci-dessous. Vous pouvez
                ajuster avant d&apos;enregistrer.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="text-slate-400 hover:text-slate-600"
              title="Masquer ce résumé"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {picked.directors.length > 0 && (
            <div className="border-t border-slate-100 pt-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1.5">
                <Users className="h-3 w-3" />
                Dirigeants identifiés ({picked.directors.length})
              </p>
              <ul className="mt-1.5 space-y-1">
                {picked.directors.map((d, i) => {
                  const added = addedDirectors.has(i);
                  // Une personne morale n'a pas de prénom — on ne propose
                  // pas de l'ajouter comme contact (incohérent).
                  const isPersonneMorale = !d.first_name && d.last_name;
                  return (
                    <li
                      key={i}
                      className="text-xs text-slate-700 flex items-center justify-between gap-2 bg-slate-50 rounded px-2 py-1"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-medium truncate">
                          {[d.first_name, d.last_name]
                            .filter(Boolean)
                            .join(" ")}
                        </span>
                        {d.role && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-bold whitespace-nowrap">
                            {d.role}
                          </span>
                        )}
                      </div>
                      {!compact &&
                        contactsBuilderReady &&
                        !isPersonneMorale &&
                        (added ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 whitespace-nowrap">
                            <Check className="h-3 w-3" />
                            Ajouté aux contacts
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addDirectorToContacts(d, i)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-700 bg-cyan-50 border border-cyan-300 hover:bg-cyan-100 rounded px-1.5 py-0.5 whitespace-nowrap transition-colors"
                            title="Ajouter ce dirigeant comme contact de l'entreprise"
                          >
                            <UserPlus className="h-3 w-3" />
                            + Aux contacts
                          </button>
                        ))}
                    </li>
                  );
                })}
              </ul>
              {!compact && !contactsBuilderReady && (
                <p className="text-[10px] text-slate-400 italic mt-1">
                  Ajoutez-les manuellement dans la section &laquo; Contacts &raquo;
                  si souhaité.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
