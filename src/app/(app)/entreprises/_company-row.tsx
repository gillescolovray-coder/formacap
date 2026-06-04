"use client";

import { Fragment, useState } from "react";
import { LearnerPortalButtons } from "./_learner-portal-buttons";
import {
  FormationsTooltip,
  type FormationEntry,
} from "./_formations-tooltip";
import Link from "next/link";
import {
  Building2,
  ChevronRight,
  Eye,
  Handshake,
  MapPin,
  User,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COMPANY_CONTACT_ROLE_BADGE_CLASSES,
  COMPANY_CONTACT_ROLE_LABELS,
  COMPANY_TYPE_BADGE_CLASSES,
  COMPANY_TYPE_LABELS,
  COMPANY_TYPE_ROW_CLASSES,
  type Company,
} from "@/lib/companies/types";
import {
  SIRENE_STATUS_BADGE_CLASSES,
  SIRENE_STATUS_LABELS,
  type SireneLegalStatus,
} from "@/lib/sirene/types";

/**
 * Personne unifiée (contact entreprise et/ou apprenant) — calculée
 * côté serveur dans page.tsx puis passée à ce composant.
 */
type Person = {
  key: string;
  company_id: string;
  first_name: string | null;
  last_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  is_contact: boolean;
  is_learner: boolean;
  /** ID du learner si is_learner=true. Sert au lien rapide portail
   *  apprenant (Gilles 2026-06-04). */
  learner_id?: string | null;
  role?: string;
  service?: string | null;
  is_primary?: boolean;
  /** Formations engagées par cet apprenant (info-bulle 📚). */
  formations?: FormationEntry[];
};

type Props = {
  company: Company;
  people: Person[];
  contactCount: number;
  learnerCount: number;
  /** Nombre de formations engagées (session_enrollments non annulés). */
  formationCount: number;
  /** Détail des formations de l'entreprise (info-bulle du compteur). */
  companyFormations?: FormationEntry[];
  /** Nom de la société mère (NULL si l'entreprise n'a pas de parent).
   *  Affiché dans la colonne dédiée du tableau. */
  parentName?: string | null;
  /** ID de la société mère pour le lien cliquable. */
  parentId?: string | null;
  /** Force l'état déplié initial (ex. pour tout déplier en masse). */
  defaultExpanded?: boolean;
  /** Portail partenaire activé ?
   *  - true  : token genere, lien transmis au partenaire
   *  - false : type OF/prescripteur mais pas encore active
   *  - null  : type d'entreprise non eligible (pas d'icone affiche) */
  partnerPortalActive?: boolean | null;
};

/**
 * Ligne d'entreprise avec contacts dépliables au clic.
 * - Le clic sur la ligne (ou la flèche) bascule l'affichage
 * - Le nom / Pappers / SIRET restent cliquables individuellement
 *   grâce à stopPropagation
 */
export function CompanyRow({
  company: c,
  people,
  contactCount,
  learnerCount,
  formationCount,
  companyFormations = [],
  parentName = null,
  parentId = null,
  defaultExpanded = false,
  partnerPortalActive = null,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasPeople = people.length > 0;

  return (
    <Fragment>
      <tr
        onClick={() => hasPeople && setExpanded((v) => !v)}
        className={cn(
          "transition-colors",
          COMPANY_TYPE_ROW_CLASSES[c.type],
          !c.is_active && "opacity-60",
          hasPeople && "cursor-pointer",
        )}
        title={hasPeople ? "Cliquez pour afficher les contacts" : undefined}
      >
        <td className="px-4 py-3">
          <div className="flex items-start gap-3">
            {hasPeople ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((v) => !v);
                }}
                aria-label={
                  expanded
                    ? "Masquer les contacts"
                    : "Afficher les contacts"
                }
                title={
                  expanded
                    ? "Masquer les contacts"
                    : "Afficher les contacts"
                }
                className={cn(
                  "shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-md border transition-colors mt-0.5",
                  expanded
                    ? "bg-cyan-100 border-cyan-300 text-cyan-700 hover:bg-cyan-200"
                    : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-cyan-400",
                )}
              >
                <ChevronRight
                  className={cn(
                    "h-5 w-5 transition-transform",
                    expanded && "rotate-90",
                  )}
                  aria-hidden
                />
              </button>
            ) : (
              <span className="shrink-0 h-8 w-8 mt-0.5" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <Link
                href={`/entreprises/${c.id}`}
                onClick={(e) => e.stopPropagation()}
                className="block hover:underline"
              >
                <p className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                  {c.name}
                </p>
              </Link>
              <p className="text-xs text-zinc-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {/* Icone Portail partenaire (OF/prescripteur uniquement) */}
                {partnerPortalActive !== null && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center h-4 w-4 rounded-full shrink-0",
                      partnerPortalActive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-zinc-100 text-zinc-400",
                    )}
                    title={
                      partnerPortalActive
                        ? "Portail partenaire activé"
                        : "Portail partenaire non activé"
                    }
                  >
                    <Handshake className="h-2.5 w-2.5" />
                  </span>
                )}
                {(c.postal_code || c.city) && (
                  <span className="inline-flex items-center gap-1">
                    <span className="tabular-nums">
                      {c.postal_code ?? ""}
                    </span>
                    <span>{c.city ?? ""}</span>
                  </span>
                )}
                {c.industry && (
                  <span className="text-zinc-600">· {c.industry}</span>
                )}
                {!c.postal_code && !c.city && !c.industry && (
                  <span className="text-zinc-300">—</span>
                )}
              </p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <span
            className={cn(
              "inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap",
              COMPANY_TYPE_BADGE_CLASSES[c.type],
            )}
          >
            {COMPANY_TYPE_LABELS[c.type]}
          </span>
        </td>
        <td className="px-4 py-3 text-xs">
          {parentName && parentId ? (
            <Link
              href={`/entreprises/${parentId}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-violet-700 hover:text-violet-900 hover:underline font-semibold"
              title="Société mère — cliquer pour ouvrir sa fiche"
            >
              <Building2 className="h-3 w-3" />
              <span className="truncate max-w-[160px]">{parentName}</span>
            </Link>
          ) : (
            <span className="text-zinc-300">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-xs">
          <div className="flex flex-col gap-1">
            <span className="text-zinc-500 font-mono">{c.siret ?? "—"}</span>
            {c.pappers_url ? (
              <a
                href={c.pappers_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Consulter la fiche Pappers"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 self-start px-1.5 py-0.5 rounded-md border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 hover:border-cyan-400 transition-colors"
              >
                <Eye className="h-3 w-3" />
                <span className="text-[11px] font-semibold">Pappers</span>
              </a>
            ) : (
              <span className="text-zinc-300">—</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-center">
          {c.latitude !== null && c.longitude !== null ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`Coordonnées GPS : ${c.latitude}, ${c.longitude}${c.gps_source === "auto" ? " (calculées automatiquement depuis l'adresse)" : c.gps_source === "manual" ? " (saisies manuellement)" : ""}`}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "inline-flex items-center justify-center h-7 w-7 rounded-md border transition-colors",
                c.gps_source === "auto"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-500"
                  : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-500",
              )}
            >
              <MapPin className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span
              title="Aucune coordonnée GPS — modifiez la fiche pour les calculer depuis l'adresse"
              className="text-zinc-300 text-xs"
            >
              —
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-center tabular-nums">
          <span className="inline-flex flex-col items-center justify-center gap-1">
            {contactCount > 0 && (
              <span
                title={`${contactCount} contact${contactCount > 1 ? "s" : ""} entreprise`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-100 text-cyan-800 border border-cyan-200 text-xs font-bold"
              >
                <Users className="h-3 w-3" />
                {contactCount}
              </span>
            )}
            {learnerCount > 0 && (
              <span
                title={`${learnerCount} apprenant${learnerCount > 1 ? "s" : ""}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold"
              >
                <User className="h-3 w-3" />
                {learnerCount}
              </span>
            )}
            {contactCount === 0 && learnerCount === 0 && (
              <span className="text-zinc-300 text-sm">—</span>
            )}
          </span>
        </td>
        <td
          className="px-4 py-3 text-center tabular-nums"
          onClick={(e) => e.stopPropagation()}
        >
          {formationCount > 0 ? (
            <FormationsTooltip
              variant="company"
              count={formationCount}
              entries={companyFormations}
              headerLabel={c.name}
            />
          ) : (
            <span className="text-zinc-300 text-sm">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          {c.legal_status ? (
            <span
              className={cn(
                "inline-block px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap",
                SIRENE_STATUS_BADGE_CLASSES[c.legal_status as SireneLegalStatus],
              )}
              title="État officiel selon l'INSEE Sirene"
            >
              {SIRENE_STATUS_LABELS[c.legal_status as SireneLegalStatus]}
            </span>
          ) : c.is_active ? (
            <span className="text-xs text-cyan-600 dark:text-cyan-400">
              ● Active
            </span>
          ) : (
            <span className="text-xs text-zinc-400">○ Inactive</span>
          )}
        </td>
      </tr>

      {/* Ligne dépliée : contacts + apprenants */}
      {expanded && hasPeople && (
        <tr className="bg-slate-50/50 dark:bg-slate-900/30">
          <td
            colSpan={8}
            className="px-4 py-3 border-t border-slate-100 dark:border-slate-800/50"
          >
            <ul className="space-y-2">
              {people.map((p) => {
                const isBoth = p.is_contact && p.is_learner;
                const cardClass = isBoth
                  ? "border-indigo-300 bg-indigo-50/40"
                  : p.is_learner
                    ? "border-emerald-300 bg-emerald-50/40"
                    : "border-slate-200 bg-white dark:bg-slate-900";
                const avatarClass = isBoth
                  ? "bg-gradient-to-br from-indigo-500 to-violet-600"
                  : p.is_learner
                    ? "bg-gradient-to-br from-emerald-500 to-teal-600"
                    : "bg-gradient-to-br from-cyan-500 to-blue-600";
                return (
                  <li
                    key={p.key}
                    className={cn(
                      "flex items-start gap-2.5 rounded-md border px-3 py-2",
                      cardClass,
                    )}
                  >
                    <div
                      className={cn(
                        "h-8 w-8 shrink-0 rounded-full text-white text-xs font-bold flex items-center justify-center",
                        avatarClass,
                      )}
                    >
                      {`${p.first_name?.[0] ?? ""}${p.last_name?.[0] ?? ""}`.toUpperCase() ||
                        "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm inline-flex items-center gap-1.5 flex-wrap">
                        {`${p.first_name ?? ""} ${p.last_name}`.trim()}
                        {p.is_primary && (
                          <span className="text-amber-500 text-base leading-none">
                            ★
                          </span>
                        )}
                        {p.is_learner && (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold border bg-emerald-100 text-emerald-800 border-emerald-300">
                            Apprenant
                          </span>
                        )}
                        {p.is_contact && p.role && (
                          <span
                            className={cn(
                              "inline-block px-2 py-0.5 rounded text-[11px] font-bold border",
                              COMPANY_CONTACT_ROLE_BADGE_CLASSES[
                                p.role as keyof typeof COMPANY_CONTACT_ROLE_BADGE_CLASSES
                              ] ?? "bg-slate-100 text-slate-700 border-slate-200",
                            )}
                          >
                            {COMPANY_CONTACT_ROLE_LABELS[
                              p.role as keyof typeof COMPANY_CONTACT_ROLE_LABELS
                            ] ?? p.role}
                          </span>
                        )}
                        {isBoth && (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-300">
                            Double rôle
                          </span>
                        )}
                      </p>
                      <p className="text-slate-600 text-xs flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {p.job_title && (
                          <span className="font-semibold">{p.job_title}</span>
                        )}
                        {p.service && (
                          <span className="text-slate-500">· {p.service}</span>
                        )}
                        {p.email && (
                          <a
                            href={`mailto:${p.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-cyan-700 hover:underline font-medium"
                          >
                            {p.email}
                          </a>
                        )}
                        {p.mobile ? (
                          <a
                            href={`tel:${p.mobile}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-bold tabular-nums hover:text-cyan-700"
                          >
                            {p.mobile}
                          </a>
                        ) : p.phone ? (
                          <a
                            href={`tel:${p.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-bold tabular-nums hover:text-cyan-700"
                          >
                            {p.phone}
                          </a>
                        ) : null}
                      </p>
                    </div>
                    {/* Compteur formations + boutons portail — visibles
                        uniquement sur les apprenants. */}
                    {p.is_learner && p.learner_id && (
                      <div className="flex items-center gap-2 shrink-0">
                        {p.formations && p.formations.length > 0 && (
                          <FormationsTooltip
                            variant="learner"
                            count={p.formations.length}
                            entries={p.formations}
                            headerLabel={`${p.first_name ?? ""} ${p.last_name}`.trim()}
                          />
                        )}
                        <LearnerPortalButtons
                          learnerId={p.learner_id}
                          hasEmail={Boolean(p.email)}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
