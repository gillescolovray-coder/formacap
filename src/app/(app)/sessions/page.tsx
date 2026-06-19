import Link from "next/link";
import {
  BookOpen,
  Brain,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Info,
  Layers,
  ListChecks,
  MapPin,
  Plus,
  Search,
  User,
  UserPlus,
  Video,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DuplicateSessionButton } from "./_duplicate-button";
import { InscriptionsCounterCell } from "./_inscriptions-tooltip";
import { PageHeader } from "@/components/page-header";
import { SyncCalendarButton } from "./_sync-calendar-button";
import { SessionStatusSelect } from "./_status-select";
import { AdminClosedToggle } from "./_admin-closed-toggle";
import {
  computeInscriptionDisplayAmount,
  type DisplayAmountSessionContext,
} from "@/lib/billing/display-amount";
import { computeSessionPrice } from "@/lib/pricing/compute";

// Force le rechargement à chaque accès pour que les compteurs d'inscrits /
// statuts soient toujours à jour (synchronisation bidirectionnelle entre
// la liste des sessions et la fiche détail).
export const dynamic = "force-dynamic";
// La synchro/réinitialisation Google Agenda peut traiter plusieurs dizaines
// de sessions (avec throttling) -> on laisse jusqu'à 60s (max plan Hobby).
export const maxDuration = 60;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  SESSION_STATUS_LABELS,
  resolveSessionStatus,
  type SessionStatus,
  type SessionStatusDef,
  type TrainingSession,
} from "@/lib/sessions/types";
import { MODALITY_LABELS } from "@/lib/formations/types";

type SortMode =
  | "upcoming_first" // défaut : à venir/en cours d'abord (end_date asc), puis passées (end_date desc)
  | "start_desc"
  | "start_asc"
  | "end_desc"
  | "end_asc";

const SORT_LABELS: Record<SortMode, string> = {
  upcoming_first: "À venir en priorité",
  start_desc: "Date de début (plus récent)",
  start_asc: "Date de début (plus ancien)",
  end_desc: "Date de fin (plus récent)",
  end_asc: "Date de fin (plus ancien)",
};

type SearchParams = {
  q?: string;
  status?: SessionStatus | "";
  formation_id?: string;
  /** Filtre par source : "cap" | "presc:<companyId>" | "ofname:<nom OF>". */
  source?: string;
  period?: "past" | "current" | "upcoming" | "";
  sort?: SortMode | "";
  /** Filtre par dates (YYYY-MM-DD). */
  from?: string;
  to?: string;
  /** Saut rapide à un mois (YYYY-MM) — déduit from/to si présent. */
  month?: string;
};

const currencyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function formatDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const sameDay = start === end;
  const sameMonth =
    s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();

  if (sameDay) {
    return s.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  if (sameMonth) {
    return `${s.getDate()} – ${e.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
  }
  return `${s.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  })} – ${e.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

export default async function SessionsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const statusFilter = params.status ?? "";
  const formationFilter = params.formation_id ?? "";
  const sourceFilter = (params.source ?? "").trim();
  const periodFilter = params.period ?? "";
  const sortMode: SortMode =
    params.sort && params.sort in SORT_LABELS
      ? (params.sort as SortMode)
      : "upcoming_first";

  // Filtres par date (Gilles 2026-06-12). `month` (YYYY-MM) est un raccourci
  // qui déduit from/to = 1er → dernier jour du mois (s'il n'y a pas déjà un
  // from/to explicite). `from`/`to` = plage libre (YYYY-MM-DD).
  const isoDate = (v?: string) =>
    v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
  const monthParam =
    params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : "";
  let dateFrom = isoDate(params.from);
  let dateTo = isoDate(params.to);
  if (monthParam && !dateFrom && !dateTo) {
    const [my, mm] = monthParam.split("-").map(Number);
    const lastDay = new Date(my, mm, 0).getDate(); // dernier jour du mois
    dateFrom = `${monthParam}-01`;
    dateTo = `${monthParam}-${String(lastDay).padStart(2, "0")}`;
  }

  const isFiltered =
    Boolean(q) ||
    statusFilter !== "" ||
    formationFilter !== "" ||
    sourceFilter !== "" ||
    periodFilter !== "" ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(monthParam) ||
    sortMode !== "upcoming_first";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Horodatage de la dernière synchro complète Google Agenda (affiché
  // sous le bouton "Synchroniser l'agenda"). RLS -> org de l'utilisateur.
  const { data: orgRows } = await supabase
    .from("organizations")
    .select("calendar_last_sync_at")
    .limit(1);
  const calendarLastSyncAt =
    (orgRows?.[0]?.calendar_last_sync_at as string | null) ?? null;

  // Construction de la requête sessions avec les filtres avant de la
  // lancer en parallèle des autres requêtes indépendantes. Le tri
  // "upcoming_first" est fait en JS plus bas (pas de .order ici).
  // On joint aussi le formateur principal (trainer_id) pour pouvoir
  // l'afficher quand le champ texte libre `trainer_name` est vide.
  let query = supabase
    .from("sessions")
    .select(
      "*, formation:formations(id, title, public_price_excl_tax, price_company, duration_days), trainer:trainers!trainer_id(id, first_name, last_name), prescriber:companies!prescriber_company_id(id, name), quiz:quiz_templates!quiz_template_id(id, title), location_obj:formation_locations!location_id(id, name, address, postal_code, city)",
    );

  // Le statut et la formation se filtrent côté serveur (colonnes simples).
  // La RECHERCHE TEXTE et le filtre PAR DATE sont appliqués en JS plus bas
  // (Gilles 2026-06-12) : la recherche inclut désormais le NOM DE LA FORMATION
  // (table jointe, non filtrable en .or côté serveur).
  if (statusFilter) query = query.eq("status", statusFilter);
  if (formationFilter) query = query.eq("formation_id", formationFilter);

  const today = new Date().toISOString().slice(0, 10);
  if (periodFilter === "past") query = query.lt("end_date", today);
  if (periodFilter === "upcoming") query = query.gt("start_date", today);
  if (periodFilter === "current")
    query = query.lte("start_date", today).gte("end_date", today);
  // Bornes de dates côté serveur quand une plage est demandée (overlap :
  // start_date <= to ET end_date >= from). Réduit le volume rapatrié.
  if (dateFrom) query = query.gte("end_date", dateFrom);
  if (dateTo) query = query.lte("start_date", dateTo);
  // Plus de masquage des sessions >30 j : la vue groupée par mois replie
  // automatiquement les mois passés (Gilles 2026-06-12).

  // Phase 1 : tout ce qui ne dépend que de l'utilisateur — en parallèle.
  const [
    { data: membership },
    { data: sessionsRaw, error },
    { data: sourceRows },
  ] = await Promise.all([
    supabase
      .from("organization_members")
      .select("organization_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
    query,
    // Liste de TOUTES les sources (prescripteurs + OF sous-traitance) sur
    // l'ensemble des sessions — indépendante des filtres en cours — pour
    // peupler le menu déroulant « Source » (Gilles 2026-06-15).
    supabase
      .from("sessions")
      .select(
        "prescriber_company_id, subcontractor_name, is_subcontracted, prescriber:companies!prescriber_company_id(id, name)",
      ),
  ]);
  const organizationId = membership?.organization_id as string | undefined;

  // Construction des options du filtre Source. Trois familles :
  //   • CAP NUMÉRIQUE (sessions sans prescripteur ni sous-traitance) ;
  //   • un prescripteur précis (clé presc:<companyId>) ;
  //   • un OF donneur d'ordre précis (clé ofname:<nom>, le nom étant le
  //     champ affiché dans la liste — toujours renseigné en sous-traitance).
  const prescSourceMap = new Map<string, string>();
  const ofSourceSet = new Set<string>();
  for (const row of (sourceRows ?? []) as Array<Record<string, unknown>>) {
    const prescRaw = row.prescriber as
      | { id?: string; name?: string }
      | Array<{ id?: string; name?: string }>
      | null;
    const presc = Array.isArray(prescRaw) ? prescRaw[0] : prescRaw;
    if (presc?.id && presc?.name) prescSourceMap.set(presc.id, presc.name);
    const scName = ((row.subcontractor_name as string | null) ?? "").trim();
    if (scName && (row.is_subcontracted === true || scName.length > 0)) {
      ofSourceSet.add(scName);
    }
  }
  const prescSourceOptions = Array.from(prescSourceMap.entries())
    .map(([id, name]) => ({ value: `presc:${id}`, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const ofSourceOptions = Array.from(ofSourceSet)
    .map((name) => ({ value: `ofname:${name}`, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  // Tri appliqué côté JS pour pouvoir gérer l'ordre "upcoming_first"
  // (à venir/en cours d'abord, puis passées). Les autres modes sont
  // de simples comparaisons de chaînes ISO YYYY-MM-DD.
  const sessionsSorted = (sessionsRaw ?? []).slice().sort((a, b) => {
    const aStart = (a.start_date as string) ?? "";
    const bStart = (b.start_date as string) ?? "";
    const aEnd = (a.end_date as string) ?? "";
    const bEnd = (b.end_date as string) ?? "";
    switch (sortMode) {
      case "start_desc":
        return bStart.localeCompare(aStart);
      case "start_asc":
        return aStart.localeCompare(bStart);
      case "end_desc":
        return bEnd.localeCompare(aEnd);
      case "end_asc":
        return aEnd.localeCompare(bEnd);
      case "upcoming_first":
      default: {
        const aFuture = aEnd >= today ? 1 : 0;
        const bFuture = bEnd >= today ? 1 : 0;
        // 1) à venir / en cours avant les passées
        if (aFuture !== bFuture) return bFuture - aFuture;
        // 2a) à venir : la fin la plus proche d'abord
        if (aFuture === 1) return aEnd.localeCompare(bEnd);
        // 2b) passées : la plus récente d'abord
        return bEnd.localeCompare(aEnd);
      }
    }
  });

  // Filtres appliqués en JS (Gilles 2026-06-12) :
  //  - recherche texte ENRICHIE : nom de la formation + formateur (texte libre
  //    ET formateur référencé) + lieu + prescripteur.
  //  - plage de dates (from/to) : overlap avec la session.
  const qLower = q.toLowerCase();
  const sessions = sessionsSorted.filter((s) => {
    if (q) {
      const sAny = s as Record<string, unknown>;
      const form = sAny.formation as { title?: string | null } | null;
      const tr = sAny.trainer as
        | { first_name?: string; last_name?: string }
        | Array<{ first_name?: string; last_name?: string }>
        | null;
      const trObj = Array.isArray(tr) ? tr[0] : tr;
      const presc = sAny.prescriber as { name?: string | null } | null;
      const haystack = [
        form?.title,
        sAny.trainer_name as string | null,
        trObj ? `${trObj.first_name ?? ""} ${trObj.last_name ?? ""}` : null,
        sAny.location as string | null,
        presc?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(qLower)) return false;
    }
    if (sourceFilter) {
      const sAny = s as Record<string, unknown>;
      const prescRaw = sAny.prescriber as
        | { id?: string }
        | Array<{ id?: string }>
        | null;
      const presc = Array.isArray(prescRaw) ? prescRaw[0] : prescRaw;
      const prescId =
        (sAny.prescriber_company_id as string | null) ?? presc?.id ?? null;
      const scName = ((sAny.subcontractor_name as string | null) ?? "").trim();
      const isSub =
        sAny.is_subcontracted === true ||
        Boolean(sAny.subcontracting_company_id) ||
        scName.length > 0;
      if (sourceFilter === "cap") {
        // CAP NUMÉRIQUE en direct : aucune source partenaire.
        if (prescId || isSub) return false;
      } else if (sourceFilter.startsWith("presc:")) {
        if (prescId !== sourceFilter.slice("presc:".length)) return false;
      } else if (sourceFilter.startsWith("ofname:")) {
        if (scName !== sourceFilter.slice("ofname:".length)) return false;
      }
    }
    if (dateFrom || dateTo) {
      const sStart = ((s.start_date as string) ?? "").slice(0, 10);
      const sEnd = ((s.end_date as string) ?? sStart).slice(0, 10);
      if (dateFrom && sEnd < dateFrom) return false;
      if (dateTo && sStart > dateTo) return false;
    }
    return true;
  });

  const sessionIds = (sessions ?? []).map((s) => s.id as string);

  // Vue groupée par mois (Gilles 2026-06-12). On groupe les sessions filtrées
  // par mois civil (clé YYYY-MM), dans l'ordre du tri courant. Les mois passés
  // (dernier jour < aujourd'hui) sont repliés par défaut SAUF si un filtre est
  // actif (on veut alors voir tous les résultats).
  const MONTH_NAMES_FR = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ];
  type MonthGroup = {
    key: string;
    label: string;
    items: TrainingSession[];
    openByDefault: boolean;
  };
  const monthGroupMap = new Map<string, MonthGroup>();
  for (const s of sessions as TrainingSession[]) {
    const sd = ((s.start_date as string) ?? "").slice(0, 10);
    const key = sd ? sd.slice(0, 7) : "0000-00";
    let g = monthGroupMap.get(key);
    if (!g) {
      const [yy, mm] = key.split("-").map(Number);
      const label =
        yy && mm ? `${MONTH_NAMES_FR[mm - 1]} ${yy}` : "Sans date";
      // dernier jour du mois pour décider repli (mois passé)
      const lastDay =
        yy && mm
          ? `${key}-${String(new Date(yy, mm, 0).getDate()).padStart(2, "0")}`
          : "9999-12-31";
      g = {
        key,
        label,
        items: [],
        openByDefault: isFiltered || lastDay >= today,
      };
      monthGroupMap.set(key, g);
    }
    g.items.push(s);
  }
  const monthGroups = Array.from(monthGroupMap.values());

  // Navigation rapide par mois (◀ / ▶) — construit des liens qui préservent
  // les autres filtres (recherche, statut, formation, tri) et posent `month`.
  const buildSessionsHref = (overrides: Record<string, string>) => {
    const sp = new URLSearchParams();
    const merged: Record<string, string> = {
      q,
      status: statusFilter,
      formation_id: formationFilter,
      source: sourceFilter,
      period: periodFilter,
      sort: sortMode === "upcoming_first" ? "" : sortMode,
      from: dateFrom,
      to: dateTo,
      month: monthParam,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `/sessions?${qs}` : "/sessions";
  };
  const focusMonth = monthParam || today.slice(0, 7);
  const [focusY, focusM] = focusMonth.split("-").map(Number);
  const fmtMonth = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const prevMonth = fmtMonth(new Date(focusY, focusM - 2, 1));
  const nextMonth = fmtMonth(new Date(focusY, focusM, 1));
  // Liens mois : on pose `month` et on efface from/to pour que `month` prime.
  const prevMonthHref = buildSessionsHref({ month: prevMonth, from: "", to: "" });
  const nextMonthHref = buildSessionsHref({ month: nextMonth, from: "", to: "" });

  // Compteur : enrollments (apprenants déjà inscrits dans la session)
  // + inscription_requests rattachées qui ne sont PAS encore converties
  // (c'est-à-dire dont le learner_id n'est pas déjà dans les enrollments).
  // Chaque inscription compte comme une place réservée — pas de
  // déduplication agressive entre inscriptions distinctes.
  const enrollmentCount = new Map<string, number>();
  const inscriptionCount = new Map<string, number>();
  const totalPersons = new Map<string, number>();
  // Somme des montants HT des inscriptions (devis) par session — sert
  // de fallback si la session n'a pas de `amount_ht` saisi à la main.
  const inscriptionAmounts = new Map<string, number>();
  // Map session_id → tarif public unitaire (formation.price_company en
  // priorité, sinon formation.public_price_excl_tax). Déclarée ici (hors
  // du if hasSessions) pour rester accessible dans le rendu JSX du total.
  const publicUnitBySession = new Map<string, number>();
  // Contexte tarification R7 par session (hors du if hasSessions pour rester
  // accessible dans le helper r7SessionAmount et le rendu JSX).
  const sessionCtxById = new Map<string, DisplayAmountSessionContext>();
  // Sous-traitance : session -> { donneur d'ordre (OF), modalité } pour
  // calculer le forfait jour (Gilles 2026-06-12).
  const subcontractInfoBySession = new Map<
    string,
    { companyId: string | null; modality: string | null; durationDays: number | null }
  >();
  // Formateurs déduits des jours (session_days.trainer_id) — un seul
  // par id, fusionnés au cas où plusieurs jours partagent un formateur.
  const dayTrainersBySession = new Map<
    string,
    Map<string, { id: string; first_name: string; last_name: string }>
  >();
  // Set des learner_ids déjà enrôlés par session (pour détecter les
  // inscriptions déjà converties et éviter le double-comptage).
  const enrolledLearnerIds = new Map<string, Set<string>>();
  // personKeysSeen : utilisé uniquement pour ne pas répéter une même
  // personne dans la liste détaillée (info-bulle), pas pour le total.
  const personKeysSeen = new Map<string, Set<string>>();
  const stageBreakdown = new Map<string, Map<string, number>>();
  let stagesList: Array<{
    id: string;
    name: string;
    color: string | null;
    position: number;
    is_lost?: boolean | null;
  }> = [];

  // Personnes par session (pour l'info-bulle détaillée)
  type PersonRow = {
    key: string; // identifiant pour dédoublonner
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null; // portable
    job_title: string | null;
    company_name: string | null;
    statusLabel: string;
    statusColor: string | null;
    sortKey: string;
  };
  const personsBySession = new Map<string, PersonRow[]>();

  // Phase 2 : tout en parallèle (le bloc enrollments dépend de sessionIds,
  // mais on factorise avec les counts globaux et les statuts custom pour
  // n'avoir qu'un seul aller-retour réseau au total).
  const hasSessions = sessionIds.length > 0;
  const [
    { data: enrollments },
    { data: inscriptions },
    { data: stagesData },
    { data: dayTrainers },
    { data: customStatusesRaw },
    { data: sessionConventions },
    { count: totalCount },
    { count: upcomingCount },
    { count: currentCount },
    { count: pastCount },
    { count: hiddenOldSessionsCount },
  ] = await Promise.all([
    hasSessions
      ? supabase
          .from("session_enrollments")
          .select(
            "id, session_id, status, convocation_sent_at, attestation_sent_at, learner:learners(id, first_name, last_name, email, phone, job_title, company:companies(id, name))",
          )
          .in("session_id", sessionIds)
          .neq("status", "cancelled")
      : Promise.resolve({ data: [] }),
    hasSessions
      ? supabase
          .from("inscription_requests")
          .select(
            "id, target_session_id, learner_id, prospect_email, prospect_first_name, prospect_last_name, prospect_phone, stage_id, company_name_freetext, quote_amount_ht, via_partner_portal, billing_total_ht, employer_amount_ht, inscription_channel, referrer:companies!referrer_company_id(name, type), learner:learners(first_name, last_name, email, phone, job_title, company:companies(name))",
          )
          .in("target_session_id", sessionIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("inscription_stages")
      .select("id, name, color, position, is_lost")
      .eq("is_active", true)
      .order("position", { ascending: true }),
    hasSessions
      ? supabase
          .from("session_days")
          .select(
            "session_id, day_date, trainer:trainers!trainer_id(id, first_name, last_name)",
          )
          .in("session_id", sessionIds)
          .order("day_date", { ascending: true })
      : Promise.resolve({ data: [] }),
    organizationId
      ? supabase
          .from("session_statuses")
          .select("*")
          .eq("organization_id", organizationId)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] }),
    // Conventions par session — pour la modal synthese Inscriptions/
    // Conventions (Gilles 2026-05-31, Option A refonte UI).
    hasSessions
      ? supabase
          .from("session_conventions")
          .select(
            "id, session_id, company_id, status, sent_at, signed_at, signed_by_name",
          )
          .in("session_id", sessionIds)
      : Promise.resolve({ data: [] }),
    supabase.from("sessions").select("id", { count: "exact", head: true }),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .gt("start_date", today),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .lte("start_date", today)
      .gte("end_date", today),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .lt("end_date", today),
    // Compteur des sessions terminees depuis > 30 jours (masquees par
    // defaut — Gilles 2026-05-22).
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .lt(
        "end_date",
        new Date(Date.now() - 30 * 24 * 3600 * 1000)
          .toISOString()
          .slice(0, 10),
      ),
  ]);
  const customStatuses = (customStatusesRaw ?? []) as SessionStatusDef[];
  // Options de statut pour le sélecteur inline (Gilles 2026-06-12).
  // « Archivée » retiré des choix (Gilles 2026-06-13) : remplacé par le
  // marqueur « Dossier clôturé ».
  const statusOptions: { code: string; label: string }[] =
    customStatuses.length > 0
      ? customStatuses
          .filter((st) => st.code !== "archived")
          .map((st) => ({ code: st.code, label: st.label }))
      : (
          Object.keys(SESSION_STATUS_LABELS) as Array<
            keyof typeof SESSION_STATUS_LABELS
          >
        )
          .filter((key) => key !== "archived")
          .map((key) => ({ code: key, label: SESSION_STATUS_LABELS[key] }));

  if (hasSessions) {
    stagesList = (stagesData ?? []) as typeof stagesList;
    const stageById = new Map(stagesList.map((s) => [s.id, s]));
    // Fix Gilles 2026-05-31 : les inscriptions au stage "cancelled" /
    // "refused" / "lost" (is_lost=true) ne doivent PAS apparaitre dans
    // le tableau Sessions ni compter dans le CA. C est aligne avec ce
    // que voit l onglet Participants (qui se base sur session_enrollments
    // — donc n inclut JAMAIS les inscriptions perdues).
    const lostStageIds = new Set(
      stagesList.filter((s) => s.is_lost === true).map((s) => s.id),
    );

    (enrollments ?? []).forEach((r) => {
      const id = r.session_id as string;
      enrollmentCount.set(id, (enrollmentCount.get(id) ?? 0) + 1);
      if (!personKeysSeen.has(id)) personKeysSeen.set(id, new Set());
      if (!enrolledLearnerIds.has(id)) enrolledLearnerIds.set(id, new Set());
      const learner = r.learner as unknown as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        phone: string | null;
        job_title: string | null;
        company: { name: string } | null;
      } | null;
      const key = `l:${learner?.id ?? Math.random()}`;
      personKeysSeen.get(id)!.add(key);
      if (learner?.id) enrolledLearnerIds.get(id)!.add(learner.id);
      if (!personsBySession.has(id)) personsBySession.set(id, []);
      personsBySession.get(id)!.push({
        key,
        first_name: learner?.first_name ?? null,
        last_name: learner?.last_name ?? null,
        email: learner?.email ?? null,
        phone: learner?.phone ?? null,
        job_title: learner?.job_title ?? null,
        company_name: learner?.company?.name ?? null,
        statusLabel: "Inscrit",
        statusColor: "#10b981",
        sortKey: `${learner?.last_name ?? ""} ${learner?.first_name ?? ""}`.toLowerCase(),
      });
    });

    // Remplit la map tarif public déclarée plus haut (Gilles 2026-05-22).
    // Et construit en meme temps la map sessionId -> contexte pour le
    // helper partage computeInscriptionDisplayAmount (refonte 2026-05-31).
    // (sessionCtxById est déclaré au scope externe ci-dessus)
    for (const s of sessionsRaw ?? []) {
      const f = (
        s as {
          formation?: {
            public_price_excl_tax?: number | null;
            price_company?: number | null;
            duration_days?: number | null;
          } | null;
        }
      ).formation;
      const pub =
        (f?.price_company ?? null) !== null
          ? Number(f?.price_company)
          : (f?.public_price_excl_tax ?? null) !== null
            ? Number(f?.public_price_excl_tax)
            : null;
      if (pub !== null && Number.isFinite(pub) && pub > 0) {
        publicUnitBySession.set((s as { id: string }).id, pub);
      }
      // Contexte session pour le helper partage. duration_days vient
      // soit de la formation (preferable), soit calculee depuis dates.
      const sessAny = s as Record<string, unknown>;
      const durationDays =
        f?.duration_days !== null && f?.duration_days !== undefined
          ? Number(f.duration_days)
          : null;
      sessionCtxById.set((s as { id: string }).id, {
        pricing_mode: (sessAny.pricing_mode as "per_learner" | "forfait" | null) ?? null,
        price_per_day_ht: sessAny.price_per_day_ht as number | string | null,
        price_forfait_ht: sessAny.price_forfait_ht as number | string | null,
        price_extra_per_day_ht: sessAny.price_extra_per_day_ht as
          | number
          | string
          | null,
        pricing_threshold: sessAny.pricing_threshold as number | string | null,
        duration_days: durationDays,
        formation_public_price_excl_tax: pub,
        // Pour la session entiere, nb_billable_inscriptions est calcule
        // separement dans la passe inscriptions. On laisse undefined :
        // le mode forfait sera moins precis ici mais c est acceptable
        // pour une vue agregee (les ecrans detail font le bon calcul).
      });
      // Sous-traitance : on garde l'OF donneur d'ordre + la modalité.
      // L'OF peut être relié via subcontracting_company_id OU, à défaut,
      // prescriber_company_id (selon la saisie). On essaie les deux.
      if (sessAny.is_subcontracted === true) {
        subcontractInfoBySession.set((s as { id: string }).id, {
          companyId:
            (sessAny.subcontracting_company_id as string | null) ??
            (sessAny.prescriber_company_id as string | null) ??
            null,
          modality: (sessAny.modality as string | null) ?? null,
          durationDays,
        });
      }
    }

    (inscriptions ?? []).forEach((r, idx) => {
      const id = r.target_session_id as string;
      if (!id) return;
      // Skip inscriptions perdues (cancelled / refused / lost) — Gilles
      // 2026-05-31 : sinon elles continuent a gonfler le CA du tableau
      // Sessions alors qu elles ne sont plus dans Participants.
      const inscStageId = r.stage_id as string | null;
      if (inscStageId && lostStageIds.has(inscStageId)) return;
      // Skip brouillons zombies (Gilles 2026-05-31) : inscriptions
      // creees vides (pas de nom apprenant ET pas de learner_id rattache).
      // Ces enregistrements pollluent le compteur sans correspondre a
      // une vraie demande d inscription.
      const hasLearnerLink = !!(r.learner_id as string | null);
      const prospectLast = ((r.prospect_last_name as string | null) ?? "").trim();
      const prospectFirst = ((r.prospect_first_name as string | null) ?? "").trim();
      const prospectEmail = ((r.prospect_email as string | null) ?? "").trim();
      const hasProspectInfo = !!(prospectLast || prospectFirst || prospectEmail);
      if (!hasLearnerLink && !hasProspectInfo) return;
      inscriptionCount.set(id, (inscriptionCount.get(id) ?? 0) + 1);
      // Refonte tarification 2026-05-31 (Gilles etape 6 phase 2) :
      // delegate au helper partage. Source unique de verite =
      // src/lib/billing/display-amount.ts (utilisee aussi par
      // _session-table.tsx, dashboard, conventions, etc.)
      const ctx =
        sessionCtxById.get(id) ??
        ({
          formation_public_price_excl_tax: publicUnitBySession.get(id) ?? null,
        } as DisplayAmountSessionContext);
      const res = computeInscriptionDisplayAmount(
        r as {
          billing_total_ht?: number | string | null;
          quote_amount_ht?: number | string | null;
        },
        ctx,
      );
      if (res.amount !== null) {
        inscriptionAmounts.set(
          id,
          (inscriptionAmounts.get(id) ?? 0) + res.amount,
        );
      }
      const stage = r.stage_id ? stageById.get(r.stage_id as string) : null;
      const learnerInfo = r.learner as unknown as {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        phone: string | null;
        job_title: string | null;
        company: { name: string } | null;
      } | null;
      // Fallback : prospect_* en priorité, sinon données du learner lié
      const firstName =
        (r.prospect_first_name as string | null) ??
        learnerInfo?.first_name ??
        null;
      const lastName =
        (r.prospect_last_name as string | null) ??
        learnerInfo?.last_name ??
        null;
      const email =
        (r.prospect_email as string | null) ?? learnerInfo?.email ?? null;
      const phone =
        (r.prospect_phone as string | null) ?? learnerInfo?.phone ?? null;
      // Clé unique par inscription (incluant idx pour vraiment toujours
      // afficher chaque ligne, même les doublons logiques)
      const personKey = `i:${idx}:${r.learner_id ?? r.prospect_email ?? Math.random()}`;
      if (!personsBySession.has(id)) personsBySession.set(id, []);
      personsBySession.get(id)!.push({
        key: personKey,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        job_title: learnerInfo?.job_title ?? null,
        company_name:
          learnerInfo?.company?.name ??
          (r.company_name_freetext as string | null) ??
          null,
        statusLabel: stage?.name ?? "Demande",
        statusColor: stage?.color ?? null,
        sortKey: `${lastName ?? ""} ${firstName ?? ""}`.toLowerCase(),
      });
      const stageId = r.stage_id as string | null;
      if (stageId) {
        if (!stageBreakdown.has(id)) stageBreakdown.set(id, new Map());
        const m = stageBreakdown.get(id)!;
        m.set(stageId, (m.get(stageId) ?? 0) + 1);
      }
    });

    // Tri alphabétique des personnes au sein de chaque session
    // + DEDUPLICATION par TRIPLET (email + nom + prenom) — Gilles
    // 2026-05-31 v2 : la dedup precedente sur email seul masquait
    // les apprenants partageant une adresse generique (ex:
    // contact@boite.fr). On dedup desormais sur le triplet complet
    // (memoire feedback 2026-05-22 : autoriser plusieurs apprenants
    // avec meme email mais nom/prenom differents).
    for (const sid of personsBySession.keys()) {
      const list = personsBySession.get(sid) ?? [];
      list.sort((a, b) => a.sortKey.localeCompare(b.sortKey, "fr"));
      const seen = new Set<string>();
      const deduped: typeof list = [];
      for (const p of list) {
        // Triplet email+nom+prenom (insensible casse + trim)
        const emailKey = (p.email ?? "").trim().toLowerCase();
        const lastKey = (p.last_name ?? "").trim().toLowerCase();
        const firstKey = (p.first_name ?? "").trim().toLowerCase();
        const dedupKey = `${emailKey}|${lastKey}|${firstKey}`;
        // Si TOUS les champs sont vides -> garde quand meme (chaque
        // entree zombie distincte aurait sa propre representation)
        if (dedupKey === "||" || !seen.has(dedupKey)) {
          seen.add(dedupKey);
          deduped.push(p);
        }
      }
      personsBySession.set(sid, deduped);
    }

    // Indexation des formateurs par jour (un par session, dédupliqué).
    // Supabase JS type une jointure ambiguë comme un tableau ; on cast
    // en `unknown` puis on normalise.
    (dayTrainers ?? []).forEach((d) => {
      const sid = d.session_id as string;
      const raw = d.trainer as unknown;
      const t =
        Array.isArray(raw) ? raw[0] : raw;
      if (
        !sid ||
        !t ||
        typeof t !== "object" ||
        !(t as { id?: unknown }).id
      ) {
        return;
      }
      const trainer = t as {
        id: string;
        first_name: string;
        last_name: string;
      };
      if (!dayTrainersBySession.has(sid)) {
        dayTrainersBySession.set(sid, new Map());
      }
      dayTrainersBySession.get(sid)!.set(trainer.id, trainer);
    });

    // Calcul du total par session :
    //   total = enrollments
    //         + inscriptions dont le learner_id N'EST PAS déjà enrôlé
    //   (les inscriptions converties n'ajoutent pas de places en double)
    // Fix Gilles 2026-05-31 : applique les memes filtres que la boucle
    // principale (skip cancelled/refused/lost ET brouillons zombies sans
    // nom). Sinon des inscriptions abandonnees continuent a apparaitre
    // dans le compteur X / 10 alors qu elles ne sont plus dans
    // l onglet Participants.
    for (const sid of sessionIds) {
      const enrolled = enrollmentCount.get(sid) ?? 0;
      const enrolledIds = enrolledLearnerIds.get(sid) ?? new Set();
      let pendingFromInscriptions = 0;
      (inscriptions ?? []).forEach((r) => {
        if (r.target_session_id !== sid) return;
        // Skip stages perdus
        const stId = r.stage_id as string | null;
        if (stId && lostStageIds.has(stId)) return;
        // Skip brouillons zombies (sans nom ni learner)
        const hasLearner = !!(r.learner_id as string | null);
        const last = ((r.prospect_last_name as string | null) ?? "").trim();
        const first = ((r.prospect_first_name as string | null) ?? "").trim();
        const email = ((r.prospect_email as string | null) ?? "").trim();
        if (!hasLearner && !last && !first && !email) return;
        const lid = r.learner_id as string | null;
        if (lid && enrolledIds.has(lid)) {
          // déjà comptée dans enrollments → on l'ignore
        } else {
          pendingFromInscriptions += 1;
        }
      });
      totalPersons.set(sid, enrolled + pendingFromInscriptions);
    }
  }
  const stageById = new Map(stagesList.map((s) => [s.id, s]));

  // ── Sous-traitance : montant = forfait jour de l'OF donneur d'ordre × jours
  //    (Gilles 2026-06-12). CAP est rémunéré au forfait journalier, pas par
  //    apprenant. Le tarif sous-traitance est sur la fiche de l'OF.
  const subcontractCompanyIds = Array.from(
    new Set(
      Array.from(subcontractInfoBySession.values())
        .map((v) => v.companyId)
        .filter((x): x is string => Boolean(x)),
    ),
  );
  const subcontractRateByCompany = new Map<
    string,
    { distanciel: number | null; presentiel: number | null }
  >();
  if (subcontractCompanyIds.length > 0) {
    const { data: scCompanies } = await supabase
      .from("companies")
      .select(
        "id, subcontracting_daily_rate_distanciel_ht, subcontracting_daily_rate_presentiel_ht",
      )
      .in("id", subcontractCompanyIds);
    for (const c of (scCompanies ?? []) as Array<{
      id: string;
      subcontracting_daily_rate_distanciel_ht: number | string | null;
      subcontracting_daily_rate_presentiel_ht: number | string | null;
    }>) {
      const toN = (v: number | string | null) =>
        v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null;
      subcontractRateByCompany.set(c.id, {
        distanciel: toN(c.subcontracting_daily_rate_distanciel_ht),
        presentiel: toN(c.subcontracting_daily_rate_presentiel_ht),
      });
    }
  }

  // Montant forfait sous-traitance pour une session (ou null si non applicable
  // / tarif non renseigné sur l'OF).
  const subcontractAmount = (s: TrainingSession): number | null => {
    const info = subcontractInfoBySession.get(s.id);
    if (!info || !info.companyId) return null;
    const rates = subcontractRateByCompany.get(info.companyId);
    if (!rates) return null;
    const rate =
      info.modality === "distanciel"
        ? rates.distanciel ?? rates.presentiel
        : rates.presentiel ?? rates.distanciel;
    if (!rate || rate <= 0) return null;
    const days =
      info.durationDays && info.durationDays > 0
        ? info.durationDays
        : Math.max(
            1,
            Math.round(
              (new Date(s.end_date).getTime() -
                new Date(s.start_date).getTime()) /
                86_400_000,
            ) + 1,
          );
    return Math.round(rate * days * 100) / 100;
  };

  // Montant calculé depuis la tarification R7 propre à la session (forfait
  // INTRA / per_learner INTER) — Gilles 2026-06-08. Permet d'afficher le
  // montant d'une session dont le prix est saisi (ex. forfait 2490 €/jour)
  // MÊME sans inscrit. Le forfait/jour est dû quel que soit le nb
  // d'apprenants -> calcul avec max(nbInscrits, 1) en mode forfait.
  const r7SessionAmount = (s: TrainingSession): number | null => {
    const sCtx = sessionCtxById.get(s.id);
    if (!sCtx?.pricing_mode) return null;
    const nbInscrits =
      totalPersons.get(s.id) ??
      enrollmentCount.get(s.id) ??
      inscriptionCount.get(s.id) ??
      0;
    const days =
      sCtx.duration_days && Number(sCtx.duration_days) > 0
        ? Number(sCtx.duration_days)
        : Math.max(
            1,
            Math.round(
              (new Date(s.end_date).getTime() -
                new Date(s.start_date).getTime()) /
                86_400_000,
            ) + 1,
          );
    const nbForPrice =
      sCtx.pricing_mode === "forfait" ? Math.max(nbInscrits, 1) : nbInscrits;
    const breakdown = computeSessionPrice(
      {
        mode: sCtx.pricing_mode,
        pricePerDayHt:
          sCtx.price_per_day_ht != null ? Number(sCtx.price_per_day_ht) : null,
        priceForfaitHt:
          sCtx.price_forfait_ht != null ? Number(sCtx.price_forfait_ht) : null,
        priceExtraPerDayHt:
          sCtx.price_extra_per_day_ht != null
            ? Number(sCtx.price_extra_per_day_ht)
            : null,
        threshold:
          sCtx.pricing_threshold != null ? Number(sCtx.pricing_threshold) : null,
      },
      nbForPrice,
      days,
    );
    return breakdown.totalHt > 0 ? breakdown.totalHt : null;
  };

  // ============================================================
  // Refonte UI synthese Inscriptions/Conventions 2026-05-31 (Gilles
  // Option A) : construit une Map sessionId -> liste enrichie pour
  // alimenter la modal SessionDetailDialog (apprenant, entreprise,
  // etape, convention, convocation, attestation, montant HT).
  // ============================================================
  // lostStageIds defini ailleurs en local — recalcul pour ce bloc
  // (scope different car les boucles d agregation precedentes etaient
  // dans le if (hasSessions)).
  const lostStageIdsForDetail = new Set(
    stagesList.filter((s) => s.is_lost === true).map((s) => s.id),
  );

  type SessionDetailItem = {
    key: string;
    learnerId: string | null;
    fullName: string;
    companyName: string | null;
    sourceLabel: string;
    stageName: string | null;
    stageColor: string | null;
    amountHt: number | null;
    opcoAmount: number;
    employerAmount: number;
    convention: "signed" | "sent" | "draft" | "cancelled" | "none";
    convocationSent: boolean;
    attestationSent: boolean;
  };

  // Convention par (sessionId, companyId)
  const conventionByKey = new Map<
    string,
    { status: string; signed_at: string | null; sent_at: string | null }
  >();
  for (const row of (sessionConventions ?? []) as Array<{
    session_id: string;
    company_id: string | null;
    status: string;
    sent_at: string | null;
    signed_at: string | null;
  }>) {
    if (!row.company_id) continue;
    conventionByKey.set(`${row.session_id}|${row.company_id}`, {
      status: row.status,
      signed_at: row.signed_at,
      sent_at: row.sent_at,
    });
  }

  // Enrollment par (sessionId, learnerId) — pour convocation/attestation
  type EnrollmentDetail = {
    convocation_sent_at: string | null;
    attestation_sent_at: string | null;
    company_id: string | null;
  };
  const enrollmentByLearnerSession = new Map<string, EnrollmentDetail>();
  for (const e of (enrollments ?? []) as unknown as Array<{
    session_id: string;
    convocation_sent_at: string | null;
    attestation_sent_at: string | null;
    learner: {
      id: string;
      company: { id: string; name: string | null } | Array<{ id: string; name: string | null }> | null;
    } | null;
  }>) {
    const lInfo = e.learner;
    if (!lInfo?.id) continue;
    const company = Array.isArray(lInfo.company) ? lInfo.company[0] : lInfo.company;
    enrollmentByLearnerSession.set(`${e.session_id}|${lInfo.id}`, {
      convocation_sent_at: e.convocation_sent_at,
      attestation_sent_at: e.attestation_sent_at,
      company_id: company?.id ?? null,
    });
  }

  // OPCO fundings + employer amount par inscriptionId (Gilles
  // 2026-06-01) — pour la decomposition dans la modal Voir detail.
  type OpcoFundingSummary = { opcoTotal: number };
  const opcoByInscription = new Map<string, OpcoFundingSummary>();
  const inscriptionIdsForOpco = (
    (inscriptions ?? []) as unknown as Array<{ id?: string }>
  )
    .map((r) => r.id)
    .filter((x): x is string => !!x);
  if (inscriptionIdsForOpco.length > 0) {
    const { data: fundings } = await supabase
      .from("inscription_opco_fundings")
      .select("inscription_id, amount_ht")
      .in("inscription_id", inscriptionIdsForOpco);
    for (const f of (fundings ?? []) as Array<{
      inscription_id: string;
      amount_ht: number | string | null;
    }>) {
      const a =
        f.amount_ht !== null && f.amount_ht !== undefined
          ? Number(f.amount_ht)
          : 0;
      if (!Number.isFinite(a) || a <= 0) continue;
      const cur = opcoByInscription.get(f.inscription_id) ?? { opcoTotal: 0 };
      cur.opcoTotal += a;
      opcoByInscription.set(f.inscription_id, cur);
    }
  }

  // sessionDetailItems : Map<sessionId, SessionDetailItem[]>
  const sessionDetailItems = new Map<string, SessionDetailItem[]>();
  for (const sid of sessionIds) {
    sessionDetailItems.set(sid, []);
  }
  for (const r of (inscriptions ?? []) as unknown as Array<{
    id: string;
    target_session_id: string;
    learner_id: string | null;
    prospect_first_name: string | null;
    prospect_last_name: string | null;
    prospect_email: string | null;
    stage_id: string | null;
    company_name_freetext: string | null;
    quote_amount_ht: number | null;
    billing_total_ht: number | string | null;
    employer_amount_ht: number | string | null;
    inscription_channel: string | null;
    referrer: { name: string | null; type: string | null } | Array<{ name: string | null; type: string | null }> | null;
    learner: { first_name: string | null; last_name: string | null; company: { name: string } | null } | null;
  }>) {
    const sid = r.target_session_id;
    if (!sid) continue;
    // Filtres : exclure stages perdus + brouillons zombies (meme logique
    // que les boucles precedentes — coherent par construction)
    if (r.stage_id && lostStageIdsForDetail.has(r.stage_id)) continue;
    const hasLearner = !!r.learner_id;
    const last = (r.prospect_last_name ?? "").trim();
    const first = (r.prospect_first_name ?? "").trim();
    const email = (r.prospect_email ?? "").trim();
    if (!hasLearner && !last && !first && !email) continue;

    const lInfo = r.learner;
    const fullName =
      [lInfo?.first_name ?? first, lInfo?.last_name ?? last]
        .filter((x) => x && x.trim())
        .join(" ")
        .trim() || email || "Apprenant";
    const companyName =
      lInfo?.company?.name ?? r.company_name_freetext ?? null;
    const stage = r.stage_id ? stageById.get(r.stage_id) : null;
    const amountHt =
      r.billing_total_ht !== null && r.billing_total_ht !== undefined
        ? Number(r.billing_total_ht)
        : r.quote_amount_ht !== null
          ? Number(r.quote_amount_ht)
          : publicUnitBySession.get(sid) ?? null;

    // Convention (recherche par companyId du learner si disponible)
    let conventionStatus: SessionDetailItem["convention"] = "none";
    const enrollDetail = r.learner_id
      ? enrollmentByLearnerSession.get(`${sid}|${r.learner_id}`)
      : null;
    const companyIdForConv = enrollDetail?.company_id ?? null;
    if (companyIdForConv) {
      const conv = conventionByKey.get(`${sid}|${companyIdForConv}`);
      if (conv) {
        if (conv.status === "signed") conventionStatus = "signed";
        else if (conv.status === "sent") conventionStatus = "sent";
        else if (conv.status === "cancelled") conventionStatus = "cancelled";
        else conventionStatus = "draft";
      }
    }

    // Source d inscription (Gilles 2026-05-31) :
    //   - direct -> "CAP NUMERIQUE"
    //   - of + nom referrer -> "OF — <nom>"
    //   - prescripteur + nom referrer -> "Prescripteur — <nom>"
    const ref = Array.isArray(r.referrer) ? r.referrer[0] : r.referrer;
    let sourceLabel = "CAP NUMERIQUE";
    if (r.inscription_channel === "of") {
      sourceLabel = ref?.name ? `OF — ${ref.name}` : "OF";
    } else if (r.inscription_channel === "prescripteur") {
      sourceLabel = ref?.name
        ? `Prescripteur — ${ref.name}`
        : "Prescripteur";
    }

    // Decomposition OPCO + Employeur (Gilles 2026-06-01)
    const opcoSummary = opcoByInscription.get(r.id) ?? { opcoTotal: 0 };
    const opcoAmount = opcoSummary.opcoTotal;
    const employerManual =
      r.employer_amount_ht !== null && r.employer_amount_ht !== undefined
        ? Number(r.employer_amount_ht)
        : null;
    const employerAmount =
      opcoAmount > 0
        ? employerManual !== null && Number.isFinite(employerManual)
          ? employerManual
          : Math.max(0, (amountHt ?? 0) - opcoAmount)
        : 0;

    sessionDetailItems.get(sid)!.push({
      key: `i:${r.learner_id ?? email ?? fullName}`,
      learnerId: r.learner_id,
      fullName,
      companyName,
      sourceLabel,
      stageName: stage?.name ?? null,
      stageColor: stage?.color ?? null,
      amountHt,
      opcoAmount,
      employerAmount,
      convention: conventionStatus,
      convocationSent: !!enrollDetail?.convocation_sent_at,
      attestationSent: !!enrollDetail?.attestation_sent_at,
    });
  }

  // Resume par session : nb conventions signees / envoyees / a envoyer
  function conventionSummary(items: SessionDetailItem[]) {
    let signed = 0;
    let sent = 0;
    let draft = 0;
    const seenCompanies = new Set<string>();
    for (const it of items) {
      const key = it.companyName ?? `__solo_${it.key}`;
      if (seenCompanies.has(key)) continue;
      seenCompanies.add(key);
      if (it.convention === "signed") signed++;
      else if (it.convention === "sent") sent++;
      else if (it.convention === "draft") draft++;
    }
    return { signed, sent, draft, totalCompanies: seenCompanies.size };
  }

  function statCardClass(active: boolean, accent: string) {
    return cn(
      "rounded-xl border p-4 transition-all hover:shadow-sm",
      active
        ? "ring-2 ring-zinc-900 dark:ring-white border-zinc-900 dark:border-white"
        : "border-zinc-200 dark:border-zinc-800 opacity-90 hover:opacity-100",
      accent,
    );
  }

  return (
    <>
      <PageHeader
        title="Sessions de formation"
        description="Planifiez les dates de vos formations et inscrivez les apprenants."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Sessions" },
        ]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <SyncCalendarButton lastSyncAt={calendarLastSyncAt} />
            <Button nativeButton={false} render={<Link href="/sessions/new" />}>
              <Plus className="h-4 w-4" />
              Nouvelle session
            </Button>
          </div>
        }
      />

      <div className="p-4 sm:p-8 space-y-4">
        {/* Info masquage automatique des sessions > 30 jours
            (Gilles 2026-05-22) : on alerte l'utilisateur quand des
            sessions sont cachees, et on propose un raccourci. */}
        {periodFilter === "" &&
          !q &&
          (hiddenOldSessionsCount ?? 0) > 0 && (
            <div className="rounded-lg bg-cyan-50/60 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900 p-3 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-cyan-700 dark:text-cyan-400 shrink-0 mt-0.5" />
              <p className="text-xs text-cyan-900 dark:text-cyan-200 leading-relaxed">
                <strong>{hiddenOldSessionsCount}</strong> session
                {(hiddenOldSessionsCount ?? 0) > 1 ? "s" : ""} termin
                {(hiddenOldSessionsCount ?? 0) > 1 ? "ées" : "ée"} depuis
                plus de <strong>30 jours</strong>{" "}
                {(hiddenOldSessionsCount ?? 0) > 1 ? "sont masquées" : "est masquée"}{" "}
                pour alléger l&apos;affichage. Pour les consulter,
                cliquez sur{" "}
                <Link
                  href="/sessions?period=past"
                  className="underline font-bold hover:text-cyan-700 dark:hover:text-cyan-300"
                >
                  Passées
                </Link>{" "}
                ci-dessous.
              </p>
            </div>
          )}

        {/* Stat cards par période */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Link
            href={buildSessionsHref({ period: "" })}
            className={statCardClass(
              periodFilter === "",
              "bg-white dark:bg-zinc-900",
            )}
          >
            <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1">
              <ListChecks className="h-3.5 w-3.5" />
              Total
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {totalCount ?? 0}
            </div>
          </Link>
          <Link
            href={buildSessionsHref({ period: "upcoming" })}
            className={statCardClass(
              periodFilter === "upcoming",
              "bg-amber-50/50 dark:bg-amber-950/20",
            )}
          >
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-medium uppercase tracking-wider mb-1">
              <Calendar className="h-3.5 w-3.5" />
              À venir
            </div>
            <div className="text-2xl font-bold tabular-nums text-amber-800 dark:text-amber-300">
              {upcomingCount ?? 0}
            </div>
          </Link>
          <Link
            href={buildSessionsHref({ period: "current" })}
            className={statCardClass(
              periodFilter === "current",
              "bg-cyan-50/50 dark:bg-cyan-950/20",
            )}
          >
            <div className="flex items-center gap-2 text-cyan-700 dark:text-cyan-400 text-xs font-medium uppercase tracking-wider mb-1">
              <Clock className="h-3.5 w-3.5" />
              En cours
            </div>
            <div className="text-2xl font-bold tabular-nums text-cyan-800 dark:text-cyan-300">
              {currentCount ?? 0}
            </div>
          </Link>
          <Link
            href={buildSessionsHref({ period: "past" })}
            className={statCardClass(
              periodFilter === "past",
              "bg-zinc-100 dark:bg-zinc-900",
            )}
          >
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 text-xs font-medium uppercase tracking-wider mb-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Passées
            </div>
            <div className="text-2xl font-bold tabular-nums text-zinc-700 dark:text-zinc-300">
              {pastCount ?? 0}
            </div>
          </Link>
        </div>

        <form
          method="get"
          className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 space-y-3"
        >
          {/* La PÉRIODE (À venir / En cours / Passées) est pilotée par les
              cartes cliquables ci-dessus — on la préserve via un champ caché
              pour ne pas la perdre en filtrant (Gilles 2026-06-13 : suppression
              du menu Période redondant avec « Du → Au »). */}
          {periodFilter && (
            <input type="hidden" name="period" value={periodFilter} />
          )}

          {/* Ligne 1 : grande recherche + bouton coloré bien visible. */}
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
              <Input
                id="q"
                name="q"
                type="search"
                placeholder="Rechercher une formation, un formateur, un lieu…"
                defaultValue={q}
                className="h-11 pl-9 text-base"
              />
            </div>
            <div className="flex gap-2 shrink-0 w-full sm:w-auto">
              <Button
                type="submit"
                className="h-12 flex-1 sm:flex-none px-8 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-base shadow-md"
              >
                <Search className="h-5 w-5" />
                Rechercher
              </Button>
              {isFiltered && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12"
                  nativeButton={false}
                  render={<Link href="/sessions" />}
                >
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>

          {/* Ligne 2 : filtres secondaires compacts (formation / statut / tri
              + dates). */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 sm:gap-x-3 sm:gap-y-2 pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
            {/* Filtres Formation / Statut / Tri retirés (Gilles 2026-06-19) —
                allègement : la recherche texte couvre la formation, les cartes
                de période couvrent le statut. */}
            {/* Filtre Source (CAP / Prescripteur / OF) — permet de consulter
                toutes les sessions, passées comme à venir, d'un partenaire
                donné (Gilles 2026-06-15). */}
            <div className="space-y-1 w-full sm:w-auto">
              <Label htmlFor="source" className="text-[11px] text-zinc-500 uppercase tracking-wider">
                Source
              </Label>
              <select
                id="source"
                name="source"
                defaultValue={sourceFilter}
                className="flex h-9 w-full sm:w-[200px] rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
              >
                <option value="">Toutes les sources</option>
                <option value="cap">CAP NUMÉRIQUE (en direct)</option>
                {prescSourceOptions.length > 0 && (
                  <optgroup label="Prescripteurs">
                    {prescSourceOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {ofSourceOptions.length > 0 && (
                  <optgroup label="OF (sous-traitance)">
                    {ofSourceOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            {/* Séparateur visuel */}
            <div className="hidden md:block w-px self-stretch bg-zinc-200 dark:bg-zinc-700 mx-1" />

            {/* Dates : saut rapide au mois (◀ ▶) + plage précise Du / Au. */}
            <div className="space-y-1 w-full sm:w-auto">
              <Label htmlFor="month" className="text-[11px] text-zinc-500 uppercase tracking-wider">
                Mois
              </Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  nativeButton={false}
                  title="Mois précédent"
                  render={<Link href={prevMonthHref} />}
                >
                  ‹
                </Button>
                <Input
                  id="month"
                  name="month"
                  type="month"
                  defaultValue={monthParam}
                  className="h-9 w-full sm:w-[150px]"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  nativeButton={false}
                  title="Mois suivant"
                  render={<Link href={nextMonthHref} />}
                >
                  ›
                </Button>
              </div>
            </div>
            <div className="space-y-1 w-full sm:w-auto">
              <Label htmlFor="from" className="text-[11px] text-zinc-500 uppercase tracking-wider">
                Du
              </Label>
              <Input
                id="from"
                name="from"
                type="date"
                defaultValue={dateFrom}
                className="h-9 w-full sm:w-[150px]"
              />
            </div>
            <div className="space-y-1 w-full sm:w-auto">
              <Label htmlFor="to" className="text-[11px] text-zinc-500 uppercase tracking-wider">
                Au
              </Label>
              <Input
                id="to"
                name="to"
                type="date"
                defaultValue={dateTo}
                className="h-9 w-full sm:w-[150px]"
              />
            </div>
          </div>
        </form>

        {error ? (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            Erreur lors du chargement : {error.message}
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
            {isFiltered ? (
              <>
                <p className="text-sm font-medium mb-1">Aucun résultat</p>
                <p className="text-xs text-zinc-500 mb-4">
                  Aucune session ne correspond à votre recherche.
                </p>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/sessions" />}
                >
                  Réinitialiser
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium mb-1">Aucune session</p>
                <p className="text-xs text-zinc-500 mb-4">
                  Planifiez votre première session pour démarrer.
                </p>
                <Button
                  nativeButton={false}
                  render={<Link href="/sessions/new" />}
                >
                  <Plus className="h-4 w-4" />
                  Nouvelle session
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-500 px-1">
              {sessions.length} session{sessions.length > 1 ? "s" : ""}
              {isFiltered
                ? " (filtrée" + (sessions.length > 1 ? "s" : "") + ")"
                : ""}
            </p>

            {/* Bloc récap « Total HT » retiré (Gilles 2026-06-19) — allègement
                de la page Sessions. */}

            {monthGroups.map((grp) => (
            <details
              key={grp.key}
              open={grp.openByDefault}
              className="group rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden"
            >
              <summary className="cursor-pointer select-none list-none flex items-center gap-2 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900/60">
                <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0 transition-transform -rotate-90 group-open:rotate-0" />
                <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                  {grp.label}
                </span>
                <span className="text-xs font-normal text-zinc-400">
                  ({grp.items.length} session{grp.items.length > 1 ? "s" : ""})
                </span>
              </summary>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="px-4 py-3">Dates</th>
                    <th className="px-4 py-3">Formation</th>
                    <th className="px-4 py-3 text-center">Quiz</th>
                    <th className="px-4 py-3">Formateur</th>
                    <th className="px-4 py-3 text-right">Montant HT</th>
                    <th className="px-4 py-3 text-right">Inscrits</th>
                    <th className="px-4 py-3">Dossier</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {grp.items.map((s) => {
                    // Formateur affiché : priorité au texte libre, sinon
                    // formateur référencé principal (joint), sinon liste
                    // dédupliquée des formateurs des jours.
                    const sRaw = s as unknown as {
                      trainer?:
                        | {
                            id: string;
                            first_name: string;
                            last_name: string;
                          }
                        | Array<{
                            id: string;
                            first_name: string;
                            last_name: string;
                          }>
                        | null;
                    };
                    const principalTrainer = (() => {
                      const t = sRaw.trainer;
                      if (!t) return null;
                      return Array.isArray(t) ? t[0] ?? null : t;
                    })();
                    const dayTrainersList = Array.from(
                      (dayTrainersBySession.get(s.id) ?? new Map()).values(),
                    ) as Array<{
                      id: string;
                      first_name: string;
                      last_name: string;
                    }>;
                    let trainerLabel: string | null = null;
                    let trainerTitle: string | undefined;
                    if (s.trainer_name) {
                      trainerLabel = s.trainer_name;
                    } else if (principalTrainer) {
                      trainerLabel = `${principalTrainer.first_name} ${principalTrainer.last_name}`;
                    } else if (dayTrainersList.length > 0) {
                      const names = dayTrainersList.map(
                        (t) => `${t.first_name} ${t.last_name}`,
                      );
                      trainerLabel =
                        names.length === 1
                          ? names[0]
                          : `${names[0]} +${names.length - 1}`;
                      if (names.length > 1) {
                        trainerTitle = `${names.length} formateurs : ${names.join(", ")}`;
                      }
                    }

                    // Refonte tarification 2026-05-31 (Gilles) :
                    // Cascade corrigee pour eviter l incoherence
                    // 1220€ (tarif catalogue) vs 1175€ (CA reel).
                    //   1. amount_ht saisi sur la session (total figé) →
                    //      utilisé tel quel
                    //   2. somme des montants reels des inscriptions
                    //      (billing_total_ht > quote_amount_ht) →
                    //      AFFICHE LE CA REEL (tarifs negocies inclus)
                    //   3. fallback estimation : tarif PUBLIC × nb
                    //      d'inscrits (si aucune inscription chiffree)
                    const pubUnit = publicUnitBySession.get(s.id);
                    const nbInscrits =
                      totalPersons.get(s.id) ??
                      enrollmentCount.get(s.id) ??
                      inscriptionCount.get(s.id) ??
                      0;
                    const inscriptionTotal =
                      inscriptionAmounts.get(s.id) ?? 0;
                    // Tarification R7 propre à la session (forfait/jour…),
                    // affichée même sans inscrit. Gilles 2026-06-08.
                    const sessionConfigAmount = r7SessionAmount(s);
                    // INTRA forfait : le prix de la session EST le forfait
                    // (prix fixe), pas la somme des parts par apprenant qui
                    // peuvent être figées/incohérentes. Le forfait prime donc
                    // sur la somme des inscriptions. Gilles 2026-06-08.
                    const isForfait =
                      sessionCtxById.get(s.id)?.pricing_mode === "forfait";
                    const useForfaitFirst =
                      (s.amount_ht === null || s.amount_ht === undefined) &&
                      isForfait &&
                      sessionConfigAmount !== null;
                    // Sous-traitance : forfait jour de l'OF (prioritaire, car
                    // CAP est payé au forfait, pas par apprenant). Gilles 2026-06-12.
                    const scAmount =
                      s.amount_ht === null || s.amount_ht === undefined
                        ? subcontractAmount(s)
                        : null;

                    const displayedAmount =
                      s.amount_ht !== null && s.amount_ht !== undefined
                        ? Number(s.amount_ht)
                        : scAmount !== null
                          ? scAmount
                          : useForfaitFirst
                            ? sessionConfigAmount
                            : inscriptionTotal > 0
                              ? inscriptionTotal
                              : sessionConfigAmount !== null
                                ? sessionConfigAmount
                                : pubUnit && pubUnit > 0 && nbInscrits > 0
                                  ? pubUnit * nbInscrits
                                  : null;
                    const amountFromInscriptions =
                      (s.amount_ht === null || s.amount_ht === undefined) &&
                      scAmount === null &&
                      !useForfaitFirst &&
                      inscriptionTotal > 0;

                    const enrolled = enrollmentCount.get(s.id) ?? 0;
                    const inscriptions = inscriptionCount.get(s.id) ?? 0;
                    const total = totalPersons.get(s.id) ?? 0;
                    const isFull =
                      s.max_participants !== null &&
                      s.max_participants !== undefined &&
                      total >= s.max_participants;
                    // Avatar dégradé selon la modalité — donne un repère
                    // visuel rapide en parcourant la liste.
                    const avatarClass = !s.modality
                      ? "bg-gradient-to-br from-zinc-400 to-zinc-500"
                      : s.modality === "presentiel"
                        ? "bg-gradient-to-br from-emerald-500 to-teal-600"
                        : s.modality === "distanciel"
                          ? "bg-gradient-to-br from-cyan-500 to-blue-600"
                          : "bg-gradient-to-br from-violet-500 to-purple-600";
                    const AvatarIcon = !s.modality
                      ? BookOpen
                      : s.modality === "presentiel"
                        ? Building2
                        : s.modality === "distanciel"
                          ? Video
                          : Layers;
                    // Tooltip de l'avatar : modalite + détails contextuels
                    // (presentiel → adresse complete du lieu ; distanciel →
                    // outil visio + lien). Économise la colonne Lieu en
                    // gardant l'info accessible au survol.
                    const modalityTitle = (() => {
                      if (!s.modality) return "Modalité non renseignée";
                      const base = `Modalité : ${MODALITY_LABELS[s.modality]}`;
                      const parts: string[] = [base];
                      // Lieu détaillé (présentiel + hybride)
                      if (
                        s.modality === "presentiel" ||
                        s.modality === "hybride"
                      ) {
                        const rawLoc = (
                          s as unknown as {
                            location_obj?:
                              | {
                                  name: string | null;
                                  address: string | null;
                                  postal_code: string | null;
                                  city: string | null;
                                }
                              | Array<{
                                  name: string | null;
                                  address: string | null;
                                  postal_code: string | null;
                                  city: string | null;
                                }>
                              | null;
                          }
                        ).location_obj;
                        const loc = Array.isArray(rawLoc)
                          ? rawLoc[0] ?? null
                          : rawLoc ?? null;
                        if (loc) {
                          const addr = [
                            loc.address,
                            [loc.postal_code, loc.city]
                              .filter(Boolean)
                              .join(" "),
                          ]
                            .filter((x) => x && x.length > 0)
                            .join(", ");
                          const locLine = loc.name
                            ? addr
                              ? `Lieu : ${loc.name} — ${addr}`
                              : `Lieu : ${loc.name}`
                            : addr
                              ? `Lieu : ${addr}`
                              : null;
                          if (locLine) parts.push(locLine);
                        } else if (s.location) {
                          parts.push(`Lieu : ${s.location}`);
                        }
                      }
                      // Visio (distanciel + hybride)
                      if (
                        s.modality === "distanciel" ||
                        s.modality === "hybride"
                      ) {
                        if (s.video_app) {
                          parts.push(`Visio : ${s.video_app}`);
                        }
                        if (s.video_link) {
                          parts.push(`Lien : ${s.video_link}`);
                        }
                      }
                      return parts.join("\n");
                    })();
                    // Adresse complète (présentiel) affichée directement dans
                    // la colonne Formation (Gilles 2026-06-15).
                    const addressLine = (() => {
                      const rawLocCell = (
                        s as unknown as {
                          location_obj?:
                            | {
                                name: string | null;
                                address: string | null;
                                postal_code: string | null;
                                city: string | null;
                              }
                            | Array<{
                                name: string | null;
                                address: string | null;
                                postal_code: string | null;
                                city: string | null;
                              }>
                            | null;
                        }
                      ).location_obj;
                      const locCell = Array.isArray(rawLocCell)
                        ? rawLocCell[0] ?? null
                        : rawLocCell ?? null;
                      const addr = [
                        locCell?.address,
                        [locCell?.postal_code, locCell?.city]
                          .filter(Boolean)
                          .join(" "),
                      ]
                        .filter((x) => x && x.length > 0)
                        .join(", ");
                      const namePart = locCell?.name ?? null;
                      if (namePart && addr) return `${namePart} — ${addr}`;
                      if (namePart) return namePart;
                      if (addr) return addr;
                      if (s.location) return s.location;
                      return null;
                    })();
                    const statusInfo = resolveSessionStatus(
                      s.status,
                      customStatuses,
                    );
                    // Surcharge visuelle par statut (Gilles 2026-06-13) :
                    //  - ANNULÉE  -> ligne GRISÉE + atténuée (opacity), bien
                    //    identifiée comme inactive (révélée au survol).
                    //  - CONFIRMÉE -> teinte bleue PLUS SOUTENUE.
                    //  - autres   -> classes par couleur existantes.
                    // Clôture administrative (Gilles 2026-06-13) — indépendant
                    // du statut ; liséré vert à gauche quand le dossier est
                    // clôturé.
                    const adminClosed = Boolean(
                      (s as { admin_closed_at?: string | null }).admin_closed_at,
                    );
                    // Surcharge visuelle (Gilles 2026-06-15) : un dossier
                    // CLÔTURÉ prend un fond VERT plus soutenu (prioritaire sur
                    // le statut). Sinon, mise en forme par statut.
                    const rowClass = adminClosed
                      ? "bg-emerald-200/60 dark:bg-emerald-900/40 hover:bg-emerald-200 dark:hover:bg-emerald-900/60"
                      : statusInfo.code === "cancelled"
                        ? "bg-zinc-100/80 dark:bg-zinc-900/50 opacity-60 hover:opacity-100 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/60"
                        : statusInfo.code === "confirmed"
                          ? "bg-blue-100/70 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/40"
                          : statusInfo.rowClasses;
                    return (
                    <tr
                      key={s.id}
                      className={cn("transition-colors", rowClass)}
                    >
                      <td
                        className={cn(
                          "px-4 py-3 whitespace-nowrap align-top",
                          adminClosed && "border-l-4 border-emerald-500",
                        )}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300 text-xs">
                            {formatDateRange(s.start_date, s.end_date)}
                          </span>
                        </div>
                        {/* Statut sous la date pour faciliter la lecture
                            (Gilles 2026-06-13). */}
                        <div className="mt-1.5">
                          <SessionStatusSelect
                            sessionId={s.id}
                            current={s.status}
                            options={statusOptions}
                            badgeClasses={statusInfo.badgeClasses}
                            locked={adminClosed}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "h-9 w-9 shrink-0 rounded-full text-white flex items-center justify-center shadow-sm cursor-help",
                              avatarClass,
                            )}
                            title={modalityTitle}
                            aria-label={modalityTitle}
                          >
                            <AvatarIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/sessions/${s.id}`}
                              className="font-bold text-sm text-zinc-900 dark:text-zinc-100 hover:underline block"
                            >
                              {s.formation?.title ?? "—"}
                            </Link>
                            {/* Badge INTER/INTRA + nom prescripteur / OF
                                donneur d'ordre s'il y en a un (utile pour
                                reperer les sessions rattachees a un
                                partenaire sans ouvrir la fiche). */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span
                                className={cn(
                                  "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap",
                                  s.is_inter
                                    ? "bg-cyan-50 border-cyan-200 text-cyan-700"
                                    : "bg-amber-50 border-amber-200 text-amber-700",
                                )}
                                title={s.is_inter ? "Session ouverte a plusieurs entreprises" : "Session dediee a une seule entreprise"}
                              >
                                {s.is_inter ? "INTER" : "INTRA"}
                              </span>
                              {(() => {
                                const rawPrescriber = (
                                  s as unknown as {
                                    prescriber?:
                                      | { id: string; name: string }
                                      | Array<{ id: string; name: string }>
                                      | null;
                                  }
                                ).prescriber;
                                const prescriber = Array.isArray(rawPrescriber)
                                  ? rawPrescriber[0] ?? null
                                  : rawPrescriber ?? null;
                                if (prescriber?.name) {
                                  return (
                                    <Link
                                      href={`/entreprises/${prescriber.id}`}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100 whitespace-nowrap max-w-[220px]"
                                      title={`Prescripteur : ${prescriber.name} — ouvrir la fiche`}
                                    >
                                      <Building2 className="h-3 w-3 shrink-0" />
                                      <span className="truncate">
                                        {prescriber.name}
                                      </span>
                                    </Link>
                                  );
                                }
                                if (s.subcontractor_name) {
                                  // Si l'OF est relié (subcontracting_company_id),
                                  // on ouvre sa fiche ; sinon on recherche par nom.
                                  const scId = (
                                    s as unknown as {
                                      subcontracting_company_id?: string | null;
                                    }
                                  ).subcontracting_company_id;
                                  const href = scId
                                    ? `/entreprises/${scId}`
                                    : `/entreprises?q=${encodeURIComponent(s.subcontractor_name)}`;
                                  return (
                                    <Link
                                      href={href}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 whitespace-nowrap max-w-[220px]"
                                      title={`Donneur d'ordre (sous-traitance) : ${s.subcontractor_name} — ouvrir la fiche`}
                                    >
                                      <Building2 className="h-3 w-3 shrink-0" />
                                      <span className="truncate">
                                        {s.subcontractor_name}
                                      </span>
                                    </Link>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                            {/* Lieu présentiel (adresse complète) / visio
                                distanciel (appli + lien) — Gilles 2026-06-15.
                                Distinction nette entre lien visio renseigné ou
                                non. */}
                            {(s.modality === "presentiel" ||
                              s.modality === "hybride" ||
                              s.modality === "distanciel") && (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px]">
                                {(s.modality === "presentiel" ||
                                  s.modality === "hybride") && (
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1 max-w-[280px]",
                                      addressLine
                                        ? "text-zinc-500 dark:text-zinc-400"
                                        : "text-amber-600 dark:text-amber-500",
                                    )}
                                    title={addressLine ?? undefined}
                                  >
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    <span className="truncate">
                                      {addressLine ?? "Adresse non renseignée"}
                                    </span>
                                  </span>
                                )}
                                {(s.modality === "distanciel" ||
                                  s.modality === "hybride") && (
                                  <span className="inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                                    <Video className="h-3 w-3 shrink-0" />
                                    <span className="truncate max-w-[160px]">
                                      {s.video_app || "Visio"}
                                    </span>
                                    {s.video_link ? (
                                      <a
                                        href={s.video_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={`Ouvrir le lien visio : ${s.video_link}`}
                                        className="inline-flex items-center justify-center h-5 w-5 rounded text-cyan-600 hover:text-cyan-800 hover:bg-cyan-50 dark:hover:bg-cyan-950/40"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </a>
                                    ) : (
                                      <span
                                        title="Lien visio non renseigné"
                                        className="inline-flex items-center justify-center h-5 w-5 rounded text-zinc-300 dark:text-zinc-600 cursor-not-allowed"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>
                            )}
                            {(() => {
                              const breakdown = stageBreakdown.get(s.id);
                              if (!breakdown || breakdown.size === 0)
                                return null;
                              const items = Array.from(breakdown.entries())
                                .map(([sid, count]) => ({
                                  stage: stageById.get(sid),
                                  count,
                                }))
                                .filter((x) => x.stage)
                                .sort(
                                  (a, b) =>
                                    (a.stage!.position ?? 0) -
                                    (b.stage!.position ?? 0),
                                );
                              return (
                                <div className="flex flex-wrap items-center gap-1 mt-1">
                                  {items.map((it) => (
                                    <span
                                      key={it.stage!.id}
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap"
                                      style={{
                                        backgroundColor: `${it.stage!.color}15`,
                                        borderColor:
                                          it.stage!.color ?? "#94a3b8",
                                        color: it.stage!.color ?? "#475569",
                                      }}
                                      title={it.stage!.name}
                                    >
                                      {it.stage!.name}
                                      <span className="font-black">
                                        {" "}
                                        {it.count}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(() => {
                          const rawQuiz = (
                            s as unknown as {
                              quiz?:
                                | { id: string; title: string }
                                | Array<{ id: string; title: string }>
                                | null;
                            }
                          ).quiz;
                          const quiz = Array.isArray(rawQuiz)
                            ? rawQuiz[0] ?? null
                            : rawQuiz ?? null;
                          if (quiz?.title) {
                            return (
                              <span
                                className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900 cursor-help"
                                title={`Quiz rattaché : ${quiz.title}`}
                                aria-label={`Quiz rattaché : ${quiz.title}`}
                              >
                                <Brain className="h-3.5 w-3.5" />
                              </span>
                            );
                          }
                          return (
                            <span
                              className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-zinc-100 text-zinc-400 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-500 dark:border-zinc-700 cursor-help"
                              title="Aucun quiz d'évaluation rattaché à cette session"
                              aria-label="Aucun quiz rattaché"
                            >
                              <Brain className="h-3.5 w-3.5 opacity-50" />
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {trainerLabel ? (
                          <div
                            className="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-300"
                            title={trainerTitle}
                          >
                            <User className="h-3 w-3 text-zinc-400 shrink-0" />
                            <span className="truncate max-w-[160px]">
                              {trainerLabel}
                            </span>
                          </div>
                        ) : (
                          <span className="text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {displayedAmount !== null ? (
                          <span
                            className={cn(
                              "font-bold text-sm tabular-nums",
                              amountFromInscriptions
                                ? "text-cyan-700 dark:text-cyan-400"
                                : "text-zinc-800 dark:text-zinc-200",
                            )}
                            title={
                              amountFromInscriptions
                                ? "Montant calculé à partir des devis d'inscription (renseignez le champ Montant HT sur la fiche pour figer le montant)"
                                : undefined
                            }
                          >
                            {currencyFormatter.format(displayedAmount)}
                            {amountFromInscriptions && (
                              <span className="ml-1 text-[10px] font-normal text-zinc-400">
                                (devis)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-zinc-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <InscriptionsCounterCell
                          total={total}
                          enrolled={enrolled}
                          inscriptions={inscriptions}
                          maxParticipants={s.max_participants ?? null}
                          isFull={isFull}
                          persons={personsBySession.get(s.id) ?? []}
                          stageBreakdown={(() => {
                            const m = stageBreakdown.get(s.id);
                            if (!m) return [];
                            return Array.from(m.entries())
                              .map(([sid, count]) => {
                                const stage = stageById.get(sid);
                                if (!stage) return null;
                                return {
                                  id: stage.id,
                                  name: stage.name,
                                  color: stage.color,
                                  count,
                                };
                              })
                              .filter(
                                (
                                  x,
                                ): x is {
                                  id: string;
                                  name: string;
                                  color: string | null;
                                  count: number;
                                } => x !== null,
                              )
                              .sort((a, b) => {
                                const sa = stageById.get(a.id);
                                const sb = stageById.get(b.id);
                                return (
                                  (sa?.position ?? 0) - (sb?.position ?? 0)
                                );
                              });
                          })()}
                          sessionTitle={
                            (s.formation as { title?: string } | null)?.title ??
                            "Session"
                          }
                          sessionDate={
                            s.start_date
                              ? new Date(
                                  s.start_date + "T00:00:00",
                                ).toLocaleDateString("fr-FR", {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                })
                              : null
                          }
                          detailItems={sessionDetailItems.get(s.id) ?? []}
                          conventionSummary={conventionSummary(
                            sessionDetailItems.get(s.id) ?? [],
                          )}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <AdminClosedToggle
                          sessionId={s.id}
                          closed={adminClosed}
                        />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {adminClosed ? (
                          <span
                            title="Session clôturée : décochez « Clôturé » pour inscrire un apprenant"
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-zinc-300 cursor-not-allowed mr-1"
                          >
                            <UserPlus className="h-4 w-4" />
                          </span>
                        ) : (
                          <Link
                            href={`/inscriptions/new?session_id=${s.id}`}
                            title="Inscrire un apprenant à cette session"
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-zinc-500 hover:text-cyan-700 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 transition-colors mr-1"
                          >
                            <UserPlus className="h-4 w-4" />
                          </Link>
                        )}
                        <DuplicateSessionButton
                          sessionId={s.id}
                          sessionLabel={s.formation?.title ?? undefined}
                        />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </details>
            ))}
          </>
        )}
      </div>
    </>
  );
}
