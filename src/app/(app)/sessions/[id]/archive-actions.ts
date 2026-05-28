"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  buildDriveFolderUrl,
  buildSessionFolderName,
  ensureSessionFolder,
} from "@/lib/google-drive/folder";
import { isDriveConfigured } from "@/lib/google-drive/client";

/**
 * Cree (ou retrouve) le dossier Google Drive d'une session selon la
 * codification cap numerique, et enregistre l'id en BDD.
 *
 * Idempotent : si le dossier existe deja (en BDD ou sur Drive avec le
 * meme nom), on ne recree rien.
 *
 * Gilles 2026-05-28 : etape 1 du projet d'archivage Drive. Les uploads
 * de PDFs viendront dans une V2 (necessite Vercel Pro pour la
 * generation de PDFs serveur).
 */
export type ArchiveSessionResult = {
  ok: boolean;
  folderId?: string;
  folderName?: string;
  folderUrl?: string;
  error?: string;
};

export async function createDriveFolderForSession(
  sessionId: string,
): Promise<ArchiveSessionResult> {
  if (!isDriveConfigured()) {
    return {
      ok: false,
      error:
        "Integration Drive non configuree (variables d'environnement Google manquantes sur le serveur).",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Non authentifie." };
  }

  // 1. Charger la session avec tout ce qu'il faut pour le nommage
  const { data: session } = await supabase
    .from("sessions")
    .select(
      `id, status, start_date, end_date, is_inter, subcontractor_name,
       drive_folder_id, prescriber_company_id,
       formation:formations(title, duration_days, duration_hours),
       prescriber:companies!prescriber_company_id(name),
       enrollments:session_enrollments(
         learner:learners(company:companies(id, name))
       )`,
    )
    .eq("id", sessionId)
    .maybeSingle<{
      id: string;
      status: string | null;
      start_date: string;
      end_date: string;
      is_inter: boolean | null;
      subcontractor_name: string | null;
      drive_folder_id: string | null;
      prescriber_company_id: string | null;
      formation: {
        title: string;
        duration_days: number | null;
        duration_hours: number | null;
      } | null;
      prescriber: { name: string } | null;
      enrollments:
        | Array<{
            learner: {
              company: { id: string; name: string } | null;
            } | null;
          }>
        | null;
    }>();

  if (!session) return { ok: false, error: "Session introuvable." };

  // 2. Garde-fou : seulement les sessions en cours ou terminees
  if (session.status !== "in_progress" && session.status !== "completed") {
    return {
      ok: false,
      error:
        "L'archivage Drive n'est disponible que pour les sessions en cours ou terminees.",
    };
  }

  // 3. Calcul des champs de nommage
  const formationTitle = session.formation?.title ?? "Session";
  const isInter = session.is_inter === true;

  // Liste des entreprises clientes (depuis les inscriptions)
  const clientCompanies = new Map<string, string>();
  (session.enrollments ?? []).forEach((e) => {
    const c = e.learner?.company;
    if (c?.id && c.name) clientCompanies.set(c.id, c.name);
  });
  const hasMultipleClients = clientCompanies.size > 1;
  const singleClientName =
    clientCompanies.size === 1
      ? Array.from(clientCompanies.values())[0]
      : null;

  const folderName = buildSessionFolderName({
    startDate: session.start_date,
    durationDays: session.formation?.duration_days ?? null,
    isInter,
    prescriberName: session.prescriber?.name ?? null,
    subcontractorName: session.subcontractor_name ?? null,
    hasMultipleClients,
    singleClientName,
    sessionTitle: formationTitle,
  });

  // 4. Creation / recuperation du dossier Drive
  let folderId: string;
  try {
    folderId = await ensureSessionFolder(folderName);
  } catch (err) {
    const msg = (err as Error).message ?? "Erreur Drive inconnue";
    console.error(
      "[archiveSession] ensureSessionFolder echec",
      { sessionId, folderName, error: msg },
    );
    return {
      ok: false,
      error: `Erreur lors de la creation du dossier Drive : ${msg}`,
    };
  }

  // 5. Persiste l'id en BDD + horodate
  await supabase
    .from("sessions")
    .update({
      drive_folder_id: folderId,
      drive_archived_at: new Date().toISOString(),
      drive_archived_by: user.id,
    })
    .eq("id", sessionId);

  revalidatePath(`/sessions/${sessionId}`);

  return {
    ok: true,
    folderId,
    folderName,
    folderUrl: buildDriveFolderUrl(folderId),
  };
}
