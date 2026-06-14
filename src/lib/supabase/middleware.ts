import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth",
  "/c/", // Catalogue de vente publié — accessible sans connexion
  "/portail", // Portail public de catalogue + fiches formation (sans login)
  "/api/catalog/", // Téléchargement PDF du catalogue public
  "/signer/", // Signature à distance émargement (apprenants non connectés)
  "/conventions/", // Signature à distance convention (RH non connecté)
  // Portails token-based — accessibles via /xxx/<token> sans login Supabase.
  // Le token dans l'URL fait office d'authentification (verifie cote serveur
  // a chaque page via createAdminClient + resolve token -> entity).
  "/partenaire/", // Portail OF / prescripteur
  "/preinscription/", // Page publique de pré-inscription (lien diffusé par un partenaire)
  "/mon-parcours/", // Portail apprenant (quiz, emargement, certificat...)
  "/formateur/", // Portail formateur (planning, emargement, positionnement)
  "/emarger/", // Signature emargement apprenant (lien email)
  "/eval/", // Lien evaluation a chaud (depuis email)
  "/evaluation/", // Variante evaluation
  // BUG FIX URGENT Gilles 2026-05-27 : ces routes etaient bloquees par
  // le middleware -> redirige vers /login alors qu'aucun compte n'est
  // requis (token URL = authentification).
  "/inscription-rapide/", // QR inscription rapide sous-traitance (formateur affiche QR)
  "/quiz-session/", // QR quiz partage session (formateur affiche QR -> liste apprenants)
];

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Convocation imprimable servie en mode public via le token portail de
  // l'inscription (?token=) : lien envoyé par email (apprenant/RH) OU
  // visualisation depuis le portail formateur. La page valide elle-même
  // le token contre l'enrollment. Gilles 2026-06-05.
  const isPublicConvocation =
    /^\/sessions\/[^/]+\/convocations\/[^/]+\/print\/?$/.test(pathname) &&
    request.nextUrl.searchParams.has("token");

  // Pages imprimables internes (authentifiées) à rendre SANS sidebar :
  // programme de formation. Gilles 2026-06-09.
  const isBareLayout =
    /^\/formations\/[^/]+\/programme\/?$/.test(pathname) ||
    /^\/programmes\/[^/]+\/apercu\/?$/.test(pathname) ||
    /^\/sessions\/[^/]+\/quiz\/print\/?$/.test(pathname) ||
    /^\/sessions\/[^/]+\/evaluation\/print\/?$/.test(pathname);

  // En-tête propagé au layout (app) : permet à AppShell de rendre la
  // convocation publique SANS exiger de login (sinon page blanche /login).
  const requestHeaders = new Headers(request.headers);
  if (isPublicConvocation) requestHeaders.set("x-public-print", "1");
  if (isBareLayout) requestHeaders.set("x-bare-layout", "1");

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

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
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
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

  const isPublic =
    isPublicConvocation || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

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
