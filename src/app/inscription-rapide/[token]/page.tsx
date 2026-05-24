import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitQuickSignup } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inscription rapide — CAP NUMERIQUE",
  robots: "noindex, nofollow",
};

type Params = { token: string };

/**
 * Page publique d'inscription rapide (sous-traitance, Gilles 2026-05-24).
 *
 * Accédée via QR code que le formateur affiche en début de session quand
 * l'OF donneur d'ordre n'a pas transmis la liste des apprenants en amont.
 *
 * Pas de session Supabase Auth : la possession du token valide l'accès.
 * Après soumission, l'apprenant est redirigé direct sur son quiz
 * pré-formation.
 */
export default async function QuickSignupPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const supabase = createAdminClient();

  // 1. Valider token + récupérer contexte session (pour afficher
  //    le titre de la formation à l'apprenant)
  const { data: tokenRow } = await supabase
    .from("session_quick_signup_tokens")
    .select(
      "session_id, expires_at, session:sessions(start_date, end_date, formation:formations(title), organization:organizations(name, logo_url), subcontractor_name)",
    )
    .eq("token", token)
    .maybeSingle<{
      session_id: string;
      expires_at: string;
      session: {
        start_date: string;
        end_date: string;
        formation: { title: string } | null;
        organization: { name: string; logo_url: string | null } | null;
        subcontractor_name: string | null;
      } | null;
    }>();

  if (!tokenRow || !tokenRow.session) {
    return <NotFound reason="Ce lien d'inscription est invalide ou introuvable." />;
  }
  if (new Date(tokenRow.expires_at) <= new Date()) {
    return <NotFound reason="Ce lien d'inscription a expiré." />;
  }

  const session = tokenRow.session;
  const formationTitle = session.formation?.title ?? "Formation";
  const orgName = session.organization?.name ?? "";
  const orgLogo = session.organization?.logo_url ?? null;
  const subName = session.subcontractor_name;

  // Format date FR
  const startDate = new Date(session.start_date);
  const dateLabel = startDate.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const action = submitQuickSignup.bind(null, token);

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white">
      <div className="max-w-md mx-auto p-4 md:p-6 space-y-4">
        {/* En-tête */}
        <header className="text-center space-y-2 pt-4">
          {orgLogo && (
            <img
              src={orgLogo}
              alt={orgName}
              className="h-12 mx-auto object-contain"
            />
          )}
          <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-bold text-amber-700">
            <Sparkles className="h-3.5 w-3.5" />
            Inscription rapide
          </div>
          <h1 className="text-lg font-bold text-zinc-900 leading-tight">
            {formationTitle}
          </h1>
          <p className="text-xs text-zinc-600">
            {dateLabel}
            {orgName ? ` · ${orgName}` : ""}
          </p>
          {subName && (
            <p className="text-[11px] text-zinc-500 italic">
              Action commandée par : {subName}
            </p>
          )}
        </header>

        {/* Bandeau d'info */}
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
          <p className="font-semibold mb-1">Bienvenue !</p>
          <p>
            Renseignez ce mini-formulaire pour rejoindre la session.
            Vous serez ensuite redirigé(e) vers un court questionnaire
            de positionnement à remplir avant le démarrage de la formation.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Formulaire */}
        <form
          action={action}
          className="rounded-xl bg-white border border-zinc-200 shadow-sm p-4 space-y-3"
        >
          <div className="grid grid-cols-1 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-zinc-700">
                Votre société / employeur <span className="text-red-500">*</span>
              </span>
              <input
                name="company_name_temp"
                type="text"
                required
                autoComplete="organization"
                className="w-full h-11 rounded-md border border-zinc-300 px-3 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
                placeholder="Ex. SARL Dupont"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-zinc-700">
                SIRET (optionnel — 14 chiffres)
              </span>
              <input
                name="company_siret_temp"
                type="text"
                inputMode="numeric"
                pattern="[0-9 ]*"
                maxLength={18}
                className="w-full h-11 rounded-md border border-zinc-300 px-3 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
              />
            </label>

            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1 col-span-1">
                <span className="text-xs font-medium text-zinc-700">
                  Civilité
                </span>
                <select
                  name="civility"
                  className="w-full h-11 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none bg-white"
                  defaultValue=""
                >
                  <option value="">—</option>
                  <option value="Mme">Mme</option>
                  <option value="M.">M.</option>
                </select>
              </label>
              <label className="space-y-1 col-span-2">
                <span className="text-xs font-medium text-zinc-700">
                  Fonction
                </span>
                <input
                  name="job_title"
                  type="text"
                  autoComplete="organization-title"
                  className="w-full h-11 rounded-md border border-zinc-300 px-3 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
                />
              </label>
            </div>

            <label className="space-y-1">
              <span className="text-xs font-medium text-zinc-700">
                Prénom <span className="text-red-500">*</span>
              </span>
              <input
                name="first_name"
                type="text"
                required
                autoComplete="given-name"
                className="w-full h-11 rounded-md border border-zinc-300 px-3 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-zinc-700">
                Nom <span className="text-red-500">*</span>
              </span>
              <input
                name="last_name"
                type="text"
                required
                autoComplete="family-name"
                className="w-full h-11 rounded-md border border-zinc-300 px-3 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-zinc-700">
                Email
              </span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                className="w-full h-11 rounded-md border border-zinc-300 px-3 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
                placeholder="prenom.nom@example.com"
              />
              <span className="text-[11px] text-zinc-500">
                Recommandé pour recevoir l&apos;attestation à la fin
                de la formation.
              </span>
            </label>
          </div>

          <button
            type="submit"
            className="w-full h-12 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm transition"
          >
            Valider & commencer le questionnaire →
          </button>

          <p className="text-[10px] text-zinc-400 text-center">
            Les champs marqués d&apos;un astérisque (*) sont obligatoires.
            Vos données sont enregistrées par l&apos;organisme de formation
            uniquement pour les besoins administratifs (feuille de
            présence, attestation).
          </p>
        </form>
      </div>
    </div>
  );
}

function NotFound({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md bg-white rounded-xl shadow-md border border-zinc-200 p-6 text-center space-y-3">
        <h1 className="text-lg font-bold">Lien d&apos;inscription</h1>
        <p className="text-sm text-zinc-600">{reason}</p>
        <p className="text-xs text-zinc-400">
          Rapprochez-vous du formateur pour obtenir un lien à jour.
        </p>
      </div>
    </div>
  );
}
