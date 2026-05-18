"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  LocationDocument,
  LocationDocumentKind,
} from "@/lib/locations/types";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo
const BUCKET = "formation-locations";

function extractPathFromUrl(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.substring(idx + marker.length);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadLocationDocument(
  locationId: string,
  formData: FormData,
) {
  const file = formData.get("file") as File | null;
  const kind =
    (formData.get("kind") as LocationDocumentKind | null) ?? "autre";
  const label = (formData.get("label") as string | null)?.trim() || null;

  if (!file || file.size === 0) {
    redirect(
      `/lieux/${locationId}?error=${encodeURIComponent("Aucun fichier sélectionné")}`,
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    redirect(
      `/lieux/${locationId}?error=${encodeURIComponent("Fichier trop volumineux (max 10 Mo)")}`,
    );
  }

  const supabase = await createClient();
  const safeName = sanitizeFileName(file.name);
  const path = `${locationId}/${kind}-${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    redirect(
      `/lieux/${locationId}?error=${encodeURIComponent(uploadError.message)}`,
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { data: location } = await supabase
    .from("formation_locations")
    .select("documents")
    .eq("id", locationId)
    .maybeSingle();

  const existing = (location?.documents as LocationDocument[] | null) ?? [];
  const newDoc: LocationDocument = {
    kind,
    file_url: publicUrl,
    file_name: file.name,
    label: label ?? undefined,
    uploaded_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabase
    .from("formation_locations")
    .update({ documents: [...existing, newDoc] })
    .eq("id", locationId);

  if (updateError) {
    redirect(
      `/lieux/${locationId}?error=${encodeURIComponent(updateError.message)}`,
    );
  }

  revalidatePath(`/lieux/${locationId}`);
  redirect(`/lieux/${locationId}?docUploaded=1`);
}

export async function removeLocationDocument(
  locationId: string,
  fileUrl: string,
) {
  const supabase = await createClient();

  const path = extractPathFromUrl(fileUrl);
  if (path) {
    await supabase.storage.from(BUCKET).remove([path]);
  }

  const { data: location } = await supabase
    .from("formation_locations")
    .select("documents")
    .eq("id", locationId)
    .maybeSingle();

  const existing = (location?.documents as LocationDocument[] | null) ?? [];
  const filtered = existing.filter((d) => d.file_url !== fileUrl);

  await supabase
    .from("formation_locations")
    .update({ documents: filtered })
    .eq("id", locationId);

  revalidatePath(`/lieux/${locationId}`);
  redirect(`/lieux/${locationId}?docRemoved=1`);
}
