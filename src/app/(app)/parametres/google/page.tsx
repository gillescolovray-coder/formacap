import {
  AlertCircle,
  Calendar,
  Check,
  Lock,
  RefreshCw,
  UserCircle,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ParametresNav } from "../_nav";

export default async function GoogleSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Pas encore configuré : la connexion OAuth Google n'est pas active.
  // Les credentials (Client ID / Client Secret) ne sont pas encore en
  // variables d'environnement. Cette page est un placeholder qui
  // explique la fonctionnalité à venir.
  const isConfigured = false;

  return (
    <>
      <PageHeader
        title="Synchronisation Google"
        description="Apprenants vers Google Contacts, sessions vers Google Calendar."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres" },
          { label: "Google" },
        ]}
      />
      <ParametresNav />
      <div className="p-8 max-w-3xl space-y-6">
        {/* Bandeau "non configuré" */}
        <div className="rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Synchronisation pas encore configurée
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                Cette fonctionnalité est en cours d&apos;activation. Une fois
                la configuration terminée côté Google Cloud Console et que les
                identifiants OAuth seront en place, tu pourras connecter ton
                compte Google ci-dessous.
              </p>
            </div>
          </div>
        </div>

        {/* Connexion compte Google (désactivé) */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <UserCircle className="h-5 w-5" />
              Compte Google connecté
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Le compte Google qui recevra les contacts et événements
              synchronisés.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 flex items-center gap-3">
            <Lock className="h-4 w-4 text-zinc-400 shrink-0" />
            <p className="text-sm text-zinc-500 italic">
              Aucun compte connecté.
            </p>
          </div>

          <Button type="button" disabled>
            Connecter mon compte Google
          </Button>
          <p className="text-xs text-zinc-500">
            Le bouton sera activé dès que la configuration côté Google sera
            terminée.
          </p>
        </section>

        {/* Aperçu des fonctionnalités à venir */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Aperçu des synchronisations</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Ce qui sera disponible une fois la fonctionnalité activée.
            </p>
          </div>

          {/* Contacts */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 opacity-70">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Apprenants → Google Contacts</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                  Tes apprenants seront envoyés dans ton carnet de contacts
                  Google avec le libellé{" "}
                  <strong className="text-cyan-700 dark:text-cyan-400">
                    « CAP NUM Logiciel OF »
                  </strong>
                  . Tu pourras donc les retrouver depuis Gmail ou ton
                  téléphone Android.
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 shrink-0">
                Bientôt
              </span>
            </div>
          </div>

          {/* Calendar */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 opacity-70">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Sessions → Google Calendar</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                  Tes sessions de formation seront ajoutées à un calendrier
                  Google dédié{" "}
                  <strong className="text-violet-700 dark:text-violet-400">
                    « Logiciel OF »
                  </strong>
                  . Tu pourras le superposer à ton calendrier perso et
                  recevoir des rappels automatiques.
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 shrink-0">
                Bientôt
              </span>
            </div>
          </div>

          {/* Bouton de sync (désactivé) */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Button type="button" variant="outline" disabled>
              <RefreshCw className="h-4 w-4" />
              Lancer une synchronisation manuelle
            </Button>
          </div>
        </section>

        {/* Info coûts / RGPD */}
        <section className="rounded-xl bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900 p-5">
          <h3 className="text-sm font-bold text-cyan-900 dark:text-cyan-200 flex items-center gap-2">
            <Check className="h-4 w-4" />
            Bon à savoir
          </h3>
          <ul className="mt-2 space-y-1.5 text-xs text-cyan-900/80 dark:text-cyan-200/80 leading-relaxed">
            <li className="flex gap-2">
              <span className="text-cyan-600 dark:text-cyan-400">•</span>
              <span>
                <strong>Gratuit</strong> : les API Google Contacts et Calendar
                sont gratuites pour ton volume (largement sous le quota offert
                par Google).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-cyan-600 dark:text-cyan-400">•</span>
              <span>
                <strong>Aucune écriture sans ton accord</strong> : tu connectes
                un compte Google précis, les synchros se font dans ce compte
                uniquement.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-cyan-600 dark:text-cyan-400">•</span>
              <span>
                <strong>Désynchronisation possible à tout moment</strong> : un
                bouton « Déconnecter » te permettra de couper le lien et
                conserver ou supprimer les données déjà envoyées.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-cyan-600 dark:text-cyan-400">•</span>
              <span>
                <strong>Sens unique pour démarrer</strong> : les modifications
                faites côté Google ne reviennent pas dans le logiciel OF (la
                source de vérité reste l&apos;application).
              </span>
            </li>
          </ul>
        </section>

        {!isConfigured && (
          <p className="text-xs text-zinc-400 italic text-center">
            Tu peux revenir sur cette page une fois la configuration Google
            Cloud terminée pour activer la connexion.
          </p>
        )}
      </div>
    </>
  );
}
