import Link from "next/link";
import {
  BookOpen,
  Brain,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Info,
  Layers,
  ListChecks,
  Plus,
  User,
  UserPlus,
  Video,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DuplicateSessionButton } from "./_duplicate-button";
import { InscriptionsCounterCell } from "./_inscriptions-tooltip";
import { PageHeader } from "@/components/page-header";
import {
  computeInscriptionDisplayAmount,
  type DisplayAmountSessionContext,
} from "@/lib/billing/display-amount";

// Force le rechargement à chaque accès pour que les compteurs d'inscrits /
// statuts soient toujours à jour (synchronisation bidirectionnelle entre
// la liste des sessions et la fiche détail).
export const dynamic = "force-dynamic";
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
  period?: "past" | "current" | "upcoming" | "";
  sort?: SortMode | "";
};

function escapeForIlike(value: string) {
  return value.replace(/[%_,()]/g, " ").trim();
}

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
  const periodFilter = params.period ?? "";
  const sortMode: SortMode =
    params.sort && params.sort in SORT_LABELS
      ? (params.sort as SortMode)
      : "upcoming_first";
  const isFiltered =
    Boolean(q) ||
    statusFilter !== "" ||
    formationFilter !== "" ||
    periodFilter !== "" ||
    sortMode !== "upcoming_first";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

  if (q) {
    const safe = escapeForIlike(q);
    if (safe.length > 0) {
      query = query.or(
        `trainer_name.ilike.%${safe}%,location.ilike.%${safe}%`,
      );
    }
  }
  if (statusFilter) query = query.eq("status", statusFilter);
  if (formationFilter) query = query.eq("formation_id", formationFilter);

  const today = new Date().toISOString().slice(0, 10);
  if (periodFilter === "past") query = query.lt("end_date", today);
  if (periodFilter === "upcoming") query = query.gt("start_date", today);
  if (periodFilter === "current")
    query = query.lte("start_date", today).gte("end_date", today);
  // Gilles 2026-05-22 : par défaut (pas de filtre période ni recherche),
  // on masque les sessions terminées depuis plus de 30 jours pour
  // alléger l'affichage. L'utilisateur peut toujours cliquer sur le
  // bouton "Passées" pour voir TOUTES les anciennes sessions.
  if (periodFilter === "" && !q) {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    query = query.gte("end_date", cutoff);
  }

  // Phase 1 : tout ce qui ne dépend que de l'utilisateur — en parallèle.
  const [
    { data: membership },
    { data: formations },
    { data: sessionsRaw, error },
  ] = await Promise.all([
    supabase
      .from("organization_members")
      .select("organization_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("formations")
      .select("id, title")
      .order("title", { ascending: true }),
    query,
  ]);
  const organizationId = membership?.organization_id as string | undefined;

  // Tri appliqué côté JS pour pouvoir gérer l'ordre "upcoming_first"
  // (à venir/en cours d'abord, puis passées). Les autres modes sont
  // de simples comparaisons de chaînes ISO YYYY-MM-DD.
  const sessions = (sessionsRaw ?? []).slice().sort((a, b) => {
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

  const sessionIds = (sessions ?? []).map((s) => s.id as string);
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
    const sessionCtxById = new Map<string, DisplayAmountSessionContext>();
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
          <Button nativeButton={false} render={<Link href="/sessions/new" />}>
            <Plus className="h-4 w-4" />
            Nouvelle session
          </Button>
        }
      />

      <div className="p-8 space-y-4">
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
            href="/sessions"
            className={statCardClass(
              periodFilter === "" && !isFiltered,
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
            href="/sessions?period=upcoming"
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
            href="/sessions?period=current"
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
            href="/sessions?period=past"
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
          className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4"
        >
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] items-end">
            <div className="space-y-1.5">
              <Label htmlFor="q" className="text-xs">
                Rechercher
              </Label>
              <Input
                id="q"
                name="q"
                type="search"
                placeholder="Formateur, lieu…"
                defaultValue={q}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="formation_id" className="text-xs">
                Formation
              </Label>
              <select
                id="formation_id"
                name="formation_id"
                defaultValue={formationFilter}
                className="flex h-9 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
              >
                <option value="">Toutes</option>
                {(formations ?? []).map((f) => (
                  <option key={f.id as string} value={f.id as string}>
                    {f.title as string}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status" className="text-xs">
                Statut
              </Label>
              <select
                id="status"
                name="status"
                defaultValue={statusFilter}
                className="flex h-9 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
              >
                <option value="">Tous</option>
                {(customStatuses.length > 0
                  ? customStatuses.map((s) => ({
                      code: s.code,
                      label: s.label,
                    }))
                  : (
                      Object.keys(SESSION_STATUS_LABELS) as Array<
                        keyof typeof SESSION_STATUS_LABELS
                      >
                    ).map((key) => ({
                      code: key,
                      label: SESSION_STATUS_LABELS[key],
                    }))
                ).map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="period" className="text-xs">
                Période
              </Label>
              <select
                id="period"
                name="period"
                defaultValue={periodFilter}
                className="flex h-9 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
              >
                <option value="">Toutes</option>
                <option value="upcoming">À venir</option>
                <option value="current">En cours</option>
                <option value="past">Passées</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sort" className="text-xs">
                Tri
              </Label>
              <select
                id="sort"
                name="sort"
                defaultValue={sortMode}
                className="flex h-9 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
              >
                {(Object.keys(SORT_LABELS) as SortMode[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Filtrer</Button>
              {isFiltered && (
                <Button
                  type="button"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/sessions" />}
                >
                  Réinitialiser
                </Button>
              )}
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

            {/* Récap des totaux HT par statut. Calculé sur les sessions
                de la page courante (donc respecte les filtres actifs). */}
            {(() => {
              type Bucket = {
                code: string;
                label: string;
                color: string;
                badgeClasses: string;
                totalHT: number;
                count: number;
              };
              const buckets = new Map<string, Bucket>();
              let grandTotal = 0;
              let withAmount = 0;
              for (const s of sessions as TrainingSession[]) {
                const info = resolveSessionStatus(s.status, customStatuses);
                const key = info.code;
                if (!buckets.has(key)) {
                  buckets.set(key, {
                    code: info.code,
                    label: info.label,
                    color: info.color,
                    badgeClasses: info.badgeClasses,
                    totalHT: 0,
                    count: 0,
                  });
                }
                const b = buckets.get(key)!;
                b.count += 1;
                // Refonte tarification 2026-05-31 (Gilles) : cascade
                // corrigee pour totaux session :
                //   1. amount_ht saisi sur la session (réel)
                //   2. somme inscriptionAmounts (CA reel = billing_total_ht
                //      > quote_amount_ht — tarifs negocies inclus)
                //   3. fallback estimation = tarif public × nb d'inscrits
                //      (ou max_participants a defaut)
                let amount = 0;
                if (s.amount_ht !== null && s.amount_ht !== undefined) {
                  amount = Number(s.amount_ht);
                } else {
                  const fromInscriptions = inscriptionAmounts.get(s.id) ?? 0;
                  if (fromInscriptions > 0) {
                    amount = fromInscriptions;
                  } else {
                    const pub = publicUnitBySession.get(s.id);
                    if (pub && pub > 0) {
                      const nb =
                        totalPersons.get(s.id) ??
                        enrollmentCount.get(s.id) ??
                        inscriptionCount.get(s.id) ??
                        0;
                      const effectiveNb =
                        nb > 0 ? nb : Number(s.max_participants ?? 0);
                      if (effectiveNb > 0) amount = pub * effectiveNb;
                    }
                  }
                }
                if (amount > 0) {
                  b.totalHT += amount;
                  grandTotal += amount;
                  withAmount += 1;
                }
              }
              const bucketsArr = Array.from(buckets.values());
              if (withAmount === 0) return null;
              return (
                <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase tracking-wider font-bold text-zinc-500 mr-1">
                      Total HT
                    </span>
                    <span className="inline-flex items-center px-3 py-1 rounded-md bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-black tabular-nums">
                      {currencyFormatter.format(grandTotal)}
                    </span>
                    <span className="text-xs text-zinc-400">
                      ({withAmount} session{withAmount > 1 ? "s" : ""}{" "}
                      avec montant)
                    </span>
                    <span className="mx-2 text-zinc-200 dark:text-zinc-700">
                      |
                    </span>
                    {bucketsArr
                      .filter((b) => b.totalHT > 0)
                      .map((b) => (
                        <span
                          key={b.code}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap",
                            b.badgeClasses,
                          )}
                          title={`${b.count} session${b.count > 1 ? "s" : ""} en « ${b.label} »`}
                        >
                          <span className="font-medium">{b.label}</span>
                          <span className="font-black tabular-nums">
                            {currencyFormatter.format(b.totalHT)}
                          </span>
                        </span>
                      ))}
                  </div>
                </div>
              );
            })()}

            <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="px-4 py-3">Dates</th>
                    <th className="px-4 py-3">Formation</th>
                    <th className="px-4 py-3 text-center">Quiz</th>
                    <th className="px-4 py-3">Formateur</th>
                    <th className="px-4 py-3 text-right">Montant HT</th>
                    <th className="px-4 py-3 text-right">Inscrits</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {(sessions as TrainingSession[]).map((s) => {
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
                    const displayedAmount =
                      s.amount_ht !== null && s.amount_ht !== undefined
                        ? Number(s.amount_ht)
                        : inscriptionTotal > 0
                          ? inscriptionTotal
                          : pubUnit && pubUnit > 0 && nbInscrits > 0
                            ? pubUnit * nbInscrits
                            : null;
                    const amountFromInscriptions =
                      (s.amount_ht === null || s.amount_ht === undefined) &&
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
                    const statusInfo = resolveSessionStatus(
                      s.status,
                      customStatuses,
                    );
                    return (
                    <tr
                      key={s.id}
                      className={cn(
                        "transition-colors",
                        statusInfo.rowClasses,
                      )}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300 text-xs">
                            {formatDateRange(s.start_date, s.end_date)}
                          </span>
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
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 border border-violet-200 text-violet-700 whitespace-nowrap max-w-[220px]"
                                      title={`Prescripteur : ${prescriber.name}`}
                                    >
                                      <Building2 className="h-3 w-3 shrink-0" />
                                      <span className="truncate">
                                        {prescriber.name}
                                      </span>
                                    </span>
                                  );
                                }
                                if (s.subcontractor_name) {
                                  return (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-50 border border-orange-200 text-orange-700 whitespace-nowrap max-w-[220px]"
                                      title={`Donneur d'ordre (sous-traitance) : ${s.subcontractor_name}`}
                                    >
                                      <Building2 className="h-3 w-3 shrink-0" />
                                      <span className="truncate">
                                        {s.subcontractor_name}
                                      </span>
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
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
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap cursor-help",
                            statusInfo.badgeClasses,
                          )}
                          title={
                            statusInfo.description
                              ? `${statusInfo.label} — ${statusInfo.description}`
                              : statusInfo.label
                          }
                          aria-label={statusInfo.description || statusInfo.label}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Link
                          href={`/inscriptions/new?session_id=${s.id}`}
                          title="Inscrire un apprenant à cette session"
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-zinc-500 hover:text-cyan-700 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 transition-colors mr-1"
                        >
                          <UserPlus className="h-4 w-4" />
                        </Link>
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
          </>
        )}
      </div>
    </>
  );
}
