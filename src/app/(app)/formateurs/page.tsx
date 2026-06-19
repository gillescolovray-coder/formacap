import Link from "next/link";
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  Plus,
  Star,
  UserCheck,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  TRAINER_STATUS_BADGE_CLASSES,
  TRAINER_STATUS_LABELS,
  TRAINER_VALIDATION_BADGE_CLASSES,
  TRAINER_VALIDATION_STATUS_LABELS,
  type Trainer,
  type TrainerStatus,
  type TrainerValidationStatus,
} from "@/lib/trainers/types";
import { PortalIcon } from "./_portal-icon";

type SearchParams = {
  q?: string;
  status?: TrainerStatus | "";
  validation?: TrainerValidationStatus | "";
  active?: string;
};

function escapeForIlike(value: string) {
  return value.replace(/[%_,()]/g, " ").trim();
}

export default async function TrainersListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const statusFilter = params.status ?? "";
  const validationFilter = params.validation ?? "";
  const activeFilter = params.active ?? "";
  const isFiltered =
    Boolean(q) ||
    statusFilter !== "" ||
    validationFilter !== "" ||
    activeFilter !== "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [totalCount, validatedCount, toValidateCount, externalCount, rcExpiringCount] =
    await Promise.all([
      supabase.from("trainers").select("id", { count: "exact", head: true }),
      supabase
        .from("trainers")
        .select("id", { count: "exact", head: true })
        .eq("validation_status", "valide"),
      supabase
        .from("trainers")
        .select("id", { count: "exact", head: true })
        .eq("validation_status", "a_valider"),
      supabase
        .from("trainers")
        .select("id", { count: "exact", head: true })
        .neq("status", "salarie"),
      supabase
        .from("trainers")
        .select("id", { count: "exact", head: true })
        .lte(
          "rc_pro_expires_on",
          new Date(Date.now() + 90 * 24 * 3600 * 1000)
            .toISOString()
            .slice(0, 10),
        ),
    ]);

  let query = supabase
    .from("trainers")
    .select("*")
    .order("last_name", { ascending: true });

  if (q) {
    const safe = escapeForIlike(q);
    if (safe.length > 0) {
      query = query.or(
        `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,company_name.ilike.%${safe}%,siret.ilike.%${safe}%`,
      );
    }
  }
  if (statusFilter) query = query.eq("status", statusFilter);
  if (validationFilter) query = query.eq("validation_status", validationFilter);
  if (activeFilter === "yes") query = query.eq("is_active", true);
  if (activeFilter === "no") query = query.eq("is_active", false);

  const { data: trainers, error } = await query;

  // Bulk : tokens portail + compétences (trainer_competences) en 1 round-trip
  // chacun. Évite N+1 queries.
  const tokenByTrainer = new Map<string, string>();
  const competencesByTrainer = new Map<
    string,
    Array<{ domainName: string; levelName: string | null }>
  >();
  if (trainers && trainers.length > 0) {
    const trainerIds = (trainers as Array<{ id: string }>).map((t) => t.id);

    const [tokensRes, competencesRes] = await Promise.all([
      supabase
        .from("trainer_portal_tokens")
        .select("trainer_id, token")
        .in("trainer_id", trainerIds),
      supabase
        .from("trainer_competences")
        .select(
          "trainer_id, domain:skill_domains(name), level:skill_levels(name)",
        )
        .in("trainer_id", trainerIds),
    ]);

    for (const row of (tokensRes.data ?? []) as Array<{
      trainer_id: string;
      token: string;
    }>) {
      tokenByTrainer.set(row.trainer_id, row.token);
    }

    type CompRow = {
      trainer_id: string;
      domain: { name: string } | Array<{ name: string }> | null;
      level: { name: string } | Array<{ name: string }> | null;
    };
    for (const row of (competencesRes.data ?? []) as CompRow[]) {
      const dom = Array.isArray(row.domain) ? row.domain[0] : row.domain;
      const lvl = Array.isArray(row.level) ? row.level[0] : row.level;
      if (!dom?.name) continue;
      if (!competencesByTrainer.has(row.trainer_id)) {
        competencesByTrainer.set(row.trainer_id, []);
      }
      competencesByTrainer.get(row.trainer_id)!.push({
        domainName: dom.name,
        levelName: lvl?.name ?? null,
      });
    }
  }

  const stats = [
    {
      label: "Total",
      value: totalCount.count ?? 0,
      accent:
        "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800",
      icon: Users,
      iconClass: "text-slate-600 dark:text-slate-400",
      href: "/formateurs",
      active: !isFiltered,
    },
    {
      label: "Validés",
      value: validatedCount.count ?? 0,
      accent:
        "bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-900",
      icon: CheckCircle2,
      iconClass: "text-cyan-600 dark:text-cyan-400",
      href: "/formateurs?validation=valide",
      active: validationFilter === "valide",
    },
    {
      label: "À valider",
      value: toValidateCount.count ?? 0,
      accent:
        "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
      icon: UserCheck,
      iconClass: "text-amber-600 dark:text-amber-400",
      href: "/formateurs?validation=a_valider",
      active: validationFilter === "a_valider",
    },
    {
      label: "Externes",
      value: externalCount.count ?? 0,
      accent:
        "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900",
      icon: Briefcase,
      iconClass: "text-violet-600 dark:text-violet-400",
      href: "/formateurs",
      active: false,
    },
    {
      label: "RC pro à renouveler",
      value: rcExpiringCount.count ?? 0,
      accent:
        "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900",
      icon: AlertTriangle,
      iconClass: "text-red-600 dark:text-red-400",
      href: "/formateurs",
      active: false,
    },
  ];

  return (
    <>
      <PageHeader
        title="Formateurs"
        description="Référentiel des formateurs internes et externes (Qualiopi indic. 21-22)."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Formateurs" },
        ]}
        actions={
          <Button nativeButton={false} render={<Link href="/formateurs/new" />}>
            <Plus className="h-4 w-4" />
            Nouveau formateur
          </Button>
        }
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className={cn(
                "rounded-xl border p-4 transition-all hover:shadow-sm",
                s.accent,
                s.active
                  ? "ring-2 ring-slate-900 dark:ring-white shadow-sm"
                  : "opacity-90 hover:opacity-100",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
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

        <form
          method="get"
          className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3"
        >
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto] items-end">
            <div className="space-y-1.5">
              <Label htmlFor="q" className="text-xs">
                Rechercher
              </Label>
              <Input
                id="q"
                name="q"
                type="search"
                placeholder="Nom, prénom, email, entreprise…"
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
                className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              >
                <option value="">Tous</option>
                {Object.entries(TRAINER_STATUS_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="validation" className="text-xs">
                Validation
              </Label>
              <select
                id="validation"
                name="validation"
                defaultValue={validationFilter}
                className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              >
                <option value="">Toutes</option>
                {Object.entries(TRAINER_VALIDATION_STATUS_LABELS).map(
                  ([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="active" className="text-xs">
                État
              </Label>
              <select
                id="active"
                name="active"
                defaultValue={activeFilter}
                className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              >
                <option value="">Tous</option>
                <option value="yes">Actifs</option>
                <option value="no">Inactifs</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Filtrer</Button>
              {isFiltered && (
                <Button
                  type="button"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/formateurs" />}
                >
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>
        </form>

        {error ? (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            Erreur : {error.message}
          </div>
        ) : !trainers || trainers.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-12 text-center">
            <Users className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
            {isFiltered ? (
              <>
                <p className="text-sm font-medium mb-1">Aucun résultat</p>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/formateurs" />}
                >
                  Réinitialiser
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium mb-1">Aucun formateur</p>
                <p className="text-xs text-slate-500 mb-4">
                  Référencez votre premier formateur interne ou externe.
                </p>
                <Button
                  nativeButton={false}
                  render={<Link href="/formateurs/new" />}
                >
                  <Plus className="h-4 w-4" />
                  Nouveau formateur
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500 px-1">
              {trainers.length} formateur{trainers.length > 1 ? "s" : ""}
            </p>
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-slate-50 dark:bg-slate-950 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Formateur</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3 text-center" title="Double-cliquez pour ouvrir le portail formateur">
                      Portail
                    </th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3">Ville</th>
                    <th className="px-4 py-3">Domaines</th>
                    <th className="px-4 py-3">Niveau</th>
                    <th className="px-4 py-3">Validation</th>
                    <th className="px-4 py-3 text-right">Satisfaction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {(trainers as Trainer[]).map((t) => (
                    <tr
                      key={t.id}
                      className={cn(
                        "transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/50",
                        !t.is_active && "opacity-60",
                      )}
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/formateurs/${t.id}`}
                          className="hover:underline"
                        >
                          {t.last_name.toUpperCase()} {t.first_name}
                        </Link>
                        {t.company_name && (
                          <p className="text-xs text-slate-500 font-normal">
                            {t.company_name}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {t.email ? (
                          <a
                            href={`mailto:${t.email}`}
                            className="block text-cyan-700 dark:text-cyan-400 hover:underline truncate max-w-[200px]"
                            title={t.email}
                          >
                            {t.email}
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {t.mobile ? (
                          <a
                            href={`tel:${t.mobile}`}
                            className="block text-slate-600 dark:text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-400"
                          >
                            {t.mobile}
                          </a>
                        ) : t.phone ? (
                          <a
                            href={`tel:${t.phone}`}
                            className="block text-slate-600 dark:text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-400"
                          >
                            {t.phone}
                          </a>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <PortalIcon
                          token={tokenByTrainer.get(t.id) ?? null}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap",
                            TRAINER_STATUS_BADGE_CLASSES[t.status],
                          )}
                        >
                          {TRAINER_STATUS_LABELS[t.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {t.postal_code || t.city ? (
                          <>
                            {t.postal_code && (
                              <span className="font-mono">{t.postal_code}</span>
                            )}
                            {t.postal_code && t.city && " "}
                            {t.city}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px]">
                        {(() => {
                          // Priorité au nouveau système (trainer_competences :
                          // domaine + niveau structurés). Fallback sur l'ancien
                          // intervention_domains (text[] saisi via tags libres)
                          // pour les fiches non migrées (Gilles 2026-05-24).
                          const comps = competencesByTrainer.get(t.id) ?? [];
                          if (comps.length > 0) {
                            return (
                              <div className="flex flex-wrap gap-1">
                                {comps.slice(0, 3).map((c, i) => (
                                  <span
                                    key={`${c.domainName}-${i}`}
                                    className="inline-block px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900 text-[10px] font-medium"
                                    title={
                                      c.levelName
                                        ? `${c.domainName} · ${c.levelName}`
                                        : c.domainName
                                    }
                                  >
                                    {c.domainName}
                                  </span>
                                ))}
                                {comps.length > 3 && (
                                  <span className="text-[10px] text-slate-400">
                                    +{comps.length - 3}
                                  </span>
                                )}
                              </div>
                            );
                          }
                          // Fallback ancien système
                          const legacy = t.intervention_domains ?? [];
                          if (legacy.length > 0) {
                            return (
                              <div className="flex flex-wrap gap-1">
                                {legacy.slice(0, 3).map((d) => (
                                  <span
                                    key={d}
                                    className="inline-block px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900 text-[10px] font-medium"
                                  >
                                    {d}
                                  </span>
                                ))}
                                {legacy.length > 3 && (
                                  <span className="text-[10px] text-slate-400">
                                    +{legacy.length - 3}
                                  </span>
                                )}
                              </div>
                            );
                          }
                          return "—";
                        })()}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[150px]">
                        {(() => {
                          // Niveaux : du nouveau système d'abord (uniques),
                          // sinon fallback ancien intervention_levels.
                          const comps = competencesByTrainer.get(t.id) ?? [];
                          const newLevels = Array.from(
                            new Set(
                              comps
                                .map((c) => c.levelName)
                                .filter((n): n is string => !!n),
                            ),
                          );
                          if (newLevels.length > 0) return newLevels.join(", ");
                          const legacyLevels = t.intervention_levels ?? [];
                          return legacyLevels.length > 0
                            ? legacyLevels.join(", ")
                            : "—";
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap",
                            TRAINER_VALIDATION_BADGE_CLASSES[t.validation_status],
                          )}
                        >
                          {
                            TRAINER_VALIDATION_STATUS_LABELS[
                              t.validation_status
                            ]
                          }
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {t.satisfaction_avg !== null ? (
                          <span className="inline-flex items-center gap-1 text-cyan-700 dark:text-cyan-400">
                            <Star className="h-3 w-3 fill-current" />
                            {t.satisfaction_avg.toFixed(1)}
                            <span className="text-xs text-slate-400">
                              /{t.satisfaction_scale ?? 5}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
