import Link from "next/link";
import { AlertTriangle, Check, Info, Mail, Printer } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isResendConfigured } from "@/lib/email/resend";
import {
  healCompanyLinksForSession,
  healEnrollmentsForSession,
  healLearnersForSession,
} from "@/lib/inscriptions/sync";
import { SessionTabs } from "../_session-tabs";
import { SessionHeaderMeta } from "../_session-header-meta";
import {
  markConvocationSent,
  unmarkConvocationSent,
} from "./actions";
import { BulkSendButton, SendOneButton } from "./_send-buttons";
import { GmailButton } from "./_gmail-button";
import { ConfirmInscriptionGmailButton } from "./_confirm-of-gmail-button";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EnrollmentRow = {
  id: string;
  convocation_sent_at: string | null;
  inscription_request_id: string | null;
  learner: {
    id: string;
    civility: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    company_id: string | null;
  } | null;
  // Enrichissements ajoutés au mapping (Gilles 2026-05-22)
  channel?: string;
  referents?: Array<{ name: string; email: string | null }>;
  /** Nom de l'OF partenaire qui a inscrit cet apprenant (si applicable).
   *  Quand non null, l'OF gère lui-même la convocation/convention. */
  partner_of_name?: string | null;
  /** Nom du partenaire (OF ou prescripteur) qui a fait l'inscription,
   *  utilisé dans la colonne SOURCE D'INSCRIPTION. */
  partner_name?: string | null;
  /** Date d'envoi du mail confirmation Gmail (OF — migration 0100). */
  partner_confirmation_sent_at?: string | null;
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
  // Email de l'utilisateur connecté → passé en `authuser` à Gmail compose
  // pour ouvrir le compte pro Workspace (Gilles 2026-05-22).
  const currentUserEmail = user.email ?? "";

  // Téléphone de l'organisation pour la signature des emails Gmail
  // (bouton "Confirmer via Gmail" pour les apprenants OF — Gilles 2026-05-22).
  let trainerPhone: string | null = null;
  try {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization:organizations(phone)")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle<{
        organization:
          | { phone: string | null }
          | Array<{ phone: string | null }>
          | null;
      }>();
    const org = Array.isArray(membership?.organization)
      ? membership?.organization[0]
      : membership?.organization;
    trainerPhone = org?.phone ?? null;
  } catch {
    trainerPhone = null;
  }

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, start_date, end_date, modality, video_link, video_app, formation:formations(id, title)",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      start_date: string;
      end_date: string;
      modality: string | null;
      video_link: string | null;
      video_app: string | null;
      formation: { id: string; title: string } | null;
    }>();
  if (!session) notFound();

  // Self-healing en 3 étapes (ordre important) :
  // 1) learners manquants → 2) company_id manquants → 3) enrollments.
  try {
    await healLearnersForSession(supabase, id);
    await healCompanyLinksForSession(supabase, id);
    await healEnrollmentsForSession(supabase, id);
  } catch (e) {
    console.warn(
      "[convocations/page] heal failed",
      (e as Error).message,
    );
  }

  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, convocation_sent_at, inscription_request_id, learner:learners(id, civility, first_name, last_name, email, phone, mobile, company_id)",
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
  // Source d'inscription (canal + nom partenaire) par request →
  // affichée dans la colonne SOURCE D'INSCRIPTION (Gilles 2026-05-22).
  const channelByRequestId = new Map<string, string>();
  const partnerNameByRequestId = new Map<string, string>();
  // Date d'envoi du mail confirmation Gmail pour les apprenants OF
  // (Gilles 2026-05-22 — migration 0100).
  const partnerConfirmationSentByRequestId = new Map<string, string>();
  if (requestIds.length > 0) {
    const { data: reqs } = await supabase
      .from("inscription_requests")
      .select(
        "id, inscription_channel, referrer_company_id, partner_confirmation_email_sent_at, referrer:companies!referrer_company_id(name, type)",
      )
      .in("id", requestIds);
    for (const r of (reqs ?? []) as Array<{
      id: string;
      inscription_channel: string | null;
      referrer_company_id: string | null;
      partner_confirmation_email_sent_at: string | null;
      referrer:
        | { name: string; type: string }
        | Array<{ name: string; type: string }>
        | null;
    }>) {
      const ref = Array.isArray(r.referrer) ? r.referrer[0] : r.referrer;
      if (r.referrer_company_id && ref?.type === "of") {
        partnerOfByRequestId.set(r.id, ref.name);
      }
      if (ref?.name) {
        partnerNameByRequestId.set(r.id, ref.name);
      }
      channelByRequestId.set(r.id, r.inscription_channel ?? "direct");
      if (r.partner_confirmation_email_sent_at) {
        partnerConfirmationSentByRequestId.set(
          r.id,
          r.partner_confirmation_email_sent_at,
        );
      }
    }
  }

  // Référents pédagogiques par société pour cette session (Gilles 2026-05-22).
  // On lit inscription_referent_contacts directement (dédoublonnage cote
  // BDD via une contrainte d'unicite session × societe × contact).
  const learnerCompanyIds = Array.from(
    new Set(
      rawRows
        .map((r) => r.learner?.company_id as string | null)
        .filter((x): x is string => Boolean(x)),
    ),
  );
  const referentsByCompany = new Map<
    string,
    Array<{ name: string; email: string | null }>
  >();
  if (learnerCompanyIds.length > 0) {
    const { data: refRows } = await supabase
      .from("inscription_referent_contacts")
      .select(
        "company_id, contact:company_contacts(first_name, last_name, email)",
      )
      .eq("session_id", id)
      .in("company_id", learnerCompanyIds);
    for (const row of (refRows ?? []) as Array<{
      company_id: string;
      contact:
        | { first_name: string | null; last_name: string | null; email: string | null }
        | Array<{ first_name: string | null; last_name: string | null; email: string | null }>
        | null;
    }>) {
      const c = Array.isArray(row.contact) ? row.contact[0] : row.contact;
      if (!c) continue;
      const name =
        [c.first_name, c.last_name].filter(Boolean).join(" ") || "Référent";
      const list = referentsByCompany.get(row.company_id) ?? [];
      list.push({ name, email: c.email });
      referentsByCompany.set(row.company_id, list);
    }
  }

  const rows: EnrollmentRow[] = rawRows.map((r) => ({
    ...r,
    partner_of_name: r.inscription_request_id
      ? (partnerOfByRequestId.get(r.inscription_request_id) ?? null)
      : null,
    channel: r.inscription_request_id
      ? (channelByRequestId.get(r.inscription_request_id) ?? "direct")
      : "direct",
    partner_name: r.inscription_request_id
      ? (partnerNameByRequestId.get(r.inscription_request_id) ?? null)
      : null,
    partner_confirmation_sent_at: r.inscription_request_id
      ? (partnerConfirmationSentByRequestId.get(r.inscription_request_id) ??
        null)
      : null,
    referents: r.learner?.company_id
      ? (referentsByCompany.get(r.learner.company_id) ?? [])
      : [],
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

      <div className="p-8 max-w-7xl space-y-4">
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

        {/* Bandeau d'erreur si session distancielle/hybride sans lien
            de connexion (Gilles 2026-05-22). Bloque l'envoi des
            convocations tant que le lien n'est pas renseigné. */}
        {(session.modality === "distanciel" ||
          session.modality === "hybride") &&
          !session.video_link && (
            <div className="rounded-xl bg-rose-50 border-2 border-rose-300 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-700 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-rose-900">
                    ⚠ Lien de connexion manquant
                  </p>
                  <p className="text-xs text-rose-800 mt-1">
                    Cette session est en{" "}
                    <strong>
                      {session.modality === "distanciel"
                        ? "distanciel"
                        : "hybride"}
                    </strong>{" "}
                    mais le lien de connexion ({session.video_app ?? "Zoom/Teams/Meet…"})
                    n&apos;est pas renseigné. L&apos;envoi des convocations
                    est bloqué pour éviter d&apos;envoyer une convocation
                    sans le lien d&apos;accès à la session.
                  </p>
                  <Link
                    href={`/sessions/${id}`}
                    className="inline-block mt-2 text-xs font-bold text-rose-700 underline hover:text-rose-900"
                  >
                    → Compléter le lien sur la fiche session
                  </Link>
                </div>
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
              resendConfigured={
                resendOn &&
                !(
                  (session.modality === "distanciel" ||
                    session.modality === "hybride") &&
                  !session.video_link
                )
              }
            />
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center text-sm text-zinc-500">
            Aucun apprenant inscrit. Les convocations apparaîtront ici dès
            qu&apos;un apprenant sera inscrit à cette session.
          </div>
        ) : (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Apprenant</th>
                  <th className="px-4 py-3 leading-tight">
                    Source
                    <br />
                    d&apos;inscription
                  </th>
                  <th className="px-4 py-3">Référent pédagogique</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
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
                  const email = r.learner?.email ?? null;
                  const isSent = !!r.convocation_sent_at;
                  // Lien direct vers le PDF généré par Puppeteer (header +
                  // footer + bandeau via pdf-lib). Aligné sur la convention
                  // pour cohérence des actions ("Aperçu PDF" ouvre toujours
                  // le PDF, pas un aperçu intermédiaire).
                  const printUrl = `/api/sessions/${id}/convocations/${r.id}/pdf`;
                  // Pré-remplissage email pour Gmail / Mailto.
                  // Gilles 2026-05-22 : le PDF ne peut PAS être attaché
                  // via URL Gmail (limitation officielle Google). Donc le
                  // bouton Gmail ouvre 2 onglets : le PDF + Gmail
                  // compose. L'utilisateur glisse-dépose le PDF.
                  const mailSubject = `Convocation à la formation : ${title}`;
                  const mailBody = `Bonjour,\n\nVotre convocation à la formation « ${title} » ${dateRange} vient de s'ouvrir dans un autre onglet. Merci de la glisser-déposer dans cet email avant de l'envoyer.\n\nBien cordialement,`;
                  const mailto = email
                    ? `mailto:${email}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`
                    : undefined;
                  const phone = r.learner?.phone ?? null;
                  const mobile = r.learner?.mobile ?? null;
                  // Label SOURCE : on aligne sur l'onglet Participants
                  // (Gilles 2026-05-26) — badge type + nom partenaire en
                  // sous-ligne (au lieu d'un seul gros badge qui prenait
                  // toute la colonne pour les noms d'OF longs).
                  const channelKey =
                    r.channel === "of"
                      ? "of"
                      : r.channel === "prescripteur"
                        ? "prescripteur"
                        : "direct";
                  const channelLabel =
                    channelKey === "prescripteur"
                      ? "Prescripteur"
                      : channelKey === "of"
                        ? "OF"
                        : "CAP NUMERIQUE";
                  const channelCls =
                    channelKey === "prescripteur"
                      ? "bg-blue-100 text-blue-800 border-blue-200"
                      : channelKey === "of"
                        ? "bg-violet-100 text-violet-800 border-violet-200"
                        : "bg-emerald-100 text-emerald-800 border-emerald-200";
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
                      <td className="px-4 py-3 align-top">
                        <div className="font-bold text-zinc-900">
                          {fullName}
                        </div>
                        {email && (
                          <div className="text-xs text-zinc-700 mt-0.5">
                            ✉ {email}
                          </div>
                        )}
                        {!email && (
                          <div className="text-xs text-zinc-400 italic mt-0.5">
                            Email non renseigné
                          </div>
                        )}
                        {mobile && (
                          <div className="text-xs text-zinc-700 font-mono">
                            📱 {mobile}
                          </div>
                        )}
                        {phone && !mobile && (
                          <div className="text-xs text-zinc-700 font-mono">
                            ☎ {phone}
                          </div>
                        )}
                      </td>
                      {/* Source d'inscription (canal) — format aligné
                          sur l'onglet Participants : badge type + nom
                          partenaire en sous-ligne. */}
                      <td className="px-4 py-3 align-top text-xs max-w-[200px]">
                        {channelKey === "direct" ? (
                          <span
                            className={cn(
                              "inline-block px-1.5 py-0.5 rounded border font-bold text-[11px] whitespace-nowrap",
                              channelCls,
                            )}
                          >
                            {channelLabel}
                          </span>
                        ) : (
                          <div
                            className="leading-tight"
                            title={`Canal : ${channelLabel}${r.partner_name ? " · " + r.partner_name : ""}`}
                          >
                            <span
                              className={cn(
                                "inline-block px-1.5 py-0.5 rounded border font-bold text-[11px] whitespace-nowrap",
                                channelCls,
                              )}
                            >
                              {channelLabel}
                            </span>
                            {r.partner_name ? (
                              <div className="text-[11px] text-slate-700 mt-0.5 break-words">
                                {r.partner_name}
                              </div>
                            ) : (
                              <div className="text-[10px] uppercase font-bold text-red-700 mt-0.5">
                                à compléter
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      {/* Référents pédagogiques */}
                      <td className="px-4 py-3 align-top text-xs">
                        {r.referents && r.referents.length > 0 ? (
                          <ul className="space-y-0.5">
                            {r.referents.map((ref, i) => (
                              <li key={i} className="leading-tight">
                                <div className="font-semibold text-zinc-800">
                                  {ref.name}
                                </div>
                                {ref.email && (
                                  <div className="text-[11px] text-zinc-500">
                                    {ref.email}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-zinc-400 italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {/* Pour les inscriptions via OF partenaire, la
                            convocation est à la charge de l'OF. On
                            n'affiche plus de badge "Géré par X" ici car
                            l'info est dans la colonne SOURCE D'INSCRIPTION
                            (Gilles 2026-05-22). Statut neutre. */}
                        {r.partner_of_name ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-600 border border-zinc-200"
                            title={`La convocation est à la charge de l'OF partenaire ${r.partner_of_name}.`}
                          >
                            À la charge de l&apos;OF
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
                        {/* flex-wrap pour que les boutons retombent
                            sur une 2ème ligne plutôt que de déborder
                            (Gilles 2026-05-22). */}
                        <div className="flex flex-wrap items-start justify-end gap-1.5">
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
                              partenaire (l'OF gère sa convocation).
                              Désactivé aussi si la session est en
                              distanciel/hybride sans lien de connexion
                              (Gilles 2026-05-22). */}
                          {!r.partner_of_name && (() => {
                            const remoteWithoutLink =
                              (session.modality === "distanciel" ||
                                session.modality === "hybride") &&
                              !session.video_link;
                            return (
                              <SendOneButton
                                sessionId={id}
                                enrollmentId={r.id}
                                disabled={
                                  !resendOn || !email || remoteWithoutLink
                                }
                                disabledReason={
                                  !resendOn
                                    ? "Resend non configuré"
                                    : !email
                                      ? "Pas d'email"
                                      : remoteWithoutLink
                                        ? "Lien de connexion manquant sur la fiche session"
                                        : undefined
                                }
                              />
                            );
                          })()}
                          {/* Bouton Gmail (Option B Gilles 2026-05-22) :
                              ouvre Gmail compose avec un lien public
                              vers le PDF de la convocation inséré dans
                              le body. L'email part du compte pro
                              Workspace, le destinataire clique sur le
                              lien pour récupérer la convocation. */}
                          {!r.partner_of_name && email && (
                            <div className="inline-flex flex-col items-stretch gap-0.5">
                              <GmailButton
                                enrollmentId={r.id}
                                toEmail={email}
                                subject={mailSubject}
                                authUserEmail={currentUserEmail}
                                formationTitle={title}
                                dateRange={dateRange}
                                learnerCivility={r.learner?.civility ?? null}
                                learnerName={base}
                                trainerPhone={trainerPhone}
                              />
                              {mailto && (
                                <a
                                  href={mailto}
                                  className="text-[10px] text-center text-zinc-400 hover:text-zinc-700 hover:underline"
                                  title="Fallback mailto: pour client email système (sans pièce jointe automatique)"
                                >
                                  ou Mailto
                                </a>
                              )}
                            </div>
                          )}
                          {r.partner_of_name ? (
                            <div className="inline-flex flex-col items-stretch gap-1">
                              {/* Bouton confirmation d'inscription via Gmail —
                                  réservé aux apprenants OF partenaires
                                  (Gilles 2026-05-22). Tracking en BDD via
                                  partner_confirmation_email_sent_at. */}
                              {email && (
                                <ConfirmInscriptionGmailButton
                                  sessionId={id}
                                  enrollmentId={r.id}
                                  toEmail={email}
                                  learnerCivility={r.learner?.civility ?? null}
                                  learnerName={base}
                                  formationTitle={title}
                                  dateRange={dateRange}
                                  authUserEmail={currentUserEmail}
                                  trainerPhone={trainerPhone}
                                  partnerOfName={r.partner_of_name}
                                  alreadySentAt={r.partner_confirmation_sent_at}
                                />
                              )}
                              <span className="text-[10px] text-zinc-500 italic text-center max-w-[180px]">
                                Convocation à la charge de l&apos;OF.
                                Connexion auto envoyée 48h avant.
                              </span>
                            </div>
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
