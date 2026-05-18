import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ListChecks,
  User,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "../_resolve";

type Params = { token: string };

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function PartnerInscriptionsPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const { token } = await params;
  const { ok } = await searchParams;
  const ctx = await resolvePartnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();

  // Toutes les inscriptions soumises par ce partenaire
  const { data: requests } = await supabase
    .from("inscription_requests")
    .select(
      `
      id, received_at, prospect_first_name, prospect_last_name,
      learner:learners(id, first_name, last_name, email),
      session:sessions(id, reference, start_date, end_date,
        formation:formations(id, title))
    `,
    )
    .eq("referrer_company_id", ctx.company.id)
    .order("received_at", { ascending: false });

  type Row = {
    id: string;
    received_at: string;
    prospect_first_name: string | null;
    prospect_last_name: string | null;
    learner:
      | {
          id: string;
          first_name: string;
          last_name: string;
          email: string | null;
        }
      | Array<{
          id: string;
          first_name: string;
          last_name: string;
          email: string | null;
        }>
      | null;
    session:
      | {
          id: string;
          reference: string | null;
          start_date: string | null;
          end_date: string | null;
          formation:
            | { id: string; title: string }
            | Array<{ id: string; title: string }>
            | null;
        }
      | Array<{
          id: string;
          reference: string | null;
          start_date: string | null;
          end_date: string | null;
          formation:
            | { id: string; title: string }
            | Array<{ id: string; title: string }>
            | null;
        }>
      | null;
  };
  const rows = ((requests ?? []) as unknown as Row[]).map((r) => {
    const learner = Array.isArray(r.learner) ? r.learner[0] : r.learner;
    const session = Array.isArray(r.session) ? r.session[0] : r.session;
    const formation =
      session && Array.isArray(session.formation)
        ? session.formation[0]
        : (session?.formation ?? null);
    return {
      id: r.id,
      received_at: r.received_at,
      learnerName: learner
        ? `${learner.first_name} ${learner.last_name}`
        : [r.prospect_first_name, r.prospect_last_name]
            .filter(Boolean)
            .join(" ") || "—",
      learnerEmail: learner?.email ?? null,
      sessionRef: session?.reference ?? null,
      startDate: session?.start_date ?? null,
      endDate: session?.end_date ?? null,
      formationTitle: formation?.title ?? "—",
    };
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <Link
        href={`/partenaire/${token}`}
        className="inline-flex items-center gap-1 text-sm text-cyan-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour au tableau de bord
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-zinc-900 inline-flex items-center gap-2">
          <ListChecks className="h-6 w-6 text-indigo-600" />
          Mes inscriptions
        </h1>
        <p className="text-sm text-zinc-600 mt-1">
          Liste des apprenants que vous avez inscrits via votre espace
          partenaire.
        </p>
      </header>

      {ok && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 inline-flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
          <span>Inscription enregistrée et confirmée.</span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-8 text-center">
          <User className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm text-zinc-600">
            Aucune inscription enregistrée pour le moment.
          </p>
          <Link
            href={`/partenaire/${token}/catalogue`}
            className="inline-block mt-3 text-sm text-cyan-700 hover:underline"
          >
            Parcourir le catalogue →
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <Th>Apprenant</Th>
                <Th>Formation</Th>
                <Th>Dates</Th>
                <Th>Statut</Th>
                <Th>Inscrit le</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isFinished = r.endDate && r.endDate < today;
                const isStarted = r.startDate && r.startDate <= today;
                const statusBadge = isFinished
                  ? {
                      label: "Terminée",
                      cls: "bg-emerald-100 text-emerald-700 border-emerald-200",
                    }
                  : isStarted
                    ? {
                        label: "En cours",
                        cls: "bg-amber-100 text-amber-700 border-amber-200",
                      }
                    : {
                        label: "À venir",
                        cls: "bg-cyan-100 text-cyan-700 border-cyan-200",
                      };
                return (
                  <tr
                    key={r.id}
                    className="border-t border-zinc-200 hover:bg-zinc-50/50"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-zinc-900">
                        {r.learnerName}
                      </div>
                      {r.learnerEmail && (
                        <div className="text-[11px] text-zinc-500">
                          {r.learnerEmail}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-zinc-800">
                        {r.formationTitle}
                      </div>
                      {r.sessionRef && (
                        <div className="text-[11px] text-zinc-500">
                          Réf. {r.sessionRef}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <div className="inline-flex items-center gap-1 text-zinc-700">
                        <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                        {formatDate(r.startDate)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusBadge.cls}`}
                      >
                        {statusBadge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-600 inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-zinc-400" />
                      {new Date(r.received_at).toLocaleDateString("fr-FR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-[11px] uppercase tracking-wider font-bold text-zinc-600 px-3 py-2.5">
      {children}
    </th>
  );
}
