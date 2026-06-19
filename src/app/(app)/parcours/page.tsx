import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  Route as RouteIcon,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  PARCOURS_STATUS_BADGE_CLASSES,
  PARCOURS_STATUS_LABELS,
  type Parcours,
  type ParcoursStatus,
} from "@/lib/parcours/types";

type SearchParams = {
  q?: string;
  status?: ParcoursStatus | "";
};

function escapeForIlike(value: string) {
  return value.replace(/[%_,()]/g, " ").trim();
}

export default async function ParcoursListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const statusFilter = params.status ?? "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [totalCount, plannedCount, inProgressCount, completedCount] =
    await Promise.all([
      supabase.from("parcours").select("id", { count: "exact", head: true }),
      supabase
        .from("parcours")
        .select("id", { count: "exact", head: true })
        .eq("status", "planned"),
      supabase
        .from("parcours")
        .select("id", { count: "exact", head: true })
        .eq("status", "in_progress"),
      supabase
        .from("parcours")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed"),
    ]);

  let query = supabase
    .from("parcours")
    .select("*")
    .order("name", { ascending: true });
  if (q) {
    const safe = escapeForIlike(q);
    if (safe.length > 0) {
      query = query.or(
        `name.ilike.%${safe}%,internal_code.ilike.%${safe}%,description.ilike.%${safe}%`,
      );
    }
  }
  if (statusFilter) query = query.eq("status", statusFilter);

  const { data: parcours, error } = await query;

  // Compteur de sessions par parcours
  const parcoursIds = (parcours ?? []).map((p) => p.id as string);
  const sessionCount = new Map<
    string,
    { count: number; totalHours: number; totalDays: number }
  >();
  if (parcoursIds.length > 0) {
    const { data: sessAgg } = await supabase
      .from("sessions")
      .select(
        "parcours_id, formation:formations(duration_hours, duration_days)",
      )
      .in("parcours_id", parcoursIds);

    (sessAgg ?? []).forEach((s) => {
      const pid = s.parcours_id as string;
      const cur = sessionCount.get(pid) ?? {
        count: 0,
        totalHours: 0,
        totalDays: 0,
      };
      const f = s.formation as unknown as {
        duration_hours: number | null;
        duration_days: number | null;
      } | null;
      cur.count += 1;
      cur.totalHours += Number(f?.duration_hours ?? 0);
      cur.totalDays += Number(f?.duration_days ?? 0);
      sessionCount.set(pid, cur);
    });
  }

  const stats = [
    {
      label: "Total",
      value: totalCount.count ?? 0,
      icon: RouteIcon,
      iconClass: "text-slate-600",
      accent: "bg-slate-50 border-slate-200",
      href: "/parcours",
      active: !statusFilter,
    },
    {
      label: "Planifiés",
      value: plannedCount.count ?? 0,
      icon: Calendar,
      iconClass: "text-amber-600",
      accent: "bg-amber-50 border-amber-200",
      href: "/parcours?status=planned",
      active: statusFilter === "planned",
    },
    {
      label: "En cours",
      value: inProgressCount.count ?? 0,
      icon: Clock,
      iconClass: "text-cyan-600",
      accent: "bg-cyan-50 border-cyan-200",
      href: "/parcours?status=in_progress",
      active: statusFilter === "in_progress",
    },
    {
      label: "Terminés",
      value: completedCount.count ?? 0,
      icon: CheckCircle2,
      iconClass: "text-violet-600",
      accent: "bg-violet-50 border-violet-200",
      href: "/parcours?status=completed",
      active: statusFilter === "completed",
    },
  ];

  return (
    <>
      <PageHeader
        title="Parcours de formation"
        description="Regroupez plusieurs sessions (présentiel, distanciel, e-learning, hybride…) en un parcours pédagogique cohérent."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Parcours" },
        ]}
        actions={
          <Button nativeButton={false} render={<Link href="/parcours/new" />}>
            <Plus className="h-4 w-4" />
            Nouveau parcours
          </Button>
        }
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className={cn(
                "rounded-xl border p-4 transition-all hover:shadow-sm",
                s.accent,
                s.active ? "ring-2 ring-slate-900 shadow-sm" : "opacity-90",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    {s.label}
                  </p>
                  <p className="text-2xl font-bold mt-1 tabular-nums">
                    {s.value}
                  </p>
                </div>
                <s.icon className={cn("h-5 w-5", s.iconClass)} />
              </div>
            </Link>
          ))}
        </div>

        <form
          method="get"
          className="rounded-xl bg-white border border-slate-200 p-4"
        >
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto] items-end">
            <div className="space-y-1.5">
              <Label htmlFor="q" className="text-xs">
                Rechercher
              </Label>
              <Input
                id="q"
                name="q"
                type="search"
                placeholder="Nom, code, description…"
                defaultValue={q}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status" className="text-xs">
                Statut
              </Label>
              <select
                id="status"
                name="status"
                defaultValue={statusFilter}
                className="flex h-9 w-full rounded-md border border-slate-300 bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">Tous</option>
                {Object.entries(PARCOURS_STATUS_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Filtrer</Button>
              {(q || statusFilter) && (
                <Button
                  type="button"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/parcours" />}
                >
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>
        </form>

        {error ? (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            Erreur : {error.message}
          </div>
        ) : !parcours || parcours.length === 0 ? (
          <div className="rounded-xl bg-white border border-slate-200 p-12 text-center">
            <RouteIcon className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-medium mb-1">Aucun parcours</p>
            <p className="text-xs text-slate-500 mb-4">
              Créez votre premier parcours pour orchestrer plusieurs sessions.
            </p>
            <Button nativeButton={false} render={<Link href="/parcours/new" />}>
              <Plus className="h-4 w-4" />
              Nouveau parcours
            </Button>
          </div>
        ) : (
          <div className="rounded-xl bg-white border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Nom</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">Sessions</th>
                  <th className="px-4 py-3 text-right">Total heures</th>
                  <th className="px-4 py-3 text-right">Total jours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(parcours as Parcours[]).map((p) => {
                  const stat = sessionCount.get(p.id) ?? {
                    count: 0,
                    totalHours: 0,
                    totalDays: 0,
                  };
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/parcours/${p.id}`}
                          className="hover:underline"
                        >
                          {p.name}
                        </Link>
                        {p.description && (
                          <p className="text-xs text-slate-500 line-clamp-1">
                            {p.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.internal_code ? (
                          <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[11px]">
                            {p.internal_code}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap",
                            PARCOURS_STATUS_BADGE_CLASSES[p.status],
                          )}
                        >
                          {PARCOURS_STATUS_LABELS[p.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {stat.count > 0 ? (
                          <span className="font-bold text-cyan-700">
                            {stat.count}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {stat.totalHours > 0 ? (
                          <span className="font-semibold">
                            {stat.totalHours}{" "}
                            <span className="text-xs text-slate-400 font-normal">
                              h
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {stat.totalDays > 0 ? (
                          <span className="font-semibold">
                            {stat.totalDays}{" "}
                            <span className="text-xs text-slate-400 font-normal">
                              j
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
