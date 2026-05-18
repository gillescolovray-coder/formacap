"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Euro,
  ExternalLink,
  Handshake,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { Button } from "@/components/ui/button";
import {
  activatePartnerPortal,
  removePartnerPrice,
  revokePartnerPortal,
  savePartnerGeneralRate,
  savePartnerPortalVisibility,
  savePartnerPrice,
} from "./partner-actions";

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

type PartnerType = "of" | "prescripteur";

type Props = {
  companyId: string;
  companyName: string;
  companyType: PartnerType;
  token: string | null;
  /** Tarif HT par jour pour les formations distanciel (prescripteur). */
  dailyRateDistancielHt: number | null;
  /** Tarif HT par jour pour les formations présentiel (prescripteur). */
  dailyRatePresentielHt: number | null;
  /** Forfait HT par apprenant (OF). */
  quizUnitPriceHt: number | null;
  /** Voir le catalogue distanciel INTER public (prescripteur). */
  showInterCatalog: boolean;
  /** Voir ses sessions INTRA rattachées (prescripteur). */
  showOwnIntra: boolean;
  formations: FormationOption[];
  pricing: PricingRow[];
};

export function PartnerPortalSection({
  companyId,
  companyName,
  companyType,
  token,
  dailyRateDistancielHt,
  dailyRatePresentielHt,
  quizUnitPriceHt,
  showInterCatalog,
  showOwnIntra,
  formations,
  pricing,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Origin calcule cote client uniquement, apres mount.
  // Au premier rendu (SSR ET premier paint client), origin = "" pour
  // que le HTML serveur et client soient identiques (sinon erreur
  // d'hydration React). Puis useEffect met a jour avec la vraie valeur.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const portalUrl = token && origin ? `${origin}/partenaire/${token}` : null;

  function activate() {
    setError(null);
    startTransition(async () => {
      const res = await activatePartnerPortal(companyId);
      if (!res.ok) setError(res.error ?? "Erreur");
      else router.refresh();
    });
  }

  function revoke() {
    if (
      !confirm(
        "Révoquer le portail ? L'ancien lien ne fonctionnera plus. Un nouveau lien pourra être créé ensuite.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const res = await revokePartnerPortal(companyId);
      if (!res.ok) setError(res.error ?? "Erreur");
      else router.refresh();
    });
  }

  async function copyLink() {
    if (!portalUrl) return;
    await navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <CollapsibleSection
      icon={Handshake}
      title="Portail partenaire"
      description={
        companyType === "of"
          ? "Espace privé permettant à cet OF partenaire d'inscrire ses apprenants aux QUIZ pré/post de CAP NUMÉRIQUE (forfait par apprenant). L'OF reste responsable de ses propres convocations / conventions / attestations."
          : "Espace privé permettant à ce prescripteur de consulter votre catalogue distanciel INTER et d'inscrire ses apprenants en autonomie. CAP NUMÉRIQUE génère tous les documents Qualiopi (convocation, convention, attestation)."
      }
      accent="blue"
      defaultOpen
      id="partner-portal"
    >
      <div className="space-y-5">
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* État du portail */}
        {!token ? (
          <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              <strong>Portail inactif.</strong> Cliquez pour générer un lien
              d&apos;accès unique à transmettre à {companyName}.
            </div>
            <Button
              type="button"
              onClick={activate}
              disabled={pending}
              size="sm"
            >
              <Handshake className="h-4 w-4" />
              Activer le portail
            </Button>
          </div>
        ) : (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-wider font-bold text-emerald-700 mb-1">
                  Portail actif
                </p>
                <p className="text-xs text-emerald-900 dark:text-emerald-300">
                  Lien d&apos;accès à transmettre au partenaire :
                </p>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <code className="font-mono text-[11px] bg-white dark:bg-zinc-900 border border-emerald-200 px-2 py-1.5 rounded text-zinc-700 break-all max-w-full">
                    {portalUrl}
                  </code>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  onClick={copyLink}
                  size="sm"
                  variant="outline"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copié
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copier le lien
                    </>
                  )}
                </Button>
                {portalUrl && (
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-xs border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-700 font-medium"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ouvrir
                  </a>
                )}
                <Button
                  type="button"
                  onClick={revoke}
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  title="Révoquer ce lien et en générer un nouveau"
                >
                  <RefreshCw className="h-4 w-4" />
                  Révoquer
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Visibilité du catalogue dans le portail (prescripteur uniquement) */}
        {companyType === "prescripteur" && (
          <VisibilityToggles
            companyId={companyId}
            showInterCatalog={showInterCatalog}
            showOwnIntra={showOwnIntra}
          />
        )}

        {/* Tarif général appliqué automatiquement */}
        <GeneralRateEditor
          companyId={companyId}
          companyType={companyType}
          dailyRateDistancielHt={dailyRateDistancielHt}
          dailyRatePresentielHt={dailyRatePresentielHt}
          quizUnitPriceHt={quizUnitPriceHt}
        />

        {/* Tarifs spécifiques (overrides) */}
        <PricingEditor
          companyId={companyId}
          companyType={companyType}
          formations={formations}
          pricing={pricing}
        />
      </div>
    </CollapsibleSection>
  );
}

function PricingEditor({
  companyId,
  companyType,
  formations,
  pricing,
}: {
  companyId: string;
  companyType: PartnerType;
  formations: FormationOption[];
  pricing: PricingRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ligne d'ajout
  const [newFormationId, setNewFormationId] = useState("");
  const [newPrice, setNewPrice] = useState<string>("");
  const [newNotes, setNewNotes] = useState("");

  // Map pour affichage
  const formationById = new Map(formations.map((f) => [f.id, f]));
  const availableForAdd = formations.filter(
    (f) => !pricing.some((p) => p.formation_id === f.id),
  );

  function add() {
    setError(null);
    if (!newFormationId) {
      setError("Sélectionnez une formation.");
      return;
    }
    const priceNum = Number(newPrice);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError("Prix invalide.");
      return;
    }
    startTransition(async () => {
      const res = await savePartnerPrice(
        companyId,
        newFormationId,
        priceNum,
        newNotes.trim() || null,
      );
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      setNewFormationId("");
      setNewPrice("");
      setNewNotes("");
      setAddOpen(false);
      router.refresh();
    });
  }

  function remove(formationId: string) {
    if (!confirm("Supprimer ce tarif négocié ?")) return;
    setError(null);
    startTransition(async () => {
      const res = await removePartnerPrice(companyId, formationId);
      if (!res.ok) setError(res.error ?? "Erreur");
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3 flex-wrap pt-3">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
            <Euro className="h-4 w-4 text-amber-600" />
            Tarifs spécifiques par formation
            <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">
              (surcharge le tarif général)
            </span>
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            {companyType === "of"
              ? "Prix HT forfaitaire par apprenant pour une formation précise. Surcharge le tarif quiz général."
              : "Prix HT total par apprenant pour une formation précise. Surcharge le calcul automatique tarif_jour × durée."}
          </p>
        </div>
        {!addOpen && availableForAdd.length > 0 && (
          <Button
            type="button"
            onClick={() => setAddOpen(true)}
            size="sm"
            variant="outline"
          >
            <Plus className="h-4 w-4" />
            Ajouter un tarif
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Tableau des tarifs existants */}
      {pricing.length === 0 ? (
        <div className="rounded-md bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 p-4 text-center text-xs text-zinc-500 italic">
          Aucun tarif négocié pour le moment.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900/50">
              <tr>
                <th className="text-left text-[11px] uppercase tracking-wider font-bold text-zinc-600 px-3 py-2">
                  Formation
                </th>
                <th className="text-right text-[11px] uppercase tracking-wider font-bold text-zinc-600 px-3 py-2">
                  Prix HT
                </th>
                <th className="text-left text-[11px] uppercase tracking-wider font-bold text-zinc-600 px-3 py-2">
                  Notes
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {pricing.map((row) => {
                const f = formationById.get(row.formation_id);
                return (
                  <tr
                    key={row.formation_id}
                    className="border-t border-zinc-200 dark:border-zinc-800"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {f?.title ?? "(formation supprimée)"}
                      </div>
                      {f?.duration_hours && (
                        <div className="text-[11px] text-zinc-500">
                          {f.duration_hours} h
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-amber-700 tabular-nums">
                      {row.unit_price_ht.toFixed(2)} €
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {row.notes ?? ""}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => remove(row.formation_id)}
                        disabled={pending}
                        className="text-zinc-500 hover:text-rose-600 disabled:opacity-30 p-1"
                        title="Supprimer ce tarif"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Ligne d'ajout */}
      {addOpen && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2">
            <select
              value={newFormationId}
              onChange={(e) => setNewFormationId(e.target.value)}
              className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
            >
              <option value="">— Choisir une formation —</option>
              {availableForAdd.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="Prix HT"
              className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm tabular-nums"
            />
          </div>
          <input
            type="text"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Notes (optionnel : conditions, validité…)"
            className="w-full h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
          />
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                setError(null);
              }}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button type="button" size="sm" onClick={add} disabled={pending}>
              Enregistrer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Visibilité catalogue (prescripteur)
// ============================================================

function VisibilityToggles({
  companyId,
  showInterCatalog,
  showOwnIntra,
}: {
  companyId: string;
  showInterCatalog: boolean;
  showOwnIntra: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [inter, setInter] = useState(showInterCatalog);
  const [intra, setIntra] = useState(showOwnIntra);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update(next: { inter?: boolean; intra?: boolean }) {
    const newInter = next.inter ?? inter;
    const newIntra = next.intra ?? intra;
    setInter(newInter);
    setIntra(newIntra);
    setError(null);
    startTransition(async () => {
      const res = await savePartnerPortalVisibility(companyId, {
        showInterCatalog: newInter,
        showOwnIntra: newIntra,
      });
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        // rollback affichage
        setInter(showInterCatalog);
        setIntra(showOwnIntra);
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
      <div className="pt-3">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
          Catalogue visible dans son portail
        </h3>
        <p className="text-[11px] text-zinc-500 mt-0.5">
          Choisissez ce que ce prescripteur peut consulter et où inscrire des
          apprenants en autonomie.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-2">
        <label className="flex items-start gap-2.5 text-sm cursor-pointer rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900">
          <input
            type="checkbox"
            checked={inter}
            onChange={(e) => update({ inter: e.target.checked })}
            disabled={pending}
            className="h-4 w-4 mt-0.5 rounded border-zinc-300"
          />
          <div>
            <span className="font-medium">
              Catalogue distanciel INTER public
            </span>
            <p className="text-xs text-zinc-500 mt-0.5">
              Toutes les sessions distanciel INTER à venir proposées par CAP
              NUMÉRIQUE.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-2.5 text-sm cursor-pointer rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900">
          <input
            type="checkbox"
            checked={intra}
            onChange={(e) => update({ intra: e.target.checked })}
            disabled={pending}
            className="h-4 w-4 mt-0.5 rounded border-zinc-300"
          />
          <div>
            <span className="font-medium">Mes sessions INTRA</span>
            <p className="text-xs text-zinc-500 mt-0.5">
              Sessions INTRA (présentiel ou distanciel) où ce prescripteur est
              référent (champ « Prescripteur référent » sur la fiche session).
            </p>
          </div>
        </label>
      </div>

      {saved && (
        <p className="text-[11px] text-emerald-700 font-medium">
          Préférences enregistrées.
        </p>
      )}
    </div>
  );
}

// ============================================================
// Tarif général (par jour pour prescripteur, forfait pour OF)
// ============================================================

function GeneralRateEditor({
  companyId,
  companyType,
  dailyRateDistancielHt,
  dailyRatePresentielHt,
  quizUnitPriceHt,
}: {
  companyId: string;
  companyType: PartnerType;
  dailyRateDistancielHt: number | null;
  dailyRatePresentielHt: number | null;
  quizUnitPriceHt: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // États selon le type
  const [quizValue, setQuizValue] = useState<string>(
    quizUnitPriceHt !== null ? String(quizUnitPriceHt) : "",
  );
  const [distancielValue, setDistancielValue] = useState<string>(
    dailyRateDistancielHt !== null ? String(dailyRateDistancielHt) : "",
  );
  const [presentielValue, setPresentielValue] = useState<string>(
    dailyRatePresentielHt !== null ? String(dailyRatePresentielHt) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function parseRate(raw: string): number | null | "invalid" {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return "invalid";
    return n;
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      let payload:
        | { quizUnitPriceHt: number | null }
        | {
            dailyRateDistancielHt: number | null;
            dailyRatePresentielHt: number | null;
          };
      if (companyType === "of") {
        const v = parseRate(quizValue);
        if (v === "invalid") {
          setError("Tarif forfait invalide.");
          return;
        }
        payload = { quizUnitPriceHt: v };
      } else {
        const d = parseRate(distancielValue);
        const p = parseRate(presentielValue);
        if (d === "invalid" || p === "invalid") {
          setError("Tarif invalide.");
          return;
        }
        payload = {
          dailyRateDistancielHt: d,
          dailyRatePresentielHt: p,
        };
      }
      const res = await savePartnerGeneralRate(companyId, payload);
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  }

  const hasAnyRate =
    companyType === "of"
      ? quizUnitPriceHt !== null
      : dailyRateDistancielHt !== null || dailyRatePresentielHt !== null;

  const help =
    companyType === "of"
      ? "Forfait par apprenant pour accéder aux quiz pré + post de CAP NUMÉRIQUE. CAP NUMÉRIQUE ne génère pas la convocation ni la convention : c'est votre OF qui s'en charge."
      : "Multiplié automatiquement par la durée de chaque formation (en jours). Le tarif appliqué dépend de la modalité de la formation (distanciel ou présentiel).";

  return (
    <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
      <div className="pt-3">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
          <Euro className="h-4 w-4 text-emerald-600" />
          Tarif général
        </h3>
        <p className="text-[11px] text-zinc-500 mt-0.5">{help}</p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {companyType === "of" ? (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <label
              htmlFor={`general-quiz-${companyId}`}
              className="block text-[11px] uppercase tracking-wider font-bold text-zinc-600 mb-1"
            >
              Tarif quiz HT par apprenant (forfait)
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`general-quiz-${companyId}`}
                type="number"
                step="0.01"
                min="0"
                value={quizValue}
                onChange={(e) => setQuizValue(e.target.value)}
                placeholder="ex : 65"
                className="h-9 w-40 rounded-md border border-zinc-300 bg-white px-2 text-sm tabular-nums"
              />
              <span className="text-sm text-zinc-500 font-medium">
                € HT / apprenant
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={save} disabled={pending}>
              {saved ? "Enregistré" : "Enregistrer"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-cyan-200 bg-cyan-50/30 p-3">
              <label
                htmlFor={`general-distanciel-${companyId}`}
                className="block text-[11px] uppercase tracking-wider font-bold text-cyan-700 mb-1"
              >
                Tarif jour DISTANCIEL
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`general-distanciel-${companyId}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={distancielValue}
                  onChange={(e) => setDistancielValue(e.target.value)}
                  placeholder="ex : 250"
                  className="h-9 w-32 rounded-md border border-zinc-300 bg-white px-2 text-sm tabular-nums"
                />
                <span className="text-xs text-zinc-500 font-medium">
                  € HT / jour / apprenant
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-3">
              <label
                htmlFor={`general-presentiel-${companyId}`}
                className="block text-[11px] uppercase tracking-wider font-bold text-emerald-700 mb-1"
              >
                Tarif jour PRÉSENTIEL
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`general-presentiel-${companyId}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={presentielValue}
                  onChange={(e) => setPresentielValue(e.target.value)}
                  placeholder="ex : 400"
                  className="h-9 w-32 rounded-md border border-zinc-300 bg-white px-2 text-sm tabular-nums"
                />
                <span className="text-xs text-zinc-500 font-medium">
                  € HT / jour / apprenant
                </span>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={save} disabled={pending}>
              {saved ? "Enregistré" : "Enregistrer"}
            </Button>
          </div>
        </div>
      )}

      {!hasAnyRate && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 inline-block">
          Aucun tarif général : seules les formations avec un tarif spécifique
          seront accessibles à l&apos;inscription dans le portail.
        </p>
      )}
    </div>
  );
}
