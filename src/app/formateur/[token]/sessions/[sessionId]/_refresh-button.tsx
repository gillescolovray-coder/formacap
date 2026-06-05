"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Bouton "Rafraîchir les données" — recharge les données serveur sans
 * F5 manuel. Utile pour voir les signatures d'émargement dès que les
 * apprenants ont signé (Gilles 2026-06-05).
 */
export function RefreshButton({
  label = "Rafraîchir",
}: {
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      size="sm"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      title="Recharger les données (signatures, participants…)"
      className="bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
