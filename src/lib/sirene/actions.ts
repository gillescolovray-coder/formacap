"use server";

import { searchSirene } from "./search";
import type { SireneCompany } from "./types";

/**
 * Server Action exposée aux composants client pour interroger
 * l'API recherche-entreprises.api.gouv.fr.
 */
export async function searchSireneAction(
  query: string,
): Promise<{ ok: true; results: SireneCompany[] } | { ok: false; error: string }> {
  try {
    const results = await searchSirene(query);
    return { ok: true, results };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Erreur inconnue lors de la recherche.";
    return { ok: false, error: msg };
  }
}
