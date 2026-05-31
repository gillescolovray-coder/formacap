"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Briefcase,
  Building2,
  FileSignature,
  ListChecks,
  Mail,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SessionDetailDialog,
  type SessionDetailItem,
} from "./_session-detail-dialog";

type StageItem = {
  id: string;
  name: string;
  color: string | null;
  count: number;
};

type PersonRow = {
  key: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  company_name: string | null;
  statusLabel: string;
  statusColor: string | null;
};

type ConventionSummary = {
  signed: number;
  sent: number;
  draft: number;
  totalCompanies: number;
};

type Props = {
  total: number;
  enrolled: number;
  inscriptions: number;
  maxParticipants: number | null;
  isFull: boolean;
  stageBreakdown: StageItem[];
  persons: PersonRow[];
  // Refonte UI Option A 2026-05-31 — nouvelle modal synthese
  sessionTitle?: string;
  sessionDate?: string | null;
  detailItems?: SessionDetailItem[];
  conventionSummary?: ConventionSummary;
};

export function InscriptionsCounterCell({
  total,
  enrolled,
  inscriptions,
  maxParticipants,
  isFull,
  stageBreakdown,
  persons,
  sessionTitle,
  sessionDate,
  detailItems,
  conventionSummary,
}: Props) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function show() {
    if (!triggerRef.current || total === 0) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
    setOpen(true);
  }

  function hide() {
    setOpen(false);
  }

  // Refonte UI Option A 2026-05-31 — etat de la modal synthese
  const [detailOpen, setDetailOpen] = useState(false);
  const canShowDetail = !!(
    sessionTitle &&
    detailItems &&
    detailItems.length > 0
  );

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <div
          ref={triggerRef}
          className="text-right cursor-help"
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <span
            className={cn(
              "font-bold tabular-nums",
              isFull
                ? "text-red-700 dark:text-red-400"
                : total > 0
                  ? "text-cyan-700 dark:text-cyan-400"
                  : "text-zinc-700 dark:text-zinc-300",
            )}
          >
            {total}
          </span>
          {maxParticipants !== null && maxParticipants !== undefined && (
            <span className="text-xs text-zinc-400 font-normal">
              {" "}
              / {maxParticipants}
            </span>
          )}
          {inscriptions > 0 && (
            <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 align-middle">
              +{inscriptions} en cours
            </span>
          )}
        </div>

        {/* Badge synthese conventions (refonte UI Option A) */}
        {conventionSummary && conventionSummary.totalCompanies > 0 && (
          <div className="flex items-center gap-1 text-[10px] whitespace-nowrap">
            <FileSignature className="h-3 w-3 text-zinc-400" />
            {conventionSummary.signed > 0 && (
              <span
                className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold"
                title={`${conventionSummary.signed} convention(s) signée(s)`}
              >
                {conventionSummary.signed}✓
              </span>
            )}
            {conventionSummary.sent > 0 && (
              <span
                className="px-1 py-0.5 rounded bg-cyan-100 text-cyan-800 font-bold"
                title={`${conventionSummary.sent} convention(s) envoyée(s)`}
              >
                {conventionSummary.sent}✉
              </span>
            )}
            {conventionSummary.draft > 0 && (
              <span
                className="px-1 py-0.5 rounded bg-amber-100 text-amber-800 font-bold"
                title={`${conventionSummary.draft} convention(s) brouillon`}
              >
                {conventionSummary.draft}⏳
              </span>
            )}
          </div>
        )}

        {/* Bouton "Voir détail" qui ouvre la modal (refonte UI Option A) */}
        {canShowDetail && (
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-cyan-700 hover:text-cyan-900 hover:underline whitespace-nowrap"
            title="Voir le détail inscriptions + conventions"
          >
            <ListChecks className="h-3 w-3" />
            Voir détail
          </button>
        )}
      </div>

      {/* Modal synthese (refonte UI Option A) */}
      {canShowDetail && (
        <SessionDetailDialog
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          sessionTitle={sessionTitle!}
          sessionDate={sessionDate ?? null}
          items={detailItems!}
        />
      )}

      {mounted &&
        open &&
        coords &&
        total > 0 &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: coords.top,
              right: coords.right,
              zIndex: 9999,
            }}
            className="w-[420px] max-h-[500px] overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl"
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            {/* Récap chiffré */}
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 rounded-t-xl sticky top-0 z-10">
              <div className="flex items-baseline gap-3">
                <span className="font-black text-2xl tabular-nums text-cyan-700 dark:text-cyan-400">
                  {total}
                </span>
                <p className="text-xs text-slate-500">
                  {maxParticipants !== null && (
                    <>
                      sur {maxParticipants} places{" "}
                      {isFull && (
                        <span className="ml-1 inline-block px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[9px] font-bold uppercase">
                          Complet
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {enrolled > 0 && (
                  <>
                    <strong>{enrolled}</strong> inscrit
                    {enrolled > 1 ? "s" : ""}
                  </>
                )}
                {enrolled > 0 && inscriptions > 0 && " · "}
                {inscriptions > 0 && (
                  <>
                    <strong>{inscriptions}</strong> demande
                    {inscriptions > 1 ? "s" : ""} en cours
                  </>
                )}
              </p>
              {stageBreakdown.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {stageBreakdown.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap"
                      style={{
                        backgroundColor: `${s.color}15`,
                        borderColor: s.color ?? "#94a3b8",
                        color: s.color ?? "#475569",
                      }}
                    >
                      {s.name} {s.count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Liste détaillée des personnes */}
            {persons.length > 0 && (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {persons.map((p) => {
                  const fullName =
                    [p.first_name, p.last_name]
                      .filter(Boolean)
                      .join(" ")
                      .trim() || "—";
                  return (
                    <li
                      key={p.key}
                      className="px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold truncate">
                          {p.last_name?.toUpperCase() ?? ""}
                          {p.first_name ? ` ${p.first_name}` : ""}
                          {!p.first_name && !p.last_name && fullName}
                        </p>
                        <span
                          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap shrink-0"
                          style={{
                            backgroundColor: `${p.statusColor}15`,
                            borderColor: p.statusColor ?? "#94a3b8",
                            color: p.statusColor ?? "#475569",
                          }}
                        >
                          {p.statusLabel}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 space-y-1 mt-1.5">
                        {(p.job_title || p.company_name) && (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                            {p.job_title && (
                              <span className="inline-flex items-center gap-1">
                                <Briefcase className="h-3 w-3" />
                                {p.job_title}
                              </span>
                            )}
                            {p.company_name && (
                              <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                                <Building2 className="h-3 w-3" />
                                {p.company_name}
                              </span>
                            )}
                          </div>
                        )}
                        {(p.email || p.phone) && (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                            {p.email && (
                              <a
                                href={`mailto:${p.email}`}
                                className="inline-flex items-center gap-1 text-cyan-700 dark:text-cyan-400 hover:underline"
                              >
                                <Mail className="h-3 w-3" />
                                {p.email}
                              </a>
                            )}
                            {p.phone && (
                              <a
                                href={`tel:${p.phone}`}
                                className="inline-flex items-center gap-1 hover:text-cyan-700 font-medium"
                              >
                                <Phone className="h-3 w-3" />
                                {p.phone}
                              </a>
                            )}
                          </div>
                        )}
                        {!p.job_title &&
                          !p.company_name &&
                          !p.email &&
                          !p.phone && (
                            <span className="italic text-slate-400">
                              Pas de coordonnées renseignées
                            </span>
                          )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
