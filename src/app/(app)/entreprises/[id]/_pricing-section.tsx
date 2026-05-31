"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Euro, Handshake, Percent, Wrench } from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { Button } from "@/components/ui/button";
import {
  GeneralRateEditor,
  PricingEditor,
} from "./_partner-portal-section";
import {
  savePrescripteurCommission,
  saveSubcontractingRate,
} from "./partner-actions";

/**
 * Bloc unifie "Tarifs" — refonte 2026-05-31 (demande Gilles Q4).
 *
 * Regroupe 4 sous-sections selon le scenario metier :
 *  1. Tarif partenaire (CAS 2a OF / CAS 2b prescripteur)
 *  2. Tarifs negocies par formation (override)
 *  3. Tarif sous-traitance (CAS 3 — quand CAP sous-traite pour cet OF)
 *  4. Commission prescripteur (CAS 2b avec remuneration)
 *
 * Les sous-sections s'affichent CONDITIONNELLEMENT selon le type
 * d'entreprise (OF, prescripteur, client direct...) pour eviter
 * d'encombrer l'UI avec des champs non pertinents.
 */

type FormationOption = {
  id: string;
  title: string;
  duration_hours: number | null;
  duration_days: number | null;
  public_price_excl_tax: number | null;
};

type PricingRow = {
  formation_id: string;
  unit_price_ht: number;
  notes: string | null;
};

type Props = {
  companyId: string;
  companyType: "of" | "prescripteur" | "client" | "prospect" | "fournisseur" | string;
  // Tarif partenaire (cas 2a / 2b)
  dailyRateDistancielHt: number | null;
  dailyRatePresentielHt: number | null;
  quizUnitPriceHt: number | null;
  // Tarifs negocies par formation
  formations: FormationOption[];
  pricing: PricingRow[];
  // Tarif sous-traitance (cas 3, principalement OF)
  subcontractingDistancielHt: number | null;
  subcontractingPresentielHt: number | null;
  // Commission prescripteur (cas 2b)
  prescripteurCommissionRatePct: number | null;
  prescripteurCommissionFlatHt: number | null;
};

export function PricingSection(props: Props) {
  const isOf = props.companyType === "of";
  const isPrescripteur = props.companyType === "prescripteur";
  const isPartner = isOf || isPrescripteur;

  // Tarifs "partenaire" et "tarifs negocies par formation" sont
  // pertinents pour OF + prescripteur. La sous-traitance est
  // principalement pour les OF (mais on l'autorise pour tous les
  // types pour le cas ou une entreprise cliente serait aussi
  // sous-traitant). La commission prescripteur est uniquement
  // pour les prescripteurs.
  return (
    <CollapsibleSection
      icon={Euro}
      title="Tarifs"
      description="Toutes les conditions tarifaires de cette entreprise selon les scenarios metier : partenaire achete des places, prescripteur envoie un client, ou CAP sous-traite pour cet OF."
      accent="emerald"
      defaultOpen={false}
      id="tarifs"
    >
      <div className="space-y-6">
        {/* 1. Tarif partenaire (OF achete des places / Prescripteur
            envoie son client avec tarif negocie) */}
        {isPartner && (
          <SubBlock
            icon={<Handshake className="h-4 w-4 text-cyan-700" />}
            title="Tarif partenaire"
            subtitle={
              isOf
                ? "CAS 2a — Quand cet OF achete des places dans une session CAP. CAP facture l OF a ce tarif × duree × nb apprenants."
                : "CAS 2b — Quand ce prescripteur envoie un client. CAP facture le client final a ce tarif × duree × nb apprenants. Si vide -> tarif catalogue."
            }
          >
            <GeneralRateEditor
              companyId={props.companyId}
              companyType={isOf ? "of" : "prescripteur"}
              dailyRateDistancielHt={props.dailyRateDistancielHt}
              dailyRatePresentielHt={props.dailyRatePresentielHt}
              quizUnitPriceHt={props.quizUnitPriceHt}
            />
          </SubBlock>
        )}

        {/* 2. Tarifs negocies par formation (override) */}
        {isPartner && (
          <SubBlock
            icon={<Euro className="h-4 w-4 text-amber-600" />}
            title="Tarifs negocies par formation"
            subtitle="Override : surcharge le tarif general ci-dessus pour une formation precise."
          >
            <PricingEditor
              companyId={props.companyId}
              companyType={isOf ? "of" : "prescripteur"}
              formations={props.formations}
              pricing={props.pricing}
            />
          </SubBlock>
        )}

        {/* 3. Tarif sous-traitance (CAS 3 — uniquement pour OF en
            principe, mais on l'affiche aussi pour les autres pour
            ne pas bloquer un cas exceptionnel) */}
        <SubBlock
          icon={<Wrench className="h-4 w-4 text-orange-600" />}
          title="Tarif sous-traitance (CAS 3)"
          subtitle="Quand CAP NUMERIQUE est sous-traitant : forfait journalier HT independant du nb apprenants. Renseigner si cet OF nous confie regulierement des prestations."
        >
          <SubcontractingRateEditor
            companyId={props.companyId}
            distancielHt={props.subcontractingDistancielHt}
            presentielHt={props.subcontractingPresentielHt}
          />
        </SubBlock>

        {/* 4. Commission prescripteur (CAS 2b avec remuneration) */}
        {isPrescripteur && (
          <SubBlock
            icon={<Percent className="h-4 w-4 text-purple-600" />}
            title="Commission prescripteur (CAS 2b)"
            subtitle="Remuneration optionnelle versee a ce prescripteur. Pourcentage du CA et/ou forfait fixe par inscription."
          >
            <PrescripteurCommissionEditor
              companyId={props.companyId}
              ratePct={props.prescripteurCommissionRatePct}
              flatHt={props.prescripteurCommissionFlatHt}
            />
          </SubBlock>
        )}

        {!isPartner && (
          <p className="text-[11px] text-zinc-500 italic">
            Cette entreprise n est ni OF ni Prescripteur. Seul le tarif de
            sous-traitance est applicable (utile si CAP devient sous-traitant
            ponctuel pour elle). Pour activer les autres blocs, changez le
            type de l entreprise.
          </p>
        )}
      </div>
    </CollapsibleSection>
  );
}

function SubBlock({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20 p-3 sm:p-4">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
          {icon}
          {title}
        </h3>
        <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

// ============================================================
// CAS 3 — Editeur tarif sous-traitance
// ============================================================
function SubcontractingRateEditor({
  companyId,
  distancielHt,
  presentielHt,
}: {
  companyId: string;
  distancielHt: number | null;
  presentielHt: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [d, setD] = useState<string>(
    distancielHt !== null ? String(distancielHt) : "",
  );
  const [p, setP] = useState<string>(
    presentielHt !== null ? String(presentielHt) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function parse(raw: string): number | null | "invalid" {
    const t = raw.trim();
    if (t === "") return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return "invalid";
    return n;
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const dn = parse(d);
      const pn = parse(p);
      if (dn === "invalid" || pn === "invalid") {
        setError("Tarif invalide (nombre positif attendu).");
        return;
      }
      const res = await saveSubcontractingRate(companyId, {
        distancielHt: dn,
        presentielHt: pn,
      });
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-cyan-200 bg-cyan-50/30 p-3">
          <label
            htmlFor={`sub-distanciel-${companyId}`}
            className="block text-[11px] uppercase tracking-wider font-bold text-cyan-700 mb-1"
          >
            Forfait jour DISTANCIEL
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`sub-distanciel-${companyId}`}
              type="number"
              step="0.01"
              min="0"
              value={d}
              onChange={(e) => setD(e.target.value)}
              placeholder="ex : 600"
              className="h-9 w-32 rounded-md border border-zinc-300 bg-white px-2 text-sm tabular-nums"
            />
            <span className="text-xs text-zinc-500 font-medium">€ HT / jour</span>
          </div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-3">
          <label
            htmlFor={`sub-presentiel-${companyId}`}
            className="block text-[11px] uppercase tracking-wider font-bold text-emerald-700 mb-1"
          >
            Forfait jour PRÉSENTIEL
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`sub-presentiel-${companyId}`}
              type="number"
              step="0.01"
              min="0"
              value={p}
              onChange={(e) => setP(e.target.value)}
              placeholder="ex : 800"
              className="h-9 w-32 rounded-md border border-zinc-300 bg-white px-2 text-sm tabular-nums"
            />
            <span className="text-xs text-zinc-500 font-medium">€ HT / jour</span>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-zinc-500 italic">
        Forfait independant du nombre d apprenants (1 fois pour TOUTE la
        session). Pour activer ce tarif sur une session : cocher
        &quot;Session sous-traitee&quot; sur la fiche session et selectionner
        cet OF.
      </p>
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {saved ? "Enregistré" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// CAS 2b — Commission prescripteur
// ============================================================
function PrescripteurCommissionEditor({
  companyId,
  ratePct,
  flatHt,
}: {
  companyId: string;
  ratePct: number | null;
  flatHt: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [r, setR] = useState<string>(ratePct !== null ? String(ratePct) : "");
  const [f, setF] = useState<string>(flatHt !== null ? String(flatHt) : "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function parsePct(raw: string): number | null | "invalid" {
    const t = raw.trim();
    if (t === "") return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > 100) return "invalid";
    return n;
  }
  function parseFlat(raw: string): number | null | "invalid" {
    const t = raw.trim();
    if (t === "") return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return "invalid";
    return n;
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const rn = parsePct(r);
      const fn = parseFlat(f);
      if (rn === "invalid") {
        setError("Pourcentage invalide (0 à 100).");
        return;
      }
      if (fn === "invalid") {
        setError("Forfait invalide (nombre positif).");
        return;
      }
      const res = await savePrescripteurCommission(companyId, {
        ratePct: rn,
        flatHt: fn,
      });
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-purple-200 bg-purple-50/30 p-3">
          <label
            htmlFor={`comm-rate-${companyId}`}
            className="block text-[11px] uppercase tracking-wider font-bold text-purple-700 mb-1"
          >
            Pourcentage commission
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`comm-rate-${companyId}`}
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={r}
              onChange={(e) => setR(e.target.value)}
              placeholder="ex : 10"
              className="h-9 w-24 rounded-md border border-zinc-300 bg-white px-2 text-sm tabular-nums"
            />
            <span className="text-xs text-zinc-500 font-medium">% du CA HT</span>
          </div>
        </div>
        <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/30 p-3">
          <label
            htmlFor={`comm-flat-${companyId}`}
            className="block text-[11px] uppercase tracking-wider font-bold text-fuchsia-700 mb-1"
          >
            Forfait fixe
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`comm-flat-${companyId}`}
              type="number"
              step="0.01"
              min="0"
              value={f}
              onChange={(e) => setF(e.target.value)}
              placeholder="ex : 50"
              className="h-9 w-32 rounded-md border border-zinc-300 bg-white px-2 text-sm tabular-nums"
            />
            <span className="text-xs text-zinc-500 font-medium">
              € HT / inscription
            </span>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-zinc-500 italic">
        Les deux peuvent etre cumules. Laisser vide si pas de commission.
        Versee uniquement quand l inscription est confirmee.
      </p>
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {saved ? "Enregistré" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
