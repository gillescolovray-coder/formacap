import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Users,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "./_resolve";
import { loadPartnerCatalogueSessions } from "@/lib/portal/partner-catalogue";

type Params = { token: string };

export default async function PartnerDashboardPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const ctx = await resolvePartnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // ── KPI d'activité réelle du partenaire (Gilles 2026-06-15) ──────────────
  // On compte les apprenants présents :
  //   (a) sur les sessions où ce partenaire est DONNEUR D'ORDRE (sous-
  //       traitance) ou PRESCRIPTEUR référent — toutes leurs inscriptions lui
  //       « appartiennent » (session_enrollments non annulés) ;
  //   (b) + les inscriptions qu'il a faites VIA le portail (referrer_company_id)
  //       sur n'importe quelle session (ex. une session distanciel CAP).
  // Déduplication par couple (session, personne) pour ne pas compter 2× un
  // apprenant présent dans les deux sources. Le total se répartit ensuite en
  // « en cours / à venir » (session non terminée) et « terminées ».

  // Sessions « du partenaire » (donneur d'ordre OU prescripteur).
  const { data: ownSessions } = await supabase
    .from("sessions")
    .select("id, end_date")
    .or(
      `subcontracting_company_id.eq.${ctx.company.id},prescriber_company_id.eq.${ctx.company.id}`,
    )
    .neq("status", "cancelled");
  const sessionEnd = new Map<string, string | null>();
  for (const s of (ownSessions ?? []) as Array<{
    id: string;
    end_date: string | null;
  }>) {
    sessionEnd.set(s.id, s.end_date ?? null);
  }
  const ownSessionIds = Array.from(sessionEnd.keys());

  // Inscriptions portail (referrer = ce partenaire), toutes sessions cibles.
  const { data: requests } = await supabase
    .from("inscription_requests")
    .select(
      "id, target_session_id, prospect_first_name, prospect_last_name, prospect_email, learner_id",
    )
    .eq("referrer_company_id", ctx.company.id);

  // end_date des sessions cibles des inscriptions portail non déjà connues.
  const extraSessionIds = Array.from(
    new Set(
      (requests ?? [])
        .map((r) => r.target_session_id)
        .filter((x): x is string => !!x && !sessionEnd.has(x)),
    ),
  );
  if (extraSessionIds.length > 0) {
    const { data: extra } = await supabase
      .from("sessions")
      .select("id, end_date")
      .in("id", extraSessionIds);
    for (const s of (extra ?? []) as Array<{
      id: string;
      end_date: string | null;
    }>) {
      sessionEnd.set(s.id, s.end_date ?? null);
    }
  }

  // « Apprenants inscrits » = nombre de personnes DISTINCTES.
  // « En cours / à venir » et « Formations terminées » = nombre de
  // SESSIONS distinctes (formations) où ce partenaire a des apprenants,
  // réparties selon la date de fin (Gilles 2026-06-15 : une session de 14
  // apprenants = 1 formation terminée, pas 14).
  const distinctPersons = new Set<string>();
  const relevantSessions = new Set<string>();
  const addPair = (sessionId: string | null, personKey: string) => {
    distinctPersons.add(personKey);
    if (sessionId) relevantSessions.add(sessionId);
  };

  // (a) Inscrits (enrollments) sur les sessions propres du partenaire.
  if (ownSessionIds.length > 0) {
    const { data: enr } = await supabase
      .from("session_enrollments")
      .select("id, session_id, learner_id")
      .in("session_id", ownSessionIds)
      .neq("status", "cancelled");
    for (const e of (enr ?? []) as Array<{
      id: string;
      session_id: string;
      learner_id: string | null;
    }>) {
      addPair(e.session_id, `l:${e.learner_id ?? e.id}`);
    }
  }
  // (b) Inscriptions faites via le portail (toutes sessions).
  for (const r of (requests ?? []) as Array<{
    id: string;
    target_session_id: string | null;
    learner_id: string | null;
    prospect_email: string | null;
    prospect_first_name: string | null;
    prospect_last_name: string | null;
  }>) {
    const personKey = r.learner_id
      ? `l:${r.learner_id}`
      : `p:${(r.prospect_email ?? "").trim().toLowerCase() || `${r.prospect_first_name ?? ""}|${r.prospect_last_name ?? ""}`}`;
    addPair(r.target_session_id, personKey);
  }

  // Total personnes + répartition des SESSIONS (formations) terminées / à venir.
  const total = distinctPersons.size;
  let inProgress = 0;
  let finished = 0;
  for (const sid of relevantSessions) {
    const end = sessionEnd.get(sid);
    if (end && end < today) finished += 1;
    else inProgress += 1;
  }

  // Nombre de sessions visibles dans le catalogue du partenaire. On réutilise
  // EXACTEMENT la même source que la page /catalogue (helper partagé) pour que
  // le KPI du tableau de bord et le compteur du catalogue soient identiques
  // (Gilles 2026-06-15). Inclut donc les sessions de sous-traitance du
  // partenaire et exclut celles confiées à un autre OF.
  const isOfPartner = ctx.company.type === "of";
  const showOwnIntraCatalog = !isOfPartner && ctx.company.show_own_intra;

  const catalogCount = (
    await loadPartnerCatalogueSessions(
      supabase,
      {
        organizationId: ctx.company.organization_id,
        companyId: ctx.company.id,
        companyType: ctx.company.type,
        showInterCatalog: ctx.company.show_inter_catalog,
        showOwnIntra: ctx.company.show_own_intra,
      },
      today,
    )
  ).length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-cyan-50 to-indigo-50 border border-cyan-200 p-4 sm:p-6 flex items-start gap-3 sm:gap-5 flex-wrap">
        {/* Logo du partenaire (à gauche du bandeau de bienvenue) si
            uploadé dans sa fiche entreprise. Renforce l'image de marque
            du partenaire dans son propre espace. */}
        {ctx.company.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ctx.company.logo_url}
            alt={ctx.company.name}
            className="h-20 w-auto max-w-[180px] object-contain bg-white rounded-lg shadow-sm p-2 border border-cyan-100"
          />
        )}
        <div className="flex-1 min-w-0">
        <h1 className="text-lg sm:text-2xl font-bold text-zinc-900 leading-tight">
          Bienvenue, {ctx.company.name}
        </h1>
        <p className="text-xs sm:text-sm text-zinc-600 mt-1 max-w-2xl">
          {isOfPartner ? (
            <>
              Cet espace vous permet de consulter le catalogue distanciel INTER
              de {ctx.organization.name} et d&apos;inscrire vos apprenants en
              autonomie, aux tarifs négociés avec votre structure.
            </>
          ) : (
            <>
              Cet espace vous permet de consulter le catalogue de{" "}
              {ctx.organization.name} (sessions INTER distanciel
              {showOwnIntraCatalog ? " + vos sessions INTRA dédiées" : ""}) et
              d&apos;inscrire vos apprenants en autonomie, aux tarifs négociés
              avec votre structure.
            </>
          )}
        </p>
        </div>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Kpi
          icon={BookOpen}
          label="Sessions au catalogue"
          value={catalogCount ?? 0}
          color="cyan"
          href={`/partenaire/${token}/catalogue`}
        />
        <Kpi
          icon={Clock}
          label="Formations en cours / à venir"
          value={inProgress}
          color="amber"
          href={`/partenaire/${token}/inscriptions`}
        />
        <Kpi
          icon={Users}
          label="Participants"
          value={total}
          color="indigo"
          href={`/partenaire/${token}/participants`}
          title="Apprenants ayant suivi vos sessions (sous-traitance, prescription ou inscrits via le portail)"
        />
        <Kpi
          icon={CheckCircle2}
          label="Formations terminées"
          value={finished}
          color="emerald"
          href={`/partenaire/${token}/archives`}
        />
      </section>

      {/* Le bloc « Inviter mes entreprises » est désormais sur l'onglet
          Catalogue (plus pertinent quand on choisit ce qu'on diffuse). */}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href={`/partenaire/${token}/catalogue`}
          className="group rounded-2xl bg-white border border-zinc-200 p-6 hover:border-cyan-400 hover:shadow-md transition-all"
        >
          <BookOpen className="h-8 w-8 text-cyan-600 mb-3" />
          <h2 className="text-lg font-bold text-zinc-900 group-hover:text-cyan-700">
            Parcourir le catalogue
          </h2>
          <p className="text-sm text-zinc-600 mt-1">
            {isOfPartner
              ? "Sessions distanciel INTER à venir, avec vos tarifs négociés."
              : showOwnIntraCatalog
                ? "Sessions INTER distanciel + vos sessions INTRA dédiées, avec vos tarifs négociés."
                : "Sessions INTER distanciel à venir, avec vos tarifs négociés."}
          </p>
        </Link>

        <Link
          href={`/partenaire/${token}/inscriptions`}
          className="group rounded-2xl bg-white border border-zinc-200 p-6 hover:border-indigo-400 hover:shadow-md transition-all"
        >
          <Calendar className="h-8 w-8 text-indigo-600 mb-3" />
          <h2 className="text-lg font-bold text-zinc-900 group-hover:text-indigo-700">
            Mes inscriptions
          </h2>
          <p className="text-sm text-zinc-600 mt-1">
            Historique de vos apprenants inscrits via ce portail.
          </p>
        </Link>
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  color,
  href,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "cyan" | "indigo" | "amber" | "emerald";
  /** Si fourni, la carte devient cliquable vers cette destination. */
  href?: string;
  /** Infobulle personnalisée (sinon « Voir : <label> »). */
  title?: string;
}) {
  const colorClasses = {
    cyan: "bg-cyan-50 border-cyan-200 text-cyan-700",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
  }[color];
  const inner = (
    <>
      <Icon className="h-4 w-4 sm:h-5 sm:w-5 mb-1 sm:mb-2" />
      <div className="text-xl sm:text-2xl font-bold text-zinc-900 tabular-nums">
        {value}
      </div>
      <div className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold leading-tight">
        {label}
      </div>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={`rounded-xl border p-3 sm:p-4 block transition-all hover:shadow-md hover:brightness-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-cyan-300 ${colorClasses}`}
        title={title ?? `Voir : ${label}`}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${colorClasses}`}>{inner}</div>
  );
}
