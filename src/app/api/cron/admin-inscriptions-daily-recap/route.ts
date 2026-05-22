/**
 * CRON quotidien (17h Paris) : récap admin des nouvelles inscriptions
 * reçues au cours des dernières 24h, envoyé à l'email de l'organisation.
 *
 * Gilles 2026-05-22 — demande explicite pour avoir une visibilité
 * quotidienne sur l'activité commerciale (sans avoir à aller checker
 * /inscriptions chaque jour).
 *
 * Logique :
 *   1. Pour chaque organisation, cherche les inscription_requests
 *      reçues depuis le précédent récap (dernières 24h).
 *   2. Si aucune nouvelle inscription → pas d'email (anti-spam).
 *   3. Sinon → email récap structuré envoyé à organizations.email
 *      avec : nb total, liste détaillée, lien vers /inscriptions.
 *
 * Source des inscriptions :
 *   - Pré-inscription publique (partner)
 *   - Portail partenaire authentifié (partner)
 *   - Création directe admin (autre)
 *
 * Sécurité : header `Authorization: Bearer <CRON_SECRET>` (Vercel
 * l'envoie automatiquement). Configuration dans `vercel.json`.
 *
 * Planification : « 0 15 * * * » (15h UTC = 17h Paris été, 16h hiver).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type RequestRow = {
  id: string;
  organization_id: string;
  received_at: string;
  source: string | null;
  source_details: string | null;
  prospect_first_name: string | null;
  prospect_last_name: string | null;
  prospect_email: string | null;
  company_name_freetext: string | null;
  learner:
    | {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        company: { name: string } | null;
      }
    | Array<{
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        company: { name: string } | null;
      }>
    | null;
  session:
    | {
        start_date: string | null;
        formation: { title: string } | Array<{ title: string }> | null;
      }
    | Array<{
        start_date: string | null;
        formation: { title: string } | Array<{ title: string }> | null;
      }>
    | null;
  referrer:
    | { name: string | null }
    | Array<{ name: string | null }>
    | null;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSessionDate(iso: string | null): string {
  if (!iso) return "Date non renseignée";
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null;
  if (expected && auth !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, {
      status: 401,
    });
  }

  if (!isResendConfigured()) {
    return NextResponse.json({
      ok: false,
      error: "Resend non configuré",
    });
  }

  const supabase = createAdminClient();
  // Inscriptions reçues dans les dernières 24h
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: requests, error } = await supabase
    .from("inscription_requests")
    .select(
      `id, organization_id, received_at, source, source_details,
       prospect_first_name, prospect_last_name, prospect_email,
       company_name_freetext,
       learner:learners(first_name, last_name, email, company:companies(name)),
       session:sessions(start_date, formation:formations(title)),
       referrer:companies!referrer_company_id(name)`,
    )
    .gte("received_at", since)
    .order("received_at", { ascending: false });

  if (error) {
    console.error("[admin-recap-daily] select error:", error.message);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const rows = (requests ?? []) as unknown as RequestRow[];
  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      message: "Aucune nouvelle inscription dans les 24h — pas d'email envoyé",
    });
  }

  // Groupage par organisation
  const byOrg = new Map<string, RequestRow[]>();
  for (const r of rows) {
    const list = byOrg.get(r.organization_id) ?? [];
    list.push(r);
    byOrg.set(r.organization_id, list);
  }

  const orgIds = Array.from(byOrg.keys());
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, email")
    .in("id", orgIds);
  const orgInfo = new Map<string, { name: string; email: string | null }>();
  for (const o of (orgs ?? []) as Array<{
    id: string;
    name: string;
    email: string | null;
  }>) {
    orgInfo.set(o.id, { name: o.name, email: o.email });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com";
  let sent = 0;
  const failures: Array<{ orgId: string; reason: string }> = [];

  for (const [orgId, orgRows] of byOrg) {
    const org = orgInfo.get(orgId);
    if (!org?.email) {
      failures.push({ orgId, reason: "Email organisation manquant" });
      continue;
    }

    const itemsHtml = orgRows
      .map((r) => {
        const learner = Array.isArray(r.learner) ? r.learner[0] : r.learner;
        const session = Array.isArray(r.session) ? r.session[0] : r.session;
        const formationRel = session?.formation;
        const formation = Array.isArray(formationRel)
          ? formationRel[0]
          : formationRel;
        const referrer = Array.isArray(r.referrer) ? r.referrer[0] : r.referrer;

        const apprenantName =
          [
            learner?.first_name ?? r.prospect_first_name,
            learner?.last_name ?? r.prospect_last_name,
          ]
            .filter(Boolean)
            .join(" ") || "Apprenant inconnu";
        const apprenantEmail =
          learner?.email ?? r.prospect_email ?? "—";
        const entreprise =
          learner?.company?.name ?? r.company_name_freetext ?? "—";
        const formationTitle = formation?.title ?? "Formation non précisée";
        const sessionDate = formatSessionDate(session?.start_date ?? null);
        const sourceLabel = referrer?.name
          ? `via <strong>${referrer.name}</strong>`
          : r.source === "partenaire"
            ? "Portail partenaire"
            : "Création directe";

        return `<li style="margin:0 0 14px 0;padding:10px 12px;background:#f8fafc;border-radius:8px;border-left:3px solid #06b6d4;">
  <div><strong style="color:#0f172a;">${apprenantName}</strong> — <a href="mailto:${apprenantEmail}" style="color:#0369a1;">${apprenantEmail}</a></div>
  <div style="color:#475569;font-size:13px;margin-top:2px;">${entreprise}</div>
  <div style="color:#0f172a;font-size:13px;margin-top:4px;">📚 ${formationTitle} <span style="color:#64748b;">— ${sessionDate}</span></div>
  <div style="color:#64748b;font-size:12px;margin-top:2px;">${sourceLabel} · reçu ${formatDate(r.received_at)}</div>
</li>`;
      })
      .join("");

    const itemsText = orgRows
      .map((r) => {
        const learner = Array.isArray(r.learner) ? r.learner[0] : r.learner;
        const session = Array.isArray(r.session) ? r.session[0] : r.session;
        const formationRel = session?.formation;
        const formation = Array.isArray(formationRel)
          ? formationRel[0]
          : formationRel;
        const referrer = Array.isArray(r.referrer) ? r.referrer[0] : r.referrer;
        const apprenantName =
          [
            learner?.first_name ?? r.prospect_first_name,
            learner?.last_name ?? r.prospect_last_name,
          ]
            .filter(Boolean)
            .join(" ") || "Apprenant inconnu";
        const entreprise =
          learner?.company?.name ?? r.company_name_freetext ?? "—";
        const formationTitle = formation?.title ?? "Formation non précisée";
        const sessionDate = formatSessionDate(session?.start_date ?? null);
        const src = referrer?.name ? `via ${referrer.name}` : "direct";
        return `- ${apprenantName} (${entreprise}) — ${formationTitle} le ${sessionDate} [${src}]`;
      })
      .join("\n");

    const subject = `📋 Récap inscriptions du jour — ${orgRows.length} nouvelle${orgRows.length > 1 ? "s" : ""} inscription${orgRows.length > 1 ? "s" : ""}`;
    const html = `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:640px;margin:0 auto;line-height:1.5;">
  <h2 style="color:#0f172a;font-size:20px;margin:0 0 4px 0;">Récap quotidien des inscriptions</h2>
  <p style="color:#64748b;margin:0 0 18px 0;font-size:13px;">${org.name} · dernières 24h</p>
  <div style="background:linear-gradient(135deg,#06b6d4 0%,#3b82f6 100%);color:white;padding:16px 20px;border-radius:10px;margin:0 0 20px 0;">
    <div style="font-size:32px;font-weight:bold;line-height:1;">${orgRows.length}</div>
    <div style="font-size:13px;opacity:0.95;margin-top:4px;">nouvelle${orgRows.length > 1 ? "s" : ""} inscription${orgRows.length > 1 ? "s" : ""} en 24h</div>
  </div>
  <ul style="list-style:none;padding:0;margin:0 0 20px 0;">${itemsHtml}</ul>
  <p style="text-align:center;margin:24px 0;">
    <a href="${origin}/inscriptions" style="display:inline-block;padding:12px 24px;background:#0f172a;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">
      Ouvrir le module Inscriptions
    </a>
  </p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px 0;"/>
  <p style="font-size:11px;color:#94a3b8;text-align:center;">
    Email automatique généré à 17h00 (heure de Paris). Vous le recevez
    uniquement les jours où il y a eu au moins une inscription.
  </p>
</div>`.trim();

    const text = `Récap quotidien des inscriptions — ${org.name}

${orgRows.length} nouvelle${orgRows.length > 1 ? "s" : ""} inscription${orgRows.length > 1 ? "s" : ""} dans les dernières 24h :

${itemsText}

Ouvrir le module Inscriptions : ${origin}/inscriptions

---
Email automatique 17h. Pas envoyé si aucune inscription dans les 24h.`;

    const result = await sendEmail({
      to: org.email,
      toName: org.name,
      subject,
      html,
      text,
    });
    if (result.ok) {
      sent += 1;
    } else {
      failures.push({ orgId, reason: result.error ?? "send error" });
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    organizations: orgIds.length,
    inscriptions: rows.length,
    failures: failures.length > 0 ? failures : undefined,
  });
}
