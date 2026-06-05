"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { useFormStatus } from "react-dom";

type Props = {
  action: (formData: FormData) => Promise<void> | void;
};

/**
 * Formulaire client d'upload d'un support depuis le portail formateur.
 *
 * BUG FIX Gilles 2026-05-28 : avant, le bouton "Televerser" restait
 * actif pendant les 1-3 secondes d'upload -> double-clic possible ->
 * 2 INSERTs en BDD -> fichier en doublon dans la liste.
 *
 * Solution robuste type "industry standard" :
 *
 * 1) UX : bouton desactive + spinner + texte "Televersement..." pendant
 *    l'upload (via useFormStatus). Empeche le 2eme clic humain.
 *
 * 2) Cle d'idempotence (pattern Stripe / AWS) : un UUID est genere a
 *    l'ouverture du formulaire et envoye dans tous les submits qui
 *    suivent. Cote serveur, un unique index garantit qu'on n'insere
 *    qu'UNE ligne par UUID, peu importe combien de fois la requete
 *    arrive (double-clic, retry reseau, refresh, etc.).
 *
 * 3) Apres un succes, l'UUID est regenere via setRequestId pour que
 *    le prochain upload (autre fichier) soit traite comme distinct.
 */
export function UploadSupportForm({ action }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // useState lazy : crypto.randomUUID() est appele une SEULE fois a
  // l'ouverture du composant. Re-renders n'invalident pas l'UUID.
  const [requestId, setRequestId] = useState<string>(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        // L'action a fait redirect() en cas de succes — ce code ne
        // s'execute en pratique que si l'action a thrown. Mais par
        // securite : reset du form et nouvelle cle d'idempotence pour
        // qu'un upload suivant soit traite comme distinct.
        formRef.current?.reset();
        setFileName(null);
        setRequestId(
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
      }}
      className="mt-4 pt-3 border-t border-zinc-100 space-y-2"
    >
      {/* Cle d'idempotence : envoyee a chaque submit. Le serveur skip
          silencieusement si une ligne avec ce client_request_id existe
          deja (unique index). */}
      <input type="hidden" name="client_request_id" value={requestId} />
      <label className="text-xs font-medium text-zinc-700 block">
        Ajouter un support (partagé automatiquement avec les apprenants)
      </label>

      {/* Zone glisser-déposer + clic pour choisir (Gilles 2026-06-05). */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files?.[0];
          if (!dropped || !fileInputRef.current) return;
          const dt = new DataTransfer();
          dt.items.add(dropped);
          fileInputRef.current.files = dt.files;
          setFileName(dropped.name);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={
          "rounded-lg border-2 border-dashed p-3 text-center cursor-pointer transition-colors " +
          (dragging
            ? "border-indigo-500 bg-indigo-50"
            : "border-zinc-300 bg-zinc-50 hover:border-indigo-400 hover:bg-indigo-50/40")
        }
      >
        <Upload className="h-4 w-4 text-indigo-500 mx-auto mb-1" />
        <p className="text-[11px] text-zinc-600 leading-tight">
          <span className="font-semibold text-indigo-700">Glissez-déposez</span>{" "}
          un fichier ici, ou{" "}
          <span className="underline text-indigo-700">choisissez-en un</span>.
        </p>
        <p className="text-[10px] text-zinc-400 mt-0.5">
          PDF, Word, Excel, PowerPoint, image, ZIP… · 10 Mo max
        </p>
        {fileName && (
          <p className="text-[11px] font-semibold text-emerald-700 mt-1 break-all">
            ✓ {fileName}
          </p>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        name="file"
        required
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt,.csv,.zip"
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        className="hidden"
      />
      <input
        type="text"
        name="description"
        placeholder="Description (optionnel)"
        className="block w-full text-xs rounded border border-zinc-300 px-2 py-1"
      />
      <UploadSubmitButton />
    </form>
  );
}

function UploadSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        "text-xs px-3 py-1.5 rounded font-semibold inline-flex items-center gap-1.5 " +
        (pending
          ? "bg-indigo-300 text-white cursor-wait"
          : "bg-indigo-600 hover:bg-indigo-700 text-white")
      }
    >
      {pending ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Téléversement…
        </>
      ) : (
        "Téléverser"
      )}
    </button>
  );
}
