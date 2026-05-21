import {
  AtSign,
  Building2,
  ExternalLink,
  Landmark,
  MapPin,
  Phone,
  Tag,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/ui/phone-input";
import { CollapsibleSection } from "@/components/collapsible-section";
import type { Opco } from "@/lib/opcos/types";

/**
 * Formulaire d'ajout / édition d'un OPCO du référentiel.
 * Layout cohérent avec le module Entreprises : sections pliables, cartes
 * colorées par champ. (Gilles 2026-05-21)
 */
export function OpcoForm({ opco }: { opco?: Opco }) {
  return (
    <div className="space-y-4">
      {/* Identification */}
      <CollapsibleSection
        icon={Landmark}
        title="Identification"
        description="Nom et secteurs principaux de l'OPCO."
        accent="emerald"
        defaultOpen
        id="identite"
      >
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-3.5 space-y-2">
            <Label
              htmlFor="name"
              className="flex items-center gap-2 text-sm font-bold text-emerald-800"
            >
              <Landmark className="h-4 w-4" />
              Nom de l&apos;OPCO
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 ring-1 ring-red-200">
                * Obligatoire
              </span>
            </Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={opco?.name ?? ""}
              placeholder="Ex: AKTO, AFDAS, OPCO 2i…"
              className="bg-white font-semibold"
            />
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 space-y-2">
            <Label
              htmlFor="sectors"
              className="flex items-center gap-2 text-sm font-semibold text-blue-700"
            >
              <Tag className="h-4 w-4" />
              Secteurs principaux
            </Label>
            <Textarea
              id="sectors"
              name="sectors"
              defaultValue={opco?.sectors ?? ""}
              placeholder="Ex: Bâtiment, travaux publics, négoce matériaux…"
              rows={2}
              className="bg-white"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              id="is_active"
              name="is_active"
              type="checkbox"
              defaultChecked={opco ? opco.is_active : true}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <span className="text-zinc-700">OPCO actif (visible dans le formulaire d&apos;inscription)</span>
          </label>
        </div>
      </CollapsibleSection>

      {/* Portail web (PEC) — mis en avant, c'est le besoin principal */}
      <CollapsibleSection
        icon={ExternalLink}
        title="Portail Web (PEC)"
        description="Lien vers le portail en ligne où l'OF se connecte pour récupérer la prise en charge."
        accent="violet"
        defaultOpen
        id="portail"
      >
        <div className="space-y-2">
          <Label
            htmlFor="portal_url"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <ExternalLink className="h-4 w-4" />
            URL du portail
          </Label>
          <Input
            id="portal_url"
            name="portal_url"
            type="url"
            defaultValue={opco?.portal_url ?? ""}
            placeholder="https://www.akto.fr/"
          />
          <p className="text-[11px] text-slate-500">
            💡 Sur le formulaire d&apos;inscription, un bouton « Ouvrir le
            portail » apparaîtra à côté du nom OPCO sélectionné.
          </p>
        </div>
      </CollapsibleSection>

      {/* Adresse */}
      <CollapsibleSection
        icon={MapPin}
        title="Adresse nationale"
        description="Siège de l'OPCO."
        accent="rose"
        id="adresse"
      >
        <div className="space-y-2">
          <Label htmlFor="address">Adresse</Label>
          <Input
            id="address"
            name="address"
            defaultValue={opco?.address ?? ""}
            placeholder="Numéro, rue, code postal, ville…"
          />
        </div>
      </CollapsibleSection>

      {/* Contact */}
      <CollapsibleSection
        icon={Phone}
        title="Contact"
        description="Coordonnées générales de l'OPCO."
        accent="amber"
        id="contact"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone" className="inline-flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" /> Téléphone
            </Label>
            <PhoneInput
              id="phone"
              name="phone"
              defaultValue={opco?.phone ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="inline-flex items-center gap-1">
              <AtSign className="h-3.5 w-3.5" /> Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={opco?.email ?? ""}
              placeholder="contact@opco.fr"
            />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
