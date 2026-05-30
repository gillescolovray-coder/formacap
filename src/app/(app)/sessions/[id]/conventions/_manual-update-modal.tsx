"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  FileSignature,
  FileUp,
  Loader2,
  Pencil,
  Send,
  X,
} from "lucide-react";
import { manuallyUpdateConventionStatus } from "./manual-update-actions";

type Props = {
  conventionId: string;
  currentStatus: "draft" | "sent" | "signed" | "cancelled";
  /** Si la convention a une signature_data (signee en ligne), on
   *  bloque le passage manuel vers un autre statut (sauf cancel). */
  isSignedOnline: boolean;
  /** Nom de la societe — utile pour pre-remplir le nom signataire si
   *  on connait deja le representant legal. */
  defaultSignerName?: string | null;
  onClose: () => void;
};

const MESSAGES_TYPES = [
  "Convention de formation signée retournée par email.",
  "Convention de formation signée retournée par courrier postal.",
  "Convention envoyée manuellement depuis Gmail (hors application).",
  "Convention envoyée par courrier postal.",
  "Annulation suite à demande de l'entreprise cliente.",
  "Correction : statut précédent saisi par erreur.",
];

/**
 * Modale de mise a jour manuelle d'une convention de formation
 * (Gilles 2026-05-28).
 *
 * Permet de marquer une convention au bon statut quand l'envoi ou la
 * signature s'est fait hors application (Gmail perso, courrier
 * postal, fax, etc.).
 */
export function ManualUpdateModal({
  conventionId,
  currentStatus,
  isSignedOnline,
  defaultSignerName,
  onClose,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Statut par defaut : on suggere l'etape suivante logique
  const initialNewStatus: "sent" | "signed" | "cancelled" | "draft" =
    currentStatus === "draft" ? "sent" : currentStatus === "sent" ? "signed" : "signed";
  const [newStatus, setNewStatus] = useState<
    "sent" | "signed" | "cancelled" | "draft"
  >(initialNewStatus);

  const today = new Date().toISOString().slice(0, 10);
  const [effectiveDate, setEffectiveDate] = useState<string>(today);
  // Pre-remplit avec le representant legal de l'entreprise si connu
  // (Gilles 2026-05-28 : prefill automatique).
  const [signerName, setSignerName] = useState<string>(
    defaultSignerName ?? "",
  );
  // Reset signerName quand defaultSignerName change
  // (cas : la modale est gardee montee mais on switche entre conventions)
  // useEffect optionnel — ici pas critique car la modale est demontee.
  const [note, setNote] = useState<string>("");

  // Fichier (drag-drop + click)
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function pickFile(f: File | null) {
    if (!f) {
      setFile(null);
      return;
    }
    setFile(f);
  }

  async function submit() {
    setError(null);
    if (note.trim().length < 3) {
      setError(
        "La note interne est obligatoire (3 caractères minimum) — c'est l'audit Qualiopi qui justifie le changement manuel.",
      );
      return;
    }
    // Gilles 2026-05-28 : nom signataire devenu OPTIONNEL — la
    // signature physique sur le PDF scanne fait foi.

    let fileBase64: string | null = null;
    let fileName: string | null = null;
    let fileMimeType: string | null = null;
    if (file) {
      // Lecture client en base64 puis envoi a la server action
      fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1] ?? "";
          resolve(base64);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      }).catch((err) => {
        setError(`Erreur de lecture du fichier : ${err.message}`);
        return null;
      });
      if (fileBase64 === null) return;
      fileName = file.name;
      fileMimeType = file.type || "application/octet-stream";
    }

    startTransition(async () => {
      const res = await manuallyUpdateConventionStatus({
        conventionId,
        newStatus,
        effectiveDate,
        signerName: newStatus === "signed" ? signerName.trim() : null,
        note: note.trim(),
        fileBase64,
        fileName,
        fileMimeType,
      });
      if (!res.ok) {
        setError(res.error ?? "Erreur inconnue.");
        return;
      }
      onClose();
      router.refresh();
    });
  }

  // Si la convention est signee en ligne, on n'autorise que cancel
  const canChooseSignedOrSent = !isSignedOnline;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-zinc-900 text-base inline-flex items-center gap-2">
            <Pencil className="h-4 w-4 text-violet-600" />
            Mise à jour manuelle de la convention
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
            À utiliser quand la convention a été envoyée ou signée hors
            de l&apos;application (Gmail perso, courrier postal, etc.).
            Le statut sera mis à jour et l&apos;action tracée pour
            l&apos;audit Qualiopi.
          </p>

          {isSignedOnline && (
            <div className="rounded-lg bg-amber-50 border-2 border-amber-300 p-3 text-xs text-amber-900">
              ⚠ Cette convention a été signée en ligne via
              l&apos;application. Vous pouvez uniquement l&apos;annuler
              ici. Pour les autres modifications, utilisez les actions
              de la convention.
            </div>
          )}

          {/* Choix du nouveau statut */}
          <div>
            <label className="text-xs font-semibold text-zinc-700 block mb-2">
              Nouveau statut
            </label>
            <div className="grid grid-cols-2 gap-2">
              <StatusRadio
                value="sent"
                checked={newStatus === "sent"}
                onChange={() => setNewStatus("sent")}
                disabled={pending || !canChooseSignedOrSent}
                icon={<Send className="h-3.5 w-3.5" />}
                label="Envoyée"
                desc="Convention transmise au client (hors app)"
                color="cyan"
              />
              <StatusRadio
                value="signed"
                checked={newStatus === "signed"}
                onChange={() => setNewStatus("signed")}
                disabled={pending || !canChooseSignedOrSent}
                icon={<FileSignature className="h-3.5 w-3.5" />}
                label="Signée"
                desc="Convention retournée signée (hors app)"
                color="emerald"
              />
              <StatusRadio
                value="cancelled"
                checked={newStatus === "cancelled"}
                onChange={() => setNewStatus("cancelled")}
                disabled={pending}
                icon={<X className="h-3.5 w-3.5" />}
                label="Annulée"
                desc="Convention sans objet"
                color="rose"
              />
              <StatusRadio
                value="draft"
                checked={newStatus === "draft"}
                onChange={() => setNewStatus("draft")}
                disabled={pending || !canChooseSignedOrSent}
                icon={<Pencil className="h-3.5 w-3.5" />}
                label="Retour brouillon"
                desc="Correction d'une erreur de saisie"
                color="zinc"
              />
            </div>
          </div>

          {/* Date effective */}
          {newStatus !== "cancelled" && newStatus !== "draft" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-700 inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {newStatus === "sent"
                  ? "Date d'envoi effective"
                  : "Date de signature effective"}
              </label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                max={today}
                disabled={pending}
                className="h-9 px-2 rounded-md border border-zinc-300 text-sm"
              />
            </div>
          )}

          {/* Nom signataire si signed — OPTIONNEL (Gilles 2026-05-28) :
              prerempli depuis le representant legal de l'entreprise
              s'il est connu, mais l'admin peut laisser vide si le PDF
              scanne porte la signature et lit le nom directement. */}
          {newStatus === "signed" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-700 inline-flex items-center gap-1">
                <FileSignature className="h-3.5 w-3.5" />
                Nom du signataire{" "}
                <span className="text-zinc-400 font-normal">(optionnel)</span>
              </label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder={
                  defaultSignerName
                    ? defaultSignerName
                    : "Jean DUPONT (laissez vide si le PDF porte la signature)"
                }
                disabled={pending}
                className="h-9 w-full px-2 rounded-md border border-zinc-300 text-sm"
              />
              <p className="text-[10px] text-zinc-500 italic">
                {defaultSignerName
                  ? "Prérempli depuis le représentant légal de l'entreprise."
                  : "La signature physique sur le PDF scanné fait foi — vous pouvez laisser ce champ vide."}
              </p>
            </div>
          )}

          {/* Upload PDF (sauf si cancel/draft) */}
          {newStatus !== "cancelled" && newStatus !== "draft" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 inline-flex items-center gap-1">
                <FileUp className="h-3.5 w-3.5" />
                PDF{" "}
                {newStatus === "signed" ? "de la convention signée" : "envoyé"}{" "}
                <span className="text-zinc-400 font-normal">(optionnel)</span>
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) pickFile(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={
                  "rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors " +
                  (dragOver
                    ? "border-cyan-500 bg-cyan-50"
                    : file
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-zinc-300 bg-zinc-50 hover:border-cyan-400 hover:bg-cyan-50/30")
                }
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/webp"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  disabled={pending}
                  className="hidden"
                />
                {file ? (
                  <div className="space-y-1">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto" />
                    <div className="text-sm font-semibold text-emerald-900">
                      {file.name}
                    </div>
                    <div className="text-[11px] text-emerald-700">
                      {(file.size / 1024).toFixed(0)} Ko · Cliquez pour
                      changer
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <FileUp className="h-6 w-6 text-zinc-400 mx-auto" />
                    <div className="text-sm font-medium text-zinc-700">
                      Glissez le fichier ici ou cliquez pour parcourir
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      PDF, PNG, JPG ou WebP — max 10 Mo. Astuce : vous
                      pouvez glisser une pièce jointe directement depuis
                      Gmail.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Note interne OBLIGATOIRE + messages pre-remplis */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700">
              Note interne <span className="text-red-600">*</span>
              <span className="ml-2 text-[10px] font-normal text-amber-700 italic">
                Obligatoire — sert d&apos;audit Qualiopi pour justifier le
                changement manuel
              </span>
            </label>
            {/* Messages types — clic pour pre-remplir */}
            <div className="flex flex-wrap gap-1.5">
              {MESSAGES_TYPES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setNote(m)}
                  disabled={pending}
                  className="inline-flex items-center text-[11px] px-2 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100"
                  title="Cliquez pour utiliser ce message"
                >
                  + {m.length > 50 ? m.slice(0, 50) + "…" : m}
                </button>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={pending}
              rows={3}
              placeholder="Ex : Convention signée retournée par email le 28/05/2026 par Jean DUPONT (Gérant)…"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
            />
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
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Mise à jour…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Mettre à jour statut
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusRadio({
  value,
  checked,
  onChange,
  disabled,
  icon,
  label,
  desc,
  color,
}: {
  value: string;
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  desc: string;
  color: "cyan" | "emerald" | "rose" | "zinc";
}) {
  const checkedCls =
    color === "cyan"
      ? "border-cyan-500 bg-cyan-50"
      : color === "emerald"
        ? "border-emerald-500 bg-emerald-50"
        : color === "rose"
          ? "border-rose-500 bg-rose-50"
          : "border-zinc-400 bg-zinc-50";
  return (
    <label
      className={
        "flex items-start gap-2 cursor-pointer p-2.5 rounded-lg border-2 transition-colors " +
        (disabled
          ? "opacity-50 cursor-not-allowed"
          : checked
            ? checkedCls
            : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50")
      }
    >
      <input
        type="radio"
        name="newStatus"
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-0.5 h-3.5 w-3.5"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-zinc-900 inline-flex items-center gap-1.5">
          {icon}
          {label}
        </div>
        <div className="text-[10px] text-zinc-600 mt-0.5">{desc}</div>
      </div>
    </label>
  );
}

/**
 * Bouton + wrapper modale a placer dans la liste des conventions.
 */
export function ManualUpdateButton(props: Omit<Props, "onClose">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
        title="Marquer manuellement comme envoyée / signée si géré hors application"
      >
        <Pencil className="h-3 w-3" />
        Mettre à jour statut
      </button>
      {open && <ManualUpdateModal {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
