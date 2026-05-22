"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { signConvention } from "./actions";

export function ConventionSignForm({
  token,
  conventionId,
  defaultName,
}: {
  token: string;
  conventionId: string;
  defaultName: string;
}) {
  const [name, setName] = useState(defaultName);
  const [hasDrawn, setHasDrawn] = useState(false);
  // Mention légale française "Bon pour accord" — obligatoire pour engager
  // l'entreprise (Gilles 2026-05-22, suite retour Mme TORRES).
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );
  const padRef = useRef<SignaturePadHandle>(null);

  const onSubmit = () => {
    const dataUrl = padRef.current?.getDataURL();
    if (!dataUrl) {
      setResult({ ok: false, msg: "Signez avant de valider." });
      return;
    }
    if (name.trim().length < 2) {
      setResult({ ok: false, msg: "Merci de saisir votre nom complet." });
      return;
    }
    if (!acceptedTerms) {
      setResult({
        ok: false,
        msg: "Vous devez cocher la case « Bon pour accord » pour engager l'entreprise.",
      });
      return;
    }
    setResult(null);
    startTransition(async () => {
      const res = await signConvention({
        token,
        conventionId,
        signerName: name,
        signatureDataUrl: dataUrl,
        goodForAgreement: acceptedTerms,
      });
      if (res.ok) {
        setResult({ ok: true, msg: "Convention signée avec succès." });
      } else {
        setResult({ ok: false, msg: res.error });
      }
    });
  };

  if (result?.ok) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-center space-y-2">
        <div className="text-4xl">✅</div>
        <h2 className="font-bold text-emerald-900">{result.msg}</h2>
        <p className="text-sm text-emerald-800/90">
          Merci ! L&apos;organisme de formation a été notifié.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs uppercase tracking-wider font-semibold text-zinc-600">
          Votre nom complet (signataire)
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Prénom Nom"
          className="w-full h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs uppercase tracking-wider font-semibold text-zinc-600">
          Votre signature
        </label>
        <SignaturePad
          ref={padRef}
          onChange={(empty) => setHasDrawn(!empty)}
          width={360}
          height={160}
          className="w-full"
        />
      </div>

      {/* Mention légale "Bon pour accord" — case obligatoire qui engage
          l'entreprise. (Gilles 2026-05-22, mention francaise classique
          pour les conventions de formation B2B.) */}
      <label
        className={`flex items-start gap-2.5 rounded-lg border-2 p-3 cursor-pointer transition-colors ${
          acceptedTerms
            ? "border-emerald-400 bg-emerald-50"
            : "border-amber-300 bg-amber-50"
        }`}
      >
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          className="h-5 w-5 mt-0.5 rounded border-zinc-300 cursor-pointer shrink-0"
        />
        <div className="text-sm leading-snug">
          <span className="font-bold text-zinc-900">
            ☑ Bon pour accord
          </span>
          <span className="block text-[12px] text-zinc-700 mt-0.5">
            J&apos;ai lu et j&apos;accepte les termes de la convention de
            formation, et j&apos;engage l&apos;entreprise sur les conditions
            exposées.
          </span>
        </div>
      </label>

      {result && !result.ok && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-900">
          {result.msg}
        </div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={pending || !hasDrawn || !name.trim() || !acceptedTerms}
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
            Signer la convention
          </>
        )}
      </button>
    </div>
  );
}
