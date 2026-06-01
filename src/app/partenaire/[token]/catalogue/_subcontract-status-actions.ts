"use server";

/**
 * Action serveur : permettre à un OF/Prescripteur de changer le
 * statut d une session OU IL EST DONNEUR D ORDRE (sous-traitance).
 * (Gilles 2026-06-01).
 *
 * Statuts autorises : 'planned' | 'confirmed' | 'cancelled'.
 *
 * Securite : verifie que ctx.company.id === session.subcontracting_company_id
 * AVANT d updater. Refuse sinon.
 *
 * Effet de bord : envoi d un email a l owner CAP NUMERIQUE pour signaler
 * le changement (delivrabilite via Resend, mode test compatible).
 *
 * Synchronisation : revalidate les routes admin sessions + portail
 * catalogue pour que le changement soit visible immediatement.
 */
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";
import { resolvePartnerContext } from "../_resolve";

const ALLOWED_STATUSES = new Set([
  "planned",
  "confirmed",
  "cancelled",
  "postponed",
]);

const STATUS_LABEL: Record<string, string> = {
  draft: "Brouillon",
  planned: "Planifiée",
  confirmed: "Confirmée",
  cancelled: "Annulée",
  postponed: "Reportée",
};

export type UpdateStatusResult = {
  ok: boolean;
  error?: string;
};

export async function updateSubcontractingSessionStatus(
  token: string,
  sessionId: string,
  newStatus: string,
): Promise<UpdateStatusResult> {
  if (!ALLOWED_STATUSES.has(newStatus)) {
    return { ok: false, error: "Statut non autorisé." };
  }
  const ctx = await resolvePartnerContext(token);
  if (!ctx) return { ok: false, error: "Token invalide." };

  const supabase = createAdminClient();

  // 1) Charger la session + verifier que ce partenaire est le donneur
  //    d ordre. Sinon refus categorique (pas le droit d agir).
  const { data: sessionRow } = await supabase
    .from("sessions")
    .select(
      "id, status, internal_code, start_date, end_date, subcontracting_company_id, organization_id, formation:formations(title)",
    )
    .eq("id", sessionId)
    .eq("organization_id", ctx.company.organization_id)
    .maybeSingle();
  if (!sessionRow) {
    return { ok: false, error: "Session introuvable." };
  }
  const session = sessionRow as unknown as {
    id: string;
    status: string;
    internal_code: string | null;
    start_date: string | null;
    end_date: string | null;
    subcontracting_company_id: string | null;
    organization_id: string;
    formation: { title: string } | null;
  };
  if (session.subcontracting_company_id !== ctx.company.id) {
    return {
      ok: false,
      error: "Vous n'êtes pas donneur d'ordre sur cette session.",
    };
  }
  const previousStatus = session.status;
  if (previousStatus === newStatus) {
    return { ok: false, error: "Le statut est déjà celui demandé." };
  }

  // 2) Update
  const { error: updateErr } = await supabase
    .from("sessions")
    .update({ status: newStatus })
    .eq("id", sessionId);
  if (updateErr) {
    return { ok: false, error: `Mise à jour impossible : ${updateErr.message}` };
  }

  // 3) Email a l owner CAP NUMERIQUE
  if (isResendConfigured()) {
    const formationTitle = Array.isArray(session.formation)
      ? session.formation[0]?.title ?? "(session)"
      : session.formation?.title ?? "(session)";
    const ownerEmail =
      ctx.organization.email ?? "gilles.colovray@capnumerique.com";
    const prevLabel = STATUS_LABEL[previousStatus] ?? previousStatus;
    const newLabel = STATUS_LABEL[newStatus] ?? newStatus;
    const formatDate = (iso: string | null) => {
      if (!iso) return "—";
      return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    };
    const dateRange =
      session.end_date && session.end_date !== session.start_date
        ? `${formatDate(session.start_date)} au ${formatDate(session.end_date)}`
        : formatDate(session.start_date);
    const subject = `[Sous-traitance] ${ctx.company.name} → statut session "${formationTitle}" : ${prevLabel} → ${newLabel}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
        <h2 style="color:#0e7490;margin-bottom:8px;">Changement de statut session (sous-traitance)</h2>
        <p>L'organisme partenaire <strong>${ctx.company.name}</strong> vient de modifier le statut d'une session sur laquelle il est donneur d'ordre :</p>
        <table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:14px;">
          <tr>
            <td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold;width:160px;">Formation</td>
            <td style="padding:6px 10px;border:1px solid #e5e7eb;">${formationTitle}</td>
          </tr>
          ${session.internal_code ? `
          <tr>
            <td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold;">Code session</td>
            <td style="padding:6px 10px;border:1px solid #e5e7eb;">${session.internal_code}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold;">Date(s)</td>
            <td style="padding:6px 10px;border:1px solid #e5e7eb;">${dateRange}</td>
          </tr>
          <tr>
            <td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold;">Statut précédent</td>
            <td style="padding:6px 10px;border:1px solid #e5e7eb;color:#9ca3af;">${prevLabel}</td>
          </tr>
          <tr>
            <td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold;">Nouveau statut</td>
            <td style="padding:6px 10px;border:1px solid #e5e7eb;color:${newStatus === "cancelled" ? "#dc2626" : newStatus === "confirmed" ? "#059669" : "#0e7490"};font-weight:bold;">${newLabel}</td>
          </tr>
        </table>
        <p style="font-size:13px;color:#6b7280;">Cette modification est déjà reflétée dans votre interface admin (onglet Sessions).</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0;"/>
        <p style="font-size:11px;color:#9ca3af;">Notification automatique — Espace partenaire ${ctx.organization.name}.</p>
      </div>
    `;
    // Best-effort : on ne fait pas echouer le changement de statut si
    // l email ne part pas (typiquement domain pas verifie en prod).
    try {
      await sendEmail({
        to: ownerEmail,
        toName: "CAP NUMERIQUE",
        subject,
        html,
      });
    } catch (e) {
      console.error("[subcontract-status] email failed:", (e as Error).message);
    }
  }

  // 4) Revalidate routes impactees
  revalidatePath("/sessions");
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/partenaire/${token}/catalogue`);
  revalidatePath(`/partenaire/${token}`);

  return { ok: true };
}
