"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ExternalLink,
  Loader2,
  Mail,
  Phone,
  Smartphone,
  UserCog,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setInscriptionReferents } from "./actions";

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  job_title: string | null;
  role: string | null;
};

type Props = {
  inscriptionId: string;
  companyId: string | null;
  companyName: string | null;
  /** Tous les contacts entreprise de la société liée à l'apprenant.
   *  Si tableau vide ET société présente → on affiche un message
   *  invitant l'utilisateur à créer des contacts dans la fiche entreprise. */
  contacts: Contact[];
  /** Liste actuelle des contact_ids déjà rattachés comme référents
   *  (préselection des cases à cocher). */
  selectedContactIds: string[];
};

/**
 * Picker multi-sélection pour rattacher des "référents pédagogiques"
 * à une inscription. Les référents sélectionnés recevront en CC les
 * emails de confirmation, convocation, convention et attestation.
 *
 * Règle métier R6 : un référent est forcément un contact entreprise
 * de la société liée à l'apprenant. Pour les particuliers (pas de
 * société), le composant n'est pas rendu (cf. parent).
 */
export function ReferentPicker({
  inscriptionId,
  companyId,
  companyName,
  contacts,
  selectedContactIds,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(selectedContactIds),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function toggle(contactId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await setInscriptionReferents(
        inscriptionId,
        Array.from(selected),
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  if (contacts.length === 0) {
    return (
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
        <p className="text-xs text-amber-900">
          <strong>
            Aucun contact dans la fiche de {companyName ?? "la société"}.
          </strong>{" "}
          Pour pouvoir rattacher un référent pédagogique, ajoutez
          d&apos;abord des contacts dans la fiche entreprise (bloc
          « Contacts entreprise »).
        </p>
        {companyId && (
          <Link
            href={`/entreprises/${companyId}#contacts-entreprise`}
            target="_blank"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-800 hover:text-amber-900 hover:underline"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Ajouter un contact à {companyName ?? "cette société"}
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Les référents sélectionnés recevront en <strong>copie (CC)</strong> les
        emails liés à cet apprenant : confirmation d&apos;inscription,
        convocation, convention de formation, attestation de réalisation.
      </p>
      <ul className="space-y-1.5">
        {contacts.map((c) => {
          const isOn = selected.has(c.id);
          const fullName =
            [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
            "Contact sans nom";
          return (
            <li key={c.id}>
              <label
                className={cn(
                  "flex items-start gap-2.5 p-2 rounded-md border cursor-pointer transition-colors",
                  isOn
                    ? "border-cyan-400 bg-cyan-50 dark:bg-cyan-950/30 dark:border-cyan-800"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/40",
                )}
              >
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => toggle(c.id)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-600 focus-visible:ring-cyan-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold inline-flex items-center gap-1.5">
                    <UserCog className="h-3.5 w-3.5 text-cyan-700" />
                    {fullName}
                    {c.role && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wider">
                        {c.role}
                      </span>
                    )}
                  </p>
                  {c.job_title && (
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {c.job_title}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {c.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {c.email}
                      </span>
                    )}
                    {c.mobile && (
                      <span className="inline-flex items-center gap-1">
                        <Smartphone className="h-3 w-3" />
                        {c.mobile}
                      </span>
                    )}
                    {!c.mobile && c.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {c.phone}
                      </span>
                    )}
                  </p>
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      {/* Lien rapide pour ajouter d'autres contacts à la société —
          permet de sortir d'ici et d'aller enrichir la fiche entreprise
          sans perdre le contexte (ouverture nouvel onglet). */}
      {companyId && (
        <Link
          href={`/entreprises/${companyId}#contacts-entreprise`}
          target="_blank"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-cyan-700 hover:text-cyan-900 hover:underline"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Ajouter un autre contact à {companyName ?? "cette société"}
          <ExternalLink className="h-3 w-3" />
        </Link>
      )}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-[11px] text-slate-500">
          {selected.size === 0
            ? "Aucun référent sélectionné"
            : `${selected.size} référent${selected.size > 1 ? "s" : ""} sélectionné${selected.size > 1 ? "s" : ""}`}
        </p>
        <div className="flex items-center gap-2">
          {savedAt && !pending && (
            <span className="text-[11px] text-emerald-700 font-medium inline-flex items-center gap-1">
              <Check className="h-3 w-3" />
              Enregistré
            </span>
          )}
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}
