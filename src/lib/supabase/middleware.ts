import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth",
  "/c/", // Catalogue de vente publié — accessible sans connexion
  "/api/catalog/", // Téléchargement PDF du catalogue public
  "/signer/", // Signature à distance émargement (apprenants non connectés)
  "/conventions/", // Signature à distance convention (RH non connecté)
  // Portails token-based — accessibles via /xxx/<token> sans login Supabase.
  // Le token dans l'URL fait office d'authentification (verifie cote serveur
  // a chaque page via createAdminClient + resolve token -> entity).
  "/partenaire/", // Portail OF / prescripteur
  "/mon-parcours/", // Portail apprenant (quiz, emargement, certificat...)
  "/formateur/", // Portail formateur (planning, emargement, positionnement)
  "/emarger/", // Signature emargement apprenant (lien email)
  "/eval/", // Lien evaluation a chaud (depuis email)
  "/evaluation/", // Variante evaluation
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
