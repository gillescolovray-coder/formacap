/**
 * CRON quotidien : récap des pré-inscriptions du jour envoyé par email
 * à chaque partenaire (prescripteur/OF) qui en a reçu.
 *
 * Règle : si AUCUNE pré-inscription n'a été reçue dans les dernières 24h
 * pour un partenaire donné, on N'envoie PAS d'email. Pas de spam.
 *
 * Sécurité : route protégée par le secret Vercel `CRON_SECRET` envoyé
 * dans le header `Authorization: Bearer <secret>`. Configuration dans
 * `vercel.json` (ou Vercel Cron UI).
 *
 * Configuration cron suggérée (Vercel) — exécution chaque matin à 8h :
 *
 *   {
 *     "crons": [
 *       {
 *         "path": "/api/cron/preinscriptions-daily-recap",
 *         "schedule": "0 7 * * *"
 *       }
 *     ]
 *   }
 *
 * (7h UTC = 8h en France hiver, 9h en été — ajuster au goût.)
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vercel coupe les fonctions serverless après 10s par défaut ; on monte
// à 60s pour avoir le temps d'envoyer plusieurs emails séquentiellement.
export const maxDuration = 60;

type RequestRow = {
  id: string;
  organization_id: string;
  referrer_company_id: string;
  received_at: string | null;
  prospect_first_name: string | null;
  prospect_last_name: string | null;
  prospect_email: string | null;
  company_name_freetext: string | null;
  session:
    | {
        start_date: string | null;
        formation:
          | { title: string | null }
          | Array<{ title: string | null }>
          | null;
      }
    | Array<{
        start_date: string | null;
        formation:
          | { title: string | null }
          | Array<{ title: string | null }>
          | null;
      }>
    | null;
};

export async function GET(request: NextRequest) {
  // Authentification cron — Vercel envoie automatiquement le Bearer
  // `CRON_SECRET`. En dev local, on autorise sans token pour test rapide.
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
  }

  if (!isResendConfigured()) {
    return NextResponse.json({
      ok: true,
      message: "Resend non configuré, rien à envoyer.",
      sent: 0,
    });
  }

  const supabase = createAdminClient();

  // Fenêtre : les 24 dernières heures.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // Récupérer tous les stages `partner_preinscription` (un par organisation).
  const { data: stages } = await supabase
    .from("inscription_stages")
    .select("id, organization_id")
    .eq("key", "partner_preinscription");

  if (!stages || stages.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "Aucune organisation n'a le stage partner_preinscription.",
      sent: 0,
    });
  }
  const stageIds = stages.map((s) => s.id as string);

  // Toutes les pré-inscriptions créées dans les dernières 24h
  const { data: reqs, error: reqErr } = await supabase
    .from("inscription_requests")
    .select(
      `
      id, organization_id, referrer_company_id, received_at,
      prospect_first_name, prospect_last_name, prospect_email,
      company_name_freetext,
      session:sessions!target_session_id(
        start_date,
        formation:formations!inner(title)
      )
    `,
    )
    .in("stage_id", stageIds)
    .gte("received_at", since);
  if (reqErr) {
    return NextResponse.json(
      { ok: false, error: reqErr.message },
      { status: 500 },
    );
  }

  // Grouper par partenaire (referrer_company_id)
  const byPartner = new Map<string, RequestRow[]>();
  (reqs as unknown as RequestRow[] | null)?.forEach((r) => {
    if (!r.referrer_company_id) return;
    const list = byPartner.get(r.referrer_company_id) ?? [];
    list.push(r);
    byPartner.set(r.referrer_company_id, list);
  });

  if (byPartner.size === 0) {
    return NextResponse.json({
      ok: true,
      message: "Aucune pré-inscription dans les 24 dernières heures.",
      sent: 0,
    });
  }

  // Pour chaque partenaire : récupérer son contact + son token portail,
  // puis envoyer le récap.
  const partnerIds = Array.from(byPartner.keys());
  const [{ data: companies }, { data: tokens }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, email, organization_id")
      .in("id", partnerIds),
    supabase
      .from("partner_portal_tokens")
      .select("company_id, token")
      .in("company_id", partnerIds),
  ]);
  const companyById = new Map(
    (companies ?? []).map((c) => [
      c.id as string,
      c as {
        id: string;
        name: string;
        email: string | null;
        organization_id: string;
      },
    ]),
  );
  const tokenByCompany = new Map(
    (tokens ?? []).map((t) => [
      t.company_id as string,
      t.token as string,
    ]),
  );

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com";

  let sent = 0;
  const errors: string[] = [];

  for (const [partnerId, list] of byPartner.entries()) {
    const company = companyById.get(partnerId);
    if (!company?.email) {
      errors.push(`${company?.name ?? partnerId}: pas d'email de contact`);
      continue;
    }
    const portalToken = tokenByCompany.get(partnerId);
    const portalUrl = portalToken
      ? `${origin}/partenaire/${portalToken}/preinscriptions`
      : `${origin}/partenaire`;

    const itemsHtml = list
      .map((r) => {
        const sess = Array.isArray(r.session) ? r.session[0] : r.session;
        const form = sess?.formation
          ? Array.isArray(sess.formation)
            ? sess.formation[0]
            : sess.formation
          : null;
        const formationTitle = form?.title ?? "(formation supprimée)";
        const sessionDate = sess?.start_date
          ? new Date(sess.start_date + "T00:00:00").toLocaleDateString(
              "fr-FR",
              { day: "numeric", month: "long", year: "numeric" },
            )
          : "date inconnue";
        const learnerName =
          [r.prospect_first_name, r.prospect_last_name]
            .filter(Boolean)
            .join(" ") || "(nom manquant)";
        return `
<li style="margin-bottom:10px;">
  <strong>${learnerName}</strong>
  ${r.prospect_email ? `(${r.prospect_email})` : ""}
  ${r.company_name_freetext ? `— ${r.company_name_freetext}` : ""}<br/>
  <span style="color:#6b7280;font-size:12px;">
    ${formationTitle} — ${sessionDate}
  </span>
</li>`;
      })
      .join("");
    const itemsText = list
      .map((r) => {
        const sess = Array.isArray(r.session) ? r.session[0] : r.session;
        const form = sess?.formation
          ? Array.isArray(sess.formation)
            ? sess.formation[0]
            : sess.formation
          : null;
        const learnerName =
          [r.prospect_first_name, r.prospect_last_name]
            .filter(Boolean)
            .join(" ") || "(nom manquant)";
        return `- ${learnerName} ${r.prospect_email ? `(${r.prospect_email})` : ""} — ${form?.title ?? "?"} ${r.company_name_freetext ? `[${r.company_name_freetext}]` : ""}`;
      })
      .join("\n");

    const subject = `${list.length} pré-inscription${list.length > 1 ? "s" : ""} à valider — ${company.name}`;
    const html = `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px;margin:0 auto;">
  <p>Bonjour ${company.name},</p>
  <p>
    Voici le récapitulatif des pré-inscriptions reçues via votre lien
    public dans les dernières 24 heures —
    <strong>${list.length}</strong> demande${list.length > 1 ? "s" : ""}
    en attente de votre validation :
  </p>
  <ul style="padding-left:20px;">${itemsHtml}</ul>
  <p style="text-align:center;margin:24px 0;">
    <a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#0891b2;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">
      Accéder à mes pré-inscriptions à valider
    </a>
  </p>
  <p style="font-size:11px;color:#6b7280;">
    Vous recevez cet email parce que des pré-inscriptions ont été soumises
    via votre lien partenaire. Les jours sans nouvelle demande, aucun email
    n'est envoyé.
  </p>
</div>`.trim();
    const text = `Bonjour ${company.name},\n\n${list.length} pré-inscription${list.length > 1 ? "s" : ""} en attente :\n\n${itemsText}\n\nValidez ici : ${portalUrl}`;

    try {
      await sendEmail({
        to: company.email,
        toName: company.name,
        subject,
        html,
        text,
      });
      sent += 1;
    } catch (e) {
      errors.push(
        `${company.name}: ${e instanceof Error ? e.message : "send failed"}`,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    partners: byPartner.size,
    requests: reqs?.length ?? 0,
    errors: errors.length > 0 ? errors : undefined,
  });
}
