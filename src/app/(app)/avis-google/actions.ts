"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findEligibleItems, sendForItems } from "@/lib/google-review/send";

async function resolveOrgId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle<{ organization_id: string }>();
  return data?.organization_id ?? null;
}

/** Envoie maintenant la demande d'avis à TOUS les éligibles de l'organisation. */
export async function runGoogleReviewNow() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const orgId = await resolveOrgId(supabase, user.id);
  if (!orgId) redirect("/avis-google?gerror=org");

  const items = await findEligibleItems(supabase, orgId!);
  const res = await sendForItems(supabase, {
    orgId: orgId!,
    items,
    channel: "manual",
    sentBy: user.id,
  });
  if (res.error === "no_url") redirect("/avis-google?gerror=no_url");
  revalidatePath("/avis-google");
  redirect(`/avis-google?gsent=${res.sent}&gskipped=${res.skipped}`);
}

/** Active/désactive les envois automatiques (hebdo / à la clôture). */
export async function setGoogleReviewAuto(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const orgId = await resolveOrgId(supabase, user.id);
  if (!orgId) redirect("/avis-google?gerror=org");

  await supabase
    .from("organizations")
    .update({
      google_review_auto_weekly: formData.get("weekly") === "on",
      google_review_auto_on_close: formData.get("on_close") === "on",
    })
    .eq("id", orgId!);

  revalidatePath("/avis-google");
  redirect("/avis-google?saved=1");
}

/** Réinitialise une demande (permet de renvoyer). */
export async function resetGoogleReviewFromHub(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) redirect("/avis-google");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase.from("google_review_requests").delete().eq("id", requestId);
  revalidatePath("/avis-google");
  redirect("/avis-google?greset=1");
}
