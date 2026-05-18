"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deleteSessionDocument,
  getDocumentDownloadUrl,
  toggleSessionDocumentVisibility,
} from "./actions";

type Doc = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  description: string | null;
  visibility: "internal" | "shared_with_learners";
  is_training_program: boolean;
  uploaded_at: string;
};

type Props = {
  sessionId: string;
  doc: Doc;
};

function formatBytes(b: number | null): string {
  if (!b || b <= 0) return "—";
  const units = ["o", "Ko", "Mo", "Go"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function DocumentRow({ sessionId, doc }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [downloading, setDownloading] = useState(false);

  function handleDownload() {
    setDownloading(true);
    startTransition(async () => {
      try {
        const url = await getDocumentDownloadUrl(doc.id);
        if (url) {
          window.open(url, "_blank");
        } else {
          alert("Impossible de générer le lien de téléchargement.");
        }
      } finally {
        setDownloading(false);
      }
    });
  }

  function handleToggleVisibility() {
    const action = toggleSessionDocumentVisibility.bind(
      null,
      sessionId,
      doc.id,
    );
    startTransition(async () => {
      try {
        await action();
        // revalidatePath côté serveur ne suffit pas toujours à
        // rafraîchir l'UI : on force le refresh client après l'action.
        router.refresh();
      } catch (e) {
        console.error("toggle visibility error:", e);
        alert("Impossible de modifier la visibilité.");
      }
    });
  }

  function handleDelete() {
    if (
      !confirm(
        `Supprimer le document « ${doc.file_name} » ? Cette action est irréversible.`,
      )
    ) {
      return;
    }
    const action = deleteSessionDocument.bind(null, sessionId, doc.id);
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        console.error("delete document error:", e);
      }
    });
  }

  const sharedWithLearners = doc.visibility === "shared_with_learners";

  return (
    <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-950/60 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-cyan-100 dark:bg-cyan-950/40 flex items-center justify-center">
            <FileText className="h-5 w-5 text-cyan-700 dark:text-cyan-400" />
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate flex items-center gap-2">
              {doc.file_name}
              {doc.is_training_program && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200"
                  title="Programme officiel — joint automatiquement aux conventions"
                >
                  📋 Programme
                </span>
              )}
            </div>
            {doc.description && (
              <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                {doc.description}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
        {formatBytes(doc.size_bytes)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <button
          type="button"
          onClick={handleToggleVisibility}
          disabled={isPending}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium cursor-pointer select-none transition-all",
            "hover:ring-2 hover:ring-cyan-300 hover:ring-offset-1 active:scale-95",
            "disabled:opacity-50 disabled:cursor-wait",
            sharedWithLearners
              ? "bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300"
              : "bg-zinc-100 text-zinc-700 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300",
          )}
          title={
            sharedWithLearners
              ? "Cliquer pour rendre ce document INTERNE (invisible apprenants)"
              : "Cliquer pour PARTAGER ce document avec les apprenants"
          }
        >
          {sharedWithLearners ? (
            <>
              <Eye className="h-3 w-3" />
              Partagé
            </>
          ) : (
            <>
              <EyeOff className="h-3 w-3" />
              Interne
            </>
          )}
        </button>
      </td>
      <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
        {formatDate(doc.uploaded_at)}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={isPending}
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Télécharger
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={isPending}
            title="Supprimer ce document"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
