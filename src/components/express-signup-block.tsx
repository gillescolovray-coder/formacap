"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  Copy,
  Maximize2,
  QrCode,
  RefreshCw,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type QuickSignupResult =
  | { url: string; token: string }
  | { error: string };

type Props = {
  /** Server action qui crée l'apprenant temporaire + inscription + token */
  createAction: (formData: FormData) => void | Promise<void>;
  /** Server action qui retourne l'URL publique du QR */
  generateQuickSignupAction: () => Promise<QuickSignupResult>;
  /** Affiché en sous-titre du bloc (ex. nom OF donneur d'ordre) */
  subcontractorName?: string | null;
  /** Bandeau d'aide contextuel (texte court) */
  helpText?: string;
  /** Nombre de participants déjà inscrits. Si 0, on bascule en mode
   *  'tour de table' avec un message d'action explicite et le QR mis
   *  en avant comme bouton principal. */
  participantCount?: number;
};

/**
 * Bloc "Saisie express" pour sous-traitance (Gilles 2026-05-24).
 *
 * Affiché côté admin ET côté portail formateur quand la session est
 * marquée `is_subcontracted=true`. Propose deux mécanismes :
 *  1) Formulaire de saisie manuelle (6 champs) — pratique si l'utilisateur
 *     est devant son ordinateur ou son téléphone avec l'apprenant.
 *  2) QR code "Inscription rapide" — affiché au mur ou sur l'écran du
 *     formateur ; l'apprenant scanne, remplit et arrive direct sur le quiz.
 */
export function ExpressSignupBlock({
  createAction,
  generateQuickSignupAction,
  subcontractorName,
  helpText,
  participantCount = 0,
}: Props) {
  const noParticipantsYet = participantCount === 0;
  const [qrOpen, setQrOpen] = useState(false);
  const [qrFullscreen, setQrFullscreen] = useState(false);
  const [qrData, setQrData] = useState<QuickSignupResult | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!qrOpen || qrData) return;
    let cancelled = false;
    setQrLoading(true);
    generateQuickSignupAction().then((res) => {
      if (cancelled) return;
      setQrData(res);
      setQrLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [qrOpen, qrData, generateQuickSignupAction]);

  useEffect(() => {
    if (!qrOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (qrFullscreen) setQrFullscreen(false);
        else setQrOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [qrOpen, qrFullscreen]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    startTransition(async () => {
      await createAction(fd);
      form.reset();
      setFormOpen(false);
    });
  }

  const qrUrl =
    qrData && "url" in qrData ? qrData.url : null;
  const qrError = qrData && "error" in qrData ? qrData.error : null;

  const overlays = (
    <>
      {qrOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto"
          onClick={() => setQrOpen(false)}
        >
          <div className="min-h-full flex items-start sm:items-center justify-center p-4 py-8">
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-3 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setQrOpen(false)}
                className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-zinc-100 text-zinc-500"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="text-center space-y-1">
                <div className="text-xs uppercase tracking-widest text-amber-700 font-semibold">
                  Inscription rapide — tour de table
                </div>
                <h2 className="text-lg font-bold text-zinc-900">
                  Affichez ce QR code aux apprenants
                </h2>
                <p className="text-sm text-zinc-600">
                  Pendant le tour de table, chaque apprenant scanne avec
                  son téléphone, renseigne sa fiche, puis enchaîne
                  directement sur le quiz pré-formation —{" "}
                  <strong>sans ressaisir ses informations</strong>.
                </p>
                <p className="text-[11px] text-zinc-500 pt-1">
                  Astuce : cliquez sur <em>Plein écran</em> pour
                  l&apos;afficher en grand sur votre ordinateur ou
                  vidéo-projecteur.
                </p>
              </div>

              {qrLoading || !qrData ? (
                <div className="aspect-square max-w-xs mx-auto flex items-center justify-center bg-zinc-50 rounded-lg">
                  <div className="text-sm text-zinc-500">
                    Génération du QR code…
                  </div>
                </div>
              ) : qrError ? (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {qrError}
                </div>
              ) : qrUrl ? (
                <>
                  <div className="flex items-center justify-center bg-white rounded-lg border-2 border-zinc-200 p-3">
                    <QRCodeSVG
                      value={qrUrl}
                      size={220}
                      level="M"
                      marginSize={2}
                    />
                  </div>

                  <div className="text-center space-y-1">
                    <a
                      href={qrUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-amber-700 hover:underline break-all"
                    >
                      {qrUrl}
                    </a>
                  </div>

                  <div className="flex gap-2 justify-center pt-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(qrUrl);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        } catch {
                          // clipboard indisponible : on ignore
                        }
                      }}
                      title="Copier le lien d'inscription (à coller dans le chat de la visio)"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copied ? "Lien copié !" : "Copier le lien"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQrFullscreen(true)}
                    >
                      <Maximize2 className="h-4 w-4" />
                      Plein écran
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setQrData(null);
                      }}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Recharger
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {qrOpen && qrFullscreen && qrUrl && (
        <div
          className="fixed inset-0 z-[110] bg-white flex flex-col items-center justify-between p-4 sm:p-6 cursor-pointer"
          style={{ height: "100dvh" }}
          onClick={() => setQrFullscreen(false)}
        >
          <div className="text-xs uppercase tracking-widest text-amber-700 font-semibold text-center shrink-0">
            Inscription rapide — scannez pour rejoindre la session
          </div>
          <div className="flex items-center justify-center min-h-0 flex-1 w-full">
            <div
              className="aspect-square"
              style={{
                width: "min(70dvh, 90vw, 600px)",
                height: "min(70dvh, 90vw, 600px)",
              }}
            >
              <QRCodeSVG
                value={qrUrl}
                level="M"
                marginSize={2}
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          </div>
          <div className="shrink-0 text-center space-y-1">
            <a
              href={qrUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-sm text-amber-700 hover:underline font-mono break-all px-2"
            >
              {qrUrl}
            </a>
            <div className="text-xs text-zinc-400">
              Cliquez n&apos;importe où pour quitter
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <section className="rounded-xl bg-amber-50 border border-amber-200 p-4 sm:p-5 space-y-4">
      <header className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-100 text-amber-700 p-2 shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-amber-900">
            Saisie express — sous-traitance
          </h2>
          <p className="text-xs text-amber-800 mt-0.5">
            {subcontractorName
              ? `Donneur d'ordre : ${subcontractorName}. `
              : ""}
            {helpText ??
              "Pour les apprenants découverts le jour J. Choisissez la méthode la plus pratique selon la situation."}
          </p>
        </div>
      </header>

      {/* Encart pédagogique tour-de-table quand aucun participant
          n'est encore inscrit. Le QR est mis en avant comme action
          principale (Gilles 2026-05-24). */}
      {noParticipantsYet && (
        <div className="rounded-lg bg-white border-2 border-amber-400 p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="rounded-full bg-amber-100 text-amber-700 h-7 w-7 flex items-center justify-center shrink-0 font-bold text-sm">
              👋
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-amber-900">
                Aucun apprenant inscrit pour le moment ?
              </h3>
              <p className="text-xs text-zinc-700 mt-1 leading-relaxed">
                Au démarrage de la session, pendant le{" "}
                <strong>tour de table</strong>, affichez le QR code «
                inscription rapide » en grand sur votre écran ou
                vidéo-projecteur.
                <br />
                <strong>Chaque apprenant</strong> :
              </p>
              <ol className="text-xs text-zinc-700 mt-1.5 ml-3 list-decimal space-y-0.5">
                <li>scanne le QR avec son téléphone,</li>
                <li>renseigne ses informations (société, nom, email…),</li>
                <li>
                  enchaîne directement par le{" "}
                  <strong>quiz d&apos;entrée (pré-formation)</strong>.
                </li>
              </ol>
              <p className="text-[11px] text-zinc-500 italic mt-1.5">
                Pas de double saisie : leurs infos arrivent automatiquement
                dans la liste Participants ci-dessous.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm py-3 transition"
          >
            <QrCode className="h-5 w-5" />
            Afficher le QR « inscription rapide » + Quiz
          </button>
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-white border border-amber-300 hover:bg-amber-50 text-amber-800 text-xs py-2 transition"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Ou saisir un apprenant manuellement (cas isolé)
          </button>
        </div>
      )}

      {/* Mode 'avec participants' : deux boutons équivalents */}
      {!noParticipantsYet && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="flex flex-col items-start gap-1 rounded-lg bg-white border border-amber-300 hover:border-amber-500 hover:bg-amber-50 transition p-3 text-left"
          >
            <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
              <UserPlus className="h-4 w-4" />
              Saisir un apprenant
            </div>
            <p className="text-[11px] text-zinc-600">
              Formulaire rapide (6 champs). À utiliser quand vous êtes devant
              l&apos;apprenant.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="flex flex-col items-start gap-1 rounded-lg bg-white border border-amber-300 hover:border-amber-500 hover:bg-amber-50 transition p-3 text-left"
          >
            <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
              <QrCode className="h-4 w-4" />
              QR « inscription rapide »
            </div>
            <p className="text-[11px] text-zinc-600">
              Les apprenants scannent, remplissent eux-mêmes et arrivent direct
              sur le quiz pré-formation.
            </p>
          </button>
        </div>
      )}

      {formOpen && (
        <form
          onSubmit={onSubmit}
          className="rounded-lg bg-white border border-amber-300 p-3 sm:p-4 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-zinc-700">
                Société (donneur d&apos;ordre / employeur)
                <span className="text-red-500"> *</span>
              </span>
              <input
                name="company_name_temp"
                type="text"
                required
                autoComplete="organization"
                className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
                placeholder="Ex. SARL Dupont"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-zinc-700">
                SIRET (optionnel)
              </span>
              <input
                name="company_siret_temp"
                type="text"
                inputMode="numeric"
                pattern="[0-9 ]*"
                maxLength={18}
                className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
                placeholder="14 chiffres"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-zinc-700">Civilité</span>
              <select
                name="civility"
                className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none bg-white"
                defaultValue=""
              >
                <option value="">—</option>
                <option value="Mme">Mme</option>
                <option value="M.">M.</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-zinc-700">
                Fonction
              </span>
              <input
                name="job_title"
                type="text"
                autoComplete="organization-title"
                className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-zinc-700">
                Prénom <span className="text-red-500">*</span>
              </span>
              <input
                name="first_name"
                type="text"
                required
                autoComplete="given-name"
                className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
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
                className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-zinc-700">Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
                placeholder="prenom.nom@example.com"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFormOpen(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <UserPlus className="h-4 w-4" />
              {pending ? "Enregistrement…" : "Inscrire l'apprenant"}
            </Button>
          </div>
          <p className="text-[11px] text-zinc-500">
            L&apos;apprenant est créé en mode « temporaire » et apparaît
            dans la liste des participants. Vous pourrez plus tard le
            promouvoir vers une fiche définitive (entreprise + apprenant
            stockés dans le CRM).
          </p>
        </form>
      )}

      {mounted ? createPortal(overlays, document.body) : null}
    </section>
  );
}
