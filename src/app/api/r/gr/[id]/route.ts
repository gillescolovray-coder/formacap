/**
 * Lien tracé d'avis Google (Gilles 2026-06-23).
 * Le bouton « Témoignez ICI » de l'email pointe ici : on enregistre le clic
 * (clicked_at + status='clicked') puis on redirige vers le vrai lien Google.
 * Route publique (l'id UUID fait foi) — utilise le client admin.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const fallback = "https://www.google.com";
  if (!UUID_REGEX.test(id)) {
    return NextResponse.redirect(fallback);
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("google_review_requests")
    .select("id, organization_id, clicked_at")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      organization_id: string;
      clicked_at: string | null;
    }>();

  if (!row) return NextResponse.redirect(fallback);

  // Enregistre le 1er clic (idempotent).
  if (!row.clicked_at) {
    await supabase
      .from("google_review_requests")
      .update({ clicked_at: new Date().toISOString(), status: "clicked" })
      .eq("id", id);
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("google_review_url")
    .eq("id", row.organization_id)
    .maybeSingle<{ google_review_url: string | null }>();

  return NextResponse.redirect((org?.google_review_url ?? "").trim() || fallback);
}
