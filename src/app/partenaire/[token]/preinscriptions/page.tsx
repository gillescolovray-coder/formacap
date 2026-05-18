import { notFound } from "next/navigation";
import { CheckCircle2, ClipboardList, Inbox } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "../_resolve";
import { PreinscriptionsList, type PendingPreinscription } from "./_list";

type Params = { token: string };

/**
 * Onglet « Pré-inscriptions à valider » du portail partenaire.
 *
 * Liste les inscription_requests en stage `partner_preinscription`
 * (cf. migration 0090) où le partenaire est `referrer_company_id`.
 * Le partenaire valide ou refuse chaque demande individuellement.
 */
export default async function PartnerPreinscriptionsPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const ctx = await resolvePartnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();

  // Récupérer l'id du stage `partner_preinscription` pour l'organisation
  const { data: stage } = await supabase
    .from("inscription_stages")
    .select("id")
    .eq("organization_id", ctx.company.organization_id)
    .eq("key", "partner_preinscription")
    .maybeSingle<{ id: string }>();

  let pending: PendingPreinscription[] = [];
  if (stage?.id) {
    const { data: requests } = await supabase
      .from("inscription_requests")
      .select(
        `
        id, received_at, created_at, request_message,
        prospect_first_name, prospect_last_name, prospect_email, prospect_phone,
        company_name_freetext,
        financing_mode, financing_details,
        contact_referent_first_name, contact_referent_last_name,
        contact_referent_email, contact_referent_phone, contact_referent_role,
        target_session_id,
        session:sessions!target_session_id(
          id, start_date, end_date, modality,
          formation:formations!inner(id, title, duration_hours, duration_days)
        )
      `,
      )
      .eq("organization_id", ctx.company.organization_id)
      .eq("referrer_company_id", ctx.company.id)
      .eq("stage_id", stage.id)
      .order("received_at", { ascending: false });

    // Fetch séparé des payloads "created" pour récupérer SIRET / ville
    // de l'entreprise (saisis au formulaire mais pas stockés sur des
    // colonnes dédiées). Best-effort.
    const reqIds = ((requests ?? []) as Array<{ id: string }>).map(
      (r) => r.id,
    );
    const eventBySession = new Map<
      string,
      { company_siret?: string | null; company_city?: string | null; job_title?: string | null }
    >();
    if (reqIds.length > 0) {
      const { data: events } = await supabase
        .from("inscription_events")
        .select("request_id, payload")
        .in("request_id", reqIds)
        .eq("event_type", "created");
      (events ?? []).forEach((e) => {
        const rid = e.request_id as string;
        if (!eventBySession.has(rid)) {
          eventBySession.set(
            rid,
            (e.payload ?? {}) as {
              company_siret?: string | null;
              company_city?: string | null;
              job_title?: string | null;
            },
          );
        }
      });
    }

    pending = ((requests ?? []) as unknown as Array<{
      id: string;
      received_at: string | null;
      created_at: string | null;
      request_message: string | null;
      prospect_first_name: string | null;
      prospect_last_name: string | null;
      prospect_email: string | null;
      prospect_phone: string | null;
      company_name_freetext: string | null;
      financing_mode: string | null;
      financing_details: string | null;
      contact_referent_first_name: string | null;
      contact_referent_last_name: string | null;
      contact_referent_email: string | null;
      contact_referent_phone: string | null;
      contact_referent_role: string | null;
      target_session_id: string | null;
      session:
        | {
            id: string;
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
    }>).map((r) => {
      const sess = Array.isArray(r.session) ? r.session[0] ?? null : r.session;
      const form = sess?.formation
        ? Array.isArray(sess.formation)
          ? sess.formation[0] ?? null
          : sess.formation
        : null;
      const evt = eventBySession.get(r.id) ?? {};
      return {
        id: r.id,
        // Fallback created_at si received_at vide (sécurise l'affichage
        // « Reçu le… » contre les requests historiques sans timestamp).
        received_at: r.received_at ?? r.created_at,
        message: r.request_message,
        learner: {
          first_name: r.prospect_first_name,
          last_name: r.prospect_last_name,
          email: r.prospect_email,
          phone: r.prospect_phone,
          job_title: evt.job_title ?? null,
        },
        company: {
          name: r.company_name_freetext,
          siret: evt.company_siret ?? null,
          city: evt.company_city ?? null,
        },
        contact_referent:
          r.contact_referent_email || r.contact_referent_last_name
            ? {
                first_name: r.contact_referent_first_name,
                last_name: r.contact_referent_last_name,
                email: r.contact_referent_email,
                phone: r.contact_referent_phone,
                role: r.contact_referent_role,
              }
            : null,
        financing: {
          mode: r.financing_mode,
          details: r.financing_details,
        },
        session: sess
          ? {
              id: sess.id,
              start_date: sess.start_date,
              end_date: sess.end_date,
              modality: sess.modality,
              formation_title: form?.title ?? null,
              duration_hours: form?.duration_hours ?? null,
              duration_days: form?.duration_days ?? null,
            }
          : null,
      };
    });
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 inline-flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-amber-600" />
          Pré-inscriptions à valider
        </h1>
        <p className="text-sm text-zinc-600 mt-1">
          Demandes reçues via votre lien public (
          <code className="text-[11px] bg-zinc-100 px-1.5 py-0.5 rounded">
            /preinscription/{token.slice(0, 12)}…
          </code>
          ). Validez pour transformer en inscription officielle, refusez pour
          rejeter la demande.
        </p>
      </header>

      {pending.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-10 text-center">
          <Inbox className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-700">
            Aucune pré-inscription en attente.
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Les nouvelles demandes apparaîtront ici après réception.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 inline-flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-amber-700" />
            <span className="text-amber-900">
              <strong>{pending.length}</strong> pré-inscription
              {pending.length > 1 ? "s" : ""} en attente de votre validation.
            </span>
          </div>
          <PreinscriptionsList token={token} items={pending} />
        </>
      )}
    </div>
  );
}
