import Link from "next/link";
import { Award, Info, Printer } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isResendConfigured } from "@/lib/email/resend";
import { SessionTabs } from "../_session-tabs";
import { SessionHeaderMeta } from "../_session-header-meta";
import { BulkSendAttestations, SendOneAttestation } from "./_send-buttons";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AttestationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, start_date, end_date, status, formation:formations(id, title)",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      start_date: string;
      end_date: string;
      status: string;
      formation: { id: string; title: string } | null;
    }>();
  if (!session) notFound();

  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, status, attestation_sent_at, learner:learners(id, civility, first_name, last_name, email)",
    )
    .eq("session_id", id)
    .order("enrolled_at", { ascending: true });

  type Row = {
    id: string;
    status: string;
    attestation_sent_at: string | null;
    learner: {
      id: string;
      civility: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
  };
  const rows = (enrollments ?? []) as unknown as Row[];
  const resendOn = isResendConfigured();
  const sentCount = rows.filter((r) => r.attestation_sent_at).length;
  const pendingCount = rows.filter(
    (r) => !r.attestation_sent_at && r.learner?.email,
  ).length;

  // Calcul du taux de présence par apprenant (depuis les attendances)
  const enrollmentIds = rows.map((r) => r.id);
  const { data: attendances } =
    enrollmentIds.length > 0
      ? await supabase
          .from("attendances")
          .select("enrollment_id, status")
          .in("enrollment_id", enrollmentIds)
      : { data: [] };

  const attendanceByEnrollment = new Map<
    string,
    { present: number; total: number }
  >();
  (attendances ?? []).forEach((a) => {
    const eid = a.enrollment_id as string;
    const stats = attendanceByEnrollment.get(eid) ?? {
      present: 0,
      total: 0,
    };
    stats.total += 1;
    if (a.status === "present" || a.status === "late") stats.present += 1;
    attendanceByEnrollment.set(eid, stats);
  });

  const title = session.formation?.title ?? "Session";
  const isCompleted = session.status === "completed";

  return (
    <>
      <PageHeader
        title="Attestations de réalisation"
        description={
          <>
            <span className="font-semibold text-zinc-700 dark:text-zinc-300 block">
              {title}
            </span>
            <SessionHeaderMeta sessionId={id} />
          </>
        }
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Sessions", href: "/sessions" },
          { label: title, href: `/sessions/${id}` },
          { label: "Attestations" },
        ]}
        actions={<BackButton fallbackHref={`/sessions/${id}`} />}
      />

      <SessionTabs sessionId={id} counts={{ attestations: rows.length }} />

      <div className="p-8 max-w-5xl space-y-4">
        {!isCompleted && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5">
            <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              Cette session n&apos;est pas encore au statut{" "}
              <strong>Terminée</strong>. Vous pouvez générer les
              attestations en avant-première, mais il est recommandé
              d&apos;attendre la fin effective de la session pour
              transmettre les documents finaux.
            </p>
          </div>
        )}

        <div className="rounded-lg bg-cyan-50/50 border border-cyan-200 p-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-cyan-700 shrink-0 mt-0.5" />
          <p className="text-xs text-cyan-900 leading-relaxed">
            Une attestation de réalisation est générée pour chaque apprenant
            inscrit. Elle reprend automatiquement les heures suivies depuis
            l&apos;émargement, le lieu, le formateur et les mentions
            légales. <strong>Cliquez sur Envoyer</strong> pour envoyer
            l&apos;attestation par email (PDF en pièce jointe).
          </p>
        </div>

        {rows.length > 0 && (
          <div className="rounded-xl bg-white border border-zinc-200 p-4 flex items-center justify-between gap-3">
            <div className="text-sm">
              <strong>{sentCount}</strong> envoyée{sentCount > 1 ? "s" : ""} ·{" "}
              <strong>{pendingCount}</strong> en attente
              {pendingCount > 1 ? "s" : ""}
            </div>
            <BulkSendAttestations
              sessionId={id}
              pendingCount={pendingCount}
              disabled={!resendOn}
            />
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rounded-xl bg-white border border-zinc-200 p-12 text-center">
            <Award className="h-12 w-12 mx-auto text-zinc-300 mb-3" />
            <p className="text-sm font-medium mb-1">Aucune attestation</p>
            <p className="text-xs text-zinc-500">
              Aucun apprenant inscrit à cette session.
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200">
                <tr>
                  <th className="px-4 py-3">Apprenant</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Présence</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {rows.map((r) => {
                  // Préfixer le nom par la civilité si renseignée
                  // (Gilles 2026-05-22).
                  const base = r.learner
                    ? [r.learner.first_name, r.learner.last_name]
                        .filter(Boolean)
                        .join(" ")
                    : "";
                  const civ = (r.learner?.civility ?? "").trim();
                  const prefix =
                    civ === "M." || civ === "Mme" ? `${civ} ` : "";
                  const fullName = base ? `${prefix}${base}` : "—";
                  const stats = attendanceByEnrollment.get(r.id);
                  const rate =
                    stats && stats.total > 0
                      ? Math.round((stats.present / stats.total) * 100)
                      : null;
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-zinc-50/60 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{fullName}</td>
                      <td className="px-4 py-3 text-xs text-zinc-600">
                        {r.learner?.email ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {rate === null ? (
                          <span className="text-zinc-400 italic">
                            Pas d&apos;émargement
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium",
                              rate >= 100
                                ? "bg-emerald-100 text-emerald-800"
                                : rate >= 75
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-red-100 text-red-700",
                            )}
                          >
                            {rate} % présent
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            nativeButton={false}
                            render={
                              <a
                                href={`/sessions/${id}/attestations/${r.id}/print`}
                                target="_blank"
                                rel="noopener noreferrer"
                              />
                            }
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Aperçu
                          </Button>
                          <SendOneAttestation
                            sessionId={id}
                            enrollmentId={r.id}
                            disabled={!resendOn || !r.learner?.email}
                            alreadySent={!!r.attestation_sent_at}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="pt-2">
          <Link
            href={`/sessions/${id}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-white border-2 border-cyan-300 text-cyan-700 text-sm font-bold hover:bg-cyan-50 hover:border-cyan-400 transition-colors shadow-sm"
          >
            ← Retour à la fiche de session
          </Link>
        </div>
      </div>
    </>
  );
}
