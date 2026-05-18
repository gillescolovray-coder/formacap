"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { submitRemoteSignature } from "./actions";

type Slot = {
  period_date: string;
  moment: "morning" | "afternoon";
  label: string;
  isPast: boolean;
  isFuture: boolean;
  signedAt: string | null;
};

export function SignerForm({
  token,
  enrollmentId,
  learnerName,
  slots,
}: {
  token: string;
  enrollmentId: string;
  learnerName: string;
  slots: Slot[];
}) {
  // Créneaux signables : passés ou actuels, et pas encore signés
  const signableSlots = slots.filter((s) => !s.isFuture && !s.signedAt);
  const initialSlot = signableSlots[0] ?? null;

  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialSlot ? `${initialSlot.period_date}|${initialSlot.moment}` : null,
  );
  const [name, setName] = useState(learnerName);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState<{
    slot: string;
    error?: string;
  } | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  const onSubmit = () => {
    if (!selectedKey) return;
    const dataUrl = padRef.current?.getDataURL();
    if (!dataUrl) {
      setSubmitted({ slot: selectedKey, error: "Signez avant de valider." });
      return;
    }
    if (name.trim().length < 2) {
      setSubmitted({ slot: selectedKey, error: "Merci de saisir votre nom." });
      return;
    }
    const [period_date, moment] = selectedKey.split("|") as [
      string,
      "morning" | "afternoon",
    ];
    setSubmitted(null);
    startTransition(async () => {
      const res = await submitRemoteSignature({
        token,
        enrollmentId,
        signerName: name,
        periodDate: period_date,
        moment,
        signatureDataUrl: dataUrl,
      });
      if (res.ok) {
        setSubmitted({ slot: selectedKey });
        padRef.current?.clear();
        setHasDrawn(false);
      } else {
        setSubmitted({ slot: selectedKey, error: res.error });
      }
    });
  };

  // Si tous les créneaux ont été signés → message de remerciement
  const allSigned =
    slots.length > 0 && slots.every((s) => s.signedAt || s.isFuture);
  const noPast = slots.length > 0 && slots.every((s) => s.isFuture);

  if (allSigned) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-center space-y-2">
        <div className="text-4xl">✅</div>
        <h2 className="font-bold text-emerald-900">
          Toutes vos signatures ont été enregistrées
        </h2>
        <p className="text-sm text-emerald-800/90">
          Merci ! Vous n&apos;avez plus rien à faire.
        </p>
      </div>
    );
  }

  if (noPast) {
    return (
      <div className="rounded-xl bg-sky-50 border border-sky-200 p-5 text-center space-y-2">
        <div className="text-4xl">⏳</div>
        <h2 className="font-bold text-sky-900">
          Aucun créneau à signer pour le moment
        </h2>
        <p className="text-sm text-sky-800/90">
          Revenez sur ce lien après chaque demi-journée pour signer votre
          présence.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Récap des créneaux */}
      <div className="space-y-1.5">
        <div className="text-xs uppercase tracking-wider font-semibold text-zinc-600">
          Demi-journée à signer
        </div>
        {signableSlots.length === 0 ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">
            ✅ Vous avez signé tous les créneaux disponibles. Reviendrez sur ce
            lien après les demi-journées suivantes.
          </div>
        ) : (
          <div className="space-y-1.5">
            {signableSlots.map((s) => {
              const key = `${s.period_date}|${s.moment}`;
              return (
                <label
                  key={key}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${
                    selectedKey === key
                      ? "border-blue-700 bg-blue-50 ring-1 ring-blue-700"
                      : "border-zinc-200 hover:border-zinc-400"
                  }`}
                >
                  <input
                    type="radio"
                    name="slot"
                    checked={selectedKey === key}
                    onChange={() => setSelectedKey(key)}
                    className="h-4 w-4"
                  />
                  <span className="capitalize">{s.label}</span>
                </label>
              );
            })}
          </div>
        )}

        {/* Récap des créneaux déjà signés */}
        {slots.filter((s) => s.signedAt).length > 0 && (
          <details className="text-xs text-zinc-500 mt-2">
            <summary className="cursor-pointer">
              Créneaux déjà signés ({slots.filter((s) => s.signedAt).length})
            </summary>
            <ul className="mt-1 ml-4 list-disc">
              {slots
                .filter((s) => s.signedAt)
                .map((s) => (
                  <li key={`${s.period_date}|${s.moment}`}>
                    <span className="capitalize">{s.label}</span>{" "}
                    <span className="text-emerald-600">
                      ✓ signé le{" "}
                      {new Date(s.signedAt!).toLocaleDateString("fr-FR")}
                    </span>
                  </li>
                ))}
            </ul>
          </details>
        )}
      </div>

      {selectedKey && (
        <>
          {/* Nom complet */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider font-semibold text-zinc-600">
              Votre nom complet
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Prénom Nom"
              className="w-full h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          {/* Signature pad */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider font-semibold text-zinc-600">
              Votre signature
            </label>
            <SignaturePad
              ref={padRef}
              onChange={(empty) => setHasDrawn(!empty)}
              width={Math.min(420, 360)}
              height={160}
              className="w-full"
            />
          </div>

          {/* Message d'état */}
          {submitted?.error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-900">
              {submitted.error}
            </div>
          )}
          {submitted && !submitted.error && submitted.slot === selectedKey && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">
              ✅ Signature enregistrée avec succès. Merci !
            </div>
          )}

          <button
            type="button"
            onClick={onSubmit}
            disabled={pending || !hasDrawn || !name.trim()}
            className="w-full h-11 rounded-lg bg-blue-700 text-white font-bold flex items-center justify-center gap-2 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enregistrement…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Valider ma signature
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}
