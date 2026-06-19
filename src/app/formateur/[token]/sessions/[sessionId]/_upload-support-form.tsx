"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createSupportUploadUrl,
  registerSupportDocument,
} from "./actions";

type Props = {
  token: string;
  sessionId: string;
  /** "shared_with_learners" (support apprenant, défaut) ou "internal"
   *  (pièce du bilan, visible uniquement par CAP). Gilles 2026-06-19. */
  visibility?: "shared_with_learners" | "internal";
  /** Libellé de la zone de dépôt. */
  title?: string;
  /** Message de succès personnalisé. */
  successText?: string;
};

/**
 * Upload d'un support depuis le portail formateur — version UPLOAD DIRECT.
 *
 * Le fichier est envoyé DIRECTEMENT au stockage Supabase via une URL
 * signée (généré côté serveur), SANS transiter par un Server Action.
 * Évite la limite de corps de requête de Vercel (~4,5 Mo) qui faisait
 * planter l'upload de fichiers volumineux (ZIP de supports) avec
 * "This page couldn't load". Gilles 2026-06-05.
 *
 * Étapes : 1) URL signée  2) upload direct au stockage  3) enregistrement
 * des métadonnées (petit payload). Glisser-déposer OU clic. Idempotence
 * conservée via une clé client_request_id.
 */
function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const MAX_SIZE = 50 * 1024 * 1024; // 50 Mo

export function UploadSupportForm({
  token,
  sessionId,
  visibility = "shared_with_learners",
  title = "Ajouter un support (partagé automatiquement avec les apprenants)",
  successText = "Support ajouté et partagé avec les apprenants.",
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; m: string } | null>(null);

  function pickFile(f: File | null) {
    setMsg(null);
    if (f && f.size > MAX_SIZE) {
      setMsg({ t: "err", m: "Fichier trop volumineux (max 50 Mo)." });
      return;
    }
    setFile(f);
  }

  async function handleUpload() {
    if (!file) {
      setMsg({ t: "err", m: "Aucun fichier sélectionné." });
      return;
    }
    setMsg(null);
    setPending(true);
    const requestId = newRequestId();
    try {
      // 1) URL signée
      const urlRes = await createSupportUploadUrl(
        token,
        sessionId,
        file.name,
        file.type,
      );
      if (!urlRes.ok) {
        setMsg({ t: "err", m: urlRes.error });
        return;
      }
      // 2) Upload direct au stockage (le fichier ne passe pas par le serveur)
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from("session-documents")
        .uploadToSignedUrl(urlRes.path, urlRes.uploadToken, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (upErr) {
        setMsg({ t: "err", m: `Échec de l'envoi : ${upErr.message}` });
        return;
      }
      // 3) Enregistrement des métadonnées
      const regRes = await registerSupportDocument(token, sessionId, {
        path: urlRes.path,
        fileName: file.name,
        mimeType: file.type || null,
        sizeBytes: file.size,
        description: descRef.current?.value?.trim() || null,
        clientRequestId: requestId,
        visibility,
      });
      if (!regRes.ok) {
        setMsg({ t: "err", m: regRes.error ?? "Erreur d'enregistrement." });
        return;
      }
      // Succès
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (descRef.current) descRef.current.value = "";
      setMsg({ t: "ok", m: successText });
      router.refresh();
    } catch (e) {
      setMsg({ t: "err", m: (e as Error).message || "Erreur inattendue." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 pt-3 border-t border-zinc-100 space-y-2">
      <label className="text-xs font-medium text-zinc-700 block">{title}</label>

      {/* Zone glisser-déposer + clic pour choisir */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pickFile(e.dataTransfer.files?.[0] ?? null);
        }}
        onClick={() => !pending && fileInputRef.current?.click()}
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
          PDF, Word, Excel, PowerPoint, image, ZIP… · 50 Mo max
        </p>
        {file && (
          <p className="text-[11px] font-semibold text-emerald-700 mt-1 break-all">
            ✓ {file.name}
          </p>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.svg,.txt,.csv,.zip"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        className="hidden"
      />
      <input
        ref={descRef}
        type="text"
        placeholder="Description (optionnel)"
        className="block w-full text-xs rounded border border-zinc-300 px-2 py-1"
      />

      {msg && (
        <p
          className={
            msg.t === "ok"
              ? "text-[11px] text-emerald-700"
              : "text-[11px] text-rose-700"
          }
        >
          {msg.m}
        </p>
      )}

      {/* Indicateur d'attente bien visible pendant l'envoi (Gilles 2026-06-19) :
          l'upload peut être long, on rassure le formateur. */}
      {pending && (
        <div className="flex items-center gap-2 rounded-md bg-indigo-50 border border-indigo-200 px-3 py-2 text-[11px] font-semibold text-indigo-800">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          Téléversement en cours, veuillez patienter… Ne fermez pas la page.
        </div>
      )}

      <button
        type="button"
        onClick={handleUpload}
        disabled={pending || !file}
        className={
          "text-xs px-3 py-1.5 rounded font-semibold inline-flex items-center gap-1.5 " +
          (pending || !file
            ? "bg-indigo-300 text-white cursor-not-allowed"
            : "bg-indigo-600 hover:bg-indigo-700 text-white")
        }
      >
        {pending ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Téléversement…
          </>
        ) : (
          <>
            <Check className="h-3 w-3" />
            Téléverser
          </>
        )}
      </button>
    </div>
  );
}
