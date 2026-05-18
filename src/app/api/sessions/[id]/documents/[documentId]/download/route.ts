import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Génère une URL signée pour un document de session et redirige
 * dessus. Réservé aux membres de l'organisation (RLS).
 * Utilisé par le bouton "Aperçu" du programme de formation.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; documentId: string }> },
) {
  const { id: sessionId, documentId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Vérification : le document doit appartenir à la session
  const { data: doc } = await supabase
    .from("session_documents")
    .select("storage_path, session_id, file_name")
    .eq("id", documentId)
    .maybeSingle<{
      storage_path: string;
      session_id: string;
      file_name: string;
    }>();
  if (!doc || doc.session_id !== sessionId) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("session-documents")
    .createSignedUrl(doc.storage_path, 300);
  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? "Erreur signature" },
      { status: 500 },
    );
  }

  return NextResponse.redirect(data.signedUrl);
}
