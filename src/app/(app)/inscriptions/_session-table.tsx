"use client";

import Link from "next/link";
import {
  Accessibility,
  Building2,
  User,
} from "lucide-react";
import { StageQuickChanger } from "./_stage-quick-changer";
import { useInscriptionColumns } from "./_columns-context";
import { cn } from "@/lib/utils";
import {
  FINANCING_MODE_LABELS,
  INSCRIPTION_SOURCE_LABELS,
  type InscriptionRequest,
  type InscriptionStage,
} from "@/lib/inscriptions/types";
import { computeSessionPrice } from "@/lib/pricing/compute";
import { formatLearnerName } from "@/lib/learners/format";

type SessionForCard = {
  formation: { public_price_excl_tax: number | null } | null;
  /** Tarification cascade R7 — peut être null pour les sessions
   *  pré-migration 0064. Si null, on retombe sur le prix public formation. */
  pricing_mode?: "per_learner" | "forfait" | null;
  price_per_day_ht?: number | null;
  price_forfait_ht?: number | null;
  price_extra_per_day_ht?: number | null;
  pricing_threshold?: number | null;
} | null;

export type StageEvent = {
  request_id: string;
  from_stage_id: string | null;
  to_stage_id: string | null;
  created_at: string;
  payload: Record<string, unknown> | null;
  actor_id: string | null;
  actor_name: string | null;
};

export function SessionInscriptionsTable({
  session,
  requests,
  stagesArr,
  companyNameById,
  stageEventsByInscription,
  nbJours,
}: {
  session: SessionForCard;
  requests: InscriptionRequest[];
  stagesArr: InscriptionStage[];
  /** Map id→nom pour résoudre le nom de l'entreprise du canal. */
  companyNameById?: Map<string, string>;
  /** Historique des changements d'étape, indexé par inscription_id. */
  stageEventsByInscription?: Map<string, StageEvent[]>;
  /** Nb réel de jours de formation de la session (count session_days).
   *  Utilisé pour calculer le montant HT par inscription selon la
   *  tarification cascade R7. */
  nbJours?: number;
}) {
  // Conf des colonnes : partagée globalement via le context (le bouton
  // de personnalisation est désormais en haut de la page Inscriptions,
  // pas par session).
  const { visible: v } = useInscriptionColumns();

  // ============================================================
  // Pré-calcul de la tarification cascade R7 (Gilles 2026-05-14)
  //
  // On calcule UNE fois pour toute la session :
  //   • derivedPerLearner : montant HT à imputer à chaque inscription
  //   • derivedLabel      : tooltip explicatif (mode + détail formule)
  //
  // Règles :
  //   • per_learner (INTER) : prix/J × nbJours, identique pour chacun
  //   • forfait (INTRA)     : (forfait × nbJours + extras) / nbApprenants
  //                           — le forfait est collectif, on l'imputerait
  //                           autrement c'est ambigu côté facturation
  //   • Si la session n'a pas encore de pricing_mode (legacy avant R7) :
  //     null → on retombe sur l'ancien fallback formation.public_price.
  // ============================================================
  const nbApprenantsBillable = requests.length; // V1 : tous comptés
  const days = nbJours ?? 0;
  let derivedPerLearner: number | null = null;
  let derivedLabel: string | null = null;
  /** Mode label affiché dans le footer "Total session HT". */
  let derivedFormulaShort: string | null = null;

  if (session?.pricing_mode && days > 0) {
    if (session.pricing_mode === "per_learner") {
      const perDay = Number(session.price_per_day_ht ?? 0);
      if (perDay > 0) {
        derivedPerLearner = perDay * days;
        derivedLabel = `Tarif INTER : ${perDay.toLocaleString("fr-FR")} €/J × ${days} j`;
        derivedFormulaShort = `INTER · ${perDay.toLocaleString("fr-FR")} €/J × ${nbApprenantsBillable} apprenant${
          nbApprenantsBillable > 1 ? "s" : ""
        } × ${days} j`;
      }
    } else if (
      session.pricing_mode === "forfait" &&
      nbApprenantsBillable > 0
    ) {
      const breakdown = computeSessionPrice(
        {
          mode: "forfait",
          pricePerDayHt: null,
          priceForfaitHt: Number(session.price_forfait_ht ?? 0) || null,
          priceExtraPerDayHt:
            Number(session.price_extra_per_day_ht ?? 0) || null,
          threshold: Number(session.pricing_threshold ?? 4),
        },
        nbApprenantsBillable,
        days,
      );
      if (breakdown.totalHt > 0) {
        derivedPerLearner = breakdown.totalHt / nbApprenantsBillable;
        derivedLabel = `Forfait INTRA partagé : ${breakdown.totalHt.toLocaleString("fr-FR")} € ÷ ${nbApprenantsBillable} apprenant${
          nbApprenantsBillable > 1 ? "s" : ""
        }`;
        derivedFormulaShort = `INTRA · ${breakdown.lines
          .map((l) => l.label)
          .join(" + ")}`;
      }
    }
  }

  // Total session HT = somme des montants individuels affichés dans la
  // colonne (mêmes priorités : explicite > dérivé R7 > fallback legacy).
  // Cohérent avec ce que l'utilisateur voit ligne par ligne.
  const legacyFallbackPrice =
    session?.formation?.public_price_excl_tax !== null &&
    session?.formation?.public_price_excl_tax !== undefined
      ? Number(session.formation.public_price_excl_tax)
      : null;
  let totalSessionHt = 0;
  let totalIsExact = true;
  for (const r of requests) {
    const explicit =
      r.quote_amount_ht !== null && r.quote_amount_ht !== undefined
        ? Number(r.quote_amount_ht)
        : null;
    const amount =
      explicit !== null && Number.isFinite(explicit)
        ? explicit
        : derivedPerLearner !== null && Number.isFinite(derivedPerLearner)
          ? derivedPerLearner
          : legacyFallbackPrice !== null && Number.isFinite(legacyFallbackPrice)
            ? legacyFallbackPrice
            : null;
    if (amount === null) {
      totalIsExact = false;
    } else {
      totalSessionHt += amount;
    }
  }

  return (
    <div className="relative">
      <table className="w-full text-xs table-fixed">
        <thead className="bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            {v.demandeur && <th className="px-2 py-2 w-[15%]">Demandeur</th>}
            {v.entreprise && (
              <th className="px-2 py-2 w-[20%]">Entreprise</th>
            )}
            {v.source && <th className="px-2 py-2 w-[6%]">Source</th>}
            {v.canal_inscription && (
              <th className="px-2 py-2 w-[11%] leading-tight">
                Source
                <br />
                d&apos;inscription
              </th>
            )}
            {v.financement && (
              <th className="px-2 py-2 w-[8%] leading-tight">
                Finance-
                <br />
                ment
              </th>
            )}
            {v.montant && (
              <th className="px-2 py-2 w-[8%] text-right leading-tight">
                Montant
                <br />
                HT
              </th>
            )}
            {v.etape && <th className="px-2 py-2 w-[14%]">Étape</th>}
            {v.recue && (
              <th className="px-2 py-2 w-[7%] leading-tight">
                Reçue
                <br />
                le
              </th>
            )}
            {v.ouvrir && <th className="px-2 py-2 w-[4%]"></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {requests.map((r) => {
            // Joins enrichis (typés en cast — page parent fournit les
            // bons champs via la requête Supabase).
            const joined = r as unknown as {
              company?: {
                id: string;
                name: string;
                postal_code: string | null;
                city: string | null;
              } | null;
              learner?: {
                first_name: string | null;
                last_name: string | null;
                email: string | null;
                phone: string | null;
                civility: string | null;
                postal_code: string | null;
                city: string | null;
                company?: {
                  id: string;
                  name: string;
                  postal_code: string | null;
                  city: string | null;
                } | null;
              } | null;
            };
            // Nom affiché : règle 2026-05-13 — quand un apprenant est
            // identifié (learner_id), sa fiche apprenant est la source
            // de vérité (y compris pour la civilité). Le snapshot
            // prospect_* n'est utilisé qu'en l'absence d'apprenant lié
            // (prospects anonymes).
            const hasLearner = Boolean(joined.learner);
            const prospectCivility = (r as unknown as { prospect_civility?: string | null }).prospect_civility ?? null;
            const formattedName = hasLearner
              ? formatLearnerName(
                  joined.learner?.civility,
                  joined.learner?.first_name,
                  joined.learner?.last_name,
                )
              : formatLearnerName(
                  prospectCivility,
                  r.prospect_first_name,
                  r.prospect_last_name,
                );
            const fullName = formattedName || "—";
            // L'entreprise peut être rattachée à la demande directement,
            // ou via l'apprenant. On remonte l'ID dans les deux cas pour
            // que le lien fonctionne.
            const companyId =
              joined.company?.id ?? joined.learner?.company?.id ?? null;
            const companyName =
              joined.company?.name ??
              joined.learner?.company?.name ??
              r.company_name_freetext ??
              null;
            // Cascade : adresse perso de l'apprenant, sinon adresse de
            // l'entreprise rattachée à l'apprenant, sinon adresse de
            // l'entreprise directement liée à la demande.
            const postalCode =
              joined.learner?.postal_code ??
              joined.learner?.company?.postal_code ??
              joined.company?.postal_code ??
              null;
            const city =
              joined.learner?.city ??
              joined.learner?.company?.city ??
              joined.company?.city ??
              null;

            return (
              <tr key={r.id} className="hover:bg-cyan-50/30">
                {v.demandeur && (
                  <td className="px-2 py-2 align-top">
                    <Link
                      href={`/inscriptions/${r.id}`}
                      className="hover:underline inline-flex items-center gap-1 leading-tight"
                    >
                      <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="break-words font-bold text-sm text-slate-900">
                        {fullName}
                      </span>
                      {r.has_special_needs && (
                        <Accessibility
                          className="h-3.5 w-3.5 text-cyan-600 shrink-0"
                          aria-label="Besoin spécifique"
                        />
                      )}
                    </Link>
                    {(() => {
                      // Téléphone : règle 2026-05-13 — fiche apprenant
                      // prioritaire si elle existe, sinon snapshot.
                      const phone = hasLearner
                        ? (joined.learner?.phone ?? r.prospect_phone ?? null)
                        : (r.prospect_phone ?? null);
                      if (!phone) return null;
                      return (
                        <p className="text-sm text-slate-800 font-mono font-semibold mt-1 break-all">
                          {phone}
                        </p>
                      );
                    })()}
                    {(() => {
                      // Email : idem — fiche apprenant prioritaire.
                      const email = hasLearner
                        ? (joined.learner?.email ?? r.prospect_email ?? null)
                        : (r.prospect_email ?? null);
                      if (!email) return null;
                      return (
                        <p className="text-sm text-slate-800 font-medium break-all leading-tight mt-0.5">
                          {email}
                        </p>
                      );
                    })()}
                  </td>
                )}
                {v.entreprise && (
                  <td className="px-2 py-2 text-xs align-top">
                    {companyName ? (
                      companyId ? (
                        <Link
                          href={`/entreprises/${companyId}`}
                          className="inline-flex items-start gap-1 text-cyan-700 hover:text-cyan-900 hover:underline font-semibold leading-tight break-words"
                          title="Ouvrir la fiche entreprise"
                        >
                          <Building2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span className="break-words">{companyName}</span>
                        </Link>
                      ) : (
                        <Link
                          href={`/entreprises?q=${encodeURIComponent(companyName)}`}
                          className="inline-flex items-start gap-1 text-amber-700 hover:text-amber-900 hover:underline font-semibold leading-tight break-words"
                          title="Aucun lien direct — chercher cette entreprise dans la liste"
                        >
                          <Building2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span className="break-words">{companyName}</span>
                        </Link>
                      )
                    ) : (
                      <span className="text-slate-400">Particulier</span>
                    )}
                    {/* CP + Ville stackés sous le nom (Gilles 2026-05-21 :
                        regroupement visuel pour réduire la largeur). */}
                    {(postalCode || city) && (
                      <div className="text-[11px] text-slate-600 mt-0.5 ml-4 leading-tight">
                        {postalCode && (
                          <span className="font-mono tabular-nums">
                            {postalCode}
                          </span>
                        )}
                        {postalCode && city && <span className="mx-1">·</span>}
                        {city && <span>{city}</span>}
                      </div>
                    )}
                    {!postalCode && !city && companyId && (
                      <div className="mt-1 ml-4">
                        <Link
                          href={`/entreprises/${companyId}`}
                          className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded px-1.5 py-0.5 font-bold"
                          title="Aucune adresse renseignée — cliquer pour compléter la fiche entreprise"
                        >
                          Compléter adresse
                        </Link>
                      </div>
                    )}
                  </td>
                )}
                {v.source && (
                  <td className="px-2 py-2 text-xs">
                    <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                      {INSCRIPTION_SOURCE_LABELS[r.source]}
                    </span>
                  </td>
                )}
                {v.canal_inscription && (
                  <td className="px-2 py-2 text-xs">
                    {(() => {
                      // Le canal d'inscription est sur la demande
                      // (migration 0032). Si la migration n'est pas
                      // encore passée, le champ est undefined → on
                      // affiche "CAP NUMERIQUE" par défaut.
                      const ric = r as unknown as {
                        inscription_channel?:
                          | "direct"
                          | "prescripteur"
                          | "of"
                          | null;
                        inscription_channel_company_id?: string | null;
                      };
                      const ch = ric.inscription_channel ?? "direct";
                      const channelCompanyName =
                        ric.inscription_channel_company_id && companyNameById
                          ? (companyNameById.get(
                              ric.inscription_channel_company_id,
                            ) ?? null)
                          : null;
                      if (ch === "direct") {
                        return (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold whitespace-nowrap text-[11px]">
                            CAP NUMERIQUE
                          </span>
                        );
                      }
                      const label =
                        ch === "prescripteur" ? "Prescripteur" : "OF";
                      const cls =
                        ch === "prescripteur"
                          ? "bg-blue-100 text-blue-800 border-blue-200"
                          : "bg-violet-100 text-violet-800 border-violet-200";
                      // Affichage sur 2 lignes : type (OF / Prescripteur)
                      // sur la 1re, nom de la société sur la 2de.
                      return (
                        <div
                          className="leading-tight"
                          title={`Canal : ${label}${channelCompanyName ? " · " + channelCompanyName : ""}`}
                        >
                          <span
                            className={cn(
                              "inline-block px-1.5 py-0.5 rounded border font-bold text-[11px] whitespace-nowrap",
                              cls,
                            )}
                          >
                            {label}
                          </span>
                          {channelCompanyName ? (
                            <div className="text-[11px] text-slate-700 mt-0.5 break-words">
                              {channelCompanyName}
                            </div>
                          ) : (
                            <div className="text-[10px] uppercase font-bold text-red-700 mt-0.5">
                              à compléter
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                )}
                {v.financement && (
                  <td className="px-2 py-2 text-xs">
                    {r.financing_mode && (
                      <span className="inline-block px-2 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
                        {FINANCING_MODE_LABELS[r.financing_mode]}
                      </span>
                    )}
                    {/* Accord(s) OPCO rattachés : n° dossier + nom OPCO,
                        affichés sous le badge "OPCO" */}
                    {(() => {
                      const fundings = (r as unknown as {
                        opco_fundings?: Array<{
                          agreement: {
                            id: string;
                            opco_name: string;
                            dossier_number: string | null;
                          } | null;
                        }>;
                      }).opco_fundings;
                      if (!fundings || fundings.length === 0) return null;
                      return (
                        <ul className="mt-1 space-y-0.5">
                          {fundings.flatMap((f, i) => {
                            const ag = f.agreement;
                            if (!ag) return [];
                            return [
                              <li
                                key={i}
                                className="flex items-center gap-2 text-[11px]"
                              >
                                <span className="font-mono text-slate-600 truncate">
                                  {ag.dossier_number ?? "—"}
                                </span>
                                <span className="text-violet-700 font-semibold whitespace-nowrap">
                                  {ag.opco_name}
                                </span>
                              </li>,
                            ];
                          })}
                        </ul>
                      );
                    })()}
                  </td>
                )}
                {v.montant && (
                  <td className="px-2 py-2 text-right tabular-nums">
                    {(() => {
                      // Priorité de calcul (cascade R7) :
                      //   1. Montant explicite saisi sur la demande
                      //      (négociation commerciale par inscription)
                      //   2. Tarification dérivée des champs pricing_*
                      //      de la session (INTER ou INTRA, V1 R7)
                      //   3. Fallback legacy : prix public formation
                      //      (sessions créées avant la migration 0064)
                      const explicit =
                        r.quote_amount_ht !== null &&
                        r.quote_amount_ht !== undefined
                          ? Number(r.quote_amount_ht)
                          : null;
                      const legacyFallback =
                        session?.formation?.public_price_excl_tax !== null &&
                        session?.formation?.public_price_excl_tax !== undefined
                          ? Number(session.formation.public_price_excl_tax)
                          : null;
                      const amount =
                        explicit !== null && Number.isFinite(explicit)
                          ? explicit
                          : derivedPerLearner !== null &&
                              Number.isFinite(derivedPerLearner)
                            ? derivedPerLearner
                            : legacyFallback !== null &&
                                Number.isFinite(legacyFallback)
                              ? legacyFallback
                              : null;
                      if (amount === null) {
                        return <span className="text-slate-400">—</span>;
                      }
                      // Style : explicite (override commercial) → ambre fort
                      //         dérivé R7 → couleur normale
                      //         legacy fallback → italique gris
                      const source =
                        explicit !== null
                          ? "explicit"
                          : derivedPerLearner !== null
                            ? "derived"
                            : "legacy";
                      const tooltip =
                        source === "explicit"
                          ? "Montant négocié saisi sur la demande"
                          : source === "derived"
                            ? derivedLabel ?? "Tarif session"
                            : "Prix public de la formation (session pré-tarification cascade)";
                      return (
                        <span
                          className={cn(
                            "font-bold",
                            source === "explicit"
                              ? "text-amber-700"
                              : source === "derived"
                                ? "text-slate-700"
                                : "text-slate-500 italic",
                          )}
                          title={tooltip}
                        >
                          {amount.toLocaleString("fr-FR", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          €
                        </span>
                      );
                    })()}
                  </td>
                )}
                {v.etape && (
                  <td className="px-1 py-2 overflow-hidden">
                    <StageQuickChanger
                      inscriptionId={r.id}
                      currentStageId={r.stage_id}
                      stages={stagesArr}
                      history={
                        stageEventsByInscription?.get(r.id) ?? []
                      }
                    />
                  </td>
                )}
                {v.recue && (
                  <td className="px-2 py-2 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(r.received_at).toLocaleDateString("fr-FR")}
                  </td>
                )}
                {v.ouvrir && (
                  <td className="px-2 py-2">
                    <Link
                      href={`/inscriptions/${r.id}`}
                      className="text-xs text-cyan-700 hover:underline"
                    >
                      Ouvrir →
                    </Link>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        {/* Pied de tableau — Total HT de la session (R7).
            On affiche le total uniquement s'il y a au moins une ligne
            chiffrée. La cellule "Total" est étalée sur toutes les colonnes
            qui précèdent la colonne Montant pour garder l'alignement à
            droite, comme un footer comptable classique. */}
        {v.montant && totalSessionHt > 0 && (
          <tfoot className="bg-slate-50/80 border-t-2 border-slate-200 text-[11px] font-bold">
            <tr>
              <td
                className="px-2 py-2 text-right uppercase tracking-wider text-slate-600"
                colSpan={
                  (v.demandeur ? 1 : 0) +
                  (v.entreprise ? 1 : 0) +
                  (v.source ? 1 : 0) +
                  (v.canal_inscription ? 1 : 0) +
                  (v.financement ? 1 : 0)
                }
              >
                Total session HT
                {!totalIsExact && (
                  <span className="ml-1 text-amber-700 normal-case font-normal italic">
                    (au moins)
                  </span>
                )}
                {derivedFormulaShort && (
                  <span className="block text-[9px] font-normal text-slate-500 normal-case mt-0.5">
                    {derivedFormulaShort}
                  </span>
                )}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-cyan-900">
                {totalSessionHt.toLocaleString("fr-FR", {
                  minimumFractionDigits: 2,
                })}{" "}
                €
              </td>
              {/* Cellules restantes vides pour conserver l'alignement */}
              {v.etape && <td />}
              {v.recue && <td />}
              {v.ouvrir && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
