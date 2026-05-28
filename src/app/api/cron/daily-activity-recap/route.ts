/**
 * CRON quotidien UNIFIE : recap des INSCRIPTIONS + DESINSCRIPTIONS
 * de la journee.
 *
 * Gilles 2026-05-28 : "recevoir tous les jours un email avec
 * recapitulatif de toutes les inscriptions et desinscriptions de la
 * journee". Remplace a terme les crons admin-inscriptions-daily-recap
 * et partner-modifications-daily-recap qui ne couvraient chacun qu'une
 * partie du sujet.
 *
 * Sources :
 *  - Inscriptions = inscription_requests.received_at sur 24h
 *  - Desinscriptions = inscription_deletion_log.deleted_at sur 24h
 *    (couvre admin + partenaire + system grace au logger commun)
 *
 * Destinataire : ADMIN_DAILY_RECAP_EMAIL si defini en env, sinon
 * organizations.email. Permet de pointer vers une boite perso (ex.
 * gilles.colovray@capnumerique.com) plutot que vers la boite
 * generique de l'OF.
 *
 * Anti-spam : aucun email envoye si 0 inscription ET 0 desinscription.
 *
 * Securite : header `Authorization: Bearer <CRON_SECRET>` (Vercel).
 *
 * Planification : "0 15 * * *" (15h UTC = 17h Paris ete, 16h hiver).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type InscriptionRow = {
  id: string;
  organization_id: string;
  received_at: string;
  source: string | null;
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

type DeletionRow = {
  id: string;
  organization_id: string;
  learner_name: string | null;
  learner_email: string | null;
  company_name: string | null;
  session_start_date: string | null;
  formation_title: string | null;
  deleted_by_type: "admin" | "partner" | "system";
  deleted_at: string;
};

function pick<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtSessionDate(iso: string | null): string {
  if (!iso) return "Date non renseignée";
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function sourceLabel(src: string | null): string {
  switch (src) {
    case "partenaire":
      return "Portail partenaire";
    case "email":
      return "Email manuel";
    case "telephone":
      return "Téléphone";
    case "site_web":
      return "Site web";
    case "autre":
      return "Autre";
    default:
      return src ?? "Source inconnue";
  }
}

function deletedByLabel(t: "admin" | "partner" | "system"): string {
  switch (t) {
    case "admin":
      return "Admin OF";
    case "partner":
      return "Partenaire";
    case "system":
      return "Système";
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null;
  if (expected && auth !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (!isResendConfigured()) {
    return NextResponse.json({
      ok: false,
      error: "Resend non configuré",
    });
  }

  const supabase = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // 1. Inscriptions des 24h
  const { data: insRaw, error: insErr } = await supabase
    .from("inscription_requests")
    .select(
      `id, organization_id, received_at, source,
       prospect_first_name, prospect_last_name, prospect_email,
       company_name_freetext,
       learner:learners(first_name, last_name, email, company:companies(name)),
       session:sessions(start_date, formation:formations(title)),
       referrer:companies!referrer_company_id(name)`,
    )
    .gte("received_at", since)
    .order("received_at", { ascending: false });
  if (insErr) {
    return NextResponse.json(
      { ok: false, error: insErr.message },
      { status: 500 },
    );
  }

  // 2. Desinscriptions des 24h
  const { data: delRaw, error: delErr } = await supabase
    .from("inscription_deletion_log")
    .select(
      "id, organization_id, learner_name, learner_email, company_name, session_start_date, formation_title, deleted_by_type, deleted_at",
    )
    .gte("deleted_at", since)
    .order("deleted_at", { ascending: false });
  if (delErr) {
    return NextResponse.json(
      { ok: false, error: delErr.message },
      { status: 500 },
    );
  }

  const inscriptions = (insRaw ?? []) as unknown as InscriptionRow[];
  const deletions = (delRaw ?? []) as unknown as DeletionRow[];

  if (inscriptions.length === 0 && deletions.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      message: "Aucune activite dans les 24h — pas d'email envoye",
    });
  }

  // Groupage par organisation (union des 2 sources)
  const orgIds = new Set<string>([
    ...inscriptions.map((r) => r.organization_id),
    ...deletions.map((r) => r.organization_id),
  ]);
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, email")
    .in("id", Array.from(orgIds));
  const orgInfo = new Map<string, { name: string; email: string | null }>();
  for (const o of (orgs ?? []) as Array<{
    id: string;
    name: string;
    email: string | null;
  }>) {
    orgInfo.set(o.id, { name: o.name, email: o.email });
  }

  const overrideEmail = process.env.ADMIN_DAILY_RECAP_EMAIL?.trim() || null;
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com";

  let sent = 0;
  const failures: Array<{ orgId: string; reason: string }> = [];

  for (const orgId of orgIds) {
    const org = orgInfo.get(orgId);
    const toEmail = overrideEmail ?? org?.email ?? null;
    if (!toEmail) {
      failures.push({ orgId, reason: "Aucun email destinataire" });
      continue;
    }

    const orgIns = inscriptions.filter((r) => r.organization_id === orgId);
    const orgDel = deletions.filter((r) => r.organization_id === orgId);

    const subjectParts: string[] = [];
    if (orgIns.length > 0) {
      subjectParts.push(
        `${orgIns.length} inscription${orgIns.length > 1 ? "s" : ""}`,
      );
    }
    if (orgDel.length > 0) {
      subjectParts.push(
        `${orgDel.length} désinscription${orgDel.length > 1 ? "s" : ""}`,
      );
    }
    const subject = `[FORMACAP] ${subjectParts.join(" + ")} aujourd'hui`;

    // === Bloc HTML inscriptions ===
    const inscriptionsHtml =
      orgIns.length === 0
        ? `<p style="color:#777;font-style:italic;">Aucune nouvelle inscription dans les 24h.</p>`
        : `<table style="width:100%;border-collapse:collapse;font-size:13px;">
             <thead>
               <tr style="background:#f3f4f6;">
                 <th style="text-align:left;padding:6px;border-bottom:1px solid #e5e7eb;">Apprenant</th>
                 <th style="text-align:left;padding:6px;border-bottom:1px solid #e5e7eb;">Entreprise</th>
                 <th style="text-align:left;padding:6px;border-bottom:1px solid #e5e7eb;">Formation</th>
                 <th style="text-align:left;padding:6px;border-bottom:1px solid #e5e7eb;">Date session</th>
                 <th style="text-align:left;padding:6px;border-bottom:1px solid #e5e7eb;">Source</th>
                 <th style="text-align:left;padding:6px;border-bottom:1px solid #e5e7eb;">Reçue à</th>
               </tr>
             </thead>
             <tbody>
               ${orgIns
                 .map((r) => {
                   const learner = pick(r.learner);
                   const session = pick(r.session);
                   const formation = pick(session?.formation);
                   const referrer = pick(r.referrer);
                   const name =
                     [
                       learner?.first_name ?? r.prospect_first_name,
                       learner?.last_name ?? r.prospect_last_name,
                     ]
                       .filter(Boolean)
                       .join(" ") || "—";
                   const email =
                     learner?.email ?? r.prospect_email ?? "";
                   const company =
                     learner?.company?.name ??
                     r.company_name_freetext ??
                     "—";
                   const sourceTxt = referrer?.name
                     ? `${sourceLabel(r.source)} (${referrer.name})`
                     : sourceLabel(r.source);
                   return `
                   <tr>
                     <td style="padding:6px;border-bottom:1px solid #f3f4f6;">
                       <strong>${name}</strong>
                       ${email ? `<br/><span style="color:#777;font-size:11px;">${email}</span>` : ""}
                     </td>
                     <td style="padding:6px;border-bottom:1px solid #f3f4f6;">${company}</td>
                     <td style="padding:6px;border-bottom:1px solid #f3f4f6;">${formation?.title ?? "—"}</td>
                     <td style="padding:6px;border-bottom:1px solid #f3f4f6;">${fmtSessionDate(session?.start_date ?? null)}</td>
                     <td style="padding:6px;border-bottom:1px solid #f3f4f6;">${sourceTxt}</td>
                     <td style="padding:6px;border-bottom:1px solid #f3f4f6;">${fmtTime(r.received_at)}</td>
                   </tr>`;
                 })
                 .join("")}
             </tbody>
           </table>`;

    // === Bloc HTML desinscriptions ===
    const deletionsHtml =
      orgDel.length === 0
        ? `<p style="color:#777;font-style:italic;">Aucune désinscription dans les 24h.</p>`
        : `<table style="width:100%;border-collapse:collapse;font-size:13px;">
             <thead>
               <tr style="background:#fee2e2;">
                 <th style="text-align:left;padding:6px;border-bottom:1px solid #fecaca;">Apprenant</th>
                 <th style="text-align:left;padding:6px;border-bottom:1px solid #fecaca;">Entreprise</th>
                 <th style="text-align:left;padding:6px;border-bottom:1px solid #fecaca;">Formation</th>
                 <th style="text-align:left;padding:6px;border-bottom:1px solid #fecaca;">Date session</th>
                 <th style="text-align:left;padding:6px;border-bottom:1px solid #fecaca;">Désinscrit par</th>
                 <th style="text-align:left;padding:6px;border-bottom:1px solid #fecaca;">À</th>
               </tr>
             </thead>
             <tbody>
               ${orgDel
                 .map(
                   (r) => `
                   <tr>
                     <td style="padding:6px;border-bottom:1px solid #fef2f2;">
                       <strong>${r.learner_name ?? "—"}</strong>
                       ${r.learner_email ? `<br/><span style="color:#777;font-size:11px;">${r.learner_email}</span>` : ""}
                     </td>
                     <td style="padding:6px;border-bottom:1px solid #fef2f2;">${r.company_name ?? "—"}</td>
                     <td style="padding:6px;border-bottom:1px solid #fef2f2;">${r.formation_title ?? "—"}</td>
                     <td style="padding:6px;border-bottom:1px solid #fef2f2;">${fmtSessionDate(r.session_start_date)}</td>
                     <td style="padding:6px;border-bottom:1px solid #fef2f2;">${deletedByLabel(r.deleted_by_type)}</td>
                     <td style="padding:6px;border-bottom:1px solid #fef2f2;">${fmtTime(r.deleted_at)}</td>
                   </tr>`,
                 )
                 .join("")}
             </tbody>
           </table>`;

    const html = `
      <p>Bonjour,</p>
      <p>Voici l'activité <strong>FORMACAP / ${org?.name ?? "votre organisation"}</strong> des dernières 24 heures :</p>

      <h2 style="color:#059669;margin-top:24px;font-size:15px;">
        ✅ Nouvelles inscriptions (${orgIns.length})
      </h2>
      ${inscriptionsHtml}

      <h2 style="color:#dc2626;margin-top:24px;font-size:15px;">
        ❌ Désinscriptions (${orgDel.length})
      </h2>
      ${deletionsHtml}

      <p style="margin-top:24px;">
        <a href="${origin}/inscriptions"
           style="display:inline-block;background:#0e7490;color:white;
                  text-decoration:none;padding:10px 18px;border-radius:8px;
                  font-weight:bold;">
          Ouvrir le module Inscriptions
        </a>
      </p>

      <p style="margin-top:24px;font-size:11px;color:#999;">
        Récapitulatif automatique envoyé chaque jour à 17h00.
        ${overrideEmail ? "" : "Modifier le destinataire dans les paramètres de l'organisation."}
      </p>
    `;

    const result = await sendEmail({
      to: toEmail,
      subject,
      html,
    });

    if (result.ok) {
      sent += 1;
    } else {
      failures.push({ orgId, reason: result.error ?? "Erreur Resend" });
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    inscriptions: inscriptions.length,
    deletions: deletions.length,
    failures,
  });
}
