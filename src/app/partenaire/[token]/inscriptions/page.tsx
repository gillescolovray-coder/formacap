import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ListChecks, User } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "../_resolve";
import { InscriptionsList, type InscriptionRow } from "./_list";

// Force un rendu dynamique a chaque visite — sinon le cache Next.js
// peut servir une version obsolete apres validation d'une pre-inscription
// (le revalidatePath ne suffit pas toujours selon le contexte navigateur).
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { token: string };

export default async function PartnerInscriptionsPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ ok?: string; errors?: string }>;
}) {
  const { token } = await params;
  const { ok, errors: errorsParam } = await searchParams;
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
      id, received_at, target_session_id, company_id,
      prospect_first_name, prospect_last_name, prospect_email, prospect_phone,
      company_name_freetext,
      contact_referent_first_name, contact_referent_last_name,
      contact_referent_email, contact_referent_phone, contact_referent_role,
      stage:inscription_stages(key),
      learner:learners(id, first_name, last_name, email, phone, job_title),
      company:companies!company_id(id, name, city),
      session:sessions(id, internal_code, start_date, end_date, modality, status,
        formation:formations(id, title, duration_hours, duration_days))
    `,
    )
    .eq("referrer_company_id", ctx.company.id)
    .order("received_at", { ascending: false });

  type Raw = {
    id: string;
    received_at: string;
    target_session_id: string | null;
    company_id: string | null;
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
    stage:
      | { key: string }
      | Array<{ key: string }>
      | null;
    learner:
      | {
          id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          job_title: string | null;
        }
      | Array<{
          id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          job_title: string | null;
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
          status: string | null;
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
          status: string | null;
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

  const rawList = (requests ?? []) as unknown as Raw[];

  // Charge conventions (par session_id + company_id) et convocations
  // (par session_enrollments lies aux inscriptions) en 2 requetes
  // batch pour eviter N+1.
  const sessionIds = Array.from(
    new Set(rawList.map((r) => r.target_session_id).filter(Boolean)),
  ) as string[];
  const companyIds = Array.from(
    new Set(rawList.map((r) => r.company_id).filter(Boolean)),
  ) as string[];
  const requestIds = rawList.map((r) => r.id);

  // Conventions par couple (session_id, company_id) — Map cle = `${session}|${company}`
  const conventionsMap = new Map<
    string,
    { status: string | null; sent_at: string | null; signed_at: string | null }
  >();
  if (sessionIds.length > 0 && companyIds.length > 0) {
    const { data: convs } = await supabase
      .from("session_conventions")
      .select("session_id, company_id, status, sent_at, signed_at")
      .in("session_id", sessionIds)
      .in("company_id", companyIds);
    (convs ?? []).forEach(
      (c: {
        session_id: string;
        company_id: string;
        status: string | null;
        sent_at: string | null;
        signed_at: string | null;
      }) => {
        conventionsMap.set(`${c.session_id}|${c.company_id}`, {
          status: c.status,
          sent_at: c.sent_at,
          signed_at: c.signed_at,
        });
      },
    );
  }

  // Convocations envoyees : on lit session_enrollments.inscription_email_sent_at
  // qui est mis a jour quand la convocation part. Le lien avec
  // inscription_request se fait via session_enrollments.inscription_request_id.
  const convocationsByRequestId = new Map<string, string | null>();
  if (requestIds.length > 0) {
    const { data: enrolls } = await supabase
      .from("session_enrollments")
      .select("inscription_request_id, inscription_email_sent_at")
      .in("inscription_request_id", requestIds);
    (enrolls ?? []).forEach(
      (e: {
        inscription_request_id: string | null;
        inscription_email_sent_at: string | null;
      }) => {
        if (e.inscription_request_id) {
          convocationsByRequestId.set(
            e.inscription_request_id,
            e.inscription_email_sent_at,
          );
        }
      },
    );
  }
  const rows: InscriptionRow[] = rawList.map(
    (r) => {
      const learner = Array.isArray(r.learner) ? r.learner[0] : r.learner;
      const company = Array.isArray(r.company) ? r.company[0] : r.company;
      const session = Array.isArray(r.session) ? r.session[0] : r.session;
      const stage = Array.isArray(r.stage) ? r.stage[0] : r.stage;
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
      const convKey =
        session?.id && company?.id ? `${session.id}|${company.id}` : null;
      const conv = convKey ? conventionsMap.get(convKey) ?? null : null;
      const convocSentAt = convocationsByRequestId.get(r.id) ?? null;
      return {
        id: r.id,
        received_at: r.received_at,
        learnerName: learner
          ? `${learner.first_name} ${learner.last_name}`
          : [r.prospect_first_name, r.prospect_last_name]
              .filter(Boolean)
              .join(" ") || "—",
        learnerFirstName: learner?.first_name ?? r.prospect_first_name ?? null,
        learnerLastName: learner?.last_name ?? r.prospect_last_name ?? null,
        learnerJobTitle: learner?.job_title ?? null,
        learnerEmail: learner?.email ?? r.prospect_email ?? null,
        learnerPhone: learner?.phone ?? r.prospect_phone ?? null,
        companyName: company?.name ?? r.company_name_freetext ?? null,
        companyCity: company?.city ?? null,
        companyId: company?.id ?? null,
        sessionId: session?.id ?? null,
        contact_referent: referent,
        sessionRef: session?.internal_code ?? null,
        startDate: session?.start_date ?? null,
        endDate: session?.end_date ?? null,
        modality: session?.modality ?? null,
        sessionStatus: session?.status ?? null,
        formationTitle: formation?.title ?? "—",
        durationHours: formation?.duration_hours ?? null,
        durationDays: formation?.duration_days ?? null,
        // Suivi metier des etapes (Gilles 2026-05-28)
        isConfirmed: stage?.key === "confirmed",
        conventionStatus: conv?.status ?? null,
        conventionSentAt: conv?.sent_at ?? null,
        conventionSignedAt: conv?.signed_at ?? null,
        convocationSentAt: convocSentAt,
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

      {ok && !errorsParam && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 inline-flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
          <span>
            {Number(ok) > 1
              ? `${ok} inscriptions enregistrées et confirmées.`
              : "Inscription enregistrée et confirmée."}
          </span>
        </div>
      )}

      {/* Bandeau d'erreur partielle (Gilles 2026-05-22) : si certaines
          inscriptions ont échoué silencieusement dans le batch, on
          alerte visiblement le partenaire pour qu'il ne croie pas avoir
          réussi alors qu'il a perdu des apprenants. */}
      {errorsParam && (
        <div className="rounded-xl bg-red-50 border-2 border-red-400 p-4 shadow-md">
          <div className="flex items-start gap-3">
            <span className="text-2xl shrink-0" aria-hidden>
              ⚠️
            </span>
            <div className="flex-1">
              <h3 className="font-bold text-red-900 text-base mb-1">
                {ok
                  ? `${ok} inscription${Number(ok) > 1 ? "s" : ""} enregistrée${Number(ok) > 1 ? "s" : ""}, mais certaines ont échoué`
                  : "Aucune inscription enregistrée"}
              </h3>
              <p className="text-sm text-red-800 leading-relaxed">
                Détail des échecs :
              </p>
              <ul className="text-sm text-red-800 list-disc pl-5 mt-1 space-y-0.5">
                {errorsParam.split(", ").map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
              <p className="text-xs text-red-700 italic mt-3">
                Resoumettez les apprenants en échec (corrigez l&apos;erreur
                indiquée), ou contactez {ctx.organization.name} si vous ne
                comprenez pas le message d&apos;erreur.
              </p>
            </div>
          </div>
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
        <InscriptionsList token={token} rows={rows} />
      )}
    </div>
  );
}
