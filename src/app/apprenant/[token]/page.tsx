import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLearnerContext } from "./_resolve";

type Params = { token: string };

export default async function LearnerDashboardPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const ctx = await resolveLearnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Toutes les sessions de cet apprenant (via session_enrollments)
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, status, session:sessions(id, start_date, end_date, modality, formation:formations(title))",
    )
    .eq("learner_id", ctx.learner.id)
    .neq("status", "cancelled");

  type Row = {
    id: string;
    status: string | null;
    session: {
      id: string;
      start_date: string | null;
      end_date: string | null;
      modality: string | null;
      formation: { title: string } | Array<{ title: string }> | null;
    } | null;
  };

  const rows = (enrollments ?? []) as unknown as Row[];
  const totalSessions = rows.length;
  const aVenir = rows.filter(
    (r) => r.session?.end_date && r.session.end_date >= today,
  ).length;
  const terminees = totalSessions - aVenir;

  const firstName = ctx.learner.first_name ?? "";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-cyan-50 to-indigo-50 border border-cyan-200 p-4 sm:p-6">
        <h1 className="text-lg sm:text-2xl font-bold text-zinc-900 leading-tight">
          Bonjour {firstName} !
        </h1>
        <p className="text-xs sm:text-sm text-zinc-600 mt-1 max-w-2xl">
          Bienvenue sur votre espace personnel {ctx.organization.name}. Vous y
          retrouvez vos formations, vos documents (attestations, programmes) et
          vos résultats de quiz.
        </p>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        <Kpi
          icon={BookOpen}
          label="Formations totales"
          value={totalSessions}
          color="cyan"
        />
        <Kpi
          icon={Clock}
          label="À venir / en cours"
          value={aVenir}
          color="amber"
        />
        <Kpi
          icon={CheckCircle2}
          label="Terminées"
          value={terminees}
          color="emerald"
        />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href={`/apprenant/${token}/sessions`}
          className="group rounded-2xl bg-white border border-zinc-200 p-6 hover:border-cyan-400 hover:shadow-md transition-all"
        >
          <BookOpen className="h-8 w-8 text-cyan-600 mb-3" />
          <h2 className="text-lg font-bold text-zinc-900 group-hover:text-cyan-700">
            Mes formations
          </h2>
          <p className="text-sm text-zinc-600 mt-1">
            Liste de toutes vos sessions de formation, à venir et passées.
          </p>
        </Link>

        <Link
          href={`/apprenant/${token}/documents`}
          className="group rounded-2xl bg-white border border-zinc-200 p-6 hover:border-emerald-400 hover:shadow-md transition-all"
        >
          <FileText className="h-8 w-8 text-emerald-600 mb-3" />
          <h2 className="text-lg font-bold text-zinc-900 group-hover:text-emerald-700">
            Mes documents
          </h2>
          <p className="text-sm text-zinc-600 mt-1">
            Téléchargez vos attestations de réalisation, programmes de
            formation et conventions.
          </p>
        </Link>

        <Link
          href={`/apprenant/${token}/quiz`}
          className="group rounded-2xl bg-white border border-zinc-200 p-6 hover:border-violet-400 hover:shadow-md transition-all"
        >
          <GraduationCap className="h-8 w-8 text-violet-600 mb-3" />
          <h2 className="text-lg font-bold text-zinc-900 group-hover:text-violet-700">
            Mes résultats
          </h2>
          <p className="text-sm text-zinc-600 mt-1">
            Consultez vos scores aux quiz d&apos;entrée et de sortie de chaque
            formation.
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
    <div className={`rounded-xl border p-3 sm:p-4 ${colorClasses}`}>
      <Icon className="h-4 w-4 sm:h-5 sm:w-5 mb-1 sm:mb-2" />
      <div className="text-xl sm:text-2xl font-bold text-zinc-900 tabular-nums">
        {value}
      </div>
      <div className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold leading-tight">
        {label}
      </div>
    </div>
  );
}
