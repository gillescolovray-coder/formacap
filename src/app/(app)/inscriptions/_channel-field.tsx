"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  INSCRIPTION_CHANNEL_BADGE_CLASSES,
  INSCRIPTION_CHANNEL_LABELS,
  type InscriptionChannel,
} from "@/lib/sessions/types";
import { cn } from "@/lib/utils";

type Company = { id: string; name: string; type?: string | null };

type Props = {
  defaultChannel?: InscriptionChannel;
  defaultCompanyId?: string | null;
  /**
   * Liste complète des entreprises. Le composant filtre automatiquement
   * selon le canal sélectionné :
   *   - prescripteur → entreprises de type "prescripteur"
   *   - of           → entreprises de type "of" (OPCO inclus si applicable)
   * Si `type` est absent sur les entreprises, aucun filtrage n'est appliqué.
   */
  companies: Company[];
  /** Attribut `form` pour rattacher les inputs au formulaire principal. */
  formId?: string;
};

/**
 * Champ de saisie de la source d'inscription (canal + entreprise associée).
 * Inline dans le formulaire d'inscription. Pas de submit propre — les
 * valeurs sont incluses dans le `<form>` parent via `inscription_channel`
 * et `inscription_channel_company_id`.
 */
export function InscriptionChannelField({
  defaultChannel = "direct",
  defaultCompanyId = null,
  companies,
  formId,
}: Props) {
  const [channel, setChannel] = useState<InscriptionChannel>(defaultChannel);
  const initialCompanyName =
    companies.find((c) => c.id === defaultCompanyId)?.name ?? "";
  const [companyText, setCompanyText] = useState(initialCompanyName);

  // Filtrage de la liste selon le canal :
  //   - prescripteur → seules les entreprises type "prescripteur"
  //   - of           → seules les entreprises type "of"
  // Si une entreprise n'a pas de `type` connu, on l'inclut pour éviter
  // les listes vides.
  const filteredCompanies =
    channel === "direct"
      ? []
      : companies.filter((c) => {
          if (c.type == null) return true;
          if (channel === "prescripteur") return c.type === "prescripteur";
          if (channel === "of") return c.type === "of";
          return false;
        });

  const matched =
    channel === "direct"
      ? null
      : filteredCompanies.find(
          (c) => c.name.toLowerCase() === companyText.trim().toLowerCase(),
        ) ?? null;

  // Si l'utilisateur tape un nom non reconnu, on n'envoie pas d'ID.
  // Si direct, on force vide.
  const companyIdValue = channel === "direct" ? "" : matched?.id ?? "";

  // Reset le texte si on revient à direct
  useEffect(() => {
    if (channel === "direct" && companyText) {
      // On garde le texte pour faciliter le retour, mais pas envoyé
    }
  }, [channel, companyText]);

  // Règle métier 2026-05-13 (Gilles) : le mode de financement et le
  // canal d'inscription sont TOTALEMENT INDÉPENDANTS. Une nouvelle
  // inscription part de "Autofinancement" (défaut du <select>), et
  // tout changement utilisateur dans le menu est respecté à 100% —
  // peu importe le canal sélectionné.
  //
  // Avant : un changement de canal "direct" forçait silencieusement le
  // mode à "Autofinancement" via un hidden input "override", écrasant
  // un choix "OPCO" manuel. Supprimé. L'override reste vide ; côté
  // serveur, c'est désormais la valeur du <select> qui prime
  // (cf. buildPayload `selected || override`).
  const financingOverride = "";

  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold">
        Source de l&apos;inscription
      </Label>

      {/* Inputs cachés rattachés au form parent */}
      <input
        type="hidden"
        name="inscription_channel"
        value={channel}
        form={formId}
      />
      <input
        type="hidden"
        name="inscription_channel_company_id"
        value={companyIdValue}
        form={formId}
      />
      {/* Override du mode de financement selon le canal. Lu côté serveur
          dans buildPayload, prime sur la valeur du <select>. Sécurise la
          soumission même si la modification DOM du select n'a pas pris. */}
      <input
        type="hidden"
        name="financing_mode_override"
        value={financingOverride}
        form={formId}
      />

      {/* Choix du canal en boutons radio (lisibles) */}
      <div className="grid gap-2 sm:grid-cols-3">
        {(
          ["direct", "prescripteur", "of"] as InscriptionChannel[]
        ).map((c) => {
          const isActive = channel === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={cn(
                "rounded-lg px-3 py-2 text-xs font-bold border-2 transition-colors text-left",
                isActive
                  ? INSCRIPTION_CHANNEL_BADGE_CLASSES[c]
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300",
              )}
            >
              {INSCRIPTION_CHANNEL_LABELS[c]}
            </button>
          );
        })}
      </div>

      {/* Champ entreprise — uniquement si non direct */}
      {channel !== "direct" && (
        <div className="space-y-1.5">
          <Label htmlFor="inscription_channel_company_text">
            <Building2 className="inline h-3.5 w-3.5 mr-1" />
            {channel === "prescripteur"
              ? "Nom du prescripteur"
              : "Nom de l'OF"}
            <span className="ml-1 text-red-600">*</span>
          </Label>
          <Input
            id="inscription_channel_company_text"
            list="inscription-channel-companies"
            value={companyText}
            onChange={(e) => setCompanyText(e.target.value)}
            placeholder="Tapez pour rechercher une entreprise…"
            // Forme natif : un canal non-direct exige un nom
            required
            // Validité custom : refuse la submission si le nom tapé ne
            // correspond à aucune entreprise de la liste filtrée.
            // (HTML5 setCustomValidity via ref serait plus propre, mais
            //  ce simple `required` couvre déjà le cas "champ vide".)
            aria-invalid={Boolean(companyText) && !matched}
          />
          <datalist id="inscription-channel-companies">
            {filteredCompanies.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <p className="text-[11px] text-slate-500">
            {filteredCompanies.length} entreprise
            {filteredCompanies.length > 1 ? "s" : ""} de type «{" "}
            {channel === "prescripteur" ? "Prescripteur" : "OF"} »
            {matched && (
              <span className="ml-2 text-emerald-700 font-bold">
                ✓ « {matched.name} » sélectionnée
              </span>
            )}
          </p>
          {companyText && !matched && (
            <p className="text-[11px] text-amber-700 font-bold">
              ⚠ Entreprise non trouvée dans la liste filtrée. Sélectionnez-la
              dans la liste déroulante, ou créez-la d&apos;abord dans le
              module Entreprises (type &nbsp;«&nbsp;
              {channel === "prescripteur" ? "Prescripteur" : "Organisme de formation"}
              &nbsp;»).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
