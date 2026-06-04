/**
 * Route admin : ouvre le portail apprenant d un learner en 1 clic
 * (Gilles 2026-06-04). Permet de cliquer sur une icone sur la ligne
 * contact "Apprenant" d une fiche entreprise pour arriver direct sur
 * le portail de cet apprenant.
 *
 * Securite : verifie que l utilisateur connecte est admin/manager
 * de l organisation proprietaire du learner. Sinon 401/403.
 *
 * Genere le token portail apprenant a la volee si pas encore cree
 * (helper getOrCreateLearnerPortalToken).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateLearnerPortalToken } from "@/lib/portal/learner-token";

export const runtime = "nodejs";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: learnerId } = await ctx.params;
  if (!UUID_REGEX.test(learnerId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  // Auth admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", _req.url));
  }

  // Verifie que le learner existe et appartient bien a l org de
  // l utilisateur connecte (via has_org_role implicite ; on lit la
  // colonne learner.organization_id puis on check le membership).
  const admin = createAdminClient();
  const { data: learner } = await admin
    .from("learners")
    .select("id, organization_id")
    .eq("id", learnerId)
    .maybeSingle<{ id: string; organization_id: string }>();
  if (!learner) {
    return NextResponse.json({ error: "Learner not found" }, { status: 404 });
  }
  const { data: membership } = await admin
    .from("organization_members")
    .select("id, role")
    .eq("profile_id", user.id)
    .eq("organization_id", learner.organization_id)
    .eq("is_active", true)
    .maybeSingle<{ id: string; role: string }>();
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Genere ou recupere le token portail
  const { token } = await getOrCreateLearnerPortalToken(admin, learnerId);

  // Redirige vers le portail apprenant
  return NextResponse.redirect(new URL(`/apprenant/${token}`, _req.url));
}
