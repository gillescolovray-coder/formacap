import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Wrench } from "lucide-react";
import { healEnrollmentsForSession } from "@/lib/inscriptions/sync";
import { repairOrphanInscriptions } from "./actions";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Page de diagnostic temporaire (Gilles 2026-05-22) :
 * affiche l'état réel des inscriptions/enrollments pour une session,
 * lance le healing et montre le résultat.
 *
 * Accessible directement via /sessions/<id>/diagnostic
 */
export default async function SessionDiagnosticPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ repaired?: string; errors?: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();
  const query = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 1) Inscriptions de la session avec stage
  const { data: requests } = await supabase
    .from("inscription_requests")
    .select(
      "id, learner_id, prospect_first_name, prospect_last_name, prospect_email, stage_id, stage:inscription_stages(key, name)",
    )
    .eq("target_session_id", id);

  // 2) Tous les enrollments de la session
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner_id, inscription_request_id, status, learner:learners(first_name, last_name, email)",
    )
    .eq("session_id", id);

  // 3) On lance le healing et on regarde combien il a réparé
  const healResult = await healEnrollmentsForSession(supabase, id);

  // 4) Et on relit l'état après healing
  const { data: enrollmentsAfter } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner_id, inscription_request_id, status, learner:learners(first_name, last_name, email)",
    )
    .eq("session_id", id);

  type ReqRow = {
    id: string;
    learner_id: string | null;
    prospect_first_name: string | null;
    prospect_last_name: string | null;
    prospect_email: string | null;
    stage_id: string | null;
    stage: { key: string | null; name: string | null } | null;
  };
  type EnrollRow = {
    id: string;
    learner_id: string | null;
    inscription_request_id: string | null;
    status: string;
    learner: {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
  };
  const reqs = (requests ?? []) as unknown as ReqRow[];
  const enrollsAfter = (enrollmentsAfter ?? []) as unknown as EnrollRow[];

  const enrollMap = new Map<string, EnrollRow>();
  for (const e of enrollsAfter) {
    if (e.learner_id) enrollMap.set(e.learner_id, e);
  }

  // Compte des inscriptions orphelines (sans learner_id) → drive le bouton
  const orphanCount = reqs.filter((r) => !r.learner_id).length;
  const repairAction = repairOrphanInscriptions.bind(null, id);

  return (
    <div className="p-8 max-w-6xl space-y-6">
      <PageHeader
        title="Diagnostic synchronisation"
        description="Vue détaillée des inscriptions et enrollments pour cette session."
        breadcrumbs={[
          { label: "Sessions", href: "/sessions" },
          { label: "Diagnostic" },
        ]}
      />

      {/* Bandeau résultat de réparation */}
      {query.repaired && Number(query.repaired) > 0 && (
        <div className="rounded-xl bg-emerald-50 border-2 border-emerald-300 p-4 text-sm text-emerald-900">
          <strong>✓ Réparation effectuée :</strong> {query.repaired}{" "}
          inscription{Number(query.repaired) > 1 ? "s" : ""} corrigée
          {Number(query.repaired) > 1 ? "s" : ""}.
        </div>
      )}
      {query.errors && (
        <div className="rounded-xl bg-rose-50 border border-rose-300 p-4 text-xs text-rose-900">
          <strong>Erreurs rencontrées :</strong>
          <ul className="mt-1 list-disc list-inside">
            {query.errors.split(" | ").map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Bouton de réparation si orphelins détectés */}
      {orphanCount > 0 && (
        <form action={repairAction}>
          <div className="rounded-xl bg-amber-50 border-2 border-amber-300 p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-amber-900">
                {orphanCount} inscription{orphanCount > 1 ? "s" : ""}{" "}
                orpheline{orphanCount > 1 ? "s" : ""} détectée
                {orphanCount > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-amber-800 mt-1">
                Ces inscriptions n&apos;ont pas de <code>learner_id</code>{" "}
                et ne peuvent donc pas générer convention / convocation /
                émargement. Cliquez ci-dessous pour créer les apprenants
                manquants et les rattacher automatiquement.
              </p>
            </div>
            <Button
              type="submit"
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
            >
              <Wrench className="h-4 w-4" />
              Réparer maintenant
            </Button>
          </div>
        </form>
      )}

      {/* Résumé */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-white border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wider font-bold text-slate-500">
            Inscriptions (BDD)
          </p>
          <p className="text-3xl font-black text-cyan-700 mt-1">
            {reqs.length}
          </p>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wider font-bold text-slate-500">
            Enrollments avant healing
          </p>
          <p className="text-3xl font-black text-amber-700 mt-1">
            {enrollments?.length ?? 0}
          </p>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wider font-bold text-slate-500">
            Enrollments après healing
          </p>
          <p className="text-3xl font-black text-emerald-700 mt-1">
            {enrollsAfter.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Healing : {healResult.healed} réparés / {healResult.checked}{" "}
            vérifiés
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            (avant : {enrollments?.length ?? 0})
          </p>
        </div>
      </div>

      {/* Tableau détaillé des inscriptions */}
      <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 border-b">
          Inscriptions de la session ({reqs.length})
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b">
            <tr>
              <th className="px-3 py-2">Prénom Nom</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">learner_id</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Enrollment lié ?</th>
              <th className="px-3 py-2">Statut enroll</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reqs.map((r) => {
              const enrollment = r.learner_id
                ? enrollMap.get(r.learner_id)
                : null;
              const linked =
                enrollment &&
                (enrollment.inscription_request_id as string | null) === r.id;
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-semibold">
                    {r.prospect_first_name} {r.prospect_last_name}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {r.prospect_email ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.learner_id ? (
                      <span className="font-mono text-[10px] text-emerald-700">
                        {r.learner_id.slice(0, 8)}…
                      </span>
                    ) : (
                      <span className="text-rose-700 font-bold">
                        ❌ MANQUANT
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                      {r.stage?.name ?? r.stage?.key ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {enrollment ? (
                      linked ? (
                        <span className="text-emerald-700 font-bold">
                          ✓ Lié
                        </span>
                      ) : (
                        <span className="text-amber-700 font-bold">
                          ⚠ Existe mais lié à une autre request
                        </span>
                      )
                    ) : (
                      <span className="text-rose-700 font-bold">
                        ❌ MANQUANT
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{enrollment?.status ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Liste enrollments */}
      <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 border-b">
          Enrollments en BDD après healing ({enrollmentsAfter?.length ?? 0})
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b">
            <tr>
              <th className="px-3 py-2">Apprenant</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">inscription_request_id</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {enrollsAfter.map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2 font-semibold">
                  {e.learner?.first_name} {e.learner?.last_name}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {e.learner?.email ?? "—"}
                </td>
                <td className="px-3 py-2">{e.status}</td>
                <td className="px-3 py-2 font-mono text-[10px]">
                  {e.inscription_request_id?.slice(0, 8) ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900">
        <p className="font-bold mb-1">Lecture du diagnostic</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            Si <strong>learner_id MANQUANT</strong> sur une inscription → le
            healing ne peut pas créer l&apos;enrollment. Il faut éditer
            l&apos;inscription pour rattacher un apprenant (ou en créer un).
          </li>
          <li>
            Si <strong>Enrollment MANQUANT</strong> alors que learner_id
            existe → bug de sync à corriger (envoie-moi cette ligne).
          </li>
          <li>
            Si <strong>Existe mais lié à une autre request</strong> → cas
            attendu après re-création, le healing devrait re-lier au prochain
            chargement.
          </li>
        </ul>
      </div>
    </div>
  );
}
