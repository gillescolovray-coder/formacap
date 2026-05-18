import Link from "next/link";
import { AlertTriangle, Check, Info, Mail, Printer } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isResendConfigured } from "@/lib/email/resend";
import { SessionTabs } from "../_session-tabs";
import { SessionHeaderMeta } from "../_session-header-meta";
import {
  markConvocationSent,
  unmarkConvocationSent,
} from "./actions";
import { BulkSendButton, SendOneButton } from "./_send-buttons";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EnrollmentRow = {
  id: string;
  convocation_sent_at: string | null;
  inscription_request_id: string | null;
  learner: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  /** Nom de l'OF partenaire qui a inscrit cet apprenant (si applicable).
   *  Quand non null, l'OF gère lui-même la convocation/convention. */
  partner_of_name?: string | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function ConvocationsPage({
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
      "id, start_date, end_date, modality, formation:formations(id, title)",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      start_date: string;
      end_date: string;
      modality: string | null;
      formation: { id: string; title: string } | null;
    }>();
  if (!session) notFound();

  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, convocation_sent_at, inscription_request_id, learner:learners(id, first_name, last_name, email)",
    )
    .eq("session_id", id)
    .order("enrolled_at", { ascending: true });

  // Pour chaque inscription, on cherche si elle vient d'un OF partenaire :
  //   inscription_request.referrer_company_id → companies.type = 'of'
  // Si c'est le cas, l'OF gère lui-même la convocation/convention.
  const rawRows = (enrollments ?? []) as unknown as EnrollmentRow[];
  const requestIds = Array.from(
    new Set(
      rawRows
        .map((r) => r.inscription_request_id)
        .filter((x): x is string => Boolean(x)),
    ),
  );
  const partnerOfByRequestId = new Map<string, string>();
  if (requestIds.length > 0) {
    const { data: reqs } = await supabase
      .from("inscription_requests")
      .select("id, referrer_company_id, referrer:companies!referrer_company_id(name, type)")
      .in("id", requestIds);
    for (const r of (reqs ?? []) as Array<{
      id: string;
      referrer_company_id: string | null;
      referrer:
        | { name: string; type: string }
        | Array<{ name: string; type: string }>
        | null;
    }>) {
      const ref = Array.isArray(r.referrer) ? r.referrer[0] : r.referrer;
      if (r.referrer_company_id && ref?.type === "of") {
        partnerOfByRequestId.set(r.id, ref.name);
      }
    }
  }
  const rows: EnrollmentRow[] = rawRows.map((r) => ({
    ...r,
    partner_of_name: r.inscription_request_id
      ? (partnerOfByRequestId.get(r.inscription_request_id) ?? null)
      : null,
  }));
  const sentCount = rows.filter((r) => r.convocation_sent_at).length;
  // Les apprenants inscrits via un OF partenaire sont exclus du bulk
  // d'envoi : leur OF gère lui-même la convocation.
  const pendingWithEmailCount = rows.filter(
    (r) =>
      !r.convocation_sent_at && r.learner?.email && !r.partner_of_name,
  ).length;
  const title = session.formation?.title ?? "Session";
  const dateRange = `du ${formatDate(session.start_date)} au ${formatDate(session.end_date)}`;
  const resendOn = isResendConfigured();

  return (
    <>
      <PageHeader
        title="Convocations"
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
          { label: "Convocations" },
        ]}
        actions={<BackButton fallbackHref={`/sessions/${id}`} />}
      />

      <SessionTabs
        sessionId={id}
        counts={{
          participants: rows.length,
          convocations: sentCount,
        }}
      />

      <div className="p-8 max-w-5xl space-y-4">
        {/* Bandeau d'info / configuration Resend */}
        {resendOn ? (
          <div className="rounded-lg bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900 p-3 flex items-start gap-2.5">
            <Info className="h-4 w-4 text-cyan-700 dark:text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-xs text-cyan-900 dark:text-cyan-200 leading-relaxed">
              Cliquez sur <strong>Envoyer</strong> pour envoyer la convocation
              automatiquement par email avec le PDF en pièce jointe. Le statut
              « Envoyée » garde la trace de la date d&apos;envoi pour Qualiopi.
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              <strong>Envoi automatique non configuré.</strong> Configurez
              Resend (variables <code>RESEND_API_KEY</code> et{" "}
              <code>RESEND_FROM</code>) pour envoyer les convocations
              automatiquement. En attendant, utilisez le bouton « Mailto »
              pour ouvrir votre client mail.
            </div>
          </div>
        )}

        {/* Action groupée */}
        {rows.length > 0 && (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 flex items-center justify-between gap-3">
            <div className="text-sm">
              <strong>{sentCount}</strong> envoyée{sentCount > 1 ? "s" : ""} ·{" "}
              <strong>{pendingWithEmailCount}</strong> en attente
              {pendingWithEmailCount > 1 ? "s" : ""}
            </div>
            <BulkSendButton
              sessionId={id}
              pendingCount={pendingWithEmailCount}
              resendConfigured={resendOn}
            />
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center text-sm text-zinc-500">
            Aucun apprenant inscrit. Les convocations apparaîtront ici dès
            qu&apos;un apprenant sera inscrit à cette session.
          </div>
        ) : (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Apprenant</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {rows.map((r) => {
                  const fullName = r.learner
                    ? [r.learner.first_name, r.learner.last_name]
                        .filter(Boolean)
                        .join(" ")
                    : "—";
                  const email = r.learner?.email ?? null;
                  const isSent = !!r.convocation_sent_at;
                  // Lien direct vers le PDF généré par Puppeteer (header +
                  // footer + bandeau via pdf-lib). Aligné sur la convention
                  // pour cohérence des actions ("Aperçu PDF" ouvre toujours
                  // le PDF, pas un aperçu intermédiaire).
                  const printUrl = `/api/sessions/${id}/convocations/${r.id}/pdf`;
                  // Pré-remplissage du mailto:
                  const mailSubject = `Convocation à la formation : ${title}`;
                  const mailBody = `Bonjour,%0D%0A%0D%0AVous trouverez ci-joint votre convocation à la formation « ${encodeURIComponent(title)} » ${encodeURIComponent(dateRange)}.%0D%0A%0D%0ABien cordialement,`;
                  const mailto = email
                    ? `mailto:${email}?subject=${encodeURIComponent(mailSubject)}&body=${mailBody}`
                    : undefined;
                  const markSentBound = markConvocationSent.bind(
                    null,
                    id,
                    r.id,
                  );
                  const unmarkSentBound = unmarkConvocationSent.bind(
                    null,
                    id,
                    r.id,
                  );
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        "transition-colors hover:bg-zinc-50/60 dark:hover:bg-zinc-950/60",
                        isSent &&
                          "bg-emerald-50/30 dark:bg-emerald-950/10 hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
                      )}
                    >
                      <td className="px-4 py-3 font-medium">{fullName}</td>
                      <td className="px-4 py-3 text-xs">
                        {email ? (
                          <a
                            href={`mailto:${email}`}
                            className="text-zinc-700 dark:text-zinc-300 hover:text-cyan-700 hover:underline"
                          >
                            {email}
                          </a>
                        ) : (
                          <span className="text-zinc-400 italic">
                            Email non renseigné
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.partner_of_name ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-cyan-100 text-cyan-800 border border-cyan-200"
                            title={`Géré par l'OF partenaire ${r.partner_of_name} — CAP NUMÉRIQUE n'envoie pas la convocation.`}
                          >
                            Géré par {r.partner_of_name}
                          </span>
                        ) : isSent ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <Check className="h-3 w-3" />
                            Envoyée le {formatDate(r.convocation_sent_at!)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-700 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300">
                            Non envoyée
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {!r.partner_of_name && (
                            <Button
                              variant="outline"
                              size="sm"
                              nativeButton={false}
                              render={
                                <a
                                  href={printUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                />
                              }
                            >
                              <Printer className="h-3.5 w-3.5" />
                              Aperçu PDF
                            </Button>
                          )}
                          {/* Envoi automatique via Resend si configuré.
                              Désactivé pour les inscriptions via OF
                              partenaire (l'OF gère sa convocation). */}
                          {!r.partner_of_name && (
                            <SendOneButton
                              sessionId={id}
                              enrollmentId={r.id}
                              disabled={!resendOn || !email}
                              disabledReason={
                                !resendOn
                                  ? "Resend non configuré"
                                  : !email
                                    ? "Pas d'email"
                                    : undefined
                              }
                            />
                          )}
                          {/* Mailto manuel toujours disponible en secours */}
                          {mailto && !r.partner_of_name && (
                            <Button
                              variant="outline"
                              size="sm"
                              nativeButton={false}
                              render={<a href={mailto} />}
                              title="Ouvre votre client mail avec un brouillon prérempli (envoi manuel)"
                            >
                              <Mail className="h-3.5 w-3.5" />
                              Mailto
                            </Button>
                          )}
                          {r.partner_of_name ? (
                            <span className="text-[11px] text-zinc-500 italic">
                              Convocation à la charge de l&apos;OF partenaire
                            </span>
                          ) : isSent ? (
                            <form action={unmarkSentBound}>
                              <Button
                                type="submit"
                                variant="outline"
                                size="sm"
                                title="Annuler le marquage comme envoyée"
                              >
                                Annuler
                              </Button>
                            </form>
                          ) : (
                            <form action={markSentBound}>
                              <Button
                                type="submit"
                                size="sm"
                                title="Marquer la convocation comme envoyée"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Marquer envoyée
                              </Button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-zinc-500 px-1">
          <Link
            href={`/sessions/${id}`}
            className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ← Retour à la fiche de session
          </Link>
        </p>
      </div>
    </>
  );
}
