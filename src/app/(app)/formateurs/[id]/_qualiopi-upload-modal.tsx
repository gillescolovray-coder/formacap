"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Award, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadTrainerDocument } from "./documents/actions";

type Props = {
  trainerId: string;
  open: boolean;
  onClose: () => void;
};

export function QualiopiUploadModal({ trainerId, open, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const upload = uploadTrainerDocument.bind(null, trainerId);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-br from-violet-50 to-cyan-50 dark:from-violet-950/30 dark:to-cyan-950/30 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-950 flex items-center justify-center shrink-0">
              <Award className="h-5 w-5 text-violet-700 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">
                Certificat Qualiopi
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Téléversez le certificat et indiquez sa date d&apos;expiration.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-white/60 dark:hover:bg-slate-800 text-slate-500"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action={upload} className="p-6 space-y-4">
          <input type="hidden" name="kind" value="qualiopi" />

          <div className="space-y-1.5">
            <Label htmlFor="qualiopi_label" className="text-xs">
              Libellé (optionnel)
            </Label>
            <Input
              id="qualiopi_label"
              name="label"
              placeholder="Ex: Certificat Qualiopi 2026 - Bureau Veritas"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qualiopi_expires" className="text-xs">
              Date d&apos;expiration
              <span className="text-red-600 ml-0.5">*</span>
            </Label>
            <Input
              id="qualiopi_expires"
              name="expires_on"
              type="date"
              required
            />
            <p className="text-[11px] text-slate-500">
              Cette date sera utilisée pour les alertes du tableau de bord.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qualiopi_file" className="text-xs">
              Fichier (PDF ou image, max 10 Mo)
              <span className="text-red-600 ml-0.5">*</span>
            </Label>
            <Input
              id="qualiopi_file"
              name="file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit">
              <Upload className="h-4 w-4" />
              Téléverser le certificat
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
