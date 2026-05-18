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
import { InviteBlock } from "./_invite-block";

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

  // Inscriptions soumises par ce partenaire (via portail OU saisies en admin
  // avec referrer_company_id = ce partenaire).
  const { data: requests } = await supabase
    .from("inscription_requests")
    .select(
      "id, target_session_id, prospect_first_name, prospect_last_name, learner_id, received_at",
    )
    .eq("referrer_company_id", ctx.company.id);

  const total = requests?.length ?? 0;

  // Pour KPI "en cours / terminé", on regarde les session_enrollments liés.
  // On considère qu'une inscription qui a une session passée est "terminée".
  let inProgress = 0;
  let finished = 0;
  if (requests && requests.length > 0) {
    const sessionIds = Array.from(
      new Set(
        requests.map((r) => r.target_session_id).filter((x): x is string => !!x),
      ),
    );
    if (sessionIds.length > 0) {
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, end_date")
        .in("id", sessionIds);
      const today = new Date().toISOString().slice(0, 10);
      const finishedSet = new Set(
        (sessions ?? [])
          .filter((s) => s.end_date && s.end_date < today)
          .map((s) => s.id as string),
      );
      for (const r of requests) {
        if (r.target_session_id && finishedSet.has(r.target_session_id)) {
          finished += 1;
        } else {
          inProgress += 1;
        }
      }
    } else {
      inProgress = total;
    }
  }

  // Nombre de sessions visibles dans le catalogue du partenaire (a venir).
  // Pour les OF : uniquement INTER distanciel.
  // Pour les prescripteurs : INTER distanciel + INTRA propres (selon flags),
  // ce qui reflete exactement ce qui est affiche dans /catalogue.
  // NOTE: le filtre sur formations.modality cote Supabase a un bug connu
  // sur les relations aliasees → on filtre en JS comme dans page.tsx du
  // catalogue.
  const today = new Date().toISOString().slice(0, 10);
  const isOfPartner = ctx.company.type === "of";
  const showInterCatalog =
    !isOfPartner ? ctx.company.show_inter_catalog : true;
  const showOwnIntraCatalog = !isOfPartner && ctx.company.show_own_intra;

  const catalogSessionIds = new Set<string>();
  if (showInterCatalog) {
    const { data: interRows } = await supabase
      .from("sessions")
      .select("id, formations!inner(modality)")
      .eq("organization_id", ctx.company.organization_id)
      .eq("is_inter", true)
      .gte("start_date", today)
      .in("status", ["confirmed", "draft", "planned"]);
    (interRows ?? []).forEach((r) => {
      const f = Array.isArray(r.formations) ? r.formations[0] : r.formations;
      if (f && (f as { modality: string }).modality === "distanciel") {
        catalogSessionIds.add(r.id as string);
      }
    });
  }
  if (showOwnIntraCatalog) {
    const { data: intraRows } = await supabase
      .from("sessions")
      .select("id")
      .eq("organization_id", ctx.company.organization_id)
      .eq("prescriber_company_id", ctx.company.id)
      .gte("start_date", today)
      .in("status", ["confirmed", "draft", "planned"]);
    (intraRows ?? []).forEach((r) => catalogSessionIds.add(r.id as string));
  }
  const catalogCount = catalogSessionIds.size;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-cyan-50 to-indigo-50 border border-cyan-200 p-6 flex items-start gap-5 flex-wrap">
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
        <h1 className="text-2xl font-bold text-zinc-900">
          Bienvenue, {ctx.company.name}
        </h1>
        <p className="text-sm text-zinc-600 mt-1 max-w-2xl">
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

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi
          icon={BookOpen}
          label="Sessions au catalogue"
          value={catalogCount ?? 0}
          color="cyan"
        />
        <Kpi
          icon={Users}
          label="Apprenants inscrits"
          value={total}
          color="indigo"
        />
        <Kpi
          icon={Clock}
          label="En cours / à venir"
          value={inProgress}
          color="amber"
        />
        <Kpi
          icon={CheckCircle2}
          label="Formations terminées"
          value={finished}
          color="emerald"
        />
      </section>

      {/* Bloc de diffusion publique : génère un lien de pré-inscription
          que le partenaire peut envoyer à ses entreprises. */}
      <InviteBlock
        token={token}
        partnerName={ctx.company.name}
        organizationName={ctx.organization.name}
        showOwnSessionsFilter={Boolean(showOwnIntraCatalog)}
      />

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
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "cyan" | "indigo" | "amber" | "emerald";
}) {
  const colorClasses = {
    cyan: "bg-cyan-50 border-cyan-200 text-cyan-700",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
  }[color];
  return (
    <div className={`rounded-xl border p-4 ${colorClasses}`}>
      <Icon className="h-5 w-5 mb-2" />
      <div className="text-2xl font-bold text-zinc-900 tabular-nums">
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wider font-bold">
        {label}
      </div>
    </div>
  );
}
