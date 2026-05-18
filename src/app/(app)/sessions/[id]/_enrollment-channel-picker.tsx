"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";
import { updateEnrollmentChannel } from "./enrollments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  INSCRIPTION_CHANNEL_BADGE_CLASSES,
  INSCRIPTION_CHANNEL_LABELS,
  type InscriptionChannel,
} from "@/lib/sessions/types";

type CompanyOption = { id: string; name: string; type: string | null };

type Props = {
  sessionId: string;
  enrollmentId: string;
  channel: InscriptionChannel;
  companyId: string | null;
  companyName: string | null;
  /** Liste des entreprises pour le sélecteur (datalist auto-complete). */
  companies: CompanyOption[];
};

/**
 * Petit picker permettant de qualifier le canal d'inscription d'un
 * apprenant sur une session : direct (CAP NUMERIQUE), via prescripteur,
 * ou via OF. En cas de prescripteur/OF, l'entreprise est obligatoire.
 *
 * Affichage compact : un badge cliquable. Au clic → dropdown avec radio
 * + sélecteur d'entreprise + bouton Enregistrer.
 */
export function EnrollmentChannelPicker({
  sessionId,
  enrollmentId,
  channel,
  companyId,
  companyName,
  companies,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  }>({ top: 0, left: 0 });

  const [selChannel, setSelChannel] = useState<InscriptionChannel>(channel);
  const [selCompanyName, setSelCompanyName] = useState<string>(
    companyName ?? "",
  );

  // Marqueur "monte cote client" pour autoriser createPortal (SSR safe)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calcule (et recalcule) la position du dropdown selon le trigger.
  // Largeur fixe 320px (w-80) ancree a droite du trigger.
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

  // Fermeture sur clic exterieur (en tenant compte du dropdown porte)
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

  // Liste filtrée selon le canal sélectionné :
  //   - prescripteur → uniquement les entreprises de type "prescripteur"
  //   - of           → uniquement les entreprises de type "of"
  //   - direct       → aucune (le datalist n'est pas affiché)
  const filteredCompanies = companies.filter((c) => {
    if (selChannel === "prescripteur") return c.type === "prescripteur";
    if (selChannel === "of") return c.type === "of";
    return false;
  });

  function handleSave() {
    setError(null);
    if (selChannel !== "direct" && !selCompanyName.trim()) {
      setError("Sélectionnez l'entreprise (prescripteur ou OF).");
      return;
    }
    // Match du nom saisi avec une entreprise EXISTANTE et du BON TYPE.
    const matched = filteredCompanies.find(
      (c) =>
        c.name.toLowerCase().trim() ===
        selCompanyName.toLowerCase().trim(),
    );
    if (selChannel !== "direct" && !matched) {
      const typeLabel =
        selChannel === "prescripteur" ? "prescripteur" : "OF";
      setError(
        `Entreprise introuvable parmi vos ${typeLabel}s. Vérifiez le nom ou créez la fiche dans Entreprises avec le bon type.`,
      );
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.append("inscription_channel", selChannel);
      if (selChannel !== "direct" && matched) {
        fd.append("inscription_channel_company_id", matched.id);
      }
      const res = await updateEnrollmentChannel(sessionId, enrollmentId, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      setOpen(false);
    });
  }

  // Affichage compact du canal courant
  const badgeLabel =
    channel === "direct"
      ? "CAP NUM."
      : channel === "prescripteur"
        ? `Prescr.${companyName ? " · " + companyName : ""}`
        : `OF${companyName ? " · " + companyName : ""}`;

  // État incomplet : prescripteur/OF mais sans entreprise référencée
  const isIncomplete = channel !== "direct" && !companyId;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Canal : ${INSCRIPTION_CHANNEL_LABELS[channel]}${companyName ? " · " + companyName : ""}`}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-bold border transition-colors",
          isIncomplete
            ? "bg-red-50 text-red-700 border-red-300 hover:bg-red-100 animate-pulse"
            : INSCRIPTION_CHANNEL_BADGE_CLASSES[channel],
          "hover:opacity-90",
        )}
      >
        {channel !== "direct" && <Building2 className="h-3 w-3" />}
        <span className="truncate max-w-[160px]">{badgeLabel}</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {/* Dropdown rendu en portail dans document.body pour echapper a
          tous les overflow / stacking-context des parents. */}
      {mounted && open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] w-80 rounded-lg border border-slate-200 bg-white shadow-2xl p-3 space-y-3"
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
          >
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Canal d&apos;inscription de cet apprenant
          </p>

          <div className="space-y-1.5">
            {(
              ["direct", "prescripteur", "of"] as InscriptionChannel[]
            ).map((ch) => (
              <label
                key={ch}
                className={cn(
                  "flex items-start gap-2 text-xs cursor-pointer rounded-md border p-2 transition-colors",
                  selChannel === ch
                    ? "border-cyan-400 bg-cyan-50"
                    : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <input
                  type="radio"
                  name={`channel-${enrollmentId}`}
                  value={ch}
                  checked={selChannel === ch}
                  onChange={() => setSelChannel(ch)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <span className="font-bold">
                    {INSCRIPTION_CHANNEL_LABELS[ch]}
                  </span>
                  {ch === "direct" && (
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Apprenant inscrit directement par CAP NUMERIQUE
                      (acquisition propre).
                    </p>
                  )}
                  {ch === "prescripteur" && (
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Apprenant apporté par un prescripteur (OPCO,
                      partenaire commercial…).
                    </p>
                  )}
                  {ch === "of" && (
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Apprenant apporté par un autre OF (sous-traitance
                      entrante).
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>

          {selChannel !== "direct" && (
            <div className="space-y-1">
              <Label className="text-[11px]">
                {selChannel === "prescripteur"
                  ? "Prescripteur "
                  : "Organisme de formation "}
                <span className="text-red-600 font-bold">*</span>
              </Label>
              <Input
                list={`channel-companies-${enrollmentId}`}
                value={selCompanyName}
                onChange={(e) => setSelCompanyName(e.target.value)}
                placeholder={
                  selChannel === "prescripteur"
                    ? "Tapez le nom du prescripteur…"
                    : "Tapez le nom de l'OF…"
                }
                className="h-8 text-xs"
              />
              <datalist id={`channel-companies-${enrollmentId}`}>
                {filteredCompanies.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
              {filteredCompanies.length === 0 ? (
                <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  Aucune entreprise enregistrée avec le type «{" "}
                  {selChannel === "prescripteur" ? "Prescripteur" : "OF"} ».
                  Crée d&apos;abord la fiche dans <strong>Entreprises</strong>{" "}
                  en cochant ce type.
                </p>
              ) : (
                <p className="text-[10px] text-slate-400">
                  {filteredCompanies.length}{" "}
                  {selChannel === "prescripteur" ? "prescripteur" : "OF"}
                  {filteredCompanies.length > 1 ? "s" : ""} enregistré
                  {filteredCompanies.length > 1 ? "s" : ""}.
                </p>
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
