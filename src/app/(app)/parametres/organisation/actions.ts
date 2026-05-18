"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

/**
 * Met à jour les informations légales de l'organisation : SIRET, NDA,
 * adresse, téléphone, email, site web, dirigeant. Champs repris dans
 * les conventions et autres documents Qualiopi.
 */
export async function updateOrgIdentity(orgId: string, formData: FormData) {
  const supabase = await createClient();
  const payload = {
    name: parseText(formData.get("name")) ?? undefined,
    siret: parseText(formData.get("siret")),
    nda: parseText(formData.get("nda")),
    address: parseText(formData.get("address")),
    postal_code: parseText(formData.get("postal_code")),
    city: parseText(formData.get("city")),
    phone: parseText(formData.get("phone")),
    email: parseText(formData.get("email")),
    website: parseText(formData.get("website")),
  };

  const { error } = await supabase
    .from("organizations")
    .update(payload)
    .eq("id", orgId);

  if (error) {
    redirect(
      `/parametres/organisation?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/parametres/organisation");
  revalidatePath("/", "layout"); // logo/nom dans la sidebar
  redirect("/parametres/organisation?identitySaved=1");
}

const VALID_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
];

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 Mo

function extractPathFromPublicUrl(url: string): string | null {
  const marker = "/organization-logos/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.substring(idx + marker.length);
}

export async function uploadLogo(orgId: string, formData: FormData) {
  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) {
    redirect(
      "/parametres/organisation?error=" +
        encodeURIComponent("Aucun fichier sélectionné"),
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    redirect(
      "/parametres/organisation?error=" +
        encodeURIComponent("Fichier trop volumineux (max 2 Mo)"),
    );
  }

  if (!VALID_MIME_TYPES.includes(file.type)) {
    redirect(
      "/parametres/organisation?error=" +
        encodeURIComponent(
          "Format non supporté (PNG, JPEG, SVG ou WebP attendu)",
        ),
    );
  }

  const supabase = await createClient();

  // Récupère l'URL du logo actuel pour le nettoyer ensuite
  const { data: org } = await supabase
    .from("organizations")
    .select("logo_url")
    .eq("id", orgId)
    .maybeSingle();

  // Nom de fichier unique : évite les conflits de cache entre anciens/nouveaux logos
  const extGuess =
    file.name.includes(".") ? file.name.split(".").pop() : undefined;
  const ext =
    extGuess && /^[a-zA-Z0-9]+$/.test(extGuess)
      ? extGuess.toLowerCase()
      : file.type === "image/svg+xml"
        ? "svg"
        : file.type === "image/jpeg"
          ? "jpg"
          : file.type === "image/webp"
            ? "webp"
            : "png";
  const fileName = `${orgId}/logo-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("organization-logos")
    .upload(fileName, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });

  if (uploadError) {
    redirect(
      `/parametres/organisation?error=${encodeURIComponent(uploadError.message)}`,
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("organization-logos").getPublicUrl(fileName);

  const { error: updateError } = await supabase
    .from("organizations")
    .update({ logo_url: publicUrl })
    .eq("id", orgId);

  if (updateError) {
    redirect(
      `/parametres/organisation?error=${encodeURIComponent(updateError.message)}`,
    );
  }

  // Nettoie l'ancien logo si présent
  const oldPath = org?.logo_url
    ? extractPathFromPublicUrl(org.logo_url as string)
    : null;
  if (oldPath && oldPath !== fileName) {
    await supabase.storage.from("organization-logos").remove([oldPath]);
  }

  revalidatePath("/parametres/organisation");
  redirect("/parametres/organisation?success=1");
}

/** Format HH:MM strict (ex: "08:30"). Retourne null si invalide ou vide. */
function parseTime(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  return /^\d{2}:\d{2}$/.test(s) ? s : null;
}

export async function updateLegalMentions(orgId: string, formData: FormData) {
  const supabase = await createClient();
  const raw = formData.get("legal_mentions");
  const text =
    typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;

  const { error } = await supabase
    .from("organizations")
    .update({ legal_mentions: text })
    .eq("id", orgId);
  if (error) {
    redirect(
      `/parametres/organisation?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/parametres/organisation");
  redirect("/parametres/organisation?legalSaved=1");
}

export async function updateDefaultHours(orgId: string, formData: FormData) {
  const supabase = await createClient();

  const payload = {
    default_morning_start: parseTime(formData.get("default_morning_start")),
    default_morning_end: parseTime(formData.get("default_morning_end")),
    default_afternoon_start: parseTime(formData.get("default_afternoon_start")),
    default_afternoon_end: parseTime(formData.get("default_afternoon_end")),
  };

  const { error } = await supabase
    .from("organizations")
    .update(payload)
    .eq("id", orgId);

  if (error) {
    redirect(
      `/parametres/organisation?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/parametres/organisation");
  redirect("/parametres/organisation?hoursSaved=1");
}

/**
 * Met à jour les paramètres d'émargement + certificat de réalisation
 * de l'organisation :
 *  - durée de validité du QR émargement (0-90 jours, défaut 7)
 *  - seuil de présence pour activer le certificat (0-100 %, défaut 80)
 */
export async function updateEmargementSettings(
  orgId: string,
  formData: FormData,
) {
  const supabase = await createClient();

  const rawTtl = Number(formData.get("emargement_token_ttl_days"));
  const ttl =
    Number.isFinite(rawTtl) && rawTtl >= 0 && rawTtl <= 90
      ? Math.round(rawTtl)
      : 7;

  const rawThreshold = Number(
    formData.get("realization_certificate_threshold_percent"),
  );
  const threshold =
    Number.isFinite(rawThreshold) && rawThreshold >= 0 && rawThreshold <= 100
      ? Math.round(rawThreshold)
      : 80;

  const { error } = await supabase
    .from("organizations")
    .update({
      emargement_token_ttl_days: ttl,
      realization_certificate_threshold_percent: threshold,
    })
    .eq("id", orgId);

  if (error) {
    redirect(
      `/parametres/organisation?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/parametres/organisation");
  redirect("/parametres/organisation?emargementSaved=1");
}

/**
 * Upload du certificat Qualiopi (PDF) + date d'expiration.
 *
 * Stockage : bucket privé "qualiopi-certificates" (cf. migration 0066).
 * Chemin : org_<orgId>/cert_<timestamp>.pdf (la RLS du bucket vérifie
 * que le préfixe matche bien l'organisation du membre connecté).
 */
export async function uploadQualiopiCertificate(
  orgId: string,
  formData: FormData,
) {
  const file = formData.get("file") as File | null;
  const expiresAtRaw = formData.get("expires_at");
  const expiresAt =
    typeof expiresAtRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expiresAtRaw)
      ? expiresAtRaw
      : null;

  if (!file || file.size === 0) {
    redirect(
      "/parametres/organisation?error=" +
        encodeURIComponent("Aucun fichier sélectionné"),
    );
  }
  if (file.type !== "application/pdf") {
    redirect(
      "/parametres/organisation?error=" +
        encodeURIComponent("Le certificat doit être un PDF"),
    );
  }
  if (file.size > 5 * 1024 * 1024) {
    redirect(
      "/parametres/organisation?error=" +
        encodeURIComponent("Fichier trop volumineux (max 5 Mo)"),
    );
  }
  if (!expiresAt) {
    redirect(
      "/parametres/organisation?error=" +
        encodeURIComponent("Date d'expiration manquante ou invalide"),
    );
  }

  const supabase = await createClient();

  // Nettoyer l'ancien fichier si présent (le remplacement est l'opération
  // standard — un certificat à la fois par organisation).
  const { data: existing } = await supabase
    .from("organizations")
    .select("qualiopi_certificate_path")
    .eq("id", orgId)
    .maybeSingle<{ qualiopi_certificate_path: string | null }>();
  if (existing?.qualiopi_certificate_path) {
    await supabase.storage
      .from("qualiopi-certificates")
      .remove([existing.qualiopi_certificate_path]);
  }

  const storagePath = `org_${orgId}/cert_${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("qualiopi-certificates")
    .upload(storagePath, file, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) {
    redirect(
      `/parametres/organisation?error=${encodeURIComponent(uploadError.message)}`,
    );
  }

  const { error: updateError } = await supabase
    .from("organizations")
    .update({
      qualiopi_certificate_path: storagePath,
      qualiopi_certificate_filename: file.name,
      qualiopi_certificate_expires_at: expiresAt,
      qualiopi_certificate_uploaded_at: new Date().toISOString(),
    })
    .eq("id", orgId);
  if (updateError) {
    // Rollback storage si l'update BDD échoue
    await supabase.storage.from("qualiopi-certificates").remove([storagePath]);
    redirect(
      `/parametres/organisation?error=${encodeURIComponent(updateError.message)}`,
    );
  }

  revalidatePath("/parametres/organisation");
  redirect("/parametres/organisation?qualiopiSaved=1");
}

/**
 * Upload du bandeau commercial (image) affiché sur la 1ère page des
 * conventions de formation. Stockage : bucket public "organization-banners".
 */
export async function uploadCommercialBanner(
  orgId: string,
  formData: FormData,
) {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    redirect(
      "/parametres/organisation?error=" +
        encodeURIComponent("Aucun fichier sélectionné"),
    );
  }
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) {
    redirect(
      "/parametres/organisation?error=" +
        encodeURIComponent(
          "Format non supporté pour le bandeau (PNG, JPEG, WebP)",
        ),
    );
  }
  if (file.size > 3 * 1024 * 1024) {
    redirect(
      "/parametres/organisation?error=" +
        encodeURIComponent("Bandeau trop volumineux (max 3 Mo)"),
    );
  }

  const supabase = await createClient();

  // Nettoyer l'ancien bandeau s'il existe
  const { data: existing } = await supabase
    .from("organizations")
    .select("commercial_banner_path")
    .eq("id", orgId)
    .maybeSingle<{ commercial_banner_path: string | null }>();
  if (existing?.commercial_banner_path) {
    await supabase.storage
      .from("organization-banners")
      .remove([existing.commercial_banner_path]);
  }

  const ext =
    file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/webp"
        ? "webp"
        : "png";
  const storagePath = `org_${orgId}/banner_${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("organization-banners")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadError) {
    redirect(
      `/parametres/organisation?error=${encodeURIComponent(uploadError.message)}`,
    );
  }

  const { error: updateError } = await supabase
    .from("organizations")
    .update({
      commercial_banner_path: storagePath,
      commercial_banner_filename: file.name,
      commercial_banner_uploaded_at: new Date().toISOString(),
    })
    .eq("id", orgId);
  if (updateError) {
    await supabase.storage.from("organization-banners").remove([storagePath]);
    redirect(
      `/parametres/organisation?error=${encodeURIComponent(updateError.message)}`,
    );
  }

  revalidatePath("/parametres/organisation");
  redirect("/parametres/organisation?bannerSaved=1");
}

/** Supprime le bandeau commercial (fichier + colonnes BDD). */
export async function removeCommercialBanner(orgId: string) {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("organizations")
    .select("commercial_banner_path")
    .eq("id", orgId)
    .maybeSingle<{ commercial_banner_path: string | null }>();
  if (existing?.commercial_banner_path) {
    await supabase.storage
      .from("organization-banners")
      .remove([existing.commercial_banner_path]);
  }
  await supabase
    .from("organizations")
    .update({
      commercial_banner_path: null,
      commercial_banner_filename: null,
      commercial_banner_uploaded_at: null,
    })
    .eq("id", orgId);
  revalidatePath("/parametres/organisation");
  redirect("/parametres/organisation?bannerDeleted=1");
}

/**
 * Upload de la signature + cachet du dirigeant. Image (PNG/JPEG/WebP)
 * apposée automatiquement sur les documents générés (convention,
 * attestation, etc.) dans la zone "Pour l'Organisme — Cachet et
 * signature". Stockage : bucket PRIVÉ "organization-signatures" car
 * c'est un document sensible.
 */
export async function uploadSignatureStamp(orgId: string, formData: FormData) {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    redirect(
      "/parametres/organisation?error=" +
        encodeURIComponent("Aucun fichier sélectionné"),
    );
  }
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) {
    redirect(
      "/parametres/organisation?error=" +
        encodeURIComponent(
          "Format non supporté pour la signature (PNG, JPEG, WebP)",
        ),
    );
  }
  if (file.size > 2 * 1024 * 1024) {
    redirect(
      "/parametres/organisation?error=" +
        encodeURIComponent("Signature trop volumineuse (max 2 Mo)"),
    );
  }

  const supabase = await createClient();

  // Nettoyer l'ancienne signature s'il y en a une
  const { data: existing } = await supabase
    .from("organizations")
    .select("signature_stamp_path")
    .eq("id", orgId)
    .maybeSingle<{ signature_stamp_path: string | null }>();
  if (existing?.signature_stamp_path) {
    await supabase.storage
      .from("organization-signatures")
      .remove([existing.signature_stamp_path]);
  }

  const ext =
    file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/webp"
        ? "webp"
        : "png";
  const storagePath = `org_${orgId}/signature_${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("organization-signatures")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadError) {
    redirect(
      `/parametres/organisation?error=${encodeURIComponent(uploadError.message)}`,
    );
  }

  const { error: updateError } = await supabase
    .from("organizations")
    .update({
      signature_stamp_path: storagePath,
      signature_stamp_filename: file.name,
      signature_stamp_uploaded_at: new Date().toISOString(),
    })
    .eq("id", orgId);
  if (updateError) {
    await supabase.storage
      .from("organization-signatures")
      .remove([storagePath]);
    redirect(
      `/parametres/organisation?error=${encodeURIComponent(updateError.message)}`,
    );
  }

  revalidatePath("/parametres/organisation");
  redirect("/parametres/organisation?signatureSaved=1");
}

/** Supprime la signature & cachet (fichier + colonnes BDD). */
export async function removeSignatureStamp(orgId: string) {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("organizations")
    .select("signature_stamp_path")
    .eq("id", orgId)
    .maybeSingle<{ signature_stamp_path: string | null }>();
  if (existing?.signature_stamp_path) {
    await supabase.storage
      .from("organization-signatures")
      .remove([existing.signature_stamp_path]);
  }
  await supabase
    .from("organizations")
    .update({
      signature_stamp_path: null,
      signature_stamp_filename: null,
      signature_stamp_uploaded_at: null,
    })
    .eq("id", orgId);
  revalidatePath("/parametres/organisation");
  redirect("/parametres/organisation?signatureDeleted=1");
}

/** Supprime le certificat Qualiopi (fichier + colonnes BDD). */
export async function removeQualiopiCertificate(orgId: string) {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("organizations")
    .select("qualiopi_certificate_path")
    .eq("id", orgId)
    .maybeSingle<{ qualiopi_certificate_path: string | null }>();
  if (existing?.qualiopi_certificate_path) {
    await supabase.storage
      .from("qualiopi-certificates")
      .remove([existing.qualiopi_certificate_path]);
  }
  await supabase
    .from("organizations")
    .update({
      qualiopi_certificate_path: null,
      qualiopi_certificate_filename: null,
      qualiopi_certificate_expires_at: null,
      qualiopi_certificate_uploaded_at: null,
    })
    .eq("id", orgId);
  revalidatePath("/parametres/organisation");
  redirect("/parametres/organisation?qualiopiDeleted=1");
}

export async function removeLogo(orgId: string) {
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("logo_url")
    .eq("id", orgId)
    .maybeSingle();

  const oldPath = org?.logo_url
    ? extractPathFromPublicUrl(org.logo_url as string)
    : null;
  if (oldPath) {
    await supabase.storage.from("organization-logos").remove([oldPath]);
  }

  await supabase
    .from("organizations")
    .update({ logo_url: null })
    .eq("id", orgId);

  revalidatePath("/parametres/organisation");
  redirect("/parametres/organisation?deleted=1");
}
