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
import { syncSessionsNeedingUpdate } from "@/lib/google-calendar/sync";

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

  // Synchro INCRÉMENTALE + bornée : ne traite que les sessions à
  // (re)synchroniser (jamais synchronisées / sans événement / en erreur).
  // Rapide en régime normal ; rattrape sur plusieurs passes après une purge.
  const res = await syncSessionsNeedingUpdate({ budgetMs: 45_000 });
  return NextResponse.json(res);
}
