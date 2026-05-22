import Link from "next/link";
import { AlertTriangle, Building2, Check, Info, Printer } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isResendConfigured } from "@/lib/email/resend";
import { healEnrollmentsForSession } from "@/lib/inscriptions/sync";
import {
  computeConventionAmount,
  type SessionPricingConfig,
} from "@/lib/pricing/compute";
import { SessionTabs } from "../_session-tabs";
import { SessionHeaderMeta } from "../_session-header-meta";
import {
  CancelConventionButton,
  EnsureAndSendConventionButton,
} from "./_send-buttons";
import { NotifyInscriptionsButton } from "./_inscription-notif-button";
import { ResendModal } from "./_resend-modal";
import { ConventionEditButton } from "./_edit-modal";
import { ReferentsModal } from "./_referents-modal";
import { ShareConventionButton } from "./_share-button";
import { RecomputeAmountButton } from "./_recompute-button";
import { PreNotifyGmailButton } from "./_pre-notify-gmail";
import { BulkPreNotifyGmailButton } from "./_pre-notify-bulk";
import { EmailStatusTimeline } from "./_email-status-timeline";
import { ConfirmInscriptionGmailButton } from "../convocations/_confirm-of-gmail-button";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConventionsPage({
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
  const currentUserEmail = user.email ?? "";

  // Téléphone de l'organisation — utilisé dans la signature des emails
  // de pré-notification Gmail (Gilles 2026-05-22).
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
      "id, start_date, end_date, amount_ht, pricing_mode, price_per_day_ht, price_forfait_ht, price_extra_per_day_ht, pricing_threshold, formation:formations(id, title, public_price_excl_tax, price_company)",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      start_date: string;
      end_date: string;
      amount_ht: number | null;
      pricing_mode: "per_learner" | "forfait" | null;
      price_per_day_ht: number | null;
      price_forfait_ht: number | null;
      price_extra_per_day_ht: number | null;
      pricing_threshold: number | null;
      formation: {
        id: string;
        title: string;
        public_price_excl_tax: number | null;
        price_company: number | null;
      } | null;
    }>();
  if (!session) notFound();

  // Self-healing : répare automatiquement les enrollments manquants
  // avant de lister (Gilles 2026-05-22 : fix bug 3 inscriptions confirmées
  // mais 1 seul participant visible dans Conventions). Silencieux.
  try {
    await healEnrollmentsForSession(supabase, id);
  } catch (e) {
    console.warn(
      "[conventions/page] healEnrollmentsForSession failed",
      (e as Error).message,
    );
  }

  // Inscriptions + entreprises distinctes
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, inscription_email_sent_at, learner:learners(id, civility, first_name, last_name, email, phone, job_title, company_id, company:companies(id, name, industry, postal_code, city))",
    )
    .eq("session_id", id);

  type EnrollmentRow = {
    id: string;
    inscription_email_sent_at: string | null;
    learner: {
      id: string;
      civility: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      job_title: string | null;
      company_id: string | null;
      company: {
        id: string;
        name: string;
        industry: string | null;
        postal_code: string | null;
        city: string | null;
      } | null;
    } | null;
  };

  const rows = (enrollments ?? []) as unknown as EnrollmentRow[];

  // (Items pour la modale "Renvoyer..." construits plus bas avec contacts RH)

  // Groupage par entreprise
  type LearnerInfo = {
    id: string;
    civility: string | null;
    name: string;
    email: string | null;
    phone: string | null;
    jobTitle: string | null;
  };
  type CompanyGroup = {
    companyId: string;
    companyName: string;
    industry: string | null;
    postalCode: string | null;
    city: string | null;
    learners: LearnerInfo[];
  };
  const byCompany = new Map<string, CompanyGroup>();
  const orphans: string[] = []; // apprenants sans entreprise

  for (const r of rows) {
    const cid = r.learner?.company_id;
    const cname = r.learner?.company?.name;
    // Le rendu JSX ajoute déjà la civilité depuis l.civility (cf. plus
    // bas) — on garde donc lname sans préfixe pour éviter "Mme Mme".
    const lname =
      [r.learner?.first_name, r.learner?.last_name]
        .filter(Boolean)
        .join(" ") || "Apprenant inconnu";
    if (!cid || !cname || !r.learner) {
      orphans.push(lname);
      continue;
    }
    if (!byCompany.has(cid)) {
      byCompany.set(cid, {
        companyId: cid,
        companyName: cname,
        industry: r.learner?.company?.industry ?? null,
        postalCode: r.learner?.company?.postal_code ?? null,
        city: r.learner?.company?.city ?? null,
        learners: [],
      });
    }
    byCompany.get(cid)!.learners.push({
      id: r.learner.id,
      civility: r.learner.civility,
      name: lname,
      email: r.learner.email,
      phone: r.learner.phone,
      jobTitle: r.learner.job_title,
    });
  }

  const companyIds = Array.from(byCompany.keys());

  // Conventions existantes (avec colonnes tracking email migration 0097)
  const { data: conventions } =
    companyIds.length > 0
      ? await supabase
          .from("session_conventions")
          .select(
            "id, company_id, status, contact_name, contact_email, sent_at, signed_at, signed_by_name, amount_ht_unit, amount_ht_total, financing_mode, obsolete_reason, prenotified_at, delivered_at, opened_at, clicked_at, bounced_at, complained_at",
          )
          .eq("session_id", id)
          .in("company_id", companyIds)
      : { data: [] };

  const conventionByCompany = new Map<
    string,
    {
      id: string;
      status: string;
      contact_name: string | null;
      contact_email: string | null;
      sent_at: string | null;
      signed_at: string | null;
      signed_by_name: string | null;
      amount_ht_unit: number | null;
      amount_ht_total: number | null;
      financing_mode: string | null;
      obsolete_reason: string | null;
      prenotified_at: string | null;
      delivered_at: string | null;
      opened_at: string | null;
      clicked_at: string | null;
      bounced_at: string | null;
      complained_at: string | null;
    }
  >();
  (conventions ?? []).forEach((c) => {
    conventionByCompany.set(c.company_id as string, {
      id: c.id as string,
      status: c.status as string,
      contact_name: c.contact_name as string | null,
      contact_email: c.contact_email as string | null,
      sent_at: c.sent_at as string | null,
      signed_at: c.signed_at as string | null,
      signed_by_name: c.signed_by_name as string | null,
      amount_ht_unit: c.amount_ht_unit as number | null,
      amount_ht_total: c.amount_ht_total as number | null,
      financing_mode: c.financing_mode as string | null,
      obsolete_reason: c.obsolete_reason as string | null,
      prenotified_at: (c as { prenotified_at?: string | null }).prenotified_at ?? null,
      delivered_at: (c as { delivered_at?: string | null }).delivered_at ?? null,
      opened_at: (c as { opened_at?: string | null }).opened_at ?? null,
      clicked_at: (c as { clicked_at?: string | null }).clicked_at ?? null,
      bounced_at: (c as { bounced_at?: string | null }).bounced_at ?? null,
      complained_at: (c as { complained_at?: string | null }).complained_at ?? null,
    });
  });

  // Contact principal + tous contacts de chaque entreprise.
  // - is_primary : pour le destinataire par défaut de la convention
  // - tous : pour le modal de sélection des référents pédagogiques
  const { data: contacts } =
    companyIds.length > 0
      ? await supabase
          .from("company_contacts")
          .select(
            "id, company_id, first_name, last_name, email, job_title, is_primary",
          )
          .in("company_id", companyIds)
      : { data: [] };
  const primaryContactByCompany = new Map<
    string,
    { name: string; email: string | null }
  >();
  // Tous les contacts groupés par société (pour le modal référents).
  type ContactItem = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    job_title: string | null;
    is_primary: boolean;
  };
  const contactsByCompany = new Map<string, ContactItem[]>();
  (contacts ?? []).forEach((c) => {
    const cid = c.company_id as string;
    // Map primary contact
    if (c.is_primary) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
      primaryContactByCompany.set(cid, {
        name,
        email: c.email as string | null,
      });
    }
    // Map all contacts
    const list = contactsByCompany.get(cid) ?? [];
    list.push({
      id: c.id as string,
      first_name: c.first_name as string | null,
      last_name: c.last_name as string | null,
      email: c.email as string | null,
      job_title: (c as { job_title?: string | null }).job_title ?? null,
      is_primary: !!c.is_primary,
    });
    contactsByCompany.set(cid, list);
  });

  // Référents pédagogiques actuellement sélectionnés pour chaque société
  // de cette session. Source : inscription_referent_contacts (dédupliqué
  // au niveau session × société). Cf. lib/inscriptions/referents.ts.
  const referentsByCompany = new Map<
    string,
    Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      job_title: string | null;
    }>
  >();
  if (companyIds.length > 0) {
    const refResults = await Promise.all(
      companyIds.map((cid) =>
        import("@/lib/inscriptions/referents").then((m) =>
          m
            .getReferentContactsForSessionCompany(supabase, id, cid)
            .then((list) => [cid, list] as const),
        ),
      ),
    );
    for (const [cid, list] of refResults) {
      referentsByCompany.set(cid, list);
    }
  }

  const title = session.formation?.title ?? "Session";
  const resendOn = isResendConfigured();

  // Date range pour les emails de pré-notification (Gilles 2026-05-22).
  const dateRange = (() => {
    const s = session.start_date;
    const e = session.end_date;
    if (!s || !e) return "";
    const sObj = new Date(s);
    const eObj = new Date(e);
    if (s === e) {
      return `le ${sObj.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
    }
    return `du ${sObj.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${eObj.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
  })();
  const companies = Array.from(byCompany.values()).sort((a, b) =>
    a.companyName.localeCompare(b.companyName, "fr"),
  );

  // === Précalcul Montant HT + Source d'inscription par société ===
  // (Gilles 2026-05-22 — colonnes ajoutées au tableau Conventions pour
  // vérifier le montant AVANT de générer + voir le canal d'inscription.)

  // Nb réel de jours = count(session_days)
  const { count: daysCount } = await supabase
    .from("session_days")
    .select("id", { count: "exact", head: true })
    .eq("session_id", id);
  const nbJours = daysCount ?? 0;

  // Inscriptions de la session (par société) — utilisé pour Montant HT
  // (fallback enrollment vide → bug constaté) ET pour la source d'inscription.
  // On charge aussi quote_amount_ht : c'est le montant saisi explicitement
  // à l'inscription, utilisé en fallback final si la cascade R7 ne donne
  // rien (cas des sessions sans pricing_mode défini — Gilles 2026-05-22).
  const { data: companyInscriptions } = await supabase
    .from("inscription_requests")
    .select(
      "company_id, inscription_channel, inscription_channel_company_id, quote_amount_ht, referrer:companies!inscription_channel_company_id(name, type)",
    )
    .eq("target_session_id", id)
    .in(
      "company_id",
      companyIds.length > 0 ? companyIds : ["00000000-0000-0000-0000-000000000000"],
    );

  // Nombre total d'apprenants sur la session (toutes sociétés confondues)
  // — pour le mode forfait. On utilise le MAX entre enrollments et
  // inscriptions pour rester cohérent même si la sync miroir est en retard.
  const [{ count: totalEnroll }, { count: totalReq }] = await Promise.all([
    supabase
      .from("session_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("session_id", id),
    supabase
      .from("inscription_requests")
      .select("id", { count: "exact", head: true })
      .eq("target_session_id", id),
  ]);
  const nbApprenantsTotal = Math.max(totalEnroll ?? 0, totalReq ?? 0);

  // Compte des apprenants par société (via inscriptions, plus fiable)
  // + somme des quote_amount_ht (fallback Montant HT explicite si la
  // cascade R7 ne donne rien).
  const inscriptionsByCompany = new Map<string, string[]>();
  const channelsByCompany = new Map<string, Set<string>>();
  // Nom du partenaire (OF / prescripteur) qui a inscrit pour cette société
  // → utilisé dans la colonne SOURCE D'INSCRIPTION à la place du label
  // générique "OF" / "Prescripteur" (Gilles 2026-05-22).
  const partnerNameByCompany = new Map<string, string>();
  // Nom de l'OF PARTENAIRE (type='of') qui a inscrit pour cette société.
  // Si rempli → la convention est à la charge de l'OF, CAP NUMERIQUE
  // masque ses boutons d'envoi/édition.
  const partnerOfNameByCompany = new Map<string, string>();
  const quoteAmountByCompany = new Map<
    string,
    { total: number; nbWithQuote: number }
  >();
  for (const row of (companyInscriptions ?? []) as Array<{
    company_id: string | null;
    inscription_channel: string | null;
    inscription_channel_company_id: string | null;
    quote_amount_ht: number | null;
    referrer:
      | { name: string; type: string | null }
      | Array<{ name: string; type: string | null }>
      | null;
  }>) {
    if (!row.company_id) continue;
    const list = inscriptionsByCompany.get(row.company_id) ?? [];
    list.push(row.company_id);
    inscriptionsByCompany.set(row.company_id, list);
    const channels = channelsByCompany.get(row.company_id) ?? new Set<string>();
    channels.add(row.inscription_channel ?? "direct");
    channelsByCompany.set(row.company_id, channels);
    const ref = Array.isArray(row.referrer) ? row.referrer[0] : row.referrer;
    if (ref?.name) {
      partnerNameByCompany.set(row.company_id, ref.name);
      if (ref.type === "of") {
        partnerOfNameByCompany.set(row.company_id, ref.name);
      }
    }
    if (row.quote_amount_ht !== null && row.quote_amount_ht !== undefined) {
      const cur = quoteAmountByCompany.get(row.company_id) ?? {
        total: 0,
        nbWithQuote: 0,
      };
      cur.total += Number(row.quote_amount_ht);
      cur.nbWithQuote += 1;
      quoteAmountByCompany.set(row.company_id, cur);
    }
  }

  const cfg: SessionPricingConfig | null = session.pricing_mode
    ? {
        mode: session.pricing_mode,
        pricePerDayHt: session.price_per_day_ht,
        priceForfaitHt: session.price_forfait_ht,
        priceExtraPerDayHt: session.price_extra_per_day_ht,
        threshold: session.pricing_threshold,
      }
    : null;

  // Map company_id → { unitHt, totalHt, source }
  const computedByCompany = new Map<
    string,
    {
      unitHt: number;
      totalHt: number;
      channels: string[];
      nbApprenants: number;
    }
  >();
  for (const c of companies) {
    const nbCompany = Math.max(
      inscriptionsByCompany.get(c.companyId)?.length ?? 0,
      c.learners.length,
    );
    let unitHt = 0;
    let totalHt = 0;
    if (cfg && nbJours > 0) {
      const r = computeConventionAmount(
        cfg,
        nbCompany,
        nbApprenantsTotal,
        nbJours,
      );
      unitHt = r.unitHt;
      totalHt = r.totalHt;
    }
    if (unitHt === 0 || totalHt === 0) {
      // Fallback legacy : prix session ou prix formation
      const legacyUnit =
        session.amount_ht ??
        session.formation?.price_company ??
        session.formation?.public_price_excl_tax ??
        0;
      if (Number(legacyUnit) > 0) {
        unitHt = Number(legacyUnit);
        totalHt = unitHt * nbCompany;
      }
    }
    if (unitHt === 0 || totalHt === 0) {
      // Dernier recours : moyenne des quote_amount_ht des inscriptions
      // (montant saisi explicitement à l'inscription — Gilles 2026-05-22).
      const q = quoteAmountByCompany.get(c.companyId);
      if (q && q.nbWithQuote > 0) {
        unitHt = q.total / q.nbWithQuote;
        totalHt = unitHt * nbCompany;
      }
    }
    const channelsSet = channelsByCompany.get(c.companyId);
    const channels = channelsSet ? Array.from(channelsSet).sort() : ["direct"];
    computedByCompany.set(c.companyId, {
      unitHt,
      totalHt,
      channels,
      nbApprenants: nbCompany,
    });

    // Auto-fix silencieux : si une convention existe avec un montant
    // figé à 0 et que le calcul donne un montant > 0, on met à jour la
    // BDD pour faire disparaître le warning (Gilles 2026-05-22).
    const conv = conventionByCompany.get(c.companyId);
    if (
      conv &&
      (conv.amount_ht_total === null ||
        Number(conv.amount_ht_total) === 0) &&
      unitHt > 0 &&
      totalHt > 0
    ) {
      const { error: updErr } = await supabase
        .from("session_conventions")
        .update({ amount_ht_unit: unitHt, amount_ht_total: totalHt })
        .eq("id", conv.id);
      if (updErr) {
        console.warn(
          "[conventions/page] auto-fix montant a échoué",
          { conventionId: conv.id, error: updErr.message },
        );
      } else {
        // Mise à jour locale pour cohérence d'affichage immédiate
        conv.amount_ht_unit = unitHt;
        conv.amount_ht_total = totalHt;
      }
    }
  }

  function formatEur(n: number): string {
    return n.toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    });
  }
  function channelLabel(c: string): string {
    if (c === "prescripteur") return "Prescripteur";
    if (c === "of") return "OF";
    return "CAP NUMERIQUE";
  }
  function channelClass(c: string): string {
    if (c === "prescripteur")
      return "bg-blue-100 text-blue-800 border-blue-200";
    if (c === "of")
      return "bg-violet-100 text-violet-800 border-violet-200";
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  }

  const signedCount = Array.from(conventionByCompany.values()).filter(
    (c) => c.status === "signed",
  ).length;

  // Items pour la modale "Renvoyer…" — chaque ligne = 1 apprenant + son RH
  const resendItems = rows.map((r) => {
    const rh = r.learner?.company_id
      ? primaryContactByCompany.get(r.learner.company_id)
      : null;
    return {
      enrollmentId: r.id,
      name:
        [r.learner?.first_name, r.learner?.last_name].filter(Boolean).join(" ") ||
        "Apprenant inconnu",
      apprenantEmail: r.learner?.email ?? null,
      alreadySent: !!r.inscription_email_sent_at,
      sentAt: r.inscription_email_sent_at,
      rhName: rh?.name ?? null,
      rhEmail: rh?.email ?? null,
    };
  });

  return (
    <>
      <PageHeader
        title="Conventions de formation"
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
          { label: "Conventions" },
        ]}
        actions={<BackButton fallbackHref={`/sessions/${id}`} />}
      />

      <SessionTabs sessionId={id} counts={{ conventions: signedCount }} />

      <div className="p-8 space-y-4">
        {!resendOn && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 leading-relaxed">
              Resend non configuré — les boutons d&apos;envoi seront inactifs.
            </p>
          </div>
        )}

        <div className="rounded-lg bg-cyan-50/50 border border-cyan-200 p-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-cyan-700 shrink-0 mt-0.5" />
          <p className="text-xs text-cyan-900 leading-relaxed">
            Une <strong>convention</strong> est générée par entreprise cliente
            inscrite à cette session. Elle est envoyée par email au contact
            principal de l&apos;entreprise (RH) avec un lien de signature en
            ligne.
          </p>
        </div>

        {/* Bouton bulk : notifier les inscriptions */}
        <div className="rounded-xl bg-white border border-zinc-200 p-4 space-y-3">
          <div>
            <strong className="text-sm">Email de confirmation d&apos;inscription</strong>
            <ul className="text-xs text-zinc-600 mt-1 space-y-0.5">
              <li>
                <strong>« Notifier les inscriptions par email »</strong> :
                envoie uniquement aux apprenants{" "}
                <strong>pas encore notifiés</strong>. Le RH reçoit{" "}
                <strong>1 email récap par société</strong> avec la liste
                complète (les nouveaux sont marqués « NOUVEAU »). Idéal après
                avoir inscrit un nouvel apprenant.
              </li>
              <li>
                <strong>« Renvoyer… »</strong> : ouvre une modale pour{" "}
                <strong>choisir précisément</strong> qui recevra l&apos;email
                (utile pour rattrapage ou suite à modification du contenu).
              </li>
            </ul>
          </div>
          <div className="flex items-center justify-end gap-2 flex-wrap">
            {/* Bouton "Prévenir tous par Gmail" : ouvre Gmail compose
                avec tous les contacts RH en CCI + message anti-spam
                pré-rédigé (Gilles 2026-05-22 — migration 0097). */}
            <BulkPreNotifyGmailButton
              sessionId={id}
              recipients={Array.from(conventionByCompany.entries())
                .filter(
                  ([cid, conv]) =>
                    !partnerOfNameByCompany.has(cid) && Boolean(conv.contact_email),
                )
                .map(([, conv]) => ({
                  conventionId: conv.id,
                  email: conv.contact_email ?? "",
                  contactName: conv.contact_name ?? "Madame, Monsieur",
                }))}
              formationTitle={title}
              dateRange={dateRange}
              authUserEmail={currentUserEmail}
              trainerPhone={trainerPhone}
            />
            <ResendModal items={resendItems} disabled={!resendOn} />
            <NotifyInscriptionsButton sessionId={id} disabled={!resendOn} />
          </div>
        </div>

        {orphans.length > 0 && (
          <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-xs text-orange-900">
            ⚠️ Apprenants <strong>sans entreprise</strong> rattachée (donc sans
            convention possible) : {orphans.join(", ")}. Va sur la fiche
            apprenant pour rattacher une entreprise.
          </div>
        )}

        {companies.length === 0 ? (
          <div className="rounded-xl bg-white border border-zinc-200 p-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-zinc-300 mb-3" />
            <p className="text-sm font-medium mb-1">
              Aucune entreprise rattachée
            </p>
            <p className="text-xs text-zinc-500">
              Inscris des apprenants avec une entreprise pour générer des
              conventions.
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-white border border-zinc-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200">
                <tr>
                  <th className="px-4 py-3">Entreprise</th>
                  <th className="px-4 py-3">Apprenants</th>
                  <th className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      Montant HT
                      <span
                        title="Montant HT calculé pour cette société (tarif cascade R7). À vérifier avant de générer la convention."
                        className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-zinc-200 text-zinc-600 text-[10px] font-bold cursor-help normal-case hover:bg-zinc-300"
                      >
                        ?
                      </span>
                    </span>
                  </th>
                  <th className="px-4 py-3 leading-tight">
                    Source
                    <br />
                    d&apos;inscription
                  </th>
                  <th className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      Référent Pédagogique
                      <span
                        title={
                          "Sélectionnez un ou plusieurs contacts de la société qui doivent recevoir les emails de cette session (convention, convocation, attestation, facture…).\n\n• Si AU MOINS UN référent est sélectionné : il(s) reçoivent les documents, l'apprenant est en copie.\n\n• Si AUCUN référent : l'apprenant reçoit directement l'ensemble des documents."
                        }
                        className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-zinc-200 text-zinc-600 text-[10px] font-bold cursor-help normal-case hover:bg-zinc-300"
                      >
                        ?
                      </span>
                    </span>
                  </th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {companies.map((c) => {
                  const conv = conventionByCompany.get(c.companyId);
                  return (
                    <tr
                      key={c.companyId}
                      className={cn(
                        "transition-colors hover:bg-zinc-50/60",
                        conv?.status === "signed" &&
                          "bg-emerald-50/30 hover:bg-emerald-50",
                        conv?.status === "sent" &&
                          "bg-cyan-50/30 hover:bg-cyan-50",
                      )}
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="font-bold text-zinc-900">
                          {c.companyName}
                        </div>
                        {c.industry && (
                          <div className="text-xs text-zinc-500 mt-0.5">
                            {c.industry}
                          </div>
                        )}
                        {(c.postalCode || c.city) && (
                          <div className="text-xs text-zinc-500">
                            {[c.postalCode, c.city].filter(Boolean).join(" ")}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-600 align-top">
                        <div className="flex items-start gap-2">
                          <span className="inline-block px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 font-semibold shrink-0 mt-0.5">
                            {c.learners.length}
                          </span>
                          <ul className="space-y-2 leading-tight flex-1 min-w-0">
                            {c.learners.map((l) => (
                              <li key={l.id} className="space-y-0.5">
                                <div className="text-sm font-bold text-zinc-900">
                                  •{" "}
                                  {l.civility ? `${l.civility} ` : ""}
                                  {l.name}
                                </div>
                                {l.jobTitle && (
                                  <div className="text-zinc-600 ml-3">
                                    {l.jobTitle}
                                  </div>
                                )}
                                {l.email && (
                                  <div className="text-zinc-500 ml-3 truncate">
                                    ✉ {l.email}
                                  </div>
                                )}
                                {l.phone && (
                                  <div className="text-zinc-500 ml-3">
                                    ☎ {l.phone}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </td>

                      {/* === Montant HT (Gilles 2026-05-22) === */}
                      <td className="px-4 py-3 align-top text-right">
                        {(() => {
                          // Cas OF partenaire : CAP NUMERIQUE n'édite pas
                          // de convention avec le client final, mais facture
                          // l'OF en interne. On affiche donc le PRIX
                          // FACTURATION INTERNE = somme des quote_amount_ht
                          // saisis lors de l'inscription via le portail
                          // partenaire (Gilles 2026-05-22).
                          if (partnerOfNameByCompany.has(c.companyId)) {
                            const q = quoteAmountByCompany.get(c.companyId);
                            const nb = c.learners.length;
                            const total = q?.total ?? 0;
                            const unit =
                              q && q.nbWithQuote > 0
                                ? total / q.nbWithQuote
                                : 0;
                            if (total > 0) {
                              return (
                                <div className="space-y-0.5 inline-block text-right">
                                  <div className="text-sm font-bold text-zinc-900 tabular-nums">
                                    {formatEur(total)}
                                  </div>
                                  <div className="text-[10px] text-zinc-500 tabular-nums">
                                    {formatEur(unit)} × {nb}
                                  </div>
                                  <div className="text-[10px] text-indigo-700 font-bold uppercase tracking-wide">
                                    Facturation interne OF
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <span
                                className="text-[10px] italic text-rose-700"
                                title="Aucun tarif partenaire n'a été défini pour cet OF. Renseigne-le sur la fiche entreprise de l'OF (rubrique Tarif partenaire)."
                              >
                                Tarif OF non défini
                              </span>
                            );
                          }
                          const computed = computedByCompany.get(c.companyId);
                          if (!computed) return <span className="text-zinc-300">—</span>;
                          const conv = conventionByCompany.get(c.companyId);
                          const persisted = conv?.amount_ht_total ?? null;
                          // Warning si une convention existe et a un montant
                          // figé qui diffère du calcul (ex: montant 0 par
                          // bug historique).
                          const persistedZero =
                            persisted !== null && persisted === 0 && computed.totalHt > 0;
                          return (
                            <div className="space-y-0.5 inline-block">
                              <div className="text-sm font-bold text-zinc-900 tabular-nums">
                                {formatEur(computed.totalHt)}
                              </div>
                              <div className="text-[10px] text-zinc-500 tabular-nums">
                                {formatEur(computed.unitHt)} ×{" "}
                                {computed.nbApprenants}
                              </div>
                              {persistedZero && (
                                <div className="text-[10px] text-rose-700 font-bold">
                                  ⚠ Conv. figée à 0
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* === Source d'inscription (Gilles 2026-05-22) === */}
                      <td className="px-4 py-3 align-top text-xs">
                        {(() => {
                          const computed = computedByCompany.get(c.companyId);
                          const channels = computed?.channels ?? ["direct"];
                          const partnerName = partnerNameByCompany.get(
                            c.companyId,
                          );
                          return (
                            <div className="space-y-1">
                              {channels.map((ch) => {
                                // Si on connaît le nom du partenaire et que
                                // le canal est partenaire, on affiche le NOM
                                // (ex: "BATYS COMPETENCES PACA"). Sinon, on
                                // retombe sur le label générique.
                                const label =
                                  (ch === "of" || ch === "prescripteur") &&
                                  partnerName
                                    ? partnerName
                                    : channelLabel(ch);
                                return (
                                  <span
                                    key={ch}
                                    className={cn(
                                      "inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap",
                                      channelClass(ch),
                                    )}
                                  >
                                    {label}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </td>

                      <td className="px-4 py-3 text-xs align-top">
                        {(() => {
                          const referents =
                            referentsByCompany.get(c.companyId) ?? [];
                          const companyContactList =
                            contactsByCompany.get(c.companyId) ?? [];
                          if (referents.length > 0) {
                            return (
                              <div className="space-y-1.5">
                                <ul className="space-y-1">
                                  {referents.map((r) => {
                                    const name =
                                      [r.first_name, r.last_name]
                                        .filter(Boolean)
                                        .join(" ") || "Référent";
                                    return (
                                      <li key={r.id}>
                                        <div className="font-medium text-zinc-800">
                                          • {name}
                                        </div>
                                        {r.job_title && (
                                          <div className="text-[10.5px] text-zinc-600 ml-2.5">
                                            {r.job_title}
                                          </div>
                                        )}
                                        {r.email && (
                                          <div className="text-[10.5px] text-zinc-500 ml-2.5 truncate">
                                            ✉ {r.email}
                                          </div>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                                <ReferentsModal
                                  sessionId={id}
                                  companyId={c.companyId}
                                  companyName={c.companyName}
                                  contacts={companyContactList}
                                  initialSelectedIds={referents.map(
                                    (r) => r.id,
                                  )}
                                />
                              </div>
                            );
                          }
                          // Aucun référent sélectionné
                          return (
                            <div className="text-amber-700 space-y-1.5">
                              <div className="italic">
                                Aucun référent pédagogique
                              </div>
                              <div className="text-[10px] text-amber-600">
                                ↳ l&apos;apprenant recevra les documents
                              </div>
                              {companyContactList.length > 0 ? (
                                <ReferentsModal
                                  sessionId={id}
                                  companyId={c.companyId}
                                  companyName={c.companyName}
                                  contacts={companyContactList}
                                  initialSelectedIds={[]}
                                />
                              ) : (
                                <Link
                                  href={`/entreprises/${c.companyId}#contacts`}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-700 hover:text-cyan-900 hover:underline"
                                >
                                  + Ajouter un contact dans la société
                                </Link>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {!conv ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-700">
                            Non créée
                          </span>
                        ) : conv.status === "draft" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                            Brouillon
                          </span>
                        ) : conv.status === "sent" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-cyan-100 text-cyan-800">
                            Envoyée
                          </span>
                        ) : conv.status === "signed" ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800"
                            title={
                              conv.signed_by_name
                                ? `Signée par ${conv.signed_by_name}`
                                : undefined
                            }
                          >
                            <Check className="h-3 w-3" />
                            Signée
                          </span>
                        ) : conv.status === "obsolete" ? (
                          <div className="flex flex-col gap-1">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800"
                              title={conv.obsolete_reason ?? "À refaire"}
                            >
                              ⚠ Obsolète
                            </span>
                            <span className="text-[10px] text-orange-700 italic max-w-xs">
                              {conv.obsolete_reason ?? "Les inscriptions ont changé"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-zinc-500 text-xs italic">
                            {conv.status}
                          </span>
                        )}
                        {/* Affichage du mode de financement (toutes statuts) */}
                        {conv?.financing_mode && (
                          <div className="text-[10px] text-zinc-500 mt-1">
                            💳 {formatFinancingMode(conv.financing_mode)}
                          </div>
                        )}
                        {/* On affiche le montant figé sur la convention
                            UNIQUEMENT s'il est > 0 — la colonne Montant HT
                            à gauche montre déjà le calculé, donc afficher
                            "0,00 € HT" ici serait juste un doublon
                            anxiogène (Gilles 2026-05-22). */}
                        {conv?.amount_ht_total != null &&
                          conv.amount_ht_total > 0 && (
                            <div className="text-[10px] text-zinc-500">
                              {Number(conv.amount_ht_total).toLocaleString(
                                "fr-FR",
                                { minimumFractionDigits: 2 },
                              )}{" "}
                              € HT
                            </div>
                          )}
                        {/* Timeline mini-icônes du cycle de vie email
                            (Gilles 2026-05-22 — migration 0097). Pas
                            affichée pour les OF partenaires (CAP n'envoie
                            pas la convention). */}
                        {conv && !partnerOfNameByCompany.has(c.companyId) && (
                          <div className="mt-2">
                            <EmailStatusTimeline
                              sentAt={conv.sent_at}
                              deliveredAt={conv.delivered_at}
                              openedAt={conv.opened_at}
                              clickedAt={conv.clicked_at}
                              signedAt={conv.signed_at}
                              bouncedAt={conv.bounced_at}
                              complainedAt={conv.complained_at}
                              preNotifiedAt={conv.prenotified_at}
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {/* Si la société est inscrite via un OF partenaire,
                            la convention est à sa charge — CAP NUMERIQUE
                            n'a aucun bouton à proposer (Gilles 2026-05-22). */}
                        {partnerOfNameByCompany.has(c.companyId) ? (
                          <div className="flex flex-col items-stretch gap-1.5 min-w-[180px] max-w-[240px] ml-auto">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200 text-center justify-center"
                              title={`La convention est à la charge de l'OF partenaire ${partnerOfNameByCompany.get(c.companyId)} — CAP NUMERIQUE n'édite pas de convention dans ce cas.`}
                            >
                              À la charge de l&apos;OF{" "}
                              {partnerOfNameByCompany.get(c.companyId)}
                            </span>
                            {/* Bouton "Confirmer via Gmail" par apprenant
                                de la société OF (Gilles 2026-05-22) :
                                ouvre Gmail avec l'email de confirmation
                                d'inscription + promesse connexion 48h
                                avant. Un bouton par apprenant. */}
                            {c.learners.map((l) =>
                              l.email ? (
                                <ConfirmInscriptionGmailButton
                                  key={l.id}
                                  toEmail={l.email}
                                  learnerCivility={l.civility}
                                  learnerName={l.name}
                                  formationTitle={title}
                                  dateRange={dateRange}
                                  authUserEmail={currentUserEmail}
                                  trainerPhone={trainerPhone}
                                  partnerOfName={
                                    partnerOfNameByCompany.get(c.companyId) ?? ""
                                  }
                                />
                              ) : null,
                            )}
                          </div>
                        ) : (
                        <div className="flex flex-col items-stretch gap-1.5 min-w-[180px] max-w-[220px] ml-auto">
                          {conv && (
                            <Button
                              variant="outline"
                              size="sm"
                              nativeButton={false}
                              render={
                                <Link
                                  href={`/api/sessions/${id}/conventions/${conv.id}/pdf`}
                                  target="_blank"
                                />
                              }
                              title="Ouvrir le PDF (rendu IDENTIQUE à celui envoyé par email)"
                            >
                              <Printer className="h-3.5 w-3.5" />
                              Aperçu PDF
                            </Button>
                          )}
                          {/* Bouton "Prévenir par Gmail" (anti-spam —
                              Gilles 2026-05-22). Ouvre Gmail compose
                              pré-rempli avec un message d'avertissement
                              spam. Marque la convention comme pré-notifiée. */}
                          {conv && conv.contact_email && (
                            <PreNotifyGmailButton
                              sessionId={id}
                              conventionId={conv.id}
                              toEmail={conv.contact_email}
                              contactName={conv.contact_name ?? "Madame, Monsieur"}
                              formationTitle={title}
                              dateRange={dateRange}
                              authUserEmail={currentUserEmail}
                              trainerPhone={trainerPhone}
                              alreadySent={Boolean(conv.prenotified_at)}
                            />
                          )}
                          <EnsureAndSendConventionButton
                            sessionId={id}
                            companyId={c.companyId}
                            conventionId={conv?.id ?? null}
                            disabled={
                              !resendOn || conv?.status === "signed"
                            }
                            disabledReason={
                              !resendOn
                                ? "Resend non configuré"
                                : conv?.status === "signed"
                                  ? "Déjà signée"
                                  : undefined
                            }
                            alreadySent={conv?.status === "sent"}
                          />
                          {/* Bouton "Modifier" : pour ajuster le prix unitaire,
                              le mode de financement et le contact RH. */}
                          {conv && (
                            <ConventionEditButton
                              sessionId={id}
                              initial={{
                                conventionId: conv.id,
                                contactName: conv.contact_name,
                                contactEmail: conv.contact_email,
                                amountHtUnit: conv.amount_ht_unit,
                                financingMode: conv.financing_mode,
                                nbApprenants: c.learners.length,
                              }}
                            />
                          )}
                          {/* Bouton "Recalculer" : visible si le montant
                              persisté est à 0 € (bug auto-update silencieux).
                              Gilles 2026-05-22 — fix Mme TORRES. */}
                          {conv &&
                            (conv.amount_ht_total === null ||
                              Number(conv.amount_ht_total) === 0) && (
                              <RecomputeAmountButton
                                sessionId={id}
                                conventionId={conv.id}
                              />
                            )}
                          {/* Bouton "Partager" : QR code + lien direct,
                              utile si l'email est filtré par anti-spam
                              (Outlook/Mailinblack). Gilles 2026-05-22. */}
                          {conv && (
                            <ShareConventionButton conventionId={conv.id} />
                          )}
                          {/* Bouton "Annuler" : disponible sur toute convention
                              existante (brouillon, envoyée, signée, obsolète).
                              Permet de recréer une convention propre. */}
                          {conv && (
                            <CancelConventionButton
                              sessionId={id}
                              conventionId={conv.id}
                              isSigned={conv.status === "signed"}
                            />
                          )}
                        </div>
                        )}
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

/**
 * Convertit le code interne du mode de financement en libellé lisible.
 */
function formatFinancingMode(code: string): string {
  const map: Record<string, string> = {
    opco: "OPCO",
    plan_developpement: "Plan de développement",
    cpf: "CPF",
    autofinancement: "Autofinancement",
    pole_emploi: "Pôle Emploi",
    fse: "FSE",
    region: "Région",
    autre: "Autre",
  };
  return map[code] ?? code;
}
