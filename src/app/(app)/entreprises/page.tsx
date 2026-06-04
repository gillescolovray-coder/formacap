import Link from "next/link";
import {
  Banknote,
  Building2,
  GitBranch,
  Handshake,
  Mail,
  Network,
  Plus,
  Share2,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompanyRow } from "./_company-row";
import { LearnerPortalButtons } from "./_learner-portal-buttons";
import {
  FormationsTooltip,
  type FormationEntry,
} from "./_formations-tooltip";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  COMPANY_TYPE_BADGE_CLASSES,
  COMPANY_TYPE_LABELS,
  type Company,
  type CompanyType,
} from "@/lib/companies/types";

type SearchParams = {
  q?: string;
  // `of_prescripteur` est une valeur composite UI : la carte « OF /
  // Prescripteurs » regroupe les deux types via un filtre .in() côté
  // serveur. Pas un type DB, juste un alias URL.
  type?: CompanyType | "of_prescripteur" | "";
  active?: string;
  view?: "contacts" | "table" | "tree";
  peopleFilter?: "all" | "apprenants" | "contacts";
  /** Filtre hiérarchique : parents seulement, filiales seulement, ou tout. */
  hierarchy?: "parents" | "subsidiaries" | "";
};

function escapeForIlike(value: string) {
  return value.replace(/[%_,()]/g, " ").trim();
}

export default async function CompaniesListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const typeFilter = params.type ?? "";
  const activeFilter = params.active ?? "";
  const hierarchyFilter: "parents" | "subsidiaries" | "" =
    params.hierarchy === "parents"
      ? "parents"
      : params.hierarchy === "subsidiaries"
        ? "subsidiaries"
        : "";
  const view: "table" | "contacts" | "tree" =
    params.view === "contacts"
      ? "contacts"
      : params.view === "tree"
        ? "tree"
        : "table";
  const peopleFilter: "all" | "apprenants" | "contacts" =
    params.peopleFilter === "apprenants"
      ? "apprenants"
      : params.peopleFilter === "contacts"
        ? "contacts"
        : "all";
  const isFiltered =
    Boolean(q) ||
    typeFilter !== "" ||
    activeFilter !== "" ||
    hierarchyFilter !== "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    totalCount,
    prospectCount,
    clientCount,
    prescripteurCount,
    financeurCount,
  ] = await Promise.all([
    supabase.from("companies").select("id", { count: "exact", head: true }),
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("type", "prospect"),
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("type", "client"),
    // La carte « OF / Prescripteurs » regroupe les deux types — un OF
    // partenaire et un prescripteur jouent un rôle similaire (apporteur
    // d'affaires) côté UX, on les compte ensemble.
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .in("type", ["prescripteur", "of"]),
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("type", "financeur"),
  ]);

  // Si une recherche est active, on cherche aussi parmi les contacts
  // et apprenants : les entreprises correspondantes (via company_id)
  // sont ajoutées au résultat même si leur fiche en elle-même ne
  // matche pas.
  let extraCompanyIds = new Set<string>();
  if (q) {
    const safe = escapeForIlike(q);
    if (safe.length > 0) {
      const [{ data: matchedContacts }, { data: matchedLearners }] =
        await Promise.all([
          supabase
            .from("company_contacts")
            .select("company_id")
            .or(
              `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%`,
            ),
          supabase
            .from("learners")
            .select("company_id")
            .not("company_id", "is", null)
            .or(
              `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%`,
            ),
        ]);
      (matchedContacts ?? []).forEach((c) => {
        if (c.company_id) extraCompanyIds.add(c.company_id as string);
      });
      (matchedLearners ?? []).forEach((l) => {
        if (l.company_id) extraCompanyIds.add(l.company_id as string);
      });
    }
  }

  let query = supabase
    .from("companies")
    .select("*")
    .order("name", { ascending: true });

  if (q) {
    const safe = escapeForIlike(q);
    if (safe.length > 0) {
      // Recherche sur les champs entreprise OU id présent dans les
      // contacts/apprenants matchés.
      const ors = [
        `name.ilike.%${safe}%`,
        `siret.ilike.%${safe}%`,
        `city.ilike.%${safe}%`,
        `email.ilike.%${safe}%`,
        `industry.ilike.%${safe}%`,
      ];
      if (extraCompanyIds.size > 0) {
        const idList = [...extraCompanyIds].join(",");
        ors.push(`id.in.(${idList})`);
      }
      query = query.or(ors.join(","));
    }
  }
  if (typeFilter === "of_prescripteur") {
    // Filtre composite : la carte « OF / Prescripteurs » regroupe les
    // deux types côté UX.
    query = query.in("type", ["prescripteur", "of"]);
  } else if (typeFilter) {
    query = query.eq("type", typeFilter);
  }
  if (activeFilter === "yes") query = query.eq("is_active", true);
  if (activeFilter === "no") query = query.eq("is_active", false);
  if (hierarchyFilter === "parents") {
    query = query.is("parent_company_id", null);
  } else if (hierarchyFilter === "subsidiaries") {
    query = query.not("parent_company_id", "is", null);
  }

  const { data: companies, error } = await query;

  // Compte des contacts par entreprise + détails si showContacts
  const companyIds = (companies ?? []).map((c) => c.id as string);

  // Société mère par entreprise affichée (pour la colonne dédiée).
  // On résout en une seule requête tous les parent_company_id distincts
  // qui ne sont PAS déjà dans la liste affichée (filtrage par exemple).
  const parentNameById = new Map<string, string>();
  const knownIds = new Set(companyIds);
  for (const c of (companies ?? []) as Company[]) {
    if (c.parent_company_id && knownIds.has(c.parent_company_id)) {
      const parent = (companies as Company[]).find(
        (x) => x.id === c.parent_company_id,
      );
      if (parent) parentNameById.set(parent.id, parent.name);
    }
  }
  const missingParentIds = Array.from(
    new Set(
      ((companies ?? []) as Company[])
        .map((c) => c.parent_company_id)
        .filter(
          (pid): pid is string => Boolean(pid) && !parentNameById.has(pid!),
        ),
    ),
  );
  if (missingParentIds.length > 0) {
    const { data: missingParents } = await supabase
      .from("companies")
      .select("id, name")
      .in("id", missingParentIds);
    for (const p of (missingParents ?? []) as Array<{
      id: string;
      name: string;
    }>) {
      parentNameById.set(p.id, p.name);
    }
  }
  const contactCountByCompany = new Map<string, number>();
  const learnerCountByCompany = new Map<string, number>();
  type ContactRow = {
    id: string;
    company_id: string;
    first_name: string | null;
    last_name: string;
    job_title: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    role: string;
    service: string | null;
    is_primary: boolean;
  };
  type LearnerRow = {
    id: string;
    company_id: string;
    first_name: string | null;
    last_name: string;
    job_title: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    is_active: boolean;
  };
  /**
   * Personne unifiée : un apprenant et/ou un contact d'entreprise.
   * Si la même personne (matching par email ou nom+prénom) figure dans
   * les deux tables, on fusionne les rôles pour éviter les doublons.
   */
  type Person = {
    key: string;
    company_id: string;
    first_name: string | null;
    last_name: string;
    job_title: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    is_contact: boolean;
    is_learner: boolean;
    /** ID du learner si is_learner=true (Gilles 2026-06-04 — lien
     *  rapide vers le portail apprenant). */
    learner_id?: string | null;
    role?: string;
    service?: string | null;
    is_primary?: boolean;
    /** Formations engagées par cet apprenant (info-bulle 📚). */
    formations?: FormationEntry[];
  };
  const peopleByCompany = new Map<string, Person[]>();

  if (companyIds.length > 0) {
    const [{ data: contactsAgg }, { data: learnersAgg }] = await Promise.all([
      supabase
        .from("company_contacts")
        .select(
          "id, company_id, first_name, last_name, job_title, email, phone, mobile, role, service, is_primary",
        )
        .in("company_id", companyIds)
        .order("is_primary", { ascending: false })
        .order("last_name", { ascending: true }),
      supabase
        .from("learners")
        .select(
          "id, company_id, first_name, last_name, job_title, email, phone, mobile, is_active",
        )
        .in("company_id", companyIds)
        .eq("is_active", true)
        .order("last_name", { ascending: true }),
    ]);

    // Fonction de clef pour matcher contact ↔ apprenant
    const personKey = (row: { email: string | null; first_name: string | null; last_name: string }) => {
      const email = row.email?.trim().toLowerCase();
      if (email) return `e:${email}`;
      const fn = (row.first_name ?? "").trim().toLowerCase();
      const ln = row.last_name.trim().toLowerCase();
      return `n:${fn}|${ln}`;
    };

    // Index par entreprise puis par clef de personne
    const indexByCompany = new Map<string, Map<string, Person>>();

    (contactsAgg ?? []).forEach((row) => {
      const c = row as unknown as ContactRow;
      contactCountByCompany.set(
        c.company_id,
        (contactCountByCompany.get(c.company_id) ?? 0) + 1,
      );
      // Toujours indexer : chaque ligne d'entreprise est dépliable
      // individuellement côté client.
      if (!indexByCompany.has(c.company_id))
        indexByCompany.set(c.company_id, new Map());
      const k = personKey(c);
      indexByCompany.get(c.company_id)!.set(k, {
        key: k,
        company_id: c.company_id,
        first_name: c.first_name,
        last_name: c.last_name,
        job_title: c.job_title,
        email: c.email,
        phone: c.phone,
        mobile: c.mobile,
        is_contact: true,
        is_learner: false,
        role: c.role,
        service: c.service,
        is_primary: c.is_primary,
      });
    });

    (learnersAgg ?? []).forEach((row) => {
      const l = row as unknown as LearnerRow;
      learnerCountByCompany.set(
        l.company_id,
        (learnerCountByCompany.get(l.company_id) ?? 0) + 1,
      );
      if (!indexByCompany.has(l.company_id))
        indexByCompany.set(l.company_id, new Map());
      const k = personKey(l);
      const existing = indexByCompany.get(l.company_id)!.get(k);
      if (existing) {
        // Fusion : déjà un contact, on ajoute le rôle apprenant
        existing.is_learner = true;
        existing.learner_id = l.id;
        // On comble les champs vides depuis l'apprenant
        existing.email = existing.email ?? l.email;
        existing.phone = existing.phone ?? l.phone;
        existing.mobile = existing.mobile ?? l.mobile;
        existing.job_title = existing.job_title ?? l.job_title;
      } else {
        indexByCompany.get(l.company_id)!.set(k, {
          key: k,
          company_id: l.company_id,
          first_name: l.first_name,
          last_name: l.last_name,
          job_title: l.job_title,
          email: l.email,
          phone: l.phone,
          mobile: l.mobile,
          is_contact: false,
          is_learner: true,
          learner_id: l.id,
        });
      }
    });

    for (const [cid, idx] of indexByCompany) {
      // Tri : primaires d'abord, puis nom alpha
      const arr = Array.from(idx.values()).sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return a.last_name.localeCompare(b.last_name, "fr");
      });
      peopleByCompany.set(cid, arr);
    }
  }

  // Formations engagées par entreprise ET par apprenant (1 seule requête).
  // Sert au compteur + aux info-bulles 📚 (détail date/durée/formateur,
  // recommandation NPS à chaud). Agrégé via les apprenants.
  const formationCountByCompany = new Map<string, number>();
  const formationsByCompany = new Map<string, FormationEntry[]>();
  const formationsByLearner = new Map<string, FormationEntry[]>();
  if (companyIds.length > 0) {
    // Récupère tous les apprenants de toutes les entreprises affichées
    const { data: allLearners } = await supabase
      .from("learners")
      .select("id, company_id, first_name, last_name")
      .in("company_id", companyIds);
    const learnerMeta = new Map<
      string,
      { companyId: string; name: string }
    >();
    (allLearners ?? []).forEach((l) => {
      learnerMeta.set(l.id as string, {
        companyId: l.company_id as string,
        name: `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim() || "—",
      });
    });
    const allLearnerIds = Array.from(learnerMeta.keys());
    if (allLearnerIds.length > 0) {
      const { data: enrollments } = await supabase
        .from("session_enrollments")
        .select(
          "id, learner_id, session:sessions(id, start_date, end_date, trainer:trainers!trainer_id(first_name, last_name), formation:formations(title, duration_hours)), evaluation_responses(nps_score, evaluation_type)",
        )
        .in("learner_id", allLearnerIds)
        .neq("status", "cancelled");

      type Raw = {
        id: string;
        learner_id: string;
        session: unknown;
        evaluation_responses:
          | Array<{ nps_score: number | null; evaluation_type: string }>
          | null;
      };

      const pick = <T,>(v: unknown): T | null =>
        (Array.isArray(v) ? (v[0] ?? null) : (v ?? null)) as T | null;

      (enrollments ?? []).forEach((row) => {
        const e = row as unknown as Raw;
        const meta = learnerMeta.get(e.learner_id);
        if (!meta) return;
        const s = pick<{
          id: string | null;
          start_date: string | null;
          end_date: string | null;
          trainer: unknown;
          formation: unknown;
        }>(e.session);
        const trainer = pick<{
          first_name: string | null;
          last_name: string | null;
        }>(s?.trainer);
        const formation = pick<{
          title: string | null;
          duration_hours: number | null;
        }>(s?.formation);
        const hot = (e.evaluation_responses ?? []).find(
          (r) => r.evaluation_type === "hot",
        );
        const entry: FormationEntry = {
          enrollmentId: e.id,
          sessionId: s?.id ?? null,
          startDate: s?.start_date ?? null,
          endDate: s?.end_date ?? null,
          durationHours: formation?.duration_hours ?? null,
          title: formation?.title ?? null,
          trainerName: trainer
            ? `${trainer.first_name ?? ""} ${trainer.last_name ?? ""}`.trim() ||
              null
            : null,
          learnerName: meta.name,
          npsScore: hot?.nps_score ?? null,
        };

        if (!formationsByCompany.has(meta.companyId))
          formationsByCompany.set(meta.companyId, []);
        formationsByCompany.get(meta.companyId)!.push(entry);
        if (!formationsByLearner.has(e.learner_id))
          formationsByLearner.set(e.learner_id, []);
        formationsByLearner.get(e.learner_id)!.push(entry);
      });

      // Tri par date de début décroissante (plus récente en haut).
      const byDateDesc = (a: FormationEntry, b: FormationEntry) =>
        (b.startDate ?? "").localeCompare(a.startDate ?? "");
      for (const list of formationsByCompany.values()) list.sort(byDateDesc);
      for (const list of formationsByLearner.values()) list.sort(byDateDesc);

      // Le compteur entreprise = nombre de FORMATIONS distinctes (sessions),
      // pas le nombre d'inscriptions (une formation peut avoir N participants).
      for (const [cid, list] of formationsByCompany) {
        const distinctSessions = new Set(
          list.map((x) => x.sessionId ?? x.enrollmentId),
        );
        formationCountByCompany.set(cid, distinctSessions.size);
      }
    }
  }

  // Rattache la liste des formations à chaque apprenant (info-bulle 📚).
  for (const people of peopleByCompany.values()) {
    for (const p of people) {
      if (p.is_learner && p.learner_id) {
        p.formations = formationsByLearner.get(p.learner_id) ?? [];
      }
    }
  }

  // Liste des company_ids ayant un portail partenaire active (token genere).
  // Utile pour afficher une icone differente sur chaque ligne d'entreprise.
  const partnerPortalActiveSet = new Set<string>();
  if (companyIds.length > 0) {
    const { data: tokens } = await supabase
      .from("partner_portal_tokens")
      .select("company_id")
      .in("company_id", companyIds);
    (tokens ?? []).forEach((t) => {
      partnerPortalActiveSet.add(t.company_id as string);
    });
  }

  const stats = [
    {
      label: "Total",
      value: totalCount.count ?? 0,
      accent:
        "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800",
      icon: Building2,
      iconClass: "text-zinc-600 dark:text-zinc-400",
      href: "/entreprises",
      active: typeFilter === "",
    },
    {
      label: "Prospects",
      value: prospectCount.count ?? 0,
      accent:
        "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
      icon: Sparkles,
      iconClass: "text-amber-600 dark:text-amber-400",
      href: "/entreprises?type=prospect",
      active: typeFilter === "prospect",
    },
    {
      label: "Clients",
      value: clientCount.count ?? 0,
      accent:
        "bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-900",
      icon: Handshake,
      iconClass: "text-cyan-600 dark:text-cyan-400",
      href: "/entreprises?type=client",
      active: typeFilter === "client",
    },
    {
      label: "OF / Prescripteurs",
      value: prescripteurCount.count ?? 0,
      accent:
        "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
      icon: Share2,
      iconClass: "text-blue-600 dark:text-blue-400",
      href: "/entreprises?type=of_prescripteur",
      active:
        typeFilter === "of_prescripteur" ||
        typeFilter === "prescripteur" ||
        typeFilter === "of",
    },
    {
      label: "Financeurs",
      value: financeurCount.count ?? 0,
      accent:
        "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900",
      icon: Banknote,
      iconClass: "text-violet-600 dark:text-violet-400",
      href: "/entreprises?type=financeur",
      active: typeFilter === "financeur",
    },
  ];

  return (
    <>
      <PageHeader
        title="Entreprises"
        description="Vos clients, prospects, OF / prescripteurs, financeurs et OPCO."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Entreprises" },
        ]}
        actions={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/entreprises/import-email" />}
              title="Crée entreprise + contact à partir d'un email reçu (Gmail, Outlook…)"
            >
              <Mail className="h-4 w-4" />
              Importer depuis un email
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="/entreprises/new" />}
            >
              <Plus className="h-4 w-4" />
              Nouvelle entreprise
            </Button>
          </>
        }
      />

      <div className="p-8 space-y-6">
        {/* Stat cards cliquables */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className={cn(
                "rounded-xl border p-4 transition-all hover:shadow-sm",
                s.accent,
                s.active
                  ? "ring-2 ring-zinc-900 dark:ring-white shadow-sm"
                  : "opacity-90 hover:opacity-100",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    {s.label}
                  </p>
                  <p className="text-2xl font-bold mt-1 tabular-nums">
                    {s.value}
                  </p>
                </div>
                <s.icon className={cn("h-5 w-5 shrink-0", s.iconClass)} />
              </div>
            </Link>
          ))}
        </div>

        {/* Recherche / filtres — recherche large en haut, sélecteurs en
            ligne en dessous, bouton Filtrer aligné à droite. */}
        <form
          method="get"
          className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 space-y-3"
        >
          <input type="hidden" name="type" value={typeFilter} />

          {/* Ligne 1 : recherche pleine largeur, plus prominente */}
          <div className="space-y-1.5">
            <Label
              htmlFor="q"
              className="text-[10px] uppercase tracking-wider font-bold text-zinc-500"
            >
              Rechercher
            </Label>
            <div className="relative">
              <svg
                aria-hidden
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <Input
                id="q"
                name="q"
                type="search"
                placeholder="Nom, SIRET, ville, email, contact, apprenant…"
                defaultValue={q}
                className="pl-9 h-10 text-sm"
              />
            </div>
          </div>

          {/* Ligne 2 : sélecteurs compacts + boutons */}
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end">
            <div className="space-y-1.5">
              <Label
                htmlFor="active"
                className="text-[10px] uppercase tracking-wider font-bold text-zinc-500"
              >
                État
              </Label>
              <select
                id="active"
                name="active"
                defaultValue={activeFilter}
                className="flex h-9 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
              >
                <option value="">Toutes</option>
                <option value="yes">Actives uniquement</option>
                <option value="no">Inactives uniquement</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="hierarchy"
                className="text-[10px] uppercase tracking-wider font-bold text-zinc-500"
              >
                Hiérarchie
              </Label>
              <select
                id="hierarchy"
                name="hierarchy"
                defaultValue={hierarchyFilter}
                className="flex h-9 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
              >
                <option value="">Toutes</option>
                <option value="parents">Sociétés mères seulement</option>
                <option value="subsidiaries">Filiales seulement</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Appliquer les filtres</Button>
              {isFiltered && (
                <Button
                  type="button"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/entreprises" />}
                >
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>
        </form>

        {/* Résultats */}
        {error ? (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            Erreur lors du chargement : {error.message}
          </div>
        ) : !companies || companies.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
            {isFiltered ? (
              <>
                <p className="text-sm font-medium mb-1">Aucun résultat</p>
                <p className="text-xs text-zinc-500 mb-4">
                  Aucune entreprise ne correspond à votre recherche.
                </p>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/entreprises" />}
                >
                  Réinitialiser les filtres
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium mb-1">Aucune entreprise</p>
                <p className="text-xs text-zinc-500 mb-4">
                  Ajoutez votre première entreprise cliente ou prospect.
                </p>
                <Button
                  nativeButton={false}
                  render={<Link href="/entreprises/new" />}
                >
                  <Plus className="h-4 w-4" />
                  Nouvelle entreprise
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Bascule vue : Entreprises / Mère-Filiale / Tous les contacts.
                Style "tabs" avec ligne sous-jacente pour rester cohérent
                avec la nav Paramètres. Compteurs intégrés à chaque onglet. */}
            {(() => {
              const baseQs: Record<string, string> = {};
              if (q) baseQs.q = q;
              if (typeFilter) baseQs.type = typeFilter;
              if (activeFilter) baseQs.active = activeFilter;
              if (hierarchyFilter) baseQs.hierarchy = hierarchyFilter;
              const urlContacts = new URLSearchParams({
                ...baseQs,
                view: "contacts",
              }).toString();
              const urlTree = new URLSearchParams({
                ...baseQs,
                view: "tree",
              }).toString();
              const urlTable = new URLSearchParams(baseQs).toString();

              // Compteur de personnes (vue "Tous les contacts").
              let peopleCount = 0;
              for (const list of peopleByCompany.values()) {
                peopleCount += list.length;
              }

              const TABS = [
                {
                  href: `/entreprises${urlTable ? `?${urlTable}` : ""}`,
                  label: "Entreprises",
                  icon: Building2,
                  active: view === "table",
                  count: companies.length,
                  activeColor:
                    "border-cyan-600 text-cyan-700 dark:text-cyan-400 bg-cyan-50/40 dark:bg-cyan-950/20",
                },
                {
                  href: `/entreprises?${urlTree}`,
                  label: "Mère / Filiale",
                  icon: Network,
                  active: view === "tree",
                  count: null as number | null,
                  activeColor:
                    "border-violet-600 text-violet-700 dark:text-violet-400 bg-violet-50/40 dark:bg-violet-950/20",
                  title: "Vue arborescente : sociétés mères et filiales",
                },
                {
                  href: `/entreprises?${urlContacts}`,
                  label: "Tous les contacts",
                  icon: UsersRound,
                  active: view === "contacts",
                  count: peopleCount,
                  activeColor:
                    "border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20",
                },
              ];

              return (
                <nav
                  aria-label="Vues entreprises"
                  className="border-b border-zinc-200 dark:border-zinc-800 flex items-end justify-between flex-wrap gap-2"
                >
                  <ul className="flex flex-wrap gap-1">
                    {TABS.map((t) => {
                      const Icon = t.icon;
                      return (
                        <li key={t.label}>
                          <Link
                            href={t.href}
                            title={t.title}
                            className={cn(
                              "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors",
                              t.active
                                ? t.activeColor
                                : "border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            {t.label}
                            {t.count !== null && (
                              <span
                                className={cn(
                                  "ml-1 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums",
                                  t.active
                                    ? "bg-white dark:bg-zinc-900 ring-1 ring-current"
                                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
                                )}
                              >
                                {t.count}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  {isFiltered && view !== "contacts" && (
                    <span className="text-[11px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-400 px-2 pb-2">
                      Filtres actifs
                    </span>
                  )}
                </nav>
              );
            })()}

            {/* Barre de filtre + compteurs pour la vue Tous les contacts */}
            {view === "contacts" &&
              (() => {
                let apprenantsCount = 0;
                let contactsEntCount = 0;
                for (const arr of peopleByCompany.values()) {
                  for (const p of arr) {
                    if (p.is_learner) apprenantsCount++;
                    if (p.is_contact) contactsEntCount++;
                  }
                }
                const baseQs: Record<string, string> = { view: "contacts" };
                if (q) baseQs.q = q;
                if (typeFilter) baseQs.type = typeFilter;
                if (activeFilter) baseQs.active = activeFilter;
                const urlAll = new URLSearchParams(baseQs).toString();
                const urlApp = new URLSearchParams({
                  ...baseQs,
                  peopleFilter: "apprenants",
                }).toString();
                const urlContacts = new URLSearchParams({
                  ...baseQs,
                  peopleFilter: "contacts",
                }).toString();
                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Filtrer :
                    </span>
                    <Link
                      href={`/entreprises?${urlAll}`}
                      className={cn(
                        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors",
                        peopleFilter === "all"
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-700 border-slate-300 hover:border-slate-500",
                      )}
                    >
                      Tous
                      <span
                        className={cn(
                          "inline-flex items-center justify-center px-1.5 rounded-full text-[10px] font-bold",
                          peopleFilter === "all"
                            ? "bg-white/20 text-white"
                            : "bg-slate-100 text-slate-700",
                        )}
                      >
                        {apprenantsCount + contactsEntCount}
                      </span>
                    </Link>
                    <Link
                      href={`/entreprises?${urlApp}`}
                      className={cn(
                        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors",
                        peopleFilter === "apprenants"
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50",
                      )}
                    >
                      Apprenants
                      <span
                        className={cn(
                          "inline-flex items-center justify-center px-1.5 rounded-full text-[10px] font-bold",
                          peopleFilter === "apprenants"
                            ? "bg-white/20 text-white"
                            : "bg-emerald-100 text-emerald-800",
                        )}
                      >
                        {apprenantsCount}
                      </span>
                    </Link>
                    <Link
                      href={`/entreprises?${urlContacts}`}
                      className={cn(
                        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors",
                        peopleFilter === "contacts"
                          ? "bg-cyan-600 text-white border-cyan-600"
                          : "bg-white text-cyan-700 border-cyan-300 hover:bg-cyan-50",
                      )}
                    >
                      Contacts entreprise
                      <span
                        className={cn(
                          "inline-flex items-center justify-center px-1.5 rounded-full text-[10px] font-bold",
                          peopleFilter === "contacts"
                            ? "bg-white/20 text-white"
                            : "bg-cyan-100 text-cyan-800",
                        )}
                      >
                        {contactsEntCount}
                      </span>
                    </Link>
                    <p className="ml-auto text-[11px] text-slate-400 italic">
                      Note : un &laquo; double rôle &raquo; compte dans les
                      deux catégories.
                    </p>
                  </div>
                );
              })()}
            {view === "tree" ? (
              (() => {
                // Vue arbre : on regroupe les entreprises par société mère.
                //   - Racines = entreprises sans parent (parent_company_id null)
                //   - Sous chaque racine : ses filiales directes
                //   - Les entreprises dont le parent n'est PAS dans la liste
                //     filtrée sont affichées comme racines orphelines.
                const list = (companies as Company[]) ?? [];
                const idsInList = new Set(list.map((c) => c.id));
                const childrenByParent = new Map<string, Company[]>();
                const roots: Company[] = [];
                for (const c of list) {
                  if (
                    c.parent_company_id &&
                    idsInList.has(c.parent_company_id)
                  ) {
                    const arr =
                      childrenByParent.get(c.parent_company_id) ?? [];
                    arr.push(c);
                    childrenByParent.set(c.parent_company_id, arr);
                  } else {
                    roots.push(c);
                  }
                }
                // Tri alpha
                roots.sort((a, b) => a.name.localeCompare(b.name, "fr"));
                for (const arr of childrenByParent.values()) {
                  arr.sort((a, b) => a.name.localeCompare(b.name, "fr"));
                }
                if (roots.length === 0) {
                  return (
                    <div className="rounded-xl bg-white border border-zinc-200 p-8 text-center text-sm text-zinc-500">
                      Aucune racine trouvée. Les filiales orphelines sont
                      remontées en racine quand leur parent n&apos;est pas
                      dans le filtre courant.
                    </div>
                  );
                }
                return (
                  <div className="space-y-3">
                    {roots.map((root) => {
                      const children = childrenByParent.get(root.id) ?? [];
                      return (
                        <div
                          key={root.id}
                          className="rounded-xl bg-white dark:bg-zinc-900 border border-violet-200 dark:border-violet-900 overflow-hidden"
                        >
                          {/* Société mère (racine) */}
                          <Link
                            href={`/entreprises/${root.id}`}
                            className="flex items-center gap-3 px-4 py-3 bg-violet-50/60 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-950/50 border-b border-violet-200 dark:border-violet-900 transition-colors"
                          >
                            <div className="h-9 w-9 shrink-0 rounded-lg bg-violet-200 dark:bg-violet-900 flex items-center justify-center">
                              <Building2 className="h-4 w-4 text-violet-700 dark:text-violet-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-violet-900 dark:text-violet-200">
                                {root.name}
                              </p>
                              <p className="text-[11px] text-violet-700 dark:text-violet-400">
                                {[root.postal_code, root.city]
                                  .filter(Boolean)
                                  .join(" ") || "—"}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "inline-block px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap shrink-0",
                                COMPANY_TYPE_BADGE_CLASSES[root.type],
                              )}
                            >
                              {COMPANY_TYPE_LABELS[root.type]}
                            </span>
                            {children.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 whitespace-nowrap shrink-0">
                                <GitBranch className="h-3 w-3" />
                                {children.length} filiale
                                {children.length > 1 ? "s" : ""}
                              </span>
                            )}
                          </Link>
                          {/* Filiales (indentées) */}
                          {children.length > 0 && (
                            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                              {children.map((child) => (
                                <li key={child.id}>
                                  <Link
                                    href={`/entreprises/${child.id}`}
                                    className="flex items-center gap-3 px-4 py-2.5 pl-12 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                                  >
                                    <Building2 className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                                      {child.name}
                                    </span>
                                    <span className="text-[11px] text-slate-500">
                                      {[child.postal_code, child.city]
                                        .filter(Boolean)
                                        .join(" ")}
                                    </span>
                                    <span
                                      className={cn(
                                        "inline-block px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ml-auto",
                                        COMPANY_TYPE_BADGE_CLASSES[child.type],
                                      )}
                                    >
                                      {COMPANY_TYPE_LABELS[child.type]}
                                    </span>
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            ) : view === "contacts" ? (
              <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                {(() => {
                  // Aplati toutes les personnes en une seule liste, avec
                  // le nom de l'entreprise et le tri par nom de famille.
                  const flatPeople: Array<{
                    company: Company;
                    person: NonNullable<
                      ReturnType<typeof peopleByCompany.get>
                    >[number];
                  }> = [];
                  for (const c of companies as Company[]) {
                    const arr = peopleByCompany.get(c.id) ?? [];
                    for (const p of arr) {
                      // Application du filtre Apprenants / Contacts / Tous
                      if (
                        peopleFilter === "apprenants" &&
                        !p.is_learner
                      ) {
                        continue;
                      }
                      if (
                        peopleFilter === "contacts" &&
                        !p.is_contact
                      ) {
                        continue;
                      }
                      flatPeople.push({ company: c, person: p });
                    }
                  }
                  // Tri alphabétique : NOM puis PRÉNOM (insensible
                  // à la casse, accents et locale FR).
                  flatPeople.sort((a, b) => {
                    const ln = a.person.last_name.localeCompare(
                      b.person.last_name,
                      "fr",
                      { sensitivity: "base" },
                    );
                    if (ln !== 0) return ln;
                    const af = a.person.first_name ?? "";
                    const bf = b.person.first_name ?? "";
                    return af.localeCompare(bf, "fr", {
                      sensitivity: "base",
                    });
                  });

                  if (flatPeople.length === 0) {
                    return (
                      <div className="p-8 text-center text-sm text-zinc-500">
                        Aucun contact ni apprenant trouvé
                        {isFiltered
                          ? " avec ces critères de recherche."
                          : "."}
                      </div>
                    );
                  }

                  return (
                    <ul className="divide-y divide-zinc-200">
                      {flatPeople.map(({ company, person: p }) => {
                        const isBoth = p.is_contact && p.is_learner;
                        const avatarClass = isBoth
                          ? "bg-gradient-to-br from-indigo-500 to-violet-600"
                          : p.is_learner
                            ? "bg-gradient-to-br from-emerald-500 to-teal-600"
                            : "bg-gradient-to-br from-cyan-500 to-blue-600";
                        // Teinte de fond ligne complète selon le rôle :
                        // - Apprenant seul → emerald (vert)
                        // - Double rôle → indigo
                        // - Contact entreprise seul → blanc (neutre)
                        const rowClass = isBoth
                          ? "bg-indigo-50/60 hover:bg-indigo-50 border-l-4 border-l-indigo-400"
                          : p.is_learner
                            ? "bg-emerald-50/60 hover:bg-emerald-50 border-l-4 border-l-emerald-500"
                            : "hover:bg-slate-50 border-l-4 border-l-transparent";
                        return (
                          <li
                            key={`${company.id}-${p.key}`}
                            className={cn(
                              "flex items-start gap-3 px-4 py-3 transition-colors",
                              rowClass,
                            )}
                          >
                            <div
                              className={cn(
                                "h-10 w-10 shrink-0 rounded-full text-white text-sm font-bold flex items-center justify-center",
                                avatarClass,
                              )}
                            >
                              {`${p.first_name?.[0] ?? ""}${p.last_name?.[0] ?? ""}`.toUpperCase() ||
                                "?"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-base inline-flex items-center gap-2 flex-wrap">
                                {`${p.first_name ?? ""} ${p.last_name}`.trim()}
                                {p.is_primary && (
                                  <span className="text-amber-500 text-base leading-none">
                                    ★
                                  </span>
                                )}
                                {p.is_learner && (
                                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold border bg-emerald-100 text-emerald-800 border-emerald-300">
                                    Apprenant
                                  </span>
                                )}
                                {p.is_contact && p.role && (
                                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold border bg-cyan-100 text-cyan-800 border-cyan-300">
                                    {p.role}
                                  </span>
                                )}
                                {isBoth && (
                                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-300">
                                    Double rôle
                                  </span>
                                )}
                              </p>
                              <p className="text-slate-600 text-sm flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                <Link
                                  href={`/entreprises/${company.id}`}
                                  className="inline-flex items-center gap-1 text-cyan-700 hover:underline font-semibold"
                                >
                                  <Building2 className="h-3 w-3" />
                                  {company.name}
                                </Link>
                                {p.job_title && (
                                  <span className="text-slate-500">
                                    · {p.job_title}
                                  </span>
                                )}
                                {p.email && (
                                  <a
                                    href={`mailto:${p.email}`}
                                    className="text-cyan-700 hover:underline"
                                  >
                                    {p.email}
                                  </a>
                                )}
                                {p.mobile ? (
                                  <a
                                    href={`tel:${p.mobile}`}
                                    className="font-bold tabular-nums hover:text-cyan-700"
                                  >
                                    {p.mobile}
                                  </a>
                                ) : p.phone ? (
                                  <a
                                    href={`tel:${p.phone}`}
                                    className="font-bold tabular-nums hover:text-cyan-700"
                                  >
                                    {p.phone}
                                  </a>
                                ) : null}
                              </p>
                            </div>
                            {/* Compteur formations + boutons portail —
                                visibles uniquement sur les apprenants. */}
                            {p.is_learner && p.learner_id && (
                              <div className="flex items-center gap-2 shrink-0">
                                {p.formations && p.formations.length > 0 && (
                                  <FormationsTooltip
                                    variant="learner"
                                    count={p.formations.length}
                                    entries={p.formations}
                                    headerLabel={`${p.first_name ?? ""} ${p.last_name}`.trim()}
                                  />
                                )}
                                <LearnerPortalButtons
                                  learnerId={p.learner_id}
                                  hasEmail={Boolean(p.email)}
                                />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}
              </div>
            ) : (
            <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="px-4 py-3">Raison sociale</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Société mère</th>
                    <th className="px-4 py-3">SIRET / Pappers</th>
                    <th className="px-4 py-3 text-center w-16">GPS</th>
                    <th className="px-4 py-3 text-center">Contacts</th>
                    <th className="px-4 py-3 text-center">Formations</th>
                    <th className="px-4 py-3">État</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {(companies as Company[]).map((c) => {
                    const people = peopleByCompany.get(c.id) ?? [];
                    const parentName = c.parent_company_id
                      ? (parentNameById.get(c.parent_company_id) ?? null)
                      : null;
                    return (
                      <CompanyRow
                        key={c.id}
                        company={c}
                        people={people}
                        contactCount={contactCountByCompany.get(c.id) ?? 0}
                        learnerCount={learnerCountByCompany.get(c.id) ?? 0}
                        formationCount={
                          formationCountByCompany.get(c.id) ?? 0
                        }
                        companyFormations={
                          formationsByCompany.get(c.id) ?? []
                        }
                        parentName={parentName}
                        parentId={c.parent_company_id ?? null}
                        partnerPortalActive={
                          c.type === "of" || c.type === "prescripteur"
                            ? partnerPortalActiveSet.has(c.id)
                            : null
                        }
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

