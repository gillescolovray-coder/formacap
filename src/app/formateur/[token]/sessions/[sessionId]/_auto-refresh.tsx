"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Rafraîchissement automatique (headless) de la page session côté
 * formateur : recharge les données serveur (signatures d'émargement,
 * participants…) toutes les `intervalMs` ms, UNIQUEMENT quand l'onglet
 * est visible (économie de ressources / batterie). Rafraîchit aussi
 * immédiatement au retour sur l'onglet. Gilles 2026-06-05.
 *
 * Affiche un discret indicateur "Mise à jour auto" pour rassurer le
 * formateur que les signatures apparaîtront sans action de sa part.
 */
export function AutoRefresh({
  intervalMs = 25000,
}: {
  intervalMs?: number;
}) {
  const router = useRouter();
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    function stamp() {
      try {
        setLastSync(
          new Date().toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        );
      } catch {
        /* ignore */
      }
    }
    function refresh() {
      if (document.visibilityState === "visible") {
        router.refresh();
        stamp();
      }
    }
    const id = setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, intervalMs]);

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-semibold"
      title="Les signatures et inscriptions se mettent à jour automatiquement."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      Mise à jour auto{lastSync ? ` · ${lastSync}` : ""}
    </span>
  );
}
