import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { SessionTabs } from "../_session-tabs";
import { SessionHeaderMeta } from "../_session-header-meta";
import { ParticipantsInscriptionsBlock } from "../_participants-inscriptions-block";
import { PortalLinksBlock } from "../_portal-links-block";
import { ExpressSignupBlock } from "@/components/express-signup-block";
import {
  createExpressLearnerAdmin,
  generateQuickSignupTokenAdmin,
} from "../express-actions";
import type {
  InscriptionRequest,
  InscriptionStage,
} from "@/lib/inscriptions/types";
import {
  healCompanyLinksForSession,
  healEnrollmentsForSession,
  healLearnersForSession,
} from "@/lib/inscriptions/sync";
import { cleanupUserEmptyDrafts } from "@/lib/inscriptions/cleanup";
import { loadFormationsByLearner } from "@/lib/learners/formations";

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

  // Self-healing en 3 étapes : learners → company_id → enrollments
  // (Gilles 2026-05-26).
  try {
    await healLearnersForSession(supabase, id);
    await healCompanyLinksForSession(supabase, id);
    await healEnrollmentsForSession(supabase, id);
  } catch (e) {
    console.warn(
      "[participants/page] heal failed",
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
      "id, max_participants, status, pricing_mode, price_per_day_ht, price_forfait_ht, price_extra_per_day_ht, pricing_threshold, is_subcontracted, subcontractor_name, formation:formations(id, title, public_price_excl_tax, duration_days)",
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
      is_subcontracted: boolean | null;
      subcontractor_name: string | null;
      formation: {
        id: string;
        title: string;
        public_price_excl_tax: number | null;
        duration_days: number | null;
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
        "*, company:companies!inscription_requests_company_id_fkey(id, name, postal_code, city), learner:learners(first_name, last_name, email, phone, civility, job_title, postal_code, city, company_name_temp, company:companies(id, name, postal_code, city))",
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
      amount_ht: number | null;
      agreement: {
        id: string;
        opco_name: string;
        dossier_number: string | null;
        pdf_url: string | null;
      } | null;
    }>
  >();
  if (inscriptionIds.length > 0) {
    const { data: fundings } = await supabase
      .from("inscription_opco_fundings")
      .select(
        "inscription_id, amount_ht, agreement:opco_funding_agreements(id, opco_name, dossier_number, pdf_url)",
      )
      .in("inscription_id", inscriptionIds);
    fundingsByInscription = new Map();
    // Genere les URL signees pour les PDF (bucket prive opco-agreements)
    // — Gilles 2026-06-01 : permet de cliquer l icone oeil pour consulter
    // l accord depuis le tableau Participants. URL valable 30 min.
    const SIGNED_TTL = 30 * 60;
    const signedUrlCache = new Map<string, string | null>();
    async function resolveSignedUrlOnce(
      stored: string | null,
    ): Promise<string | null> {
      if (!stored) return null;
      if (signedUrlCache.has(stored)) return signedUrlCache.get(stored)!;
      let path = stored;
      if (stored.startsWith("http")) {
        const marker = "/opco-agreements/";
        const idx = stored.indexOf(marker);
        if (idx === -1) {
          signedUrlCache.set(stored, stored);
          return stored;
        }
        path = stored.substring(idx + marker.length);
      }
      const { data: signed } = await supabase.storage
        .from("opco-agreements")
        .createSignedUrl(path, SIGNED_TTL);
      const url = signed?.signedUrl ?? null;
      signedUrlCache.set(stored, url);
      return url;
    }
    for (const f of (fundings ?? []) as unknown as Array<{
      inscription_id: string;
      amount_ht: number | string | null;
      agreement: {
        id: string;
        opco_name: string;
        dossier_number: string | null;
        pdf_url: string | null;
      } | null;
    }>) {
      const list = fundingsByInscription.get(f.inscription_id) ?? [];
      // Genere une URL signee pour le PDF (si dispo)
      const pdfSignedUrl = f.agreement?.pdf_url
        ? await resolveSignedUrlOnce(f.agreement.pdf_url)
        : null;
      list.push({
        amount_ht:
          f.amount_ht !== null && f.amount_ht !== undefined
            ? Number(f.amount_ht)
            : null,
        agreement: f.agreement
          ? {
              id: f.agreement.id,
              opco_name: f.agreement.opco_name,
              dossier_number: f.agreement.dossier_number,
              pdf_url: pdfSignedUrl,
            }
          : null,
      });
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

  // Formations par apprenant -> colonne "Portail apprenant" du tableau
  // (compteur + accès portail + envoi du lien). Gilles 2026-06-04.
  const participantLearnerIds = Array.from(
    new Set(
      allRequests
        .map((r) => (r as unknown as { learner_id?: string | null }).learner_id)
        .filter((x): x is string => Boolean(x)),
    ),
  );
  const formationsByLearner = await loadFormationsByLearner(
    supabase,
    participantLearnerIds,
  );

  // Consultations du portail apprenant pour cette session (Gilles 2026-06-25).
  // 1 visite enregistrée par (apprenant, inscription) toutes les 30 min.
  const { data: sessionEnrollments } = await supabase
    .from("session_enrollments")
    .select("id, learner:learners(id, first_name, last_name, email)")
    .eq("session_id", id);
  const enrollmentName = new Map<string, string>();
  // Apprenants distincts (pour l'envoi groupé des liens portail).
  const learnerInfo = new Map<
    string,
    { id: string; name: string; email: string | null }
  >();
  for (const e of (sessionEnrollments ?? []) as Array<{
    id: string;
    learner:
      | { id: string; first_name: string | null; last_name: string | null; email: string | null }
      | { id: string; first_name: string | null; last_name: string | null; email: string | null }[]
      | null;
  }>) {
    const l = Array.isArray(e.learner) ? e.learner[0] : e.learner;
    const name =
      [l?.first_name, l?.last_name].filter(Boolean).join(" ") || "Apprenant";
    enrollmentName.set(e.id, name);
    if (l?.id && !learnerInfo.has(l.id)) {
      learnerInfo.set(l.id, { id: l.id, name, email: l.email ?? null });
    }
  }
  const sessEnrIds = Array.from(enrollmentName.keys());

  // Trace d'envoi des liens portail (best-effort : colonnes migration 0136).
  const portalSentByLearner = new Map<
    string,
    { sentAt: string | null; sentCount: number }
  >();
  const learnerIdsForPortal = Array.from(learnerInfo.keys());
  if (learnerIdsForPortal.length > 0) {
    try {
      const { data: ls } = await supabase
        .from("learners")
        .select("id, portal_link_sent_at, portal_link_sent_count")
        .in("id", learnerIdsForPortal);
      for (const r of (ls ?? []) as Array<{
        id: string;
        portal_link_sent_at: string | null;
        portal_link_sent_count: number | null;
      }>) {
        portalSentByLearner.set(r.id, {
          sentAt: r.portal_link_sent_at,
          sentCount: r.portal_link_sent_count ?? 0,
        });
      }
    } catch {
      /* colonnes absentes -> bloc affichera « jamais envoyé » */
    }
  }
  const portalLinkLearners = Array.from(learnerInfo.values())
    .map((l) => ({
      ...l,
      sentAt: portalSentByLearner.get(l.id)?.sentAt ?? null,
      sentCount: portalSentByLearner.get(l.id)?.sentCount ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const portalVisitByEnrollment = new Map<
    string,
    { last: string; count: number }
  >();
  if (sessEnrIds.length > 0) {
    const { data: visits } = await supabase
      .from("learner_portal_visits")
      .select("enrollment_id, visited_at")
      .in("enrollment_id", sessEnrIds)
      .order("visited_at", { ascending: false });
    for (const v of (visits ?? []) as Array<{
      enrollment_id: string | null;
      visited_at: string;
    }>) {
      if (!v.enrollment_id) continue;
      const cur = portalVisitByEnrollment.get(v.enrollment_id);
      if (cur) cur.count += 1;
      else
        portalVisitByEnrollment.set(v.enrollment_id, {
          last: v.visited_at,
          count: 1,
        });
    }
  }
  const visitRows = sessEnrIds
    .map((eid) => ({
      name: enrollmentName.get(eid) ?? "Apprenant",
      visit: portalVisitByEnrollment.get(eid) ?? null,
    }))
    .sort((a, b) => {
      // Ceux qui ont consulté en premier (date desc), puis les non-consultés.
      if (a.visit && !b.visit) return -1;
      if (!a.visit && b.visit) return 1;
      if (a.visit && b.visit) return b.visit.last.localeCompare(a.visit.last);
      return a.name.localeCompare(b.name);
    });
  const nbConsulted = visitRows.filter((r) => r.visit).length;

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
        {query.expressOk && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 p-4 text-sm text-emerald-700 dark:text-emerald-300">
            Apprenant ajouté en saisie express. Il apparaît dans la liste
            ci-dessous en mode « temporaire ».
          </div>
        )}
        {query.portalSent !== undefined && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-800 dark:text-cyan-300">
            📧 {query.portalSent} lien(s) portail envoyé(s).
            {query.portalFailed && Number(query.portalFailed) > 0
              ? ` ${query.portalFailed} échec(s) (apprenant sans email ?).`
              : ""}
          </div>
        )}

        {session.is_subcontracted && (
          <ExpressSignupBlock
            subcontractorName={session.subcontractor_name}
            participantCount={totalParticipants}
            helpText="Sous-traitance : la liste n'arrive souvent qu'au jour J. Le formateur peut afficher le QR code au démarrage (tour de table) — chaque apprenant scanne, remplit sa fiche et passe direct au quiz pré-formation (pas de double saisie). Vous pouvez aussi ajouter ici un apprenant manuellement."
            createAction={async (formData) => {
              "use server";
              await createExpressLearnerAdmin(id, formData);
            }}
            generateQuickSignupAction={async () => {
              "use server";
              return await generateQuickSignupTokenAdmin(id);
            }}
          />
        )}

        {/* Envoi groupé des liens portail apprenant (Gilles 2026-06-25) —
            placé entre Saisie express et Consultations (Gilles 2026-06-25) */}
        <PortalLinksBlock sessionId={id} learners={portalLinkLearners} />

        {/* Consultations du portail apprenant (Gilles 2026-06-25) */}
        {visitRows.length > 0 && (
          <details className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2">
              📱 Consultations du portail apprenant
              <span className="text-xs font-normal text-zinc-500">
                ({nbConsulted}/{visitRows.length} ont consulté)
              </span>
            </summary>
            <div className="border-t border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
              {visitRows.map((r, i) => (
                <div
                  key={i}
                  className="px-4 py-2 flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-zinc-800 dark:text-zinc-200">
                    {r.name}
                  </span>
                  {r.visit ? (
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                      Consulté le{" "}
                      {new Date(r.visit.last).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {r.visit.count > 1 ? ` · ${r.visit.count} visites` : ""}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400">
                      Jamais consulté
                    </span>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}

        <ParticipantsInscriptionsBlock
          session={session}
          requests={allRequests}
          stagesArr={stagesArr}
          companyNameById={companyNameById}
          stageEventsByInscription={stageEventsByInscription}
          nbJours={nbJours}
          returnTo="participants"
          formationsByLearner={formationsByLearner}
        />
      </div>
    </>
  );
}
