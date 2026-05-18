import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ListChecks, User } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "../_resolve";
import { InscriptionsList, type InscriptionRow } from "./_list";

type Params = { token: string };

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

  // Toutes les inscriptions soumises par ce partenaire — on charge en
  // plus :
  //   • téléphone apprenant (learners + fallback prospect_phone)
  //   • entreprise rattachée (companies via company_id) + texte libre
  //   • contact référent pédagogique (migration 0093)
  //   • modalité et durée de la formation
  const { data: requests } = await supabase
    .from("inscription_requests")
    .select(
      `
      id, received_at,
      prospect_first_name, prospect_last_name, prospect_email, prospect_phone,
      company_name_freetext,
      contact_referent_first_name, contact_referent_last_name,
      contact_referent_email, contact_referent_phone, contact_referent_role,
      learner:learners(id, first_name, last_name, email, phone),
      company:companies(id, name, city),
      session:sessions(id, internal_code, start_date, end_date, modality,
        formation:formations(id, title, duration_hours, duration_days))
    `,
    )
    .eq("referrer_company_id", ctx.company.id)
    .order("received_at", { ascending: false });

  type Raw = {
    id: string;
    received_at: string;
    prospect_first_name: string | null;
    prospect_last_name: string | null;
    prospect_email: string | null;
    prospect_phone: string | null;
    company_name_freetext: string | null;
    contact_referent_first_name: string | null;
    contact_referent_last_name: string | null;
    contact_referent_email: string | null;
    contact_referent_phone: string | null;
    contact_referent_role: string | null;
    learner:
      | {
          id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
        }
      | Array<{
          id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
        }>
      | null;
    company:
      | { id: string; name: string; city: string | null }
      | Array<{ id: string; name: string; city: string | null }>
      | null;
    session:
      | {
          id: string;
          internal_code: string | null;
          start_date: string | null;
          end_date: string | null;
          modality: string | null;
          formation:
            | {
                id: string;
                title: string;
                duration_hours: number | null;
                duration_days: number | null;
              }
            | Array<{
                id: string;
                title: string;
                duration_hours: number | null;
                duration_days: number | null;
              }>
            | null;
        }
      | Array<{
          id: string;
          internal_code: string | null;
          start_date: string | null;
          end_date: string | null;
          modality: string | null;
          formation:
            | {
                id: string;
                title: string;
                duration_hours: number | null;
                duration_days: number | null;
              }
            | Array<{
                id: string;
                title: string;
                duration_hours: number | null;
                duration_days: number | null;
              }>
            | null;
        }>
      | null;
  };
  const rows: InscriptionRow[] = ((requests ?? []) as unknown as Raw[]).map(
    (r) => {
      const learner = Array.isArray(r.learner) ? r.learner[0] : r.learner;
      const company = Array.isArray(r.company) ? r.company[0] : r.company;
      const session = Array.isArray(r.session) ? r.session[0] : r.session;
      let formation: {
        id: string;
        title: string;
        duration_hours: number | null;
        duration_days: number | null;
      } | null = null;
      if (session?.formation) {
        formation = Array.isArray(session.formation)
          ? session.formation[0] ?? null
          : session.formation;
      }
      const referent =
        r.contact_referent_email ||
        r.contact_referent_last_name ||
        r.contact_referent_first_name
          ? {
              first_name: r.contact_referent_first_name,
              last_name: r.contact_referent_last_name,
              email: r.contact_referent_email,
              phone: r.contact_referent_phone,
              role: r.contact_referent_role,
            }
          : null;
      return {
        id: r.id,
        received_at: r.received_at,
        learnerName: learner
          ? `${learner.first_name} ${learner.last_name}`
          : [r.prospect_first_name, r.prospect_last_name]
              .filter(Boolean)
              .join(" ") || "—",
        learnerEmail: learner?.email ?? r.prospect_email ?? null,
        learnerPhone: learner?.phone ?? r.prospect_phone ?? null,
        companyName: company?.name ?? r.company_name_freetext ?? null,
        companyCity: company?.city ?? null,
        contact_referent: referent,
        sessionRef: session?.internal_code ?? null,
        startDate: session?.start_date ?? null,
        endDate: session?.end_date ?? null,
        modality: session?.modality ?? null,
        formationTitle: formation?.title ?? "—",
        durationHours: formation?.duration_hours ?? null,
        durationDays: formation?.duration_days ?? null,
      };
    },
  );

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
        <InscriptionsList rows={rows} />
      )}
    </div>
  );
}
