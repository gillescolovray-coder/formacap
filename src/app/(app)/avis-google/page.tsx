import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Star,
  Send,
  MousePointerClick,
  Clock,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { findEligibleItems } from "@/lib/google-review/send";
import {
  runGoogleReviewNow,
  setGoogleReviewAuto,
  resetGoogleReviewFromHub,
} from "./actions";

export const dynamic = "force-dynamic";

type SP = {
  gsent?: string;
  gskipped?: string;
  gerror?: string;
  greset?: string;
  saved?: string;
};

export default async function AvisGoogleHub({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select(
      "organization:organizations(id, name, google_review_url, google_review_auto_weekly, google_review_auto_on_close)",
    )
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const org = (
    membership as {
      organization:
        | {
            id: string;
            name: string;
            google_review_url: string | null;
            google_review_auto_weekly: boolean | null;
            google_review_auto_on_close: boolean | null;
          }
        | {
            id: string;
            name: string;
            google_review_url: string | null;
            google_review_auto_weekly: boolean | null;
            google_review_auto_on_close: boolean | null;
          }[]
        | null;
    } | null
  )?.organization;
  const o = Array.isArray(org) ? org[0] : org;
  if (!o) redirect("/dashboard");

  const orgId = o!.id;
  const reviewConfigured = Boolean(o!.google_review_url?.trim());

  // Éligibles (toutes sessions).
  const eligible = await findEligibleItems(supabase, orgId);

  // Historique des envois + compteurs.
  const { data: rows } = await supabase
    .from("google_review_requests")
    .select(
      "id, sent_at, channel, status, clicked_at, email, learner:learners(first_name, last_name), session:sessions(formation:formations(title))",
    )
    .eq("organization_id", orgId)
    .order("sent_at", { ascending: false })
    .limit(300);

  type Row = {
    id: string;
    sent_at: string;
    channel: string;
    status: string;
    clicked_at: string | null;
    email: string;
    learner: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
    session: { formation: { title: string | null } | { title: string | null }[] | null } | { formation: { title: string | null } | { title: string | null }[] | null }[] | null;
  };
  const pick = <T,>(v: unknown): T | null =>
    (Array.isArray(v) ? (v[0] ?? null) : (v ?? null)) as T | null;
  const history = ((rows ?? []) as Row[]).map((r) => {
    const l = pick<{ first_name: string | null; last_name: string | null }>(r.learner);
    const s = pick<{ formation: unknown }>(r.session);
    const f = pick<{ title: string | null }>(s?.formation);
    return {
      id: r.id,
      sentAt: r.sent_at,
      channel: r.channel,
      clicked: Boolean(r.clicked_at),
      email: r.email,
      name: [l?.first_name, l?.last_name].filter(Boolean).join(" ") || "—",
      formation: f?.title ?? "—",
    };
  });

  const sentCount = history.length;
  const clickedCount = history.filter((h) => h.clicked).length;

  return (
    <>
      <PageHeader
        title="Avis Google"
        description="Sollicitez vos apprenants très satisfaits pour un avis Google et suivez les envois."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Avis Google" },
        ]}
      />

      <div className="p-8 space-y-4 max-w-5xl">
        {/* Bannières */}
        {sp.gsent !== undefined && (
          <Banner ok>
            ✅ {sp.gsent} demande(s) envoyée(s).
            {sp.gskipped && Number(sp.gskipped) > 0
              ? ` ${sp.gskipped} ignorée(s).`
              : ""}
          </Banner>
        )}
        {sp.saved && <Banner ok>✅ Réglages enregistrés.</Banner>}
        {sp.greset && <Banner>↺ Demande réinitialisée — apprenant de nouveau sollicitable.</Banner>}
        {sp.gerror === "no_url" && (
          <Banner error>
            Aucun lien d&apos;avis Google configuré.{" "}
            <Link href="/parametres/organisation" className="underline font-semibold">
              Le renseigner
            </Link>
            .
          </Banner>
        )}

        {!reviewConfigured && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              Renseignez votre <strong>lien d&apos;avis Google</strong> dans{" "}
              <Link href="/parametres/organisation" className="underline font-semibold">
                Paramètres &gt; Organisation
              </Link>{" "}
              pour activer les envois.
            </div>
          </div>
        )}

        {/* Compteurs */}
        <div className="grid grid-cols-3 gap-3">
          <Kpi
            icon={<Star className="h-4 w-4" />}
            label="Éligibles à solliciter"
            value={eligible.length}
            color="amber"
          />
          <Kpi
            icon={<Send className="h-4 w-4" />}
            label="Demandes envoyées"
            value={sentCount}
            color="cyan"
          />
          <Kpi
            icon={<MousePointerClick className="h-4 w-4" />}
            label="Avis cliqués"
            value={clickedCount}
            color="emerald"
          />
        </div>

        {/* Envoi groupé + réglages auto */}
        <div className="grid md:grid-cols-2 gap-3">
          <section className="rounded-xl bg-white border border-emerald-200 p-4 space-y-2">
            <h2 className="text-sm font-bold text-zinc-900 inline-flex items-center gap-1.5">
              <Send className="h-4 w-4 text-emerald-600" /> Envoi manuel groupé
            </h2>
            <p className="text-xs text-zinc-500">
              Envoie la demande à tous les apprenants « Très satisfait » non
              encore sollicités ({eligible.length} éligible
              {eligible.length > 1 ? "s" : ""}).
            </p>
            <form action={runGoogleReviewNow}>
              <button
                type="submit"
                disabled={!reviewConfigured || eligible.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
                Envoyer maintenant ({eligible.length})
              </button>
            </form>
          </section>

          <section className="rounded-xl bg-white border border-zinc-200 p-4 space-y-2">
            <h2 className="text-sm font-bold text-zinc-900 inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-cyan-600" /> Envois automatiques
            </h2>
            <form action={setGoogleReviewAuto} className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  name="weekly"
                  defaultChecked={Boolean(o!.google_review_auto_weekly)}
                  className="h-4 w-4 rounded border-zinc-300 text-cyan-600"
                />
                Chaque <strong>vendredi</strong> : envoyer aux nouveaux éligibles
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  name="on_close"
                  defaultChecked={Boolean(o!.google_review_auto_on_close)}
                  className="h-4 w-4 rounded border-zinc-300 text-cyan-600"
                />
                À la <strong>clôture d&apos;une session</strong>
              </label>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-300 text-sm font-semibold hover:bg-zinc-50"
              >
                Enregistrer
              </button>
            </form>
          </section>
        </div>

        {/* Historique */}
        <section className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wider font-bold text-zinc-600">
            Historique des envois ({sentCount})
          </div>
          {history.length === 0 ? (
            <p className="p-6 text-center text-sm text-zinc-500">
              Aucune demande envoyée pour le moment.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200">
                  <tr>
                    <th className="px-4 py-2">Apprenant</th>
                    <th className="px-4 py-2">Formation</th>
                    <th className="px-4 py-2">Envoyé le</th>
                    <th className="px-4 py-2">Mode</th>
                    <th className="px-4 py-2">Clic</th>
                    <th className="px-4 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {history.map((h) => (
                    <tr key={h.id} className="hover:bg-zinc-50/50">
                      <td className="px-4 py-2 font-medium text-zinc-900">
                        {h.name}
                        <div className="text-[11px] text-zinc-400">{h.email}</div>
                      </td>
                      <td className="px-4 py-2 text-zinc-600">{h.formation}</td>
                      <td className="px-4 py-2 text-zinc-600 whitespace-nowrap">
                        {new Date(h.sentAt).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                          {h.channel === "auto" ? "Auto" : "Manuel"}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {h.clicked ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Cliqué
                          </span>
                        ) : (
                          <span className="text-zinc-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <form action={resetGoogleReviewFromHub}>
                          <input type="hidden" name="requestId" value={h.id} />
                          <button
                            type="submit"
                            className="text-[11px] text-zinc-400 hover:text-rose-600 hover:underline"
                            title="Réinitialiser pour pouvoir renvoyer"
                          >
                            ↺ Réinitialiser
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Banner({
  children,
  ok,
  error,
}: {
  children: React.ReactNode;
  ok?: boolean;
  error?: boolean;
}) {
  const cls = error
    ? "bg-rose-50 border-rose-200 text-rose-700"
    : ok
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : "bg-amber-50 border-amber-200 text-amber-800";
  return (
    <div className={`rounded-lg border px-4 py-2.5 text-sm ${cls}`}>
      {children}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "amber" | "cyan" | "emerald";
}) {
  const c = {
    amber: "bg-amber-50 text-amber-700",
    cyan: "bg-cyan-50 text-cyan-700",
    emerald: "bg-emerald-50 text-emerald-700",
  }[color];
  return (
    <div className="rounded-xl bg-white border border-zinc-200 p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${c}`}>
        {icon}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
          {label}
        </div>
        <div className="text-2xl font-bold text-zinc-900 tabular-nums">
          {value}
        </div>
      </div>
    </div>
  );
}
