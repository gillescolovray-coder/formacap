"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizePhoneE164 } from "@/lib/phone";

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

function buildContactPayload(formData: FormData) {
  // Civilité : whitelist M./Mme/Autre (ou null si rien sélectionné).
  const rawCivility = parseText(formData.get("civility"));
  const civility =
    rawCivility === "M." || rawCivility === "Mme" || rawCivility === "Autre"
      ? rawCivility
      : null;
  return {
    civility,
    first_name: parseText(formData.get("first_name")),
    last_name: parseText(formData.get("last_name")),
    job_title: parseText(formData.get("job_title")),
    email: parseText(formData.get("email")),
    phone: normalizePhoneE164(parseText(formData.get("phone"))),
    mobile: normalizePhoneE164(parseText(formData.get("mobile"))),
    notes: parseText(formData.get("notes")),
    is_primary: formData.get("is_primary") === "on",
    role: (parseText(formData.get("role")) as
      | "rh"
      | "admin"
      | "manager"
      | "comptable"
      | "referent_pedago"
      | "direction"
      | "autre"
      | null) ?? "autre",
    service: parseText(formData.get("service")),
    notify_inscription_validated:
      formData.get("notify_inscription_validated") === "on",
    notify_session_opened: formData.get("notify_session_opened") === "on",
    notify_session_cancelled: formData.get("notify_session_cancelled") === "on",
    notify_session_completed: formData.get("notify_session_completed") === "on",
    notify_admin_documents: formData.get("notify_admin_documents") === "on",
    notify_invoices: formData.get("notify_invoices") === "on",
    notify_certificates: formData.get("notify_certificates") === "on",
  };
}

export async function addContact(companyId: string, formData: FormData) {
  const payload = buildContactPayload(formData);
  if (!payload.last_name) {
    redirect(`/entreprises/${companyId}?error=Le+nom+du+contact+est+obligatoire`);
  }

  const supabase = await createClient();

  // Si marqué comme principal, on retire le flag des autres
  if (payload.is_primary) {
    await supabase
      .from("company_contacts")
      .update({ is_primary: false })
      .eq("company_id", companyId);
  }

  const { error } = await supabase.from("company_contacts").insert({
    ...payload,
    company_id: companyId,
  });

  if (error) {
    redirect(`/entreprises/${companyId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/entreprises/${companyId}`);
  redirect(`/entreprises/${companyId}?contactAdded=1`);
}

export async function updateContact(
  companyId: string,
  contactId: string,
  formData: FormData,
) {
  const payload = buildContactPayload(formData);
  if (!payload.last_name) {
    redirect(`/entreprises/${companyId}?error=Le+nom+du+contact+est+obligatoire`);
  }

  const supabase = await createClient();

  if (payload.is_primary) {
    await supabase
      .from("company_contacts")
      .update({ is_primary: false })
      .eq("company_id", companyId)
      .neq("id", contactId);
  }

  const { error } = await supabase
    .from("company_contacts")
    .update(payload)
    .eq("id", contactId);

  if (error) {
    redirect(`/entreprises/${companyId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/entreprises/${companyId}`);
  redirect(`/entreprises/${companyId}?contactUpdated=1`);
}

export async function deleteContact(companyId: string, contactId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_contacts")
    .delete()
    .eq("id", contactId);

  if (error) {
    redirect(`/entreprises/${companyId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/entreprises/${companyId}`);
  redirect(`/entreprises/${companyId}?contactDeleted=1`);
}
