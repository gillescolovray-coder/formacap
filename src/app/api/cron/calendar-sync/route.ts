/**
 * CRON — synchronisation de sécurité de l'agenda Google (Gilles 2026-06-25).
 *
 * L'appli synchronise déjà CHAQUE session à sa création/modif/confirmation
 * (temps réel). Ce cron est un FILET DE SÉCURITÉ : il repousse toutes les
 * sessions vers l'agenda partagé pour rattraper un éventuel échec ponctuel
 * (session confirmée alors que Google était momentanément indisponible, etc.).
 *
 * Coût : l'API Google Calendar est gratuite (quota largement suffisant).
 * Schedule dans vercel.json. Sécurité : Bearer CRON_SECRET.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncSessionCalendar } from "@/lib/google-calendar/sync";

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

  // Pas de synchro si l'agenda n'est pas configuré (évite des erreurs inutiles).
  if (
    !process.env.GOOGLE_CALENDAR_ID ||
    !(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64
    )
  ) {
    return NextResponse.json({ ok: false, error: "calendar_not_configured" });
  }

  const supabase = createAdminClient();
  const { data: sessions } = await supabase.from("sessions").select("id");
  const ids = ((sessions ?? []) as Array<{ id: string }>).map((s) => s.id);

  let count = 0;
  let failed = 0;
  const BATCH = 4;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const results = await Promise.all(slice.map((id) => syncSessionCalendar(id)));
    for (const r of results) {
      if (r.ok) count += 1;
      else failed += 1;
    }
    if (i + BATCH < ids.length) await new Promise((r) => setTimeout(r, 300));
  }

  // Horodatage de la dernière synchro (affiché sur la page Sessions).
  await supabase
    .from("organizations")
    .update({ calendar_last_sync_at: new Date().toISOString() })
    .not("id", "is", null);

  return NextResponse.json({ ok: true, count, failed });
}
