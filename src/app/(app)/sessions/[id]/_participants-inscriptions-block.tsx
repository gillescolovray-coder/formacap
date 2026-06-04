"use client";

import { Users } from "lucide-react";
import { InscrireLink } from "../../inscriptions/_inscrire-link";
import {
  ColumnsSettingsButton,
  InscriptionColumnsProvider,
} from "../../inscriptions/_columns-context";
import { SessionInscriptionsTable } from "../../inscriptions/_session-table";
import type { FormationEntry } from "../../entreprises/_formations-tooltip";
import type {
  InscriptionRequest,
  InscriptionStage,
} from "@/lib/inscriptions/types";
import { cn } from "@/lib/utils";

type SessionForCard = {
  id: string;
  max_participants: number | null;
  status: string | null;
  formation: { public_price_excl_tax: number | null } | null;
  pricing_mode: "per_learner" | "forfait" | null;
  price_per_day_ht: number | null;
  price_forfait_ht: number | null;
  price_extra_per_day_ht: number | null;
  pricing_threshold: number | null;
};

type StageEvent = {
  request_id: string;
  from_stage_id: string | null;
  to_stage_id: string | null;
  created_at: string;
  payload: Record<string, unknown> | null;
  actor_id: string | null;
  actor_name: string | null;
};

/**
 * Bloc unifié d'inscriptions pour une session, utilisé sur la page
 * /sessions/[id]/participants en remplacement des deux blocs
 * "Inscrits" + "Demandes en cours" (Gilles 2026-05-21).
 *
 * Objectif : une seule méthode de saisie/visualisation d'inscriptions
 * dans toute l'application. Le même tableau que sur /inscriptions est
 * affiché ici, filtré sur la session courante.
 */
export function ParticipantsInscriptionsBlock({
  session,
  requests,
  stagesArr,
  companyNameById,
  stageEventsByInscription,
  nbJours,
  returnTo,
  formationsByLearner,
}: {
  session: SessionForCard;
  requests: InscriptionRequest[];
  stagesArr: InscriptionStage[];
  companyNameById: Map<string, string>;
  stageEventsByInscription: Map<string, StageEvent[]>;
  nbJours: number;
  /** URL de retour propage aux liens "Ouvrir" du tableau pour permettre
   *  un retour contextuel apres action sur la fiche inscription
   *  (Gilles 2026-06-01). */
  returnTo?: string;
  /** Formations par learner_id pour la colonne "Portail apprenant"
   *  (compteur + accès portail). Gilles 2026-06-04. */
  formationsByLearner?: Map<string, FormationEntry[]>;
}) {
  // Compteurs par étape (mêmes pastilles que sur /inscriptions)
  const counts = new Map<string, number>();
  for (const r of requests) {
    if (r.stage_id) counts.set(r.stage_id, (counts.get(r.stage_id) ?? 0) + 1);
  }

  const max = session.max_participants ?? null;
  const isFull = max !== null && requests.length >= max;
  const isAlmostFull =
    max !== null && !isFull && max > 0 && requests.length / max >= 0.8;

  return (
    <InscriptionColumnsProvider>
      <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        {/* En-tête : compteur + pastilles d'étapes + bouton Inscrire */}
        <div className="px-4 py-2.5 flex items-center gap-3 border-b bg-slate-50/60 flex-wrap">
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black border whitespace-nowrap",
                isFull
                  ? "bg-red-100 text-red-800 border-red-300"
                  : isAlmostFull
                    ? "bg-amber-100 text-amber-800 border-amber-300"
                    : "bg-cyan-100 text-cyan-800 border-cyan-300",
              )}
              title={
                max !== null
                  ? `${requests.length} inscrit${requests.length > 1 ? "s" : ""} sur ${max} places maximum`
                  : `${requests.length} inscrit${requests.length > 1 ? "s" : ""}`
              }
            >
              <Users className="h-3 w-3" />
              {requests.length}
              {max !== null && <span className="opacity-70">/ {max}</span>}
            </span>
            {stagesArr
              .filter((s) => counts.get(s.id))
              .map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap"
                  style={{
                    backgroundColor: `${s.color}15`,
                    borderColor: s.color ?? "#94a3b8",
                    color: s.color ?? "#475569",
                  }}
                  title={s.description ?? s.name}
                >
                  {s.name} {counts.get(s.id)}
                </span>
              ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ColumnsSettingsButton />
            <InscrireLink sessionId={session.id} />
          </div>
        </div>

        {/* Tableau unifié — identique à celui de /inscriptions */}
        {requests.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Aucune inscription pour cette session. Cliquez sur
            <span className="font-semibold"> « Inscrire » </span>
            pour ajouter un apprenant.
          </div>
        ) : (
          <SessionInscriptionsTable
            session={session}
            sessionId={session.id}
            requests={requests}
            stagesArr={stagesArr}
            companyNameById={companyNameById}
            stageEventsByInscription={stageEventsByInscription}
            nbJours={nbJours}
            returnTo={returnTo === "participants" ? "participants" : undefined}
            showPortalColumn
            formationsByLearner={formationsByLearner}
          />
        )}
      </div>
    </InscriptionColumnsProvider>
  );
}
