"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo

function extractPathFromPublicUrl(url: string): string | null {
  const marker = "/formation-programmes/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.substring(idx + marker.length);
}

export async function uploadProgrammePdf(
  formationId: string,
  formData: FormData,
) {
  const file = formData.get("pdf") as File | null;
  if (!file || file.size === 0) {
    redirect(
      `/formations/${formationId}?error=${encodeURIComponent("Aucun fichier sélectionné")}`,
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    redirect(
      `/formations/${formationId}?error=${encodeURIComponent("Fichier trop volumineux (max 10 Mo)")}`,
    );
  }
  if (file.type !== "application/pdf") {
    redirect(
      `/formations/${formationId}?error=${encodeURIComponent("Seuls les fichiers PDF sont acceptés")}`,
    );
  }

  const supabase = await createClient();

  const { data: formation } = await supabase
    .from("formations")
    .select("programme_pdf_url")
    .eq("id", formationId)
    .maybeSingle();

  const fileName = `${formationId}/programme-${Date.now()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("formation-programmes")
    .upload(fileName, file, {
      contentType: "application/pdf",
      upsert: false,
      cacheControl: "3600",
    });

  if (uploadError) {
    redirect(
      `/formations/${formationId}?error=${encodeURIComponent(uploadError.message)}`,
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("formation-programmes").getPublicUrl(fileName);

  const { error: updateError } = await supabase
    .from("formations")
    .update({
      programme_pdf_url: publicUrl,
      programme_pdf_name: file.name,
    })
    .eq("id", formationId);

  if (updateError) {
    redirect(
      `/formations/${formationId}?error=${encodeURIComponent(updateError.message)}`,
    );
  }

  // Nettoyage de l'ancien PDF
  const oldPath = formation?.programme_pdf_url
    ? extractPathFromPublicUrl(formation.programme_pdf_url as string)
    : null;
  if (oldPath && oldPath !== fileName) {
    await supabase.storage.from("formation-programmes").remove([oldPath]);
  }

  revalidatePath(`/formations/${formationId}`);
  redirect(`/formations/${formationId}?pdfUploaded=1`);
}

export async function removeProgrammePdf(formationId: string) {
  const supabase = await createClient();

  const { data: formation } = await supabase
    .from("formations")
    .select("programme_pdf_url")
    .eq("id", formationId)
    .maybeSingle();

  const oldPath = formation?.programme_pdf_url
    ? extractPathFromPublicUrl(formation.programme_pdf_url as string)
    : null;
  if (oldPath) {
    await supabase.storage.from("formation-programmes").remove([oldPath]);
  }

  await supabase
    .from("formations")
    .update({ programme_pdf_url: null, programme_pdf_name: null })
    .eq("id", formationId);

  revalidatePath(`/formations/${formationId}`);
  redirect(`/formations/${formationId}?pdfRemoved=1`);
}
