"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  FileUp,
  Loader2,
  Wallet,
} from "lucide-react";
import { updateEnrollmentFinancing } from "./enrollments/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FINANCING_MODE_LABELS } from "@/lib/inscriptions/types";

type OpcoAgreement = {
  id: string;
  opco_name: string;
  dossier_number: string | null;
};

type Props = {
  sessionId: string;
  enrollmentId: string;
  /** Mode actuel de financement (provient de la inscription_request liée). */
  currentMode: string | null;
  /** ID de l'accord OPCO actuellement lié (si mode = opco). */
  currentOpcoAgreementId: string | null;
  /** Nom de l'OPCO de l'accord lié (Constructys, OCAPIAT, etc.). Affiché
   *  sur le badge à la place du libellé générique "OPCO" pour donner
   *  l'info en un coup d'œil. */
  currentOpcoName?: string | null;
  /** Numéro de dossier OPCO. Affiché en ligne secondaire sous le nom
   *  pour faciliter la communication avec le financeur. */
  currentOpcoDossierNumber?: string | null;
  /** Liste des accords OPCO existants pour l'organisation. */
  opcoAgreements: OpcoAgreement[];
  /** ID de la inscription_request miroir liée à l'enrollment. Utilisé
   *  pour le lien « + Créer un nouvel accord » qui ouvre la fiche
   *  d'inscription complète avec la modale d'upload PDF + OCR. */
  inscriptionRequestId: string | null;
  /** True si l'enrollment n'a pas de inscription_request liée (rare —
   *  cas où la sync n'a pas pu lier). On désactive alors le picker. */
  disabled?: boolean;
};

const MODE_ORDER: Array<{ value: string; short: string }> = [
  { value: "autofinancement", short: "AUTOFINANCEMENT" },
  { value: "opco", short: "OPCO" },
  { value: "cpf", short: "CPF" },
  { value: "employeur", short: "EMPLOYEUR" },
  { value: "france_travail", short: "FRANCE TRAVAIL" },
  { value: "aif", short: "AIF" },
  { value: "aide_region", short: "AIDE RÉGION" },
  { value: "fse", short: "FSE" },
  { value: "mixte", short: "MIXTE" },
  { value: "autre", short: "AUTRE" },
];

function badgeClassForMode(mode: string | null): string {
  switch (mode) {
    case "opco":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "cpf":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "employeur":
      return "bg-purple-50 text-purple-800 border-purple-200";
    case "france_travail":
      return "bg-red-50 text-red-800 border-red-200";
    case "autofinancement":
      return "bg-violet-50 text-violet-800 border-violet-200";
    case null:
      return "bg-slate-50 text-slate-500 border-slate-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-300";
  }
}

/**
 * Badge cliquable affichant le mode de financement courant. Au clic,
 * ouvre un dropdown (portail dans document.body — pattern de référence
 * cf. memory/feedback_dropdown_portal.md) permettant de :
 *   1. Changer le mode de financement
 *   2. Si OPCO sélectionné, rattacher un accord OPCO existant
 *
 * Modifie la inscription_request liée à l'enrollment (sync 2026-05-13).
 */
export function EnrollmentFinancingPicker({
  sessionId,
  enrollmentId,
  currentMode,
  currentOpcoAgreementId,
  currentOpcoName,
  currentOpcoDossierNumber,
  opcoAgreements,
  inscriptionRequestId,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const [selMode, setSelMode] = useState<string>(
    currentMode ?? "autofinancement",
  );
  const [selOpcoId, setSelOpcoId] = useState<string>(
    currentOpcoAgreementId ?? "",
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // Calcule la position du dropdown selon le trigger.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const DROPDOWN_WIDTH = 320;
      setPosition({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - DROPDOWN_WIDTH),
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

  // Fermeture sur clic extérieur (trigger + dropdown porté inclus).
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (dropdownRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function handleSave() {
    setError(null);
    if (selMode === "opco" && !selOpcoId.trim() && opcoAgreements.length > 0) {
      setError(
        "Sélectionnez l'accord OPCO concerné (ou choisissez un autre mode).",
      );
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.append("financing_mode", selMode);
      if (selMode === "opco" && selOpcoId) {
        fd.append("opco_agreement_id", selOpcoId);
      }
      const res = await updateEnrollmentFinancing(
        sessionId,
        enrollmentId,
        fd,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      setOpen(false);
    });
  }

  const currentLabel = currentMode
    ? (FINANCING_MODE_LABELS as Record<string, string>)[currentMode] ??
      currentMode.toUpperCase()
    : "—";
  // Pour le mode OPCO avec un accord lié, on affiche le NOM de l'OPCO
  // (Constructys, OCAPIAT…) plutôt que le libellé générique "OPCO" —
  // info bien plus utile pour suivre les dossiers d'un coup d'œil.
  const currentBadge =
    currentMode === "opco" && currentOpcoName
      ? currentOpcoName.toUpperCase()
      : MODE_ORDER.find((m) => m.value === currentMode)?.short
        ?? currentLabel.toUpperCase();
  const showDossier =
    currentMode === "opco" && Boolean(currentOpcoDossierNumber);
  // Title (tooltip) enrichi avec le n° de dossier OPCO si disponible
  const tooltipText = disabled
    ? "Aucune fiche d'inscription liée — modifiable depuis la fiche."
    : currentMode === "opco" && currentOpcoName
      ? `OPCO ${currentOpcoName}${currentOpcoDossierNumber ? ` · Dossier ${currentOpcoDossierNumber}` : ""}. Cliquez pour modifier.`
      : `Mode de financement actuel : ${currentLabel}. Cliquez pour modifier.`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        title={tooltipText}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider transition-colors",
          badgeClassForMode(currentMode),
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:opacity-90 cursor-pointer",
        )}
      >
        <Wallet className="h-3 w-3 shrink-0" />
        <span className="flex flex-col items-start leading-tight">
          <span className="truncate max-w-[160px]">{currentBadge}</span>
          {showDossier && (
            <span className="text-[10px] font-semibold opacity-90 normal-case tracking-normal truncate max-w-[160px]">
              N° {currentOpcoDossierNumber}
            </span>
          )}
        </span>
        {!disabled && <ChevronDown className="h-3 w-3 shrink-0" />}
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] w-80 rounded-lg border border-slate-200 bg-white shadow-2xl p-3 space-y-3"
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Mode de financement
            </p>

            <div className="space-y-1">
              <select
                value={selMode}
                onChange={(e) => setSelMode(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-300 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                {MODE_ORDER.map((m) => (
                  <option key={m.value} value={m.value}>
                    {(FINANCING_MODE_LABELS as Record<string, string>)[
                      m.value
                    ] ?? m.value}
                  </option>
                ))}
              </select>
            </div>

            {selMode === "opco" && (
              <div className="space-y-1.5">
                <Label className="text-[11px]">
                  Accord OPCO concerné{" "}
                  {opcoAgreements.length > 0 && (
                    <span className="text-red-600 font-bold">*</span>
                  )}
                </Label>
                {opcoAgreements.length === 0 ? (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                    Aucun accord OPCO enregistré pour l&apos;organisation.
                    Crée le 1ᵉʳ accord ci-dessous (upload PDF + OCR
                    automatique).
                  </p>
                ) : (
                  <select
                    value={selOpcoId}
                    onChange={(e) => setSelOpcoId(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-300 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    <option value="">— Sélectionner un accord —</option>
                    {opcoAgreements.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.opco_name}
                        {a.dossier_number ? ` · ${a.dossier_number}` : ""}
                      </option>
                    ))}
                  </select>
                )}

                {/* Lien direct vers la fiche d'inscription avec ouverture
                    automatique de la modale d'upload PDF + OCR. Permet
                    de créer un nouvel accord sans quitter le flow en
                    cours (Participants → fiche → upload → retour). */}
                {inscriptionRequestId && (
                  <Link
                    href={`/inscriptions/${inscriptionRequestId}?openOpcoModal=1&return_to=participants&session_id=${sessionId}`}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-violet-700 hover:text-violet-900 hover:underline mt-1"
                    title="Ouvre la fiche d'inscription avec la modale d'upload PDF + OCR automatique"
                  >
                    <FileUp className="h-3.5 w-3.5" />
                    + Créer un nouvel accord (PDF + OCR)
                  </Link>
                )}
              </div>
            )}

            {error && (
              <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Annuler
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={pending}
              >
                {pending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                Enregistrer
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
