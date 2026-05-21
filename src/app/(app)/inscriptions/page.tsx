import Link from "next/link";
import {
  Accessibility,
  Building2,
  Calendar,
  ChevronRight,
  Inbox,
  KanbanSquare,
  LayoutList,
  Plus,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { InscrireLink } from "./_inscrire-link";
import { SessionActionsButtons } from "./_session-actions-buttons";
import { SessionTitleLink } from "./_session-title-link";
import { LocationPopover } from "./_location-popover";
import { OpenSessionLink } from "./_open-session-link";
import {
  ColumnsSettingsButton,
  HeaderItem,
  InscriptionColumnsProvider,
} from "./_columns-context";
import { SessionInscriptionsTable } from "./_session-table";
import { TrainerPopover } from "./_trainer-popover";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cleanupUserEmptyDrafts } from "@/lib/inscriptions/cleanup";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  FINANCING_MODE_LABELS,
  INSCRIPTION_SOURCE_LABELS,
  type InscriptionRequest,
  type InscriptionStage,
} from "@/lib/inscriptions/types";
import {
  MODALITY_BADGE_CLASSES,
  MODALITY_LABELS,
  type FormationModality,
} from "@/lib/formations/types";

type SearchParams = {
  view?: "session" | "kanban";
  q?: string;
};

export default async function InscriptionsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const view: "session" | "kanban" = params.view === "kanban" ? "kanban" : "session";
  const q = (params.q ?? "").trim().toLowerCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Nettoyage anti-pollution : brouillons vides abandonnés (bug 2026-05-21).
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
      "[inscriptions/page] cleanupUserEmptyDrafts failed",
      (e as Error).message,
    );
  }

  const [
    { data: stages },
    { data: requests, error: requestsError },
    { data: sessions },
    { data: companiesData },
  ] = await Promise.all([
    supabase
      .from("inscription_stages")
      .select("*")
      .eq("is_active", true)
      .order("position", { ascending: true }),
    // NB: on n'embarque PAS `inscription_opco_fundings` ici. Cette relation
    // peut faire échouer silencieusement la requête entière si la table ou
    // ses RLS posent un souci (cas observé en mai 2026). On charge les
    // financements OPCO séparément, ci-dessous.
    supabase
      .from("inscription_requests")
      .select(
        "*, company:companies!inscription_requests_company_id_fkey(id, name, postal_code, city), learner:learners(first_name, last_name, email, phone, job_title, postal_code, city, company:companies(id, name, postal_code, city))",
      )
      .order("received_at", { ascending: false }),
    supabase
      .from("sessions")
      .select(
        "id, start_date, end_date, modality, location, is_inter, max_participants, status, default_morning_start, default_morning_end, default_afternoon_start, default_afternoon_end, pricing_mode, price_per_day_ht, price_forfait_ht, price_extra_per_day_ht, pricing_threshold, location_full:formation_locations(id, name, address, postal_code, city), formation:formations(id, title, internal_code, public_price_excl_tax), trainer:trainers(id, first_name, last_name, email, phone, mobile)",
      )
      .order("start_date", { ascending: false }),
    // Chargement de la liste des entreprises pour résoudre le nom du
    // prescripteur / OF dans la colonne "Source d'inscription".
    supabase.from("companies").select("id, name"),
  ]);
  if (requestsError) {
    console.error("[inscriptions] Erreur chargement demandes:", requestsError);
  }
  const companyNameById = new Map<string, string>(
    (companiesData ?? []).map((c) => [c.id as string, c.name as string]),
  );

  const stagesArr = (stages ?? []) as InscriptionStage[];
  const baseRequests = (requests ?? []) as InscriptionRequest[];

  // Chargement séparé des financements OPCO pour les demandes affichées,
  // afin de ne pas faire dépendre la requête principale de l'embedding
  // de `inscription_opco_fundings` (qui peut faire échouer toute la requête
  // dans certains états de la base).
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
  // Historique des changements d'étape par inscription
  // (table inscription_events, type "stage_changed").
  // On résout le nom de l'acteur via la table `profiles` en 2 temps
  // pour éviter les soucis d'embedding multi-FK.
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

    // Résolution des noms d'acteurs en une seule requête
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

  const allRequests = baseRequests.map(
    (r) =>
      ({
        ...r,
        opco_fundings: fundingsByInscription.get(r.id) ?? [],
      }) as InscriptionRequest,
  );

  // Filtrage par recherche (nom, prénom, email, entreprise référencée
  // ou texte libre, et entreprise rattachée via l'apprenant)
  const requestsArr = q
    ? allRequests.filter((r) => {
        const joined = r as unknown as {
          company?: { name: string } | null;
          learner?: { company?: { name: string } | null } | null;
        };
        const haystack = [
          r.prospect_first_name ?? "",
          r.prospect_last_name ?? "",
          r.prospect_email ?? "",
          r.company_name_freetext ?? "",
          joined.company?.name ?? "",
          joined.learner?.company?.name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
    : allRequests;
  const sessionsArr = (sessions ?? []) as unknown as Array<{
    id: string;
    start_date: string;
    end_date: string;
    modality: FormationModality | null;
    location: string | null;
    is_inter: boolean;
    max_participants: number | null;
    status: string | null;
    default_morning_start: string | null;
    default_morning_end: string | null;
    default_afternoon_start: string | null;
    default_afternoon_end: string | null;
    // ----- Tarification cascade R7 -----
    pricing_mode: "per_learner" | "forfait" | null;
    price_per_day_ht: number | null;
    price_forfait_ht: number | null;
    price_extra_per_day_ht: number | null;
    pricing_threshold: number | null;
    location_full: {
      id: string;
      name: string;
      address: string | null;
      postal_code: string | null;
      city: string | null;
    } | null;
    formation: {
      id: string;
      title: string;
      internal_code: string | null;
      public_price_excl_tax: number | null;
    } | null;
    trainer: {
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      mobile: string | null;
    } | null;
  }>;

  // Nombre réel de jours de formation par session (pour calcul tarif R7).
  // On compte les session_days existants (source de vérité du planning),
  // pas l'amplitude start_date → end_date qui peut inclure des jours non
  // ouvrés ou non programmés.
  const sessionDaysCountById = new Map<string, number>();
  if (sessionsArr.length > 0) {
    const { data: allSessionDays } = await supabase
      .from("session_days")
      .select("session_id")
      .in(
        "session_id",
        sessionsArr.map((s) => s.id),
      );
    for (const d of (allSessionDays ?? []) as Array<{ session_id: string }>) {
      sessionDaysCountById.set(
        d.session_id,
        (sessionDaysCountById.get(d.session_id) ?? 0) + 1,
      );
    }
  }

  const sessionMap = new Map(sessionsArr.map((s) => [s.id, s]));

  // Tri alphabétique des demandeurs (Nom puis Prénom)
  function sortByName(a: InscriptionRequest, b: InscriptionRequest) {
    const an = `${a.prospect_last_name ?? ""} ${a.prospect_first_name ?? ""}`
      .trim()
      .toLowerCase();
    const bn = `${b.prospect_last_name ?? ""} ${b.prospect_first_name ?? ""}`
      .trim()
      .toLowerCase();
    return an.localeCompare(bn, "fr");
  }

  // Grouper les demandes par session, apprenants triés alphabétiquement
  const bySession = new Map<string | "none", InscriptionRequest[]>();
  bySession.set("none", []);
  for (const s of sessionsArr) bySession.set(s.id, []);
  for (const r of requestsArr) {
    const key = r.target_session_id ?? "none";
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key)!.push(r);
  }
  // Tri alphabétique au sein de chaque session
  for (const list of bySession.values()) {
    list.sort(sortByName);
  }

  // Sessions affichées :
  //   - Toujours : celles qui ont au moins 1 demande (peu importe la date)
  //   - Toujours : les sessions à venir (start_date >= aujourd'hui), même
  //     vides — pour permettre d'y inscrire un apprenant
  //   - Exclues : les sessions passées sans aucune demande (inutiles).
  // Tri : échéance la plus proche d'aujourd'hui en premier.
  const todayMs = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const sessionEntriesWithRequests = sessionsArr
    .filter((s) => {
      // Sessions archivées : toujours masquées du tableau d'inscriptions.
      // La fiche reste accessible via /sessions/{id} pour rééditer un
      // document a posteriori.
      if (s.status === "archived") return false;
      const hasRequests = (bySession.get(s.id)?.length ?? 0) > 0;
      // « Encore active » : la dernière date de la session (end_date)
      // est aujourd'hui ou dans le futur. Cela couvre les sessions
      // étalées sur plusieurs jours non consécutifs (04/05 → 21/05) :
      // on continue de pouvoir y inscrire un apprenant tant que la
      // session n'est pas totalement passée.
      const stillActive =
        new Date(s.end_date).getTime() >= todayStartMs;
      return hasRequests || stillActive;
    })
    .sort((a, b) => {
      const distA = Math.abs(new Date(a.start_date).getTime() - todayMs);
      const distB = Math.abs(new Date(b.start_date).getTime() - todayMs);
      return distA - distB;
    });
  const orphanRequests = bySession.get("none") ?? [];

  // Pour le kanban
  const byStage = new Map<string, InscriptionRequest[]>();
  for (const s of stagesArr) byStage.set(s.id, []);
  for (const r of requestsArr) {
    if (r.stage_id && byStage.has(r.stage_id)) {
      byStage.get(r.stage_id)!.push(r);
    }
  }

  return (
    <>
      <PageHeader
        title="Inscriptions reçues"
        description="Gestion du flux des demandes d'inscription : qualification, devis, contrat, convocation."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Inscriptions" },
        ]}
        actions={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/parametres/inscriptions" />}
            >
              <Settings className="h-4 w-4" />
              Workflow & emails
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="/inscriptions/new" />}
            >
              <Plus className="h-4 w-4" />
              Nouvelle demande
            </Button>
          </>
        }
      />

      <InscriptionColumnsProvider>
      <div className="p-8 space-y-5">
        {/* Barre de filtres : recherche + mode d'affichage */}
        <div className="rounded-xl bg-white border border-slate-200 p-3 flex flex-wrap items-center gap-3">
          <form
            method="get"
            className="flex items-center gap-2 flex-1 min-w-[260px]"
          >
            <input type="hidden" name="view" value={view} />
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                name="q"
                type="search"
                placeholder="Rechercher un apprenant ou une entreprise…"
                defaultValue={q}
                className="pl-9"
              />
            </div>
            <Button type="submit" size="sm">
              <Search className="h-4 w-4" />
              Rechercher
            </Button>
            {q && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={`/inscriptions?view=${view}`} />}
              >
                Effacer
              </Button>
            )}
          </form>

          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-bold text-slate-500 mr-1">
              Affichage :
            </span>
            <Link
              href={`/inscriptions?view=session${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                view === "session"
                  ? "bg-cyan-600 text-white border-cyan-600 shadow-sm"
                  : "bg-white text-slate-700 border-slate-300 hover:border-cyan-400 hover:bg-cyan-50",
              )}
            >
              <LayoutList className="h-3.5 w-3.5" />
              Par session
            </Link>
            <Link
              href={`/inscriptions?view=kanban${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                view === "kanban"
                  ? "bg-cyan-600 text-white border-cyan-600 shadow-sm"
                  : "bg-white text-slate-700 border-slate-300 hover:border-cyan-400 hover:bg-cyan-50",
              )}
            >
              <KanbanSquare className="h-3.5 w-3.5" />
              Par statut
            </Link>
          </div>

          <span className="text-xs text-slate-500 ml-auto">
            {requestsArr.length} / {allRequests.length} demande
            {allRequests.length > 1 ? "s" : ""}
          </span>

          {/* Personnalisation des colonnes : globale, s'applique à toutes
              les sessions de la vue « Par session ». */}
          {view === "session" && <ColumnsSettingsButton />}
        </div>

        {requestsArr.length === 0 ? (
          <div className="rounded-xl bg-white border border-slate-200 p-12 text-center">
            <Inbox className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-medium mb-1">
              Aucune demande d&apos;inscription
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Saisissez la première demande pour démarrer.
            </p>
            <Button
              nativeButton={false}
              render={<Link href="/inscriptions/new" />}
            >
              <Plus className="h-4 w-4" />
              Saisir une demande
            </Button>
          </div>
        ) : view === "session" ? (
          <SessionView
            sessions={sessionEntriesWithRequests}
            bySession={bySession}
            stagesArr={stagesArr}
            orphanRequests={orphanRequests}
            companyNameById={companyNameById}
            stageEventsByInscription={stageEventsByInscription}
            sessionDaysCountById={sessionDaysCountById}
          />
        ) : (
          <KanbanView
            stagesArr={stagesArr}
            byStage={byStage}
            sessionMap={sessionMap}
          />
        )}
      </div>
      </InscriptionColumnsProvider>
    </>
  );
}

// =========================================================
// Vue : Par session
// =========================================================

function SessionView({
  sessions,
  bySession,
  stagesArr,
  orphanRequests,
  companyNameById,
  stageEventsByInscription,
  sessionDaysCountById,
}: {
  sessions: Array<{
    id: string;
    start_date: string;
    end_date: string;
    modality: FormationModality | null;
    location: string | null;
    is_inter: boolean;
    max_participants: number | null;
    status: string | null;
    default_morning_start: string | null;
    default_morning_end: string | null;
    default_afternoon_start: string | null;
    default_afternoon_end: string | null;
    pricing_mode: "per_learner" | "forfait" | null;
    price_per_day_ht: number | null;
    price_forfait_ht: number | null;
    price_extra_per_day_ht: number | null;
    pricing_threshold: number | null;
    location_full: {
      id: string;
      name: string;
      address: string | null;
      postal_code: string | null;
      city: string | null;
    } | null;
    formation: {
      id: string;
      title: string;
      internal_code: string | null;
      public_price_excl_tax: number | null;
    } | null;
    trainer: {
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      mobile: string | null;
    } | null;
  }>;
  bySession: Map<string | "none", InscriptionRequest[]>;
  stagesArr: InscriptionStage[];
  orphanRequests: InscriptionRequest[];
  companyNameById: Map<string, string>;
  stageEventsByInscription: Map<
    string,
    Array<{
      request_id: string;
      from_stage_id: string | null;
      to_stage_id: string | null;
      created_at: string;
      payload: Record<string, unknown> | null;
      actor_id: string | null;
      actor_name: string | null;
    }>
  >;
  /** Nb réel de jours de formation par session (count session_days). */
  sessionDaysCountById: Map<string, number>;
}) {
  if (sessions.length === 0 && orphanRequests.length === 0) {
    return (
      <div className="rounded-xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">
        Aucune demande rattachée à une session pour l&apos;instant.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toujours en haut : demandes sans session */}
      {orphanRequests.length > 0 && (
        <SessionCard
          session={null}
          requests={orphanRequests}
          stagesArr={stagesArr}
          companyNameById={companyNameById}
          stageEventsByInscription={stageEventsByInscription}
          nbJours={0}
        />
      )}
      {/* Sessions triées par échéance la plus proche */}
      {sessions.map((s) => (
        <SessionCard
          key={s.id}
          session={s}
          requests={bySession.get(s.id) ?? []}
          stagesArr={stagesArr}
          companyNameById={companyNameById}
          stageEventsByInscription={stageEventsByInscription}
          nbJours={sessionDaysCountById.get(s.id) ?? 0}
        />
      ))}
    </div>
  );
}

function SessionCard({
  session,
  requests,
  stagesArr,
  companyNameById,
  stageEventsByInscription,
  nbJours,
}: {
  session: {
    id: string;
    start_date: string;
    end_date: string;
    modality: FormationModality | null;
    location: string | null;
    is_inter: boolean;
    max_participants: number | null;
    status: string | null;
    default_morning_start: string | null;
    default_morning_end: string | null;
    default_afternoon_start: string | null;
    default_afternoon_end: string | null;
    pricing_mode: "per_learner" | "forfait" | null;
    price_per_day_ht: number | null;
    price_forfait_ht: number | null;
    price_extra_per_day_ht: number | null;
    pricing_threshold: number | null;
    location_full: {
      id: string;
      name: string;
      address: string | null;
      postal_code: string | null;
      city: string | null;
    } | null;
    formation: {
      id: string;
      title: string;
      internal_code: string | null;
      public_price_excl_tax: number | null;
    } | null;
    trainer: {
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      mobile: string | null;
    } | null;
  } | null;
  /** Nb réel de jours de formation (count session_days), pour calcul tarif. */
  nbJours: number;
  requests: InscriptionRequest[];
  stagesArr: InscriptionStage[];
  companyNameById: Map<string, string>;
  stageEventsByInscription: Map<
    string,
    Array<{
      request_id: string;
      from_stage_id: string | null;
      to_stage_id: string | null;
      created_at: string;
      payload: Record<string, unknown> | null;
      actor_id: string | null;
      actor_name: string | null;
    }>
  >;
}) {
  // Compteurs par étape
  const counts = new Map<string, number>();
  for (const r of requests) {
    if (r.stage_id) counts.set(r.stage_id, (counts.get(r.stage_id) ?? 0) + 1);
  }

  // Regle d'ouverture (Gilles 2026-05-21) : on garde ouvertes uniquement
  // les sessions qui ont au moins une inscription, et on ferme par
  // defaut celles qui sont vides (gain de place visuel + on n'affiche
  // que ce qui demande une attention).
  // Cas particulier : les sessions en cours aujourd'hui restent
  // ouvertes aussi (utile pour suivre l'emargement, meme si l'admin
  // n'a pas encore confirme d'inscription).
  const todayIso = new Date().toISOString().slice(0, 10);
  const isToday =
    session !== null &&
    session.start_date.slice(0, 10) <= todayIso &&
    todayIso <= session.end_date.slice(0, 10);
  const hasInscriptions = requests.length > 0;
  const shouldBeOpen = hasInscriptions || isToday;

  return (
    <details
      open={shouldBeOpen}
      className="group rounded-xl bg-white border border-slate-200 overflow-hidden"
    >
      <summary
        className={cn(
          "cursor-pointer list-none px-4 py-2.5 flex items-start gap-3 border-b transition-colors",
          // Couleur de fond et de bordure selon la modalité
          session?.modality === "presentiel" &&
            "bg-emerald-50/60 border-emerald-200 hover:bg-emerald-50",
          session?.modality === "distanciel" &&
            "bg-blue-50/60 border-blue-200 hover:bg-blue-50",
          session?.modality === "hybride" &&
            "bg-violet-50/60 border-violet-200 hover:bg-violet-50",
          (!session || !session.modality) &&
            "bg-slate-50/60 border-slate-200 hover:bg-slate-50",
        )}
        title="Cliquer pour déplier / replier la liste des inscriptions"
      >
        <ChevronRight
          className={cn(
            "h-5 w-5 mt-0.5 shrink-0 transition-transform duration-200 group-open:rotate-90",
            session?.modality === "presentiel" && "text-emerald-700",
            session?.modality === "distanciel" && "text-blue-700",
            session?.modality === "hybride" && "text-violet-700",
            (!session || !session.modality) && "text-slate-500",
          )}
          aria-hidden
        />
        {session ? (
          <>
            <div
              className={cn(
                "h-9 w-9 shrink-0 rounded-lg flex items-center justify-center",
                session.modality === "presentiel" &&
                  "bg-emerald-100 text-emerald-700",
                session.modality === "distanciel" &&
                  "bg-blue-100 text-blue-700",
                session.modality === "hybride" &&
                  "bg-violet-100 text-violet-700",
                !session.modality && "bg-slate-100 text-slate-700",
              )}
            >
              <Calendar className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              {/* LIGNE 1 — Badges + titre + actions à droite */}
              <div className="flex items-center gap-2 flex-wrap">
                {session.modality && (
                  <HeaderItem k="modality">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0",
                        MODALITY_BADGE_CLASSES[session.modality],
                      )}
                    >
                      {MODALITY_LABELS[session.modality]}
                    </span>
                  </HeaderItem>
                )}
                <HeaderItem k="inter_intra">
                  <span
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap shrink-0",
                      session.is_inter
                        ? "bg-cyan-100 text-cyan-800 border-cyan-300"
                        : "bg-amber-100 text-amber-800 border-amber-300",
                    )}
                    title={
                      session.is_inter
                        ? "Session INTER : ouverte à plusieurs entreprises / particuliers"
                        : "Session INTRA : dédiée à une seule entreprise"
                    }
                  >
                    {session.is_inter ? "INTER" : "INTRA"}
                  </span>
                </HeaderItem>
                <SessionTitleLink
                  sessionId={session.id}
                  title={session.formation?.title ?? "Session"}
                  className={cn(
                    "text-sm font-black tracking-tight hover:underline",
                    session.modality === "presentiel" && "text-emerald-800",
                    session.modality === "distanciel" && "text-blue-800",
                    session.modality === "hybride" && "text-violet-800",
                    !session.modality && "text-slate-900",
                  )}
                />
                {session.formation?.internal_code && (
                  <HeaderItem k="code">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-white text-slate-600 font-mono text-[10px] border border-slate-200 shrink-0">
                      {session.formation.internal_code}
                    </span>
                  </HeaderItem>
                )}
                {/* Actions à droite de la ligne 1 (poussées par ml-auto) */}
                <div className="ml-auto flex items-center gap-2 shrink-0 flex-wrap">
                  <SessionActionsButtons
                    sessionId={session.id}
                    currentStatus={session.status}
                  />
                  <OpenSessionLink sessionId={session.id} />
                  <InscrireLink sessionId={session.id} />
                </div>
              </div>
              {/* LIGNE 2 — Métadonnées à gauche, compteur + pastilles à droite */}
              <div className="flex items-center gap-3 text-xs mt-1 flex-wrap">
                <HeaderItem k="date">
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-900 whitespace-nowrap">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(session.start_date).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
                    {session.start_date !== session.end_date && (
                      <>
                        <span className="text-slate-400 mx-0.5">→</span>
                        {new Date(session.end_date).toLocaleDateString(
                          "fr-FR",
                          {
                            day: "2-digit",
                            month: "short",
                            year: "2-digit",
                          },
                        )}
                      </>
                    )}
                  </span>
                </HeaderItem>
                <HeaderItem k="lieu">
                  <LocationPopover
                    locationFull={session.location_full}
                    locationText={session.location}
                    morningStart={session.default_morning_start}
                    morningEnd={session.default_morning_end}
                    afternoonStart={session.default_afternoon_start}
                    afternoonEnd={session.default_afternoon_end}
                  />
                </HeaderItem>
                {session.trainer && (
                  <HeaderItem k="formateur">
                    <TrainerPopover trainer={session.trainer} />
                  </HeaderItem>
                )}
                {/* Compteur + pastilles d'étapes à droite (poussés par ml-auto) */}
                <div className="ml-auto flex items-center gap-2 flex-wrap shrink-0">
                  <HeaderItem k="compteur">
                    {(() => {
                      const max = session.max_participants ?? null;
                      const isFull = max !== null && requests.length >= max;
                      const isAlmostFull =
                        max !== null &&
                        !isFull &&
                        max > 0 &&
                        requests.length / max >= 0.8;
                      return (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black border whitespace-nowrap",
                            isFull
                              ? "bg-red-100 text-red-800 border-red-300"
                              : isAlmostFull
                                ? "bg-amber-100 text-amber-800 border-amber-300"
                                : "bg-cyan-100 text-cyan-800 border-cyan-300",
                          )}
                          title={
                            max !== null
                              ? `${requests.length} inscrit${requests.length > 1 ? "s" : ""} sur ${max} places maximum`
                              : `${requests.length} inscrit${requests.length > 1 ? "s" : ""}`
                          }
                        >
                          <Users className="h-3 w-3" />
                          {requests.length}
                          {max !== null && (
                            <span className="opacity-70">/ {max}</span>
                          )}
                        </span>
                      );
                    })()}
                  </HeaderItem>
                  <HeaderItem k="pastilles">
                    <>
                      {stagesArr
                        .filter((s) => counts.get(s.id))
                        .map((s) => (
                          <span
                            key={s.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap"
                            style={{
                              backgroundColor: `${s.color}15`,
                              borderColor: s.color ?? "#94a3b8",
                              color: s.color ?? "#475569",
                            }}
                            title={s.description ?? s.name}
                          >
                            {s.name} {counts.get(s.id)}
                          </span>
                        ))}
                    </>
                  </HeaderItem>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="h-9 w-9 shrink-0 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <Inbox className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold tracking-tight">
                  Demandes sans session rattachée
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs mt-1 flex-wrap">
                <span className="text-slate-500">
                  À qualifier ou orienter vers une session.
                </span>
                <div className="ml-auto flex items-center gap-2 flex-wrap shrink-0">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black border bg-amber-100 text-amber-800 border-amber-300 whitespace-nowrap">
                    <Users className="h-3 w-3" />
                    {requests.length}
                  </span>
                  {stagesArr
                    .filter((s) => counts.get(s.id))
                    .map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap"
                        style={{
                          backgroundColor: `${s.color}15`,
                          borderColor: s.color ?? "#94a3b8",
                          color: s.color ?? "#475569",
                        }}
                        title={s.description ?? s.name}
                      >
                        {s.name} {counts.get(s.id)}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          </>
        )}
      </summary>

      <SessionInscriptionsTable
        session={session}
        requests={requests}
        stagesArr={stagesArr}
        companyNameById={companyNameById}
        stageEventsByInscription={stageEventsByInscription}
        nbJours={nbJours}
      />
    </details>
  );
}

// =========================================================
// Vue : Kanban (existante, simplifiée)
// =========================================================

function KanbanView({
  stagesArr,
  byStage,
  sessionMap,
}: {
  stagesArr: InscriptionStage[];
  byStage: Map<string, InscriptionRequest[]>;
  sessionMap: Map<
    string,
    {
      id: string;
      start_date: string;
      end_date: string;
      formation: {
        id: string;
        title: string;
        internal_code: string | null;
        public_price_excl_tax: number | null;
      } | null;
    }
  >;
}) {
  return (
    <div className="overflow-x-auto pb-4">
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${stagesArr.length}, minmax(280px, 1fr))`,
        }}
      >
        {stagesArr.map((stage) => {
          const items = byStage.get(stage.id) ?? [];
          return (
            <div
              key={stage.id}
              className="rounded-xl bg-slate-50 border border-slate-200 p-3 min-h-[200px]"
            >
              <div
                className="flex items-center justify-between mb-3 px-2"
                style={{
                  borderLeft: `3px solid ${stage.color ?? "#94a3b8"}`,
                }}
              >
                <div className="pl-2">
                  <p className="text-xs font-bold uppercase tracking-wider">
                    {stage.name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {items.length} demande{items.length > 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <ul className="space-y-2">
                {items.length === 0 ? (
                  <li className="text-xs text-slate-400 italic px-2">—</li>
                ) : (
                  items.map((r) => {
                    const fullName =
                      [r.prospect_first_name, r.prospect_last_name]
                        .filter(Boolean)
                        .join(" ")
                        .trim() || "Apprenant";
                    const session = r.target_session_id
                      ? sessionMap.get(r.target_session_id)
                      : null;
                    return (
                      <li key={r.id}>
                        <Link
                          href={`/inscriptions/${r.id}`}
                          className="block rounded-lg bg-white border border-slate-200 hover:border-cyan-400 hover:shadow-sm p-3 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-sm truncate">
                              {fullName}
                            </p>
                            {r.has_special_needs && (
                              <Accessibility
                                className="h-3.5 w-3.5 text-cyan-600 shrink-0"
                                aria-label="Besoin spécifique"
                              />
                            )}
                          </div>
                          {session?.formation?.title && (
                            <p className="text-[11px] text-slate-500 truncate mt-0.5 inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {session.formation.title}
                            </p>
                          )}
                          {(() => {
                            const joined = r as unknown as {
                              company?: { name: string } | null;
                              learner?: {
                                company?: { name: string } | null;
                              } | null;
                            };
                            const companyName =
                              joined.company?.name ??
                              joined.learner?.company?.name ??
                              r.company_name_freetext ??
                              null;
                            return companyName ? (
                              <p className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                                <Building2 className="h-3 w-3" />
                                {companyName}
                              </p>
                            ) : null;
                          })()}
                          <div className="flex flex-wrap items-center gap-1 mt-2 text-[10px]">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                              {INSCRIPTION_SOURCE_LABELS[r.source]}
                            </span>
                            {r.financing_mode && (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
                                {FINANCING_MODE_LABELS[r.financing_mode]}
                              </span>
                            )}
                            {r.quote_amount_ht && (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">
                                {Number(r.quote_amount_ht).toLocaleString(
                                  "fr-FR",
                                )}{" "}
                                € HT
                              </span>
                            )}
                          </div>
                        </Link>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
