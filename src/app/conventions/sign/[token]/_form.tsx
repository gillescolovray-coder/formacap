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
    setResult(null);
    startTransition(async () => {
      const res = await signConvention({
        token,
        conventionId,
        signerName: name,
        signatureDataUrl: dataUrl,
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

      <p className="text-[11px] text-zinc-500">
        En signant, vous déclarez avoir pris connaissance des termes de la
        convention de formation et engagez l&apos;entreprise sur les
        conditions exposées.
      </p>

      {result && !result.ok && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-900">
          {result.msg}
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
            Signer la convention
          </>
        )}
      </button>
    </div>
  );
}
