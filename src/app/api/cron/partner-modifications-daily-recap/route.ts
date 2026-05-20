/**
 * CRON quotidien (17h Paris) : recap des modifications effectuees par
 * les partenaires (OF/prescripteurs) dans leur onglet « Mes inscriptions »
 * du portail au cours des 24 dernieres heures.
 *
 * Concerne les events `inscription_events` de type :
 *   - `edited` (modification d'apprenant) issus du portail partenaire
 *   - `deleted_by_partner` (suppression d'inscription)
 *
 * Pas d'email s'il n'y a eu aucune modification dans les 24h (anti-spam).
 *
 * Securite : header `Authorization: Bearer <CRON_SECRET>` (Vercel l'envoie
 * automatiquement). Configuration dans `vercel.json`.
 *
 * Planification : « 0 15 * * * » (15h UTC = 17h Paris ete, 16h hiver).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type EventRow = {
  id: string;
  request_id: string;
  event_type: string;
  payload: {
    partner_company_name?: string | null;
    learner_name?: string | null;
    learner_email?: string | null;
  } | null;
  created_at: string;
  request: {
    organization_id: string;
    prospect_first_name: string | null;
    prospect_last_name: string | null;
    prospect_email: string | null;
    referrer: { name: string | null } | Array<{ name: string | null }> | null;
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
  } | Array<unknown> | null;
};

export async function GET(request: NextRequest) {
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
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // Recupere les events des dernieres 24h types « edited » ou
  // « deleted_by_partner ». On joint la request pour avoir l'apprenant,
  // la session et le referrer (partenaire).
  const { data: events, error } = await supabase
    .from("inscription_events")
    .select(
      `
      id, request_id, event_type, payload, created_at,
      request:inscription_requests(
        organization_id,
        prospect_first_name, prospect_last_name, prospect_email,
        referrer:companies!referrer_company_id(name),
        session:sessions!target_session_id(
          start_date,
          formation:formations!inner(title)
        )
      )
    `,
    )
    .in("event_type", ["edited", "deleted_by_partner"])
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  // Filtre les events lies a une request portail partenaire (referrer
  // present). Les events « edited » d'admin sans partenaire ne nous
  // interessent pas ici.
  const partnerEvents = ((events ?? []) as unknown as EventRow[]).filter(
    (ev) => {
      const req = Array.isArray(ev.request) ? ev.request[0] : ev.request;
      if (!req || typeof req !== "object") return false;
      const ref =
        "referrer" in req && req.referrer
          ? Array.isArray(req.referrer)
            ? req.referrer[0]
            : req.referrer
          : null;
      return Boolean(ref?.name);
    },
  );

  if (partnerEvents.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "Aucune modification cote partenaire dans les 24h.",
      sent: 0,
    });
  }

  // Grouper par organisation pour envoyer 1 email a l'admin de chaque
  // orga (typiquement Gilles pour CAP NUMERIQUE).
  const byOrg = new Map<string, EventRow[]>();
  for (const ev of partnerEvents) {
    const req = Array.isArray(ev.request) ? ev.request[0] : ev.request;
    if (!req || typeof req !== "object" || !("organization_id" in req)) continue;
    const orgId = req.organization_id as string;
    const list = byOrg.get(orgId) ?? [];
    list.push(ev);
    byOrg.set(orgId, list);
  }

  // Recuperer l'email admin de chaque orga
  const orgIds = Array.from(byOrg.keys());
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, email")
    .in("id", orgIds);
  const orgById = new Map(
    (orgs ?? []).map((o) => [
      o.id as string,
      o as { id: string; name: string; email: string | null },
    ]),
  );

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com";

  let sent = 0;
  const errors: string[] = [];

  for (const [orgId, list] of byOrg.entries()) {
    const org = orgById.get(orgId);
    if (!org?.email) {
      errors.push(`org ${orgId} : pas d'email admin`);
      continue;
    }

    const itemsHtml = list
      .map((ev) => {
        const req = Array.isArray(ev.request) ? ev.request[0] : ev.request;
        const r = req as unknown as {
          prospect_first_name?: string | null;
          prospect_last_name?: string | null;
          prospect_email?: string | null;
          referrer?:
            | { name: string | null }
            | Array<{ name: string | null }>
            | null;
          session?: unknown;
        };
        const ref = r.referrer
          ? Array.isArray(r.referrer)
            ? r.referrer[0]
            : r.referrer
          : null;
        const partnerName = ref?.name ?? "—";
        const sess =
          r.session && typeof r.session === "object"
            ? Array.isArray(r.session)
              ? (r.session as Array<{
                  start_date: string | null;
                  formation:
                    | { title: string | null }
                    | Array<{ title: string | null }>
                    | null;
                }>)[0]
              : (r.session as {
                  start_date: string | null;
                  formation:
                    | { title: string | null }
                    | Array<{ title: string | null }>
                    | null;
                })
            : null;
        const form = sess?.formation
          ? Array.isArray(sess.formation)
            ? sess.formation[0]
            : sess.formation
          : null;
        // Pour `deleted_by_partner` les infos sont dans payload (vu que la
        // request a été supprimée, request peut etre null sinon).
        const learnerName =
          ev.payload?.learner_name ??
          ([
            r.prospect_first_name ?? "",
            r.prospect_last_name ?? "",
          ]
            .join(" ")
            .trim() ||
            "—");
        const learnerEmail =
          ev.payload?.learner_email ?? r.prospect_email ?? "";
        const action =
          ev.event_type === "deleted_by_partner"
            ? "<span style='color:#b91c1c;font-weight:bold;'>SUPPRESSION</span>"
            : "<span style='color:#0e7490;font-weight:bold;'>Modification</span>";
        const hh = new Date(ev.created_at).toLocaleString("fr-FR", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `<li style="margin-bottom:8px;">
  ${action} — <strong>${learnerName}</strong> ${learnerEmail ? `(${learnerEmail})` : ""}<br/>
  <span style="color:#6b7280;font-size:12px;">${form?.title ?? ""} · par <strong>${partnerName}</strong> · ${hh}</span>
</li>`;
      })
      .join("");

    const subject = `${list.length} modification${list.length > 1 ? "s" : ""} d'inscriptions par vos partenaires`;
    const html = `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px;margin:0 auto;">
  <p>Bonjour,</p>
  <p>
    Récapitulatif des modifications effectuées par vos partenaires
    (OF / prescripteurs) dans leur espace « Mes inscriptions » au cours
    des dernières 24 heures :
  </p>
  <ul style="padding-left:20px;">${itemsHtml}</ul>
  <p style="font-size:12px;color:#6b7280;margin-top:24px;">
    Vous recevez cet email tous les jours à 17h s'il y a eu des
    modifications. Aucune action n'est requise sauf si une suppression
    nécessite votre attention (annulation de convocation, etc.).
  </p>
  <p style="text-align:center;margin:20px 0;">
    <a href="${origin}/inscriptions" style="display:inline-block;padding:10px 20px;background:#0891b2;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">
      Voir toutes les inscriptions
    </a>
  </p>
</div>`.trim();
    const text = `Modifications par vos partenaires (24h) :\n\n${list
      .map((ev) => {
        const req = Array.isArray(ev.request) ? ev.request[0] : ev.request;
        const r = req as { prospect_email?: string | null } | null;
        const action =
          ev.event_type === "deleted_by_partner" ? "SUPPRIME" : "modifie";
        return `- [${action}] ${ev.payload?.learner_name ?? r?.prospect_email ?? "?"}`;
      })
      .join("\n")}\n\nVoir : ${origin}/inscriptions`;

    try {
      await sendEmail({
        to: org.email,
        toName: org.name,
        subject,
        html,
        text,
      });
      sent += 1;
    } catch (e) {
      errors.push(
        `org ${org.name} : ${e instanceof Error ? e.message : "send failed"}`,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    orgs: byOrg.size,
    events: partnerEvents.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
