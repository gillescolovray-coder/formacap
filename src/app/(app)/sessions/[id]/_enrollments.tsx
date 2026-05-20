"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Briefcase,
  Building2,
  Handshake,
  Mail,
  Phone,
  Trash2,
  UserCircle2,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ENROLLMENT_STATUS_BADGE_CLASSES,
  ENROLLMENT_STATUS_DESCRIPTIONS,
  ENROLLMENT_STATUS_LABELS,
  INITIAL_LEVEL_BADGE_CLASSES,
  INITIAL_LEVEL_LABELS,
  type Enrollment,
  type EnrollmentStatus,
  type InitialLevel,
} from "@/lib/sessions/types";
import type { Learner } from "@/lib/learners/types";
import {
  enrollLearner,
  removeEnrollment,
  updateEnrollmentInitialLevel,
  updateEnrollmentStatus,
} from "./enrollments/actions";
import { EnrollmentStatusHelp } from "./_status-help";
import { LearnerSearchPicker } from "./_learner-search-picker";
import { EnrollmentChannelPicker } from "./_enrollment-channel-picker";
import { EnrollmentFinancingPicker } from "./_enrollment-financing-picker";

export type InscriptionRequestRow = {
  id: string;
  learner_id: string | null;
  prospect_first_name: string | null;
  prospect_last_name: string | null;
  prospect_email: string | null;
  prospect_phone: string | null;
  has_special_needs: boolean;
  financing_mode: string | null;
  quote_amount_ht: number | null;
  stage_id: string | null;
  received_at: string;
  company_name_freetext: string | null;
  learner: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    job_title: string | null;
    company: { name: string } | null;
  } | null;
};

export type InscriptionStageInfo = {
  id: string;
  name: string;
  color: string | null;
  is_won: boolean;
};

type EnrollmentsSectionProps = {
  sessionId: string;
  enrollments: Enrollment[];
  availableLearners: Pick<
    Learner,
    "id" | "first_name" | "last_name" | "email" | "job_title" | "company"
  >[];
  maxParticipants: number | null;
  inscriptionRequests?: InscriptionRequestRow[];
  inscriptionStages?: InscriptionStageInfo[];
  /** Entreprises (pour le sélecteur de canal d'inscription).
   *  Le champ `type` permet de filtrer la liste selon le canal choisi :
   *  "prescripteur" → type === "prescripteur", "of" → type === "of". */
  companies?: { id: string; name: string; type: string | null }[];
  /** Accords OPCO existants pour le picker Financement (option opco). */
  opcoAgreements?: {
    id: string;
    opco_name: string;
    dossier_number: string | null;
  }[];
  /** Prix unitaire HT par société (issu de session_conventions.amount_ht_unit).
   *  Utilisé pour calculer la colonne "Montant" du tableau Participants :
   *  Total HT = prix unitaire, OPCO = part financée, RAC = Total - OPCO. */
  unitPriceByCompanyId?: Record<string, number>;
};

function getInitials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

export function EnrollmentsSection({
  sessionId,
  enrollments,
  availableLearners,
  maxParticipants,
  inscriptionRequests = [],
  inscriptionStages = [],
  companies = [],
  opcoAgreements = [],
  unitPriceByCompanyId = {},
}: EnrollmentsSectionProps) {
  const stageMap = new Map(inscriptionStages.map((s) => [s.id, s]));
  // Détecter les demandes déjà converties en enrollment (mêmes learner_id)
  const enrolledLearnerIds = new Set(
    enrollments.map((e) => e.learner_id).filter(Boolean) as string[],
  );
  // On masque les demandes dont l'apprenant est déjà inscrit en session
  // (pour éviter le double affichage), mais on garde toutes les autres.
  const pendingRequests = inscriptionRequests.filter(
    (r) => !(r.learner_id && enrolledLearnerIds.has(r.learner_id)),
  );
  const totalPersons = enrollments.length + pendingRequests.length;
  const enroll = enrollLearner.bind(null, sessionId);
  const enrolledIds = new Set(enrollments.map((e) => e.learner_id));
  const toEnroll = availableLearners.filter((l) => !enrolledIds.has(l.id));

  // Le formulaire inline a été remplacé le 2026-05-13 par une redirection
  // vers /inscriptions/new?session_id=… (fiche complète unifiée avec
  // OPCO/prescripteur/financement). On garde le state + setter (no-op)
  // pour ne pas casser le rendu conditionnel dead code restant.
  const [showForm, setShowForm] = useState(false);
  const [selectedLearnerId, setSelectedLearnerId] = useState<string>("");
  const [pickedStatus, setPickedStatus] =
    useState<EnrollmentStatus>("preinscrit");

  const isFull =
    maxParticipants !== null && totalPersons >= maxParticipants;
  const remaining =
    maxParticipants !== null
      ? Math.max(0, maxParticipants - totalPersons)
      : null;

  // Compteurs par statut
  const counts = enrollments.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});

  // Mode d'affichage : "learner" = 1 ligne par apprenant ; "company" =
  // regroupé par société avec total par société. Décision 2026-05-13.
  const [viewMode, setViewMode] = useState<"learner" | "company">("learner");

  // === Calcul des montants HT pour le footer (total session) ===
  // Pour chaque enrollment, on récupère le prix unitaire HT de la
  // société (issu de la convention) — règle métier R2 (prix par
  // convention société). Total session = somme.
  //
  // Règle Gilles 2026-05-13 : SEULS les apprenants au statut
  // "confirmed" sont comptés comme facturables (= engagement
  // contractuel pris). Les statuts amont (préinscrit, option, convoqué)
  // ne sont pas encore "engagés" donc pas facturables. Les statuts aval
  // (in_progress, completed) sont déjà facturés en pratique — donc pas
  // dans le "CA prévisionnel" affiché ici. Cancelled/absent/abandoned
  // sont évidemment exclus.
  const isBillable = (status: string) => status === "confirmed";
  const billableEnrollments = enrollments.filter((e) => isBillable(e.status));
  const totalSessionHt = billableEnrollments.reduce<number>((acc, e) => {
    const cid =
      (e.learner?.company as { id?: string } | null | undefined)?.id ?? null;
    const price = cid ? unitPriceByCompanyId[cid] : null;
    return acc + (price ?? 0);
  }, 0);
  const formatEUR = (n: number) =>
    n.toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    });

  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-cyan-100 dark:bg-cyan-950/60 flex items-center justify-center">
            <Users className="h-5 w-5 text-cyan-700 dark:text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight inline-flex items-center gap-2">
              Inscrits
              <EnrollmentStatusHelp />
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {totalPersons}
              </span>
              {maxParticipants !== null && (
                <span className="text-slate-500"> / {maxParticipants}</span>
              )}{" "}
              apprenant{totalPersons > 1 ? "s" : ""}
              {pendingRequests.length > 0 && (
                <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  dont {pendingRequests.length} demande
                  {pendingRequests.length > 1 ? "s" : ""} en cours
                </span>
              )}
              {isFull && (
                <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 text-[10px] font-bold uppercase">
                  <AlertCircle className="h-3 w-3" />
                  Complet
                </span>
              )}
              {remaining !== null && remaining > 0 && remaining <= 3 && (
                <span className="ml-2 inline-flex px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-[10px] font-bold uppercase">
                  Encore {remaining} place{remaining > 1 ? "s" : ""}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Toggle Vue Apprenant ↔ Vue Société (2026-05-13).
            Visible uniquement si au moins un apprenant inscrit. */}
        <div className="flex items-center gap-2">
          {enrollments.length > 0 && (
            <div
              className="inline-flex rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-0.5 text-xs"
              role="group"
              title="Changer l'organisation de la liste : par apprenant (1 ligne / apprenant) ou par société (regroupé)"
            >
              <button
                type="button"
                onClick={() => setViewMode("learner")}
                className={cn(
                  "px-2 py-1 rounded font-medium transition-colors",
                  viewMode === "learner"
                    ? "bg-cyan-600 text-white"
                    : "text-zinc-600 hover:text-zinc-900",
                )}
              >
                Apprenants
              </button>
              <button
                type="button"
                onClick={() => setViewMode("company")}
                className={cn(
                  "px-2 py-1 rounded font-medium transition-colors",
                  viewMode === "company"
                    ? "bg-cyan-600 text-white"
                    : "text-zinc-600 hover:text-zinc-900",
                )}
              >
                Sociétés
              </button>
            </div>
          )}
          {!isFull && (
            <Button
              type="button"
              size="sm"
              nativeButton={false}
              render={
                <Link
                  href={`/inscriptions/new?session_id=${sessionId}&return_to=participants`}
                  title="Ouvre la fiche d'inscription complète (avec OPCO, prescripteur, financement) — la session est pré-sélectionnée."
                />
              }
            >
              <UserPlus className="h-4 w-4" />
              Inscrire un apprenant
            </Button>
          )}
        </div>
      </div>

      {/* Synthèse par statut */}
      {enrollments.length > 0 && (
        <div className="px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-1.5 bg-slate-50/50 dark:bg-slate-900/30">
          {(Object.keys(ENROLLMENT_STATUS_LABELS) as EnrollmentStatus[])
            .filter((s) => counts[s])
            .map((s) => (
              <span
                key={s}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border",
                  ENROLLMENT_STATUS_BADGE_CLASSES[s],
                )}
                title={ENROLLMENT_STATUS_DESCRIPTIONS[s]}
              >
                {ENROLLMENT_STATUS_LABELS[s]}
                <span className="font-bold tabular-nums">{counts[s]}</span>
              </span>
            ))}
        </div>
      )}

      {/* En-tête de colonnes — réorganisé 2026-05-13 :
          Apprenant · Société → Source → Statut → Financement → Montant → Niveau
          Largeurs FIXES (pas minWidth) pour que header et lignes soient
          strictement alignés. Les badges débordants sont tronqués via
          max-w-full sur leurs wrappers. */}
      {enrollments.length > 0 && (
        <div className="px-6 py-2 flex items-center gap-3 text-[10px] uppercase tracking-wider font-bold text-slate-500 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
          <div className="h-9 w-9 shrink-0" aria-hidden />
          <div className="flex-1 min-w-0">Apprenant · Société</div>
          <div
            className="text-center shrink-0"
            style={{ width: 140 }}
            title="D'où vient cet apprenant : inscription directe par CAP NUMERIQUE, via un prescripteur, ou via un autre OF."
          >
            Source
          </div>
          <div
            className="text-center shrink-0"
            style={{ width: 110 }}
            title="Statut administratif de l'inscription (préinscrit, confirmé, annulé, présent)."
          >
            Statut
          </div>
          <div
            className="text-center shrink-0"
            style={{ width: 150 }}
            title="Mode de financement principal (provient de la fiche Inscription liée)."
          >
            Financement
          </div>
          <div
            className="text-right shrink-0"
            style={{ width: 110 }}
            title="Total HT par apprenant (issu de la convention). Pour les financements OPCO, détail OPCO + RAC (reste à charge). Modifiable depuis la convention."
          >
            Montant
          </div>
          <div
            className="text-center shrink-0"
            style={{ width: 130 }}
            title="Niveau initial déclaré de l'apprenant (utile pour l'évaluation Qualiopi)."
          >
            Niveau
          </div>
          <div className="w-8 shrink-0" aria-hidden />
        </div>
      )}

      {/* Liste des inscrits. La vue "Société" du toggle est en cours
          de finalisation — pour V1 elle réordonne les apprenants par
          société. La version groupée (avec headers + sous-totaux) sera
          ajoutée dans une prochaine passe. */}
      {enrollments.length > 0 ? (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
          {(viewMode === "company"
            ? [...enrollments].sort((a, b) => {
                const an =
                  (a.learner?.company as { name?: string } | null)?.name ??
                  "zzz_Particulier";
                const bn =
                  (b.learner?.company as { name?: string } | null)?.name ??
                  "zzz_Particulier";
                return an.localeCompare(bn, "fr");
              })
            : enrollments
          ).map((e) => {
            const changeStatus = updateEnrollmentStatus.bind(
              null,
              sessionId,
              e.id,
            );
            const changeLevel = updateEnrollmentInitialLevel.bind(
              null,
              sessionId,
              e.id,
            );
            const remove = removeEnrollment.bind(null, sessionId, e.id);
            const learner = e.learner;
            const fullName = learner
              ? `${learner.first_name ?? ""} ${learner.last_name ?? ""}`.trim()
              : "Apprenant inconnu";
            return (
              <li
                key={e.id}
                className="px-6 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-900/30"
              >
                {/* Avatar initiales */}
                <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">
                  {getInitials(learner?.first_name, learner?.last_name)}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Ligne 1 — Nom complet (cliquable vers fiche apprenant) */}
                  <p className="text-sm font-semibold truncate">
                    <Link
                      href={`/sessions/${sessionId}/participants/${e.id}`}
                      className="hover:text-cyan-700 hover:underline"
                      title="Ouvrir la vue 360° de cet apprenant"
                    >
                      {fullName}
                    </Link>
                  </p>
                  {/* Ligne 2 — Société (ou Particulier) · Fonction · Partenaire */}
                  <p className="text-xs text-slate-500 truncate flex items-center gap-2 mt-0.5 flex-wrap">
                    {(learner as { company?: { name?: string } | null } | null)
                      ?.company?.name ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Building2 className="h-3 w-3" />
                        {
                          (learner as {
                            company: { name: string };
                          }).company.name
                        }
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-slate-400">
                        <UserCircle2 className="h-3 w-3" />
                        Particulier
                      </span>
                    )}
                    {(learner as unknown as { job_title?: string | null } | null)
                      ?.job_title && (
                      <span className="inline-flex items-center gap-0.5 text-slate-500">
                        <Briefcase className="h-3 w-3" />
                        {
                          (learner as unknown as { job_title: string })
                            .job_title
                        }
                      </span>
                    )}
                    {(() => {
                      // Badge « via [Partenaire] » si l'inscription provient
                      // d'un portail partenaire (referrer_company_id rempli).
                      const ir = (
                        e as unknown as {
                          inscription_request?: {
                            via_partner_portal?: boolean | null;
                            referrer?:
                              | { id: string; name: string; type: string | null }
                              | Array<{ id: string; name: string; type: string | null }>
                              | null;
                          } | null;
                        }
                      ).inscription_request;
                      const referrerRaw = ir?.referrer;
                      const referrer = Array.isArray(referrerRaw)
                        ? referrerRaw[0] ?? null
                        : referrerRaw ?? null;
                      if (!referrer?.name) return null;
                      const isOf = referrer.type === "of";
                      return (
                        <span
                          className={
                            isOf
                              ? "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold"
                              : "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-bold"
                          }
                          title={`Inscription via le portail ${isOf ? "OF" : "prescripteur"} ${referrer.name}`}
                        >
                          <Handshake className="h-3 w-3" />
                          via {referrer.name}
                        </span>
                      );
                    })()}
                  </p>
                  {/* Ligne 3 — Email · Téléphone (priorité au mobile, fallback fixe) */}
                  {(learner?.email ||
                    (learner as unknown as { mobile?: string | null } | null)
                      ?.mobile ||
                    (learner as unknown as { phone?: string | null } | null)
                      ?.phone) && (
                    <p className="text-[11px] text-slate-500 truncate flex items-center gap-2 mt-0.5">
                      {learner?.email && (
                        <a
                          href={`mailto:${learner.email}`}
                          className="inline-flex items-center gap-0.5 hover:text-cyan-700 hover:underline"
                          title="Envoyer un email"
                        >
                          <Mail className="h-3 w-3" />
                          {learner.email}
                        </a>
                      )}
                      {(() => {
                        const tel =
                          (learner as unknown as {
                            mobile?: string | null;
                          } | null)?.mobile ??
                          (learner as unknown as {
                            phone?: string | null;
                          } | null)?.phone ??
                          null;
                        if (!tel) return null;
                        return (
                          <a
                            href={`tel:${tel}`}
                            className="inline-flex items-center gap-0.5 hover:text-cyan-700 hover:underline tabular-nums"
                            title="Appeler"
                          >
                            <Phone className="h-3 w-3" />
                            {tel}
                          </a>
                        );
                      })()}
                    </p>
                  )}
                </div>

                {/* === Colonne SOURCE : canal d'inscription (direct / prescripteur / OF) === */}
                <div
                  className="shrink-0 flex items-center justify-center overflow-hidden"
                  style={{ width: 140 }}
                >
                  <EnrollmentChannelPicker
                    sessionId={sessionId}
                    enrollmentId={e.id}
                    channel={e.inscription_channel ?? "direct"}
                    companyId={e.inscription_channel_company_id ?? null}
                    companyName={
                      e.inscription_channel_company_id
                        ? (companies.find(
                            (c) => c.id === e.inscription_channel_company_id,
                          )?.name ?? null)
                        : null
                    }
                    companies={companies}
                  />
                </div>

                {/* === Colonne STATUT : déplacé entre Source et Financement === */}
                <div
                  className="shrink-0 flex items-center justify-center overflow-hidden"
                  style={{ width: 110 }}
                >
                  <form action={changeStatus}>
                    <select
                      name="status"
                      defaultValue={e.status}
                      onChange={(event) =>
                        event.currentTarget.form?.requestSubmit()
                      }
                      title={ENROLLMENT_STATUS_DESCRIPTIONS[e.status]}
                      className={cn(
                        "h-8 rounded-md border-2 px-2 text-xs font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-400",
                        ENROLLMENT_STATUS_BADGE_CLASSES[e.status],
                      )}
                    >
                      {(
                        Object.keys(ENROLLMENT_STATUS_LABELS) as EnrollmentStatus[]
                      ).map((key) => (
                        <option key={key} value={key}>
                          {ENROLLMENT_STATUS_LABELS[key]}
                        </option>
                      ))}
                    </select>
                  </form>
                </div>

                {/* === Colonne FINANCEMENT : picker cliquable qui modifie la
                    inscription_request liée (sync 2026-05-13). Si OPCO est
                    sélectionné, sous-menu pour choisir l'accord. === */}
                {(() => {
                  const ir = (
                    e as unknown as {
                      inscription_request?: {
                        id: string;
                        financing_mode: string | null;
                        opco_fundings?: Array<{
                          agreement_id: string;
                          amount_ht: number | null;
                          agreement?: {
                            opco_name: string;
                            dossier_number: string | null;
                          } | null;
                        }> | null;
                      } | null;
                    }
                  ).inscription_request;
                  const mode = ir?.financing_mode ?? null;
                  const firstFunding =
                    ir?.opco_fundings && ir.opco_fundings.length > 0
                      ? ir.opco_fundings[0]
                      : null;
                  const currentOpcoId = firstFunding?.agreement_id ?? null;
                  const currentOpcoName =
                    firstFunding?.agreement?.opco_name ?? null;
                  const currentOpcoDossier =
                    firstFunding?.agreement?.dossier_number ?? null;
                  const opcoAmount =
                    firstFunding?.amount_ht !== null &&
                    firstFunding?.amount_ht !== undefined
                      ? Number(firstFunding.amount_ht)
                      : null;
                  // Prix unitaire HT issu de la convention société.
                  // Le type embedded de `learner.company` n'inclut pas
                  // toujours `id` selon l'endroit, donc cast inline.
                  const companyId =
                    (e.learner?.company as { id?: string } | null)?.id ?? null;
                  const totalHt =
                    (companyId ? unitPriceByCompanyId[companyId] : null) ??
                    null;
                  return (
                    <>
                      <div
                        className="shrink-0 flex items-center justify-center overflow-hidden"
                        style={{ width: 150 }}
                      >
                        <EnrollmentFinancingPicker
                          sessionId={sessionId}
                          enrollmentId={e.id}
                          currentMode={mode}
                          currentOpcoAgreementId={currentOpcoId}
                          currentOpcoName={currentOpcoName}
                          currentOpcoDossierNumber={currentOpcoDossier}
                          opcoAgreements={opcoAgreements}
                          inscriptionRequestId={ir?.id ?? null}
                          disabled={!ir}
                        />
                      </div>

                      {/* === Colonne MONTANT (NEW) : Total HT en gras, +
                          OPCO + RAC en sous-détails si applicable.
                          Barré + grisé si statut annulé / absent /
                          abandonné (pas de CA à constater). === */}
                      <div
                        className="text-right shrink-0 flex items-center justify-end"
                        style={{ width: 110 }}
                      >
                        <MontantCell
                          totalHt={totalHt}
                          opcoAmount={mode === "opco" ? opcoAmount : null}
                          cancelled={!isBillable(e.status)}
                        />
                      </div>
                    </>
                  );
                })()}

                {/* === Colonne NIVEAU INITIAL (déplacée en fin de ligne) === */}
                <div
                  className="shrink-0 flex items-center justify-center overflow-hidden"
                  style={{ width: 130 }}
                >
                  <form action={changeLevel}>
                    <select
                      name="initial_level"
                      defaultValue={e.initial_level ?? ""}
                      onChange={(event) =>
                        event.currentTarget.form?.requestSubmit()
                      }
                      title="Niveau initial déclaré pour cet apprenant"
                      className={cn(
                        "h-8 rounded-md border-2 px-2 text-xs font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-400",
                        e.initial_level
                          ? INITIAL_LEVEL_BADGE_CLASSES[e.initial_level]
                          : "bg-zinc-50 text-zinc-500 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-500 dark:border-zinc-800",
                      )}
                    >
                      <option value="">— Niveau —</option>
                      {(
                        Object.keys(INITIAL_LEVEL_LABELS) as InitialLevel[]
                      ).map((key) => (
                        <option key={key} value={key}>
                          {INITIAL_LEVEL_LABELS[key]}
                        </option>
                      ))}
                    </select>
                  </form>
                </div>

                <form action={remove}>
                  <Button
                    type="submit"
                    size="icon-sm"
                    variant="ghost"
                    title="Retirer"
                  >
                    <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </Button>
                </form>
              </li>
            );
          })}
          {/* Footer du tableau : total HT cumulé pour la session
              (calculé sur les inscriptions FACTURABLES — exclut
              cancelled/absent/abandoned). Aligné avec la colonne
              Montant grâce au même schéma de cellules. */}
          {billableEnrollments.length > 0 && totalSessionHt > 0 && (
            <li className="px-6 py-3 flex items-center gap-3 bg-slate-50 dark:bg-slate-950/40 border-t-2 border-slate-200 dark:border-slate-800">
              <div className="h-9 w-9 shrink-0" aria-hidden />
              <div className="flex-1 min-w-0 text-right pr-2 text-xs uppercase tracking-wider font-bold text-slate-600">
                Total session ({billableEnrollments.length} apprenant
                {billableEnrollments.length > 1 ? "s" : ""} facturable
                {billableEnrollments.length > 1 ? "s" : ""})
              </div>
              <div className="shrink-0" style={{ width: 140 }} aria-hidden />
              <div className="shrink-0" style={{ width: 110 }} aria-hidden />
              <div className="shrink-0" style={{ width: 150 }} aria-hidden />
              <div
                className="text-right shrink-0 flex items-center justify-end"
                style={{ width: 110 }}
              >
                <span className="text-[14px] font-black text-cyan-800 dark:text-cyan-300">
                  {formatEUR(totalSessionHt)} HT
                </span>
              </div>
              <div className="shrink-0" style={{ width: 130 }} aria-hidden />
              <div className="w-8 shrink-0" aria-hidden />
            </li>
          )}
        </ul>
      ) : (
        !showForm && (
          <div className="px-6 py-10 text-center">
            <Users className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
            <p className="text-sm font-medium mb-1">
              Aucun apprenant inscrit pour l&apos;instant
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Démarrez en inscrivant le premier apprenant.
            </p>
            <Button
              type="button"
              nativeButton={false}
              render={
                <Link
                  href={`/inscriptions/new?session_id=${sessionId}&return_to=participants`}
                  title="Ouvre la fiche d'inscription complète"
                />
              }
            >
              <UserPlus className="h-4 w-4" />
              Inscrire un apprenant
            </Button>
          </div>
        )
      )}

      {/* Demandes d'inscription en cours (workflow) */}
      {pendingRequests.length > 0 && (
        <div className="border-t border-zinc-200 dark:border-zinc-800">
          <div className="px-6 py-3 bg-amber-50/40 dark:bg-amber-950/15 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-semibold inline-flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <AlertCircle className="h-4 w-4" />
              Demandes d&apos;inscription en cours ({pendingRequests.length})
            </p>
            <p className="text-xs text-slate-500">
              À traiter via le module{" "}
              <Link href="/inscriptions" className="text-cyan-700 underline">
                Inscriptions
              </Link>
            </p>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {pendingRequests.map((r) => {
              const stage = r.stage_id ? stageMap.get(r.stage_id) : null;
              const firstName =
                r.prospect_first_name ?? r.learner?.first_name ?? null;
              const lastName =
                r.prospect_last_name ?? r.learner?.last_name ?? null;
              const email =
                r.prospect_email ?? r.learner?.email ?? null;
              const phone =
                r.prospect_phone ?? r.learner?.phone ?? null;
              const company =
                r.learner?.company?.name ??
                r.company_name_freetext ??
                null;
              const fullName =
                [firstName, lastName].filter(Boolean).join(" ").trim() ||
                "Demande d'inscription";
              return (
                <li
                  key={r.id}
                  className="px-6 py-3 flex items-center gap-3 hover:bg-amber-50/40 dark:hover:bg-amber-950/20"
                >
                  <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white text-xs font-bold flex items-center justify-center shadow-sm">
                    {`${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() ||
                      "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate flex items-center gap-2">
                      {fullName}
                      {r.has_special_needs && (
                        <span
                          className="text-cyan-600"
                          title="Besoin spécifique"
                        >
                          ♿
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 truncate flex flex-wrap gap-x-3">
                      {company && <span>{company}</span>}
                      {email && (
                        <a
                          href={`mailto:${email}`}
                          className="text-cyan-700 hover:underline"
                        >
                          {email}
                        </a>
                      )}
                      {phone && (
                        <a
                          href={`tel:${phone}`}
                          className="hover:text-cyan-700"
                        >
                          {phone}
                        </a>
                      )}
                    </p>
                  </div>
                  {stage && (
                    <span
                      className="inline-block px-2 py-0.5 rounded text-xs font-bold border whitespace-nowrap"
                      style={{
                        backgroundColor: `${stage.color}15`,
                        borderColor: stage.color ?? "#94a3b8",
                        color: stage.color ?? "#475569",
                      }}
                    >
                      {stage.name}
                    </span>
                  )}
                  <Link
                    href={`/inscriptions/${r.id}`}
                    className="text-xs text-cyan-700 hover:underline shrink-0"
                  >
                    Ouvrir →
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Formulaire d'inscription */}
      {showForm && (
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-cyan-50/30 dark:bg-cyan-950/15">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold inline-flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-cyan-600" />
              Inscrire un apprenant
            </p>
            {enrollments.length > 0 && (
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Annuler
              </button>
            )}
          </div>

          {toEnroll.length === 0 ? (
            <p className="text-xs text-slate-500 italic">
              Tous les apprenants disponibles sont déjà inscrits, ou aucun
              apprenant n&apos;est enregistré dans la base.
            </p>
          ) : (
            <form
              action={enroll}
              className="grid gap-3 md:grid-cols-[2fr_1fr_auto] items-end"
            >
              <div className="space-y-1.5">
                <Label className="text-xs" required>
                  Apprenant
                </Label>
                <LearnerSearchPicker
                  learners={toEnroll}
                  defaultValue={selectedLearnerId}
                  onChange={(id) => setSelectedLearnerId(id)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="enroll_status" className="text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    Statut initial
                    <EnrollmentStatusHelp />
                  </span>
                </Label>
                <select
                  id="enroll_status"
                  name="status"
                  value={pickedStatus}
                  onChange={(e) =>
                    setPickedStatus(e.target.value as EnrollmentStatus)
                  }
                  title={ENROLLMENT_STATUS_DESCRIPTIONS[pickedStatus]}
                  className={cn(
                    "flex h-9 w-full rounded-md border-2 px-3 py-1 text-sm font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2",
                    ENROLLMENT_STATUS_BADGE_CLASSES[pickedStatus],
                  )}
                >
                  {(
                    Object.keys(ENROLLMENT_STATUS_LABELS) as EnrollmentStatus[]
                  ).map((key) => (
                    <option key={key} value={key}>
                      {ENROLLMENT_STATUS_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>

              <Button type="submit" disabled={!selectedLearnerId}>
                <UserPlus className="h-4 w-4" />
                Inscrire
              </Button>

              {/* Description du statut sélectionné */}
              <div className="md:col-span-3 -mt-1">
                <p className="text-[11px] text-slate-600 dark:text-slate-400 italic px-1">
                  💡 {ENROLLMENT_STATUS_DESCRIPTIONS[pickedStatus]}
                </p>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Cellule "Montant" dans le tableau Participants.
 *
 * Règles d'affichage :
 *  - Total HT inconnu (pas de convention pour la société) → "—" en gris.
 *  - Pas d'OPCO → juste le Total HT en gras (cas autofinancement / employeur).
 *  - OPCO + Total → 3 lignes : OPCO XX € (orange) / RAC XX € (gris) /
 *    Total XX € HT (gras, en bas) avec le RAC = Total - OPCO.
 *  - OPCO sans Total HT connu → on affiche juste l'OPCO.
 *
 * Lecture seule : pour modifier, l'utilisateur passe par la convention
 * société (prix unitaire) ou par la fiche d'inscription (montant OPCO).
 */
function MontantCell({
  totalHt,
  opcoAmount,
  cancelled = false,
}: {
  totalHt: number | null;
  opcoAmount: number | null;
  /** Si true, l'inscription est annulée/absente/abandonnée : on affiche
   *  le montant barré + opacité réduite pour rappeler qu'il NE compte
   *  PAS dans le total session. */
  cancelled?: boolean;
}) {
  const formatEUR = (n: number) =>
    n.toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    });
  const wrapClass = cancelled ? "line-through opacity-50" : "";
  if (totalHt === null && opcoAmount === null) {
    return <span className="text-[11px] text-slate-400 italic">—</span>;
  }
  if (opcoAmount !== null && totalHt !== null) {
    const rac = Math.max(0, totalHt - opcoAmount);
    return (
      <div
        className={cn("flex flex-col items-end leading-tight", wrapClass)}
      >
        <span className="text-[10px] text-amber-700">
          OPCO {formatEUR(opcoAmount)}
        </span>
        <span className="text-[10px] text-slate-500">
          RAC {formatEUR(rac)}
        </span>
        <span className="text-[12px] font-bold text-slate-900">
          {formatEUR(totalHt)} HT
        </span>
      </div>
    );
  }
  if (opcoAmount !== null) {
    return (
      <span
        className={cn(
          "text-[12px] font-bold text-amber-800",
          wrapClass,
        )}
      >
        OPCO {formatEUR(opcoAmount)}
      </span>
    );
  }
  // Total HT seul (autofinancement, CPF, etc.)
  return (
    <span
      className={cn("text-[12px] font-bold text-slate-900", wrapClass)}
    >
      {formatEUR(totalHt ?? 0)} HT
    </span>
  );
}
