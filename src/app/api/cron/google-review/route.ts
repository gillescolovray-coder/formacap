/**
 * CRON hebdomadaire — demandes d'avis Google automatiques (Gilles 2026-06-23).
 * Pour chaque organisation ayant activé l'envoi auto hebdomadaire, envoie la
 * demande à TOUS les apprenants éligibles (« Très satisfait », email, non
 * encore sollicités). Channel = 'auto'.
 *
 * Schedule (vercel.json) : vendredi. Sécurité : Bearer CRON_SECRET.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findEligibleItems, sendForItems } from "@/lib/google-review/send";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, {
        status: 401,
      });
    }
  }

  const supabase = createAdminClient();
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, google_review_url")
    .eq("google_review_auto_weekly", true);

  let totalSent = 0;
  let totalSkipped = 0;
  const perOrg: Array<{ orgId: string; sent: number; skipped: number }> = [];
  for (const o of (orgs ?? []) as Array<{
    id: string;
    google_review_url: string | null;
  }>) {
    if (!o.google_review_url?.trim()) continue;
    const items = await findEligibleItems(supabase, o.id);
    const r = await sendForItems(supabase, {
      orgId: o.id,
      items,
      channel: "auto",
      sentBy: null,
    });
    totalSent += r.sent;
    totalSkipped += r.skipped;
    perOrg.push({ orgId: o.id, sent: r.sent, skipped: r.skipped });
  }

  return NextResponse.json({ ok: true, totalSent, totalSkipped, perOrg });
}
