"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Calendar, Loader2, RotateCcw, Send, X } from "lucide-react";
import { cancelOrPostponeSession } from "./cancel-postpone-actions";

type FutureSession = {
  id: string;
  label: string;
  startDate: string;
};

type Props = {
  sessionId: string;
  /** Sessions futures de la meme organisation, pour le report. */
  futureSessions: FutureSession[];
  /** Titre de la formation — utilise pour pre-remplir le message par
   *  defaut dans le textarea (Gilles 2026-05-28). */
  formationTitle: string;
  /** Date de la session source au format affichable (ex "8 juin 2026"). */
  sourceDateLabel: string;
  /** Compteurs precalcules cote serveur pour l'apercu des notifs. */
  preview: {
    learnersDirect: number;
    partners: number;
    partnersList: string[];
    /** Partenaires SANS email -> on les signale en rouge dans
     *  l'apercu pour que l'admin sache que ces OF ne recevront pas
     *  le mail (Gilles 2026-05-28). */
    partnersWithoutEmail: string[];
    trainerHasEmail: boolean;
  };
  onClose: () => void;
};

function buildDefaultMessage(
  decision: "cancel" | "postpone",
  formationTitle: string,
  sourceDateLabel: string,
  targetDateLabel: string | null,
): string {
  if (decision === "cancel") {
    return `Nous sommes contraints d'annuler la session « ${formationTitle} » prévue le ${sourceDateLabel}, faute d'un nombre suffisant de participants.

Nous vous prions de nous excuser pour ce désagrément. N'hésitez pas à consulter notre catalogue pour vous inscrire à une autre session.

Pour toute question, contactez-nous par retour d'email.`;
  }
  const target = targetDateLabel ?? "(date à confirmer)";
  return `La session « ${formationTitle} » prévue le ${sourceDateLabel} est reportée au ${target} (pour les mêmes contenus et durée).

Merci de nous confirmer si vous acceptez ce report ou si vous préférez annuler votre inscription. Vous pouvez nous répondre directement par retour d'email.`;
}

/**
 * Modale "Annuler / Reporter cette session" — V1 Gilles 2026-05-28.
 *
 * Permet de choisir entre annulation definitive et report sur une
 * session existante, avec un message personnalise (template par
 * defaut editable). Affiche un apercu du nombre de destinataires
 * (apprenants directs vs prescripteurs / OF).
 */
export function CancelPostponeModal({
  sessionId,
  futureSessions,
  formationTitle,
  sourceDateLabel,
  preview,
  onClose,
}: Props) {
  const router = useRouter();
  const [decision, setDecision] = useState<"cancel" | "postpone">("cancel");
  const [targetSessionId, setTargetSessionId] = useState<string>("");
  // Label de la session cible (pour l'inserer dans le message par defaut)
  const targetSession = futureSessions.find((s) => s.id === targetSessionId);
  const targetDateLabel = targetSession
    ? targetSession.label.split(" — ")[0]
    : null;

  // Message par defaut recalcule en temps reel selon decision + cible.
  // Pre-rempli dans le textarea (Gilles 2026-05-28) — l'utilisateur
  // peut modifier librement. Si on a edite mais qu'on rechange la
  // decision/cible, on re-injecte le default (le contexte a change).
  const defaultMessage = buildDefaultMessage(
    decision,
    formationTitle,
    sourceDateLabel,
    targetDateLabel,
  );
  const [customMessage, setCustomMessage] = useState<string>(defaultMessage);
  const [userHasEdited, setUserHasEdited] = useState(false);
  // Sync : si l'utilisateur n'a PAS modifie le message manuellement,
  // on garde le textarea synchro avec le default (qui change selon
  // la decision ou la session cible). Sinon on respecte sa saisie.
  useEffect(() => {
    if (!userHasEdited) setCustomMessage(defaultMessage);
  }, [defaultMessage, userHasEdited]);

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (decision === "postpone" && !targetSessionId) {
      setError("Sélectionnez la session sur laquelle reporter.");
      return;
    }
    if (
      !confirm(
        decision === "cancel"
          ? "Confirmer l'annulation définitive de cette session ? Les inscrits (et le formateur) seront notifiés par email."
          : "Confirmer le report de cette session ? Les inscrits (et le formateur) seront notifiés par email avec la nouvelle date.",
      )
    )
      return;

    startTransition(async () => {
      const res = await cancelOrPostponeSession({
        sessionId,
        decision,
        targetSessionId: decision === "postpone" ? targetSessionId : null,
        customMessage: customMessage.trim() || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Erreur inconnue.");
        return;
      }
      const parts: string[] = [];
      if (res.notifications) {
        if (res.notifications.learnersDirect > 0)
          parts.push(
            `${res.notifications.learnersDirect} apprenant(s) notifié(s)`,
          );
        if (res.notifications.partners > 0)
          parts.push(
            `${res.notifications.partners} partenaire(s) notifié(s)`,
          );
        if (res.notifications.trainerNotified) parts.push("formateur notifié");
      }
      const extras: string[] = [];
      if (res.notifications?.fallbackToLearner) {
        extras.push(
          `⚠ ${res.notifications.fallbackToLearner} apprenant(s) notifié(s) en fallback (OF sans email)`,
        );
      }
      if (res.notifications?.skipped?.length) {
        extras.push(
          `⚠ ${res.notifications.skipped.length} non joignable(s) — à contacter manuellement : ${res.notifications.skipped.map((s) => s.name).join(", ")}`,
        );
      }
      const summary = `Session ${decision === "cancel" ? "annulée" : "reportée"} avec succès.\n\n${parts.join(" — ")}${extras.length > 0 ? "\n\n" + extras.join("\n") : ""}`;
      alert(summary);
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 sticky top-0 bg-white">
          <h2 className="font-bold text-zinc-900 text-base inline-flex items-center gap-2">
            <Ban className="h-4 w-4 text-rose-600" />
            Annuler ou reporter la session
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs text-zinc-600 italic">
            Choisissez la décision à prendre. Les apprenants inscrits en
            direct seront notifiés à leur email personnel. Les inscriptions
            faites par un OF / prescripteur seront notifiées à leur
            contact partenaire (et non à l&apos;apprenant).
          </p>

          {/* Aperçu destinataires */}
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs space-y-1">
            <div className="font-bold text-blue-900">
              📊 Aperçu des notifications
            </div>
            <ul className="list-disc list-inside text-blue-800 space-y-0.5">
              <li>
                <strong>{preview.learnersDirect}</strong> apprenant
                {preview.learnersDirect > 1 ? "s" : ""} direct
                {preview.learnersDirect > 1 ? "s" : ""} → email à
                l&apos;apprenant
              </li>
              <li>
                <strong>{preview.partners}</strong> OF / Prescripteur
                {preview.partners > 1 ? "s" : ""} → email au partenaire
                {preview.partnersList.length > 0 && (
                  <span className="text-blue-700 italic">
                    {" "}({preview.partnersList.join(", ")})
                  </span>
                )}
              </li>
              <li>
                Formateur :{" "}
                {preview.trainerHasEmail
                  ? "✅ sera notifié"
                  : "⚠ pas d'email renseigné — non notifié"}
              </li>
            </ul>
          </div>

          {/* Warning visible si un ou plusieurs OF n'ont PAS d'email
              -> l'admin doit savoir avant d'envoyer pour pouvoir
              completer la fiche entreprise (Gilles 2026-05-28). */}
          {preview.partnersWithoutEmail.length > 0 && (
            <div className="rounded-lg bg-amber-50 border-2 border-amber-300 p-3 text-xs space-y-1.5">
              <div className="font-bold text-amber-900 inline-flex items-center gap-1">
                ⚠ Partenaire(s) sans email
              </div>
              <p className="text-amber-800">
                Les OF / prescripteurs suivants n&apos;ont pas
                d&apos;email renseigné dans leur fiche entreprise :
              </p>
              <ul className="list-disc list-inside text-amber-900 font-semibold">
                {preview.partnersWithoutEmail.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p className="text-amber-800 italic">
                Si vous validez maintenant, le système notifiera
                l&apos;apprenant en fallback (ou le marquera comme « à
                contacter manuellement » si l&apos;apprenant non plus
                n&apos;a pas d&apos;email). Pour notifier le partenaire,
                ajoutez son email sur la fiche entreprise avant de
                valider.
              </p>
            </div>
          )}

          {/* Choix décision */}
          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer p-3 rounded-lg border-2 border-zinc-200 hover:border-rose-300 hover:bg-rose-50/50 has-[:checked]:border-rose-500 has-[:checked]:bg-rose-50">
              <input
                type="radio"
                name="decision"
                value="cancel"
                checked={decision === "cancel"}
                onChange={() => setDecision("cancel")}
                className="mt-0.5 h-4 w-4"
                disabled={pending}
              />
              <div className="flex-1">
                <div className="font-bold text-sm text-rose-900 inline-flex items-center gap-1.5">
                  <Ban className="h-3.5 w-3.5" />
                  Annuler définitivement
                </div>
                <p className="text-[11px] text-rose-700 mt-0.5">
                  Statut session = Annulée. Les conventions signées
                  deviennent caduques. Les inscrits seront notifiés.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer p-3 rounded-lg border-2 border-zinc-200 hover:border-amber-300 hover:bg-amber-50/50 has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50">
              <input
                type="radio"
                name="decision"
                value="postpone"
                checked={decision === "postpone"}
                onChange={() => setDecision("postpone")}
                className="mt-0.5 h-4 w-4"
                disabled={pending}
              />
              <div className="flex-1">
                <div className="font-bold text-sm text-amber-900 inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Reporter sur une autre session
                </div>
                <p className="text-[11px] text-amber-700 mt-0.5 mb-2">
                  Statut session = Reportée. Les inscrits recevront la
                  nouvelle date et pourront accepter ou refuser par email.
                </p>
                {decision === "postpone" && (
                  <select
                    value={targetSessionId}
                    onChange={(e) => setTargetSessionId(e.target.value)}
                    disabled={pending}
                    className="w-full h-9 rounded-md border border-amber-300 bg-white px-2 text-sm"
                  >
                    <option value="">— Choisir la session cible —</option>
                    {futureSessions.length === 0 ? (
                      <option value="" disabled>
                        Aucune session future planifiée — créez-en une d&apos;abord
                      </option>
                    ) : (
                      futureSessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>
            </label>
          </div>

          {/* Message personnalisé pre-rempli avec le template par
              defaut. L'utilisateur peut le modifier librement.
              Bouton "Reinitialiser" pour revenir au template si on
              s'est trompe (Gilles 2026-05-28). */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-zinc-700">
                Message envoyé aux destinataires
              </label>
              {userHasEdited && (
                <button
                  type="button"
                  onClick={() => {
                    setUserHasEdited(false);
                    setCustomMessage(defaultMessage);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] text-cyan-700 hover:text-cyan-900 underline"
                  disabled={pending}
                  title="Revenir au texte standard pour cette décision"
                >
                  <RotateCcw className="h-3 w-3" />
                  Réinitialiser au message par défaut
                </button>
              )}
            </div>
            <textarea
              value={customMessage}
              onChange={(e) => {
                setUserHasEdited(true);
                setCustomMessage(e.target.value);
              }}
              disabled={pending}
              rows={6}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400"
            />
            <p className="text-[10px] text-zinc-500 italic">
              Message pré-rempli — modifiez-le librement avant envoi.
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end p-4 border-t border-zinc-200 sticky bottom-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-md border border-zinc-300 bg-white text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className={
              "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-white text-sm font-bold disabled:opacity-50 " +
              (decision === "cancel"
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-amber-600 hover:bg-amber-700")
            }
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Envoi…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Envoyer les notifications
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Petit wrapper bouton + state pour ouvrir la modale depuis la
 * fiche session.
 */
export function CancelPostponeButton(props: Omit<Props, "onClose">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-rose-300 bg-rose-50 text-rose-700 text-sm font-semibold hover:bg-rose-100 hover:border-rose-500"
        title="Annuler ou reporter cette session (avec notification automatique des inscrits)"
      >
        <Ban className="h-4 w-4" />
        Annuler / Reporter
      </button>
      {open && <CancelPostponeModal {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
