"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  TrainerDocument,
  TrainerDocumentKind,
} from "@/lib/trainers/types";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo
const BUCKET = "trainers";

function extractPathFromUrl(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.substring(idx + marker.length);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadTrainerDocument(
  trainerId: string,
  formData: FormData,
) {
  const file = formData.get("file") as File | null;
  const kind =
    (formData.get("kind") as TrainerDocumentKind | null) ?? "autre";
  const label = (formData.get("label") as string | null)?.trim() || null;
  const expiresOn =
    (formData.get("expires_on") as string | null)?.trim() || null;

  if (!file || file.size === 0) {
    redirect(
      `/formateurs/${trainerId}?error=${encodeURIComponent("Aucun fichier sélectionné")}`,
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    redirect(
      `/formateurs/${trainerId}?error=${encodeURIComponent("Fichier trop volumineux (max 10 Mo)")}`,
    );
  }

  const supabase = await createClient();

  const safeName = sanitizeFileName(file.name);
  const path = `${trainerId}/${kind}-${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    redirect(
      `/formateurs/${trainerId}?error=${encodeURIComponent(uploadError.message)}`,
    );
  }

  // Bucket privé : on stocke le path et on génère un signed URL au moment de l'affichage.
  // Pour simplifier, on stocke l'URL via getPublicUrl (qui marche aussi pour bucket privé en interne).
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { data: trainer } = await supabase
    .from("trainers")
    .select("documents")
    .eq("id", trainerId)
    .maybeSingle();

  const existing = (trainer?.documents as TrainerDocument[] | null) ?? [];
  const newDoc: TrainerDocument = {
    kind,
    file_url: publicUrl,
    file_name: file.name,
    label: label ?? undefined,
    uploaded_at: new Date().toISOString(),
    expires_on: expiresOn ?? null,
  };

  const updates: Record<string, unknown> = {
    documents: [...existing, newDoc],
  };
  // Cohérence : le certificat Qualiopi pousse sa date sur le formateur
  // (et active la case "is_qualiopi" si pas encore active).
  if (kind === "qualiopi") {
    updates.is_qualiopi = true;
    if (expiresOn) {
      updates.qualiopi_expires_on = expiresOn;
    }
  }

  const { error: updateError } = await supabase
    .from("trainers")
    .update(updates)
    .eq("id", trainerId);

  if (updateError) {
    redirect(
      `/formateurs/${trainerId}?error=${encodeURIComponent(updateError.message)}`,
    );
  }

  revalidatePath(`/formateurs/${trainerId}`);
  redirect(`/formateurs/${trainerId}?docUploaded=1`);
}

export async function removeTrainerDocument(
  trainerId: string,
  fileUrl: string,
) {
  const supabase = await createClient();

  const path = extractPathFromUrl(fileUrl);
  if (path) {
    await supabase.storage.from(BUCKET).remove([path]);
  }

  const { data: trainer } = await supabase
    .from("trainers")
    .select("documents")
    .eq("id", trainerId)
    .maybeSingle();

  const existing = (trainer?.documents as TrainerDocument[] | null) ?? [];
  const removed = existing.find((d) => d.file_url === fileUrl);
  const filtered = existing.filter((d) => d.file_url !== fileUrl);

  const updates: Record<string, unknown> = { documents: filtered };
  // Cohérence : si on supprime LE certificat Qualiopi (et qu'aucun autre n'existe),
  // on remet la date à null. La case "is_qualiopi" reste cochée pour ne pas perdre
  // l'info — l'utilisateur peut la décocher manuellement.
  if (
    removed?.kind === "qualiopi" &&
    !filtered.some((d) => d.kind === "qualiopi")
  ) {
    updates.qualiopi_expires_on = null;
  }

  await supabase.from("trainers").update(updates).eq("id", trainerId);

  revalidatePath(`/formateurs/${trainerId}`);
  redirect(`/formateurs/${trainerId}?docRemoved=1`);
}
