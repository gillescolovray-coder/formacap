"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  ExternalLink,
  GraduationCap,
  MailCheck,
  RefreshCw,
  Send,
} from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { Button } from "@/components/ui/button";
import {
  activateTrainerPortal,
  resendTrainerPortalInvitation,
  revokeTrainerPortal,
} from "./trainer-portal-actions";

type Props = {
  trainerId: string;
  trainerName: string;
  trainerEmail: string | null;
  /** Token actuellement actif (null si portail désactivé). */
  token: string | null;
};

/**
 * Section "Accès au portail formateur" sur la fiche formateur admin.
 * Calque du pattern partenaire (entreprises/[id]/_partner-portal-section.tsx)
 * avec en plus un bouton "Envoyer / Renvoyer l'invitation par email"
 * (demande Gilles 2026-05-23).
 *
 * États :
 *  - Inactif (token null) : bouton "Activer + envoyer l'invitation"
 *  - Actif (token présent) :
 *      - URL copiable + bouton Ouvrir
 *      - Bouton "Renvoyer l'invitation par email"
 *      - Bouton "Révoquer" (supprime le token, ancien lien invalidé)
 */
export function TrainerPortalSection({
  trainerId,
  trainerName,
  trainerEmail,
  token,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Origin calculé côté client (post-mount) — évite l'erreur d'hydration SSR.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const portalUrl = token && origin ? `${origin}/formateur/${token}` : null;

  function activate() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await activateTrainerPortal(trainerId);
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      if (res.emailSent === false) {
        setInfo(
          `Lien créé. Email NON envoyé : ${res.emailError ?? "raison inconnue"}.`,
        );
      } else {
        setInfo(`Lien créé et email d'invitation envoyé à ${trainerEmail}.`);
      }
      router.refresh();
    });
  }

  function resend() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await resendTrainerPortalInvitation(trainerId);
      if (!res.ok) {
        setError(res.emailError ?? res.error ?? "Erreur");
        return;
      }
      setInfo(`Invitation renvoyée à ${trainerEmail}.`);
    });
  }

  function revoke() {
    if (
      !confirm(
        "Révoquer l'accès au portail ?\n\n" +
          "L'ancien lien ne fonctionnera plus immédiatement et le formateur ne pourra plus accéder à son espace.\n\n" +
          "Vous pourrez recréer un nouveau lien à tout moment (nouveau token).",
      )
    )
      return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await revokeTrainerPortal(trainerId);
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      setInfo("Accès révoqué.");
      router.refresh();
    });
  }

  async function copyLink() {
    if (!portalUrl) return;
    await navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <CollapsibleSection
      icon={GraduationCap}
      title="Accès au portail formateur"
      description="Espace privé permettant à ce formateur de consulter ses sessions, gérer l'émargement, saisir son bilan et téléverser ses supports."
      accent="blue"
      defaultOpen
      id="trainer-portal"
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 flex items-start gap-2">
            <Check className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{info}</span>
          </div>
        )}

        {!token ? (
          <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-zinc-700">
              <strong>Portail inactif.</strong> Activez pour créer le lien
              d&apos;accès personnel et envoyer l&apos;email d&apos;invitation
              à <strong>{trainerName}</strong>
              {trainerEmail ? (
                <>
                  {" "}
                  (<code className="text-[11px]">{trainerEmail}</code>).
                </>
              ) : (
                "."
              )}
              {!trainerEmail && (
                <div className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
                  ⚠ Renseignez d&apos;abord un email dans la fiche du
                  formateur pour pouvoir envoyer l&apos;invitation.
                </div>
              )}
            </div>
            <Button
              type="button"
              onClick={activate}
              disabled={pending || !trainerEmail}
              size="sm"
              title={
                !trainerEmail
                  ? "Renseignez d'abord un email"
                  : "Crée le lien et envoie l'email d'invitation"
              }
            >
              <Send className="h-4 w-4" />
              Activer + envoyer l&apos;invitation
            </Button>
          </div>
        ) : (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-wider font-bold text-emerald-700 mb-1">
                  Portail actif
                </p>
                <p className="text-xs text-emerald-900">
                  Lien personnel transmis au formateur :
                </p>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <code className="font-mono text-[11px] bg-white border border-emerald-200 px-2 py-1.5 rounded text-zinc-700 break-all max-w-full">
                    {portalUrl ?? "…"}
                  </code>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  onClick={copyLink}
                  size="sm"
                  variant="outline"
                  disabled={!portalUrl}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copié
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copier le lien
                    </>
                  )}
                </Button>
                {portalUrl && (
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-xs border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-700 font-medium"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ouvrir
                  </a>
                )}
                <Button
                  type="button"
                  onClick={resend}
                  size="sm"
                  variant="outline"
                  disabled={pending || !trainerEmail}
                  title={
                    !trainerEmail
                      ? "Renseignez d'abord un email"
                      : `Renvoyer l'email d'invitation à ${trainerEmail}`
                  }
                >
                  <MailCheck className="h-4 w-4" />
                  Renvoyer l&apos;invitation
                </Button>
                <Button
                  type="button"
                  onClick={revoke}
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  title="Supprime le token : l'ancien lien cesse de fonctionner"
                >
                  <RefreshCw className="h-4 w-4" />
                  Révoquer
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-emerald-700 italic">
              💡 Le formateur conserve ce lien : il est valide tant qu&apos;il
              n&apos;est pas révoqué. Renvoyez l&apos;invitation s&apos;il
              l&apos;a perdu.
            </p>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
