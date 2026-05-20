"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Euro,
  Mail,
  MessageSquare,
  Phone,
  User,
  UserCheck,
  XCircle,
} from "lucide-react";
import { validatePreinscription, rejectPreinscription } from "./actions";

export type PendingPreinscription = {
  id: string;
  received_at: string | null;
  message: string | null;
  learner: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    job_title: string | null;
  };
  company: {
    name: string | null;
    siret: string | null;
    city: string | null;
  };
  contact_referent: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    role: string | null;
  } | null;
  financing: {
    mode: string | null;
    details: string | null;
  };
  session: {
    id: string;
    start_date: string | null;
    end_date: string | null;
    modality: string | null;
    formation_title: string | null;
    duration_hours: number | null;
    duration_days: number | null;
  } | null;
};

/**
 * Formate une date qui peut être :
 *   - un ISO timestamp (received_at, created_at) → date + heure
 *   - une date pure YYYY-MM-DD (session.start_date) → date seule
 * Gère le cas Invalid Date silencieusement (retourne "—").
 */
function formatDate(s: string | null, withTime = false): string {
  if (!s) return "—";
  // Si pas de "T" dans la chaîne, on ajoute T00:00:00 pour éviter le
  // décalage UTC (sinon une date pure "2026-05-18" devient le 17 mai
  // en heure locale française).
  const iso = s.includes("T") ? s : `${s}T00:00:00`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

const FINANCING_LABELS: Record<string, string> = {
  employeur: "Employeur",
  opco: "OPCO",
  cpf: "CPF",
  autofinancement: "Autofinancement",
  france_travail: "France Travail",
  aif: "AIF",
  aide_region: "Aide région",
  mixte: "Mixte",
  autre: "Autre",
};

export function PreinscriptionsList({
  token,
  items,
}: {
  token: string;
  items: PendingPreinscription[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function doValidate(id: string) {
    if (!confirm("Valider cette pré-inscription ? L'apprenant sera inscrit officiellement.")) return;
    setErrors((e) => ({ ...e, [id]: "" }));
    startTransition(async () => {
      const res = await validatePreinscription(token, id);
      if (!res.ok) {
        setErrors((e) => ({ ...e, [id]: res.error ?? "Erreur" }));
        return;
      }
      router.refresh();
    });
  }

  function doReject(id: string) {
    if (!confirm("Refuser cette pré-inscription ? Cette action est définitive.")) return;
    setErrors((e) => ({ ...e, [id]: "" }));
    startTransition(async () => {
      const res = await rejectPreinscription(token, id);
      if (!res.ok) {
        setErrors((e) => ({ ...e, [id]: res.error ?? "Erreur" }));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {items.map((p) => (
        <article
          key={p.id}
          className="rounded-2xl bg-white border border-amber-200 p-3 sm:p-5 space-y-3"
        >
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-zinc-900 text-sm sm:text-base">
                {p.session?.formation_title ?? "(formation supprimée)"}
              </h3>
              {p.session && (
                <p className="text-xs text-zinc-600 mt-0.5 flex items-center gap-1 flex-wrap">
                  <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                  <span>{formatDate(p.session.start_date)}</span>
                  {p.session.end_date && p.session.end_date !== p.session.start_date
                    ? <span>→ {formatDate(p.session.end_date)}</span>
                    : ""}
                  {p.session.modality && (
                    <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 text-[10px] font-bold uppercase">
                      {p.session.modality}
                    </span>
                  )}
                  {(() => {
                    // Durée « N j / H h » à côté de la date + modalité
                    const d = p.session?.duration_days;
                    const h = p.session?.duration_hours;
                    const dayLabel =
                      d != null && d > 0
                        ? Number.isInteger(d)
                          ? `${d} j`
                          : `${d.toFixed(1)} j`
                        : null;
                    const hourLabel =
                      h != null && h > 0 ? `${h} h` : null;
                    const dur =
                      dayLabel && hourLabel
                        ? `${dayLabel} / ${hourLabel}`
                        : dayLabel ?? hourLabel;
                    if (!dur) return null;
                    return (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-zinc-600 text-[11px]">
                        <Clock className="h-3 w-3 text-zinc-400" />
                        {dur}
                      </span>
                    );
                  })()}
                </p>
              )}
            </div>
            <span className="text-[10px] sm:text-[11px] text-zinc-500 italic whitespace-nowrap">
              Reçu le {formatDate(p.received_at, true)}
            </span>
          </div>

          {/* Bloc APPRENANT à inscrire */}
          <div className="rounded-md bg-zinc-50 border border-zinc-200 p-3 space-y-2 text-sm">
            <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 inline-flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              Apprenant
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="inline-flex items-center gap-2">
                <strong className="text-zinc-900">
                  {p.learner.first_name} {p.learner.last_name}
                </strong>
              </div>
              <div className="inline-flex items-center gap-2 text-zinc-700">
                <Mail className="h-3.5 w-3.5 text-zinc-400" />
                {p.learner.email ? (
                  <a
                    href={`mailto:${p.learner.email}`}
                    className="hover:underline break-all"
                  >
                    {p.learner.email}
                  </a>
                ) : (
                  "—"
                )}
              </div>
              {p.learner.phone && (
                <div className="inline-flex items-center gap-2 text-zinc-700">
                  <Phone className="h-3.5 w-3.5 text-zinc-400" />
                  {p.learner.phone}
                </div>
              )}
              {p.learner.job_title && (
                <div className="text-zinc-700">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 mr-1">
                    Fonction :
                  </span>
                  {p.learner.job_title}
                </div>
              )}
            </div>
          </div>

          {/* Bloc ENTREPRISE */}
          <div className="rounded-md bg-zinc-50 border border-zinc-200 p-3 space-y-2 text-sm">
            <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 inline-flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Entreprise
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <strong className="text-zinc-900">
                  {p.company.name ?? "—"}
                </strong>
              </div>
              {p.company.siret && (
                <div className="text-zinc-700">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 mr-1">
                    SIRET :
                  </span>
                  <span className="tabular-nums">{p.company.siret}</span>
                </div>
              )}
              {p.company.city && (
                <div className="text-zinc-700">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 mr-1">
                    Ville :
                  </span>
                  {p.company.city}
                </div>
              )}
            </div>
          </div>

          {/* Bloc CONTACT RÉFÉRENT (recevra la convention) */}
          {p.contact_referent && (
            <div className="rounded-md bg-blue-50/50 border border-blue-200 p-3 space-y-2 text-sm">
              <p className="text-[10px] uppercase tracking-wider font-bold text-blue-700 inline-flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5" />
                Contact référent (recevra la convention)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <strong className="text-zinc-900">
                    {p.contact_referent.first_name}{" "}
                    {p.contact_referent.last_name}
                  </strong>
                </div>
                {p.contact_referent.email && (
                  <div className="inline-flex items-center gap-2 text-zinc-700">
                    <Mail className="h-3.5 w-3.5 text-zinc-400" />
                    <a
                      href={`mailto:${p.contact_referent.email}`}
                      className="hover:underline break-all"
                    >
                      {p.contact_referent.email}
                    </a>
                  </div>
                )}
                {p.contact_referent.phone && (
                  <div className="inline-flex items-center gap-2 text-zinc-700">
                    <Phone className="h-3.5 w-3.5 text-zinc-400" />
                    {p.contact_referent.phone}
                  </div>
                )}
                {p.contact_referent.role && (
                  <div className="text-zinc-700">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 mr-1">
                      Fonction :
                    </span>
                    {p.contact_referent.role}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bloc FINANCEMENT */}
          {p.financing.mode && (
            <div className="rounded-md bg-emerald-50/50 border border-emerald-200 p-3 text-sm inline-flex items-center gap-2 flex-wrap">
              <Euro className="h-3.5 w-3.5 text-emerald-700" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">
                Financement :
              </span>
              <strong className="text-zinc-900">
                {FINANCING_LABELS[p.financing.mode] ?? p.financing.mode}
              </strong>
              {p.financing.details && (
                <span className="text-zinc-700">— {p.financing.details}</span>
              )}
            </div>
          )}

          {p.message && (
            <div className="text-xs text-zinc-700 italic border-l-2 border-zinc-300 pl-3 bg-zinc-50/50 py-2 rounded-r">
              <span className="inline-flex items-center gap-1.5 not-italic font-bold text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                <MessageSquare className="h-3 w-3" />
                Message
              </span>
              <p>« {p.message} »</p>
            </div>
          )}

          {errors[p.id] && (
            <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
              {errors[p.id]}
            </div>
          )}

          {/* Boutons : pleine largeur sur mobile, alignés à droite sur
              desktop. Touch-friendly (≥ 44px de hauteur). */}
          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={() => doReject(p.id)}
              disabled={pending}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md border border-zinc-300 bg-white text-zinc-700 text-sm font-medium hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Refuser
            </button>
            <button
              type="button"
              onClick={() => doValidate(p.id)}
              disabled={pending}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              Valider l&apos;inscription
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
