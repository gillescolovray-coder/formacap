import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { SessionTabs } from "../_session-tabs";
import { SessionHeaderMeta } from "../_session-header-meta";
import { ParticipantsInscriptionsBlock } from "../_participants-inscriptions-block";
import type {
  InscriptionRequest,
  InscriptionStage,
} from "@/lib/inscriptions/types";
import { healEnrollmentsForSession } from "@/lib/inscriptions/sync";
import { cleanupUserEmptyDrafts } from "@/lib/inscriptions/cleanup";

// Force le rechargement à chaque accès pour que la liste des inscriptions
// soit toujours à jour (auto-healing + filtres dynamiques).
export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ParticipantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();
  const query = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Self-healing : répare automatiquement les inscription_requests
  // confirmées qui n'ont pas d'enrollment correspondant.
  try {
    await healEnrollmentsForSession(supabase, id);
  } catch (e) {
    console.warn(
      "[participants/page] healEnrollmentsForSession failed",
      (e as Error).message,
    );
  }

  // Nettoyage anti-pollution : supprime les brouillons VIDES créés par
  // l'utilisateur courant et abandonnés (sans aucune saisie). Évite que
  // des lignes "—/Particulier/305 €" apparaissent dans le tableau quand
  // l'utilisateur clique "Inscrire" puis quitte sans rien saisir.
  // (Bug Gilles 2026-05-21)
  try {
    const { data: orgMember } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (orgMember?.organization_id) {
      await cleanupUserEmptyDrafts(
        supabase,
        orgMember.organization_id as string,
        user.id,
      );
    }
  } catch (e) {
    console.warn(
      "[participants/page] cleanupUserEmptyDrafts failed",
      (e as Error).message,
    );
  }

  // Session courante (métadonnées pour le calcul tarifaire)
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, max_participants, status, pricing_mode, price_per_day_ht, price_forfait_ht, price_extra_per_day_ht, pricing_threshold, formation:formations(id, title, public_price_excl_tax)",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      max_participants: number | null;
      status: string | null;
      pricing_mode: "per_learner" | "forfait" | null;
      price_per_day_ht: number | null;
      price_forfait_ht: number | null;
      price_extra_per_day_ht: number | null;
      pricing_threshold: number | null;
      formation: {
        id: string;
        title: string;
        public_price_excl_tax: number | null;
      } | null;
    }>();
  if (!session) notFound();

  // Chargements parallèles — mêmes embeddings que /inscriptions pour
  // que SessionInscriptionsTable affiche toutes les colonnes correctement.
  const [
    { data: stages },
    { data: requests, error: requestsError },
    { data: companiesData },
    { count: sessionDaysCount },
  ] = await Promise.all([
    supabase
      .from("inscription_stages")
      .select("*")
      .eq("is_active", true)
      .order("position", { ascending: true }),
    supabase
      .from("inscription_requests")
      .select(
        "*, company:companies!inscription_requests_company_id_fkey(id, name, postal_code, city), learner:learners(first_name, last_name, email, phone, job_title, postal_code, city, company:companies(id, name, postal_code, city))",
      )
      .eq("target_session_id", id)
      .order("received_at", { ascending: false }),
    supabase.from("companies").select("id, name"),
    supabase
      .from("session_days")
      .select("id", { count: "exact", head: true })
      .eq("session_id", id),
  ]);
  if (requestsError) {
    console.error(
      "[participants/page] Erreur chargement demandes:",
      requestsError,
    );
  }

  const stagesArr = (stages ?? []) as InscriptionStage[];
  const baseRequests = (requests ?? []) as InscriptionRequest[];
  const companyNameById = new Map<string, string>(
    (companiesData ?? []).map((c) => [c.id as string, c.name as string]),
  );

  // Financements OPCO en parallèle (relation chargée séparément pour
  // éviter de faire échouer la requête principale en cas de souci RLS).
  const inscriptionIds = baseRequests.map((r) => r.id);
  let fundingsByInscription = new Map<
    string,
    Array<{
      agreement: {
        id: string;
        opco_name: string;
        dossier_number: string | null;
      } | null;
    }>
  >();
  if (inscriptionIds.length > 0) {
    const { data: fundings } = await supabase
      .from("inscription_opco_fundings")
      .select(
        "inscription_id, amount_ht, agreement:opco_funding_agreements(id, opco_name, dossier_number)",
      )
      .in("inscription_id", inscriptionIds);
    fundingsByInscription = new Map();
    for (const f of (fundings ?? []) as unknown as Array<{
      inscription_id: string;
      agreement: {
        id: string;
        opco_name: string;
        dossier_number: string | null;
      } | null;
    }>) {
      const list = fundingsByInscription.get(f.inscription_id) ?? [];
      list.push({ agreement: f.agreement });
      fundingsByInscription.set(f.inscription_id, list);
    }
  }

  // Historique des changements d'étape (pour le tooltip dans le tableau)
  type StageEvent = {
    request_id: string;
    from_stage_id: string | null;
    to_stage_id: string | null;
    created_at: string;
    payload: Record<string, unknown> | null;
    actor_id: string | null;
    actor_name: string | null;
  };
  const stageEventsByInscription = new Map<string, StageEvent[]>();
  if (inscriptionIds.length > 0) {
    const { data: events } = await supabase
      .from("inscription_events")
      .select(
        "request_id, from_stage_id, to_stage_id, created_at, payload, actor_id",
      )
      .eq("event_type", "stage_changed")
      .in("request_id", inscriptionIds)
      .order("created_at", { ascending: false });

    const actorIds = Array.from(
      new Set(
        (events ?? [])
          .map((e) => e.actor_id as string | null)
          .filter((x): x is string => Boolean(x)),
      ),
    );
    const actorNameById = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", actorIds);
      for (const p of (profiles ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }>) {
        const name =
          [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
          p.email ||
          null;
        if (name) actorNameById.set(p.id, name);
      }
    }

    for (const raw of (events ?? []) as Array<{
      request_id: string;
      from_stage_id: string | null;
      to_stage_id: string | null;
      created_at: string;
      payload: Record<string, unknown> | null;
      actor_id: string | null;
    }>) {
      const e: StageEvent = {
        ...raw,
        actor_name: raw.actor_id
          ? (actorNameById.get(raw.actor_id) ?? null)
          : null,
      };
      const list = stageEventsByInscription.get(e.request_id) ?? [];
      list.push(e);
      stageEventsByInscription.set(e.request_id, list);
    }
  }

  // Tri alphabétique (Nom puis Prénom) — cohérent avec /inscriptions
  const allRequests = baseRequests
    .map(
      (r) =>
        ({
          ...r,
          opco_fundings: fundingsByInscription.get(r.id) ?? [],
        }) as InscriptionRequest,
    )
    .sort((a, b) => {
      const an = `${a.prospect_last_name ?? ""} ${a.prospect_first_name ?? ""}`
        .trim()
        .toLowerCase();
      const bn = `${b.prospect_last_name ?? ""} ${b.prospect_first_name ?? ""}`
        .trim()
        .toLowerCase();
      return an.localeCompare(bn, "fr");
    });

  const nbJours = sessionDaysCount ?? 0;
  const title = session.formation?.title ?? "Session";
  const totalParticipants = allRequests.length;

  return (
    <>
      <PageHeader
        title="Participants"
        description={
          <>
            <span className="font-semibold text-zinc-700 dark:text-zinc-300 block">
              {title}
            </span>
            <SessionHeaderMeta sessionId={id} />
          </>
        }
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Sessions", href: "/sessions" },
          { label: title, href: `/sessions/${id}` },
          { label: "Participants" },
        ]}
        actions={<BackButton fallbackHref={`/sessions/${id}`} />}
      />

      <SessionTabs
        sessionId={id}
        counts={{ participants: totalParticipants }}
      />

      <div className="p-8 max-w-7xl space-y-4">
        {query.error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {query.error}
          </div>
        )}

        <ParticipantsInscriptionsBlock
          session={session}
          requests={allRequests}
          stagesArr={stagesArr}
          companyNameById={companyNameById}
          stageEventsByInscription={stageEventsByInscription}
          nbJours={nbJours}
        />
      </div>
    </>
  );
}
