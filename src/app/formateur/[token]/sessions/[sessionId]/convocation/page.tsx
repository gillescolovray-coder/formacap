import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { trainerHasAccessToSession } from "@/lib/portal/trainer-session-access";
import { buildTrainerConvocationHtml } from "@/lib/sessions/trainer-convocation";
import { PrintButton } from "./_print-button";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Page « Voir ma convocation » du portail formateur (Gilles 2026-06-19).
 * La convocation est REGÉNÉRÉE à partir des données ACTUELLES de la session
 * (dates, lieu, horaires, consignes…) — donc toujours à jour même si la
 * session a été modifiée après l'envoi de l'email.
 */
export default async function TrainerConvocationViewPage({
  params,
}: {
  params: Promise<{ token: string; sessionId: string }>;
}) {
  const { token, sessionId } = await params;
  if (!UUID_REGEX.test(sessionId)) notFound();

  const supabase = createAdminClient();

  // Validation : token portail formateur + appartenance de la session.
  const { data: tokenRow } = await supabase
    .from("trainer_portal_tokens")
    .select("trainer_id")
    .eq("token", token)
    .maybeSingle<{ trainer_id: string }>();
  if (!tokenRow) notFound();

  const { data: sess } = await supabase
    .from("sessions")
    .select("id, trainer_id")
    .eq("id", sessionId)
    .maybeSingle<{ id: string; trainer_id: string | null }>();
  if (!sess) notFound();

  const access = await trainerHasAccessToSession(
    supabase,
    tokenRow.trainer_id,
    sessionId,
    sess.trainer_id,
  );
  if (!access) notFound();

  const convocation = await buildTrainerConvocationHtml(supabase, sessionId);
  if (!convocation) notFound();

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link
            href={`/formateur/${token}/sessions/${sessionId}`}
            className="inline-flex items-center gap-1.5 text-sm text-cyan-700 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à la session
          </Link>
          <PrintButton />
        </div>

        <div className="rounded-2xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-[#1e3a8a] to-[#0891b2] text-white px-5 py-3">
            <h1 className="text-base font-bold">Ma convocation</h1>
            <p className="text-[11px] text-white/80">
              Générée à partir des informations à jour de la session.
            </p>
          </div>
          {/* Contenu de la convocation (mêmes blocs que l'email reçu). */}
          <div
            className="px-5 py-5 text-sm text-zinc-800 leading-relaxed [&_a]:text-cyan-700 [&_a]:underline [&_p]:mb-2 [&_strong]:font-semibold"
            dangerouslySetInnerHTML={{ __html: convocation.html }}
          />
        </div>
      </div>
    </div>
  );
}
