"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendSelectedEnrollmentNotifications } from "@/lib/email/enrollment-notifications";

type EnrollmentItem = {
  enrollmentId: string;
  name: string;
  apprenantEmail: string | null;
  alreadySent: boolean; // basé sur inscription_email_sent_at
  sentAt: string | null;
  /** Contact RH (principal) de la société de l'apprenant. Le RH est
   *  notifié automatiquement en même temps que l'apprenant. */
  rhName?: string | null;
  rhEmail?: string | null;
};

/**
 * Bouton + modale de re-envoi. Liste tous les apprenants inscrits, avec
 * une checkbox par ligne :
 *   - Cochée par défaut si l'apprenant N'A PAS été notifié (rattrapage)
 *   - Décochée par défaut si déjà notifié (l'utilisateur peut cocher
 *     manuellement pour forcer un renvoi)
 */
export function ResendModal({
  items,
  disabled,
}: {
  items: EnrollmentItem[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(items.filter((i) => !i.alreadySent).map((i) => i.enrollmentId)),
  );
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<{
    apprenantSent: number;
    rhSent: number;
    failed: number;
    errors: Array<{ id: string; reason: string }>;
  } | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.enrollmentId)));
    }
  };

  const onSend = () => {
    if (selected.size === 0) return;
    if (
      !confirm(
        `Renvoyer les emails à ${selected.size} apprenant${selected.size > 1 ? "s" : ""} (+ leur RH) ?`,
      )
    )
      return;
    setSummary(null);
    startTransition(async () => {
      const res = await sendSelectedEnrollmentNotifications(
        Array.from(selected),
      );
      setSummary({
        apprenantSent: res.apprenantSent,
        rhSent: res.rhSent,
        failed: res.failed,
        errors: res.errors,
      });
    });
  };

  const close = () => {
    setOpen(false);
    setSummary(null);
    // Reset à la sélection auto pour la prochaine ouverture
    setSelected(
      new Set(items.filter((i) => !i.alreadySent).map((i) => i.enrollmentId)),
    );
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="default"
        onClick={() => setOpen(true)}
        disabled={disabled || items.length === 0}
        title="Renvoyer aux destinataires sélectionnés (rattrapage, modification, etc.)"
      >
        <RefreshCw className="h-4 w-4" />
        Renvoyer…
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4"
          onClick={close}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">
                  Renvoyer les notifications d&apos;inscription
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Sélectionne les apprenants à notifier. Le RH (contact
                  principal) recevra <strong>1 seul email récapitulatif par
                  société</strong> avec la liste complète des apprenants
                  (les nouveaux sont marqués).
                </p>
              </div>
              <button
                onClick={close}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {summary ? (
              <div className="p-6 space-y-3">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm">
                  <strong className="text-emerald-900">
                    Envoi terminé.
                  </strong>
                  <ul className="mt-1.5 text-emerald-800 space-y-0.5">
                    <li>
                      ✓ {summary.apprenantSent} email
                      {summary.apprenantSent > 1 ? "s" : ""} apprenant
                      {summary.apprenantSent > 1 ? "s" : ""}
                    </li>
                    <li>
                      ✓ {summary.rhSent} email
                      {summary.rhSent > 1 ? "s" : ""} RH récapitulatif
                      {summary.rhSent > 1 ? "s" : ""} (1 par société)
                    </li>
                    {summary.failed > 0 && (
                      <li className="text-rose-700">
                        ✗ {summary.failed} échec(s)
                      </li>
                    )}
                  </ul>
                  {summary.errors.length > 0 && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer">
                        Voir les erreurs
                      </summary>
                      <ul className="mt-1 ml-4 list-disc text-rose-700">
                        {summary.errors.map((e, i) => (
                          <li key={i}>{e.reason}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button onClick={close}>Fermer</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/40">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.size === items.length}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    <span className="font-medium">
                      Tout {selected.size === items.length ? "désélectionner" : "sélectionner"}
                    </span>
                  </label>
                  <span className="text-xs text-zinc-500">
                    {selected.size} / {items.length} sélectionné
                    {selected.size > 1 ? "s" : ""}
                  </span>
                </div>

                <ul className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
                  {items.map((item) => {
                    const checked = selected.has(item.enrollmentId);
                    return (
                      <li
                        key={item.enrollmentId}
                        className={`px-6 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-950/40 ${
                          checked ? "bg-cyan-50/40" : ""
                        }`}
                      >
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(item.enrollmentId)}
                            className="h-4 w-4 mt-0.5 rounded border-zinc-300"
                            disabled={!item.apprenantEmail}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm flex items-center gap-1.5">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-500" />
                              {item.name}
                              <span className="text-[10px] uppercase tracking-wider text-cyan-600 font-bold">
                                Apprenant
                              </span>
                            </div>
                            <div className="text-xs text-zinc-500 mt-0.5 ml-3">
                              {item.apprenantEmail ?? (
                                <span className="text-rose-600 italic">
                                  Pas d&apos;email — impossible d&apos;envoyer
                                </span>
                              )}
                            </div>
                            {/* Contact RH affiché en sous-ligne — inclus
                                dans le mail récap envoyé une fois par société */}
                            {item.rhEmail ? (
                              <div className="mt-2 ml-3 pl-2 border-l-2 border-emerald-200">
                                <div className="text-xs font-medium flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  {item.rhName ?? "Contact RH"}
                                  <span className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold">
                                    RH
                                  </span>
                                  <span className="text-[10px] text-zinc-400 italic">
                                    (1 mail récap par société)
                                  </span>
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                  {item.rhEmail}
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2 ml-3 text-[11px] text-amber-700 italic">
                                ⚠️ Pas de contact RH principal — seul
                                l&apos;apprenant sera notifié
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-right shrink-0">
                            {item.alreadySent ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                                ✓ Déjà envoyé
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                                ⏳ Non notifié
                              </span>
                            )}
                            {item.sentAt && (
                              <div className="text-[10px] text-zinc-400 mt-0.5">
                                {new Date(item.sentAt).toLocaleDateString("fr-FR")}
                              </div>
                            )}
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                <footer className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500 max-w-md">
                    💡 Par défaut, les apprenants <strong>non notifiés</strong> sont cochés.
                    Tu peux ajouter ceux déjà notifiés (pour renvoi après
                    modification de la convention par exemple).
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={close}>
                      Annuler
                    </Button>
                    <Button
                      onClick={onSend}
                      disabled={pending || selected.size === 0}
                    >
                      {pending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Envoyer ({selected.size})
                    </Button>
                  </div>
                </footer>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
