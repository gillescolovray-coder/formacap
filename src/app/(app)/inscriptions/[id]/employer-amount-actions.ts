"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertInscriptionSessionEditable } from "@/lib/sessions/lock";

/**
 * Met a jour la part employeur HT d une inscription (Gilles 2026-06-01).
 *
 * Option C validee : auto par defaut, modifiable manuellement.
 * Si `auto: true` => on stocke null en BDD (le helper recalculera
 * automatiquement = billing_total_ht − Σ OPCO).
 * Si `auto: false` => on stocke la valeur saisie.
 */
export async function saveEmployerAmount(
  inscriptionId: string,
  amount: number | null,
): Promise<{ ok: boolean; error?: string }> {
  const userSupabase = await createClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié" };
  const lock = await assertInscriptionSessionEditable(userSupabase, inscriptionId);
  if (!lock.ok) return lock;

  const sanitized =
    amount === null
      ? null
      : Number.isFinite(amount) && amount >= 0
        ? amount
        : null;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("inscription_requests")
    .update({ employer_amount_ht: sanitized })
    .eq("id", inscriptionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/inscriptions/${inscriptionId}`);
  return { ok: true };
}
