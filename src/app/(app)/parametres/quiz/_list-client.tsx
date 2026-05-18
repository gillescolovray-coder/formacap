"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Copy, Eye, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  QUIZ_STATUS_COLORS,
  QUIZ_STATUS_LABELS,
  type QuizStatus,
} from "@/lib/quiz/types";
import { deleteQuiz, duplicateQuiz } from "./actions";

type Row = {
  id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  updated_at: string;
  created_by_profile_id: string | null;
  created_by_trainer_id: string | null;
};

export function QuizListClient({
  rows,
  questionsCount,
}: {
  rows: Row[];
  questionsCount: Record<string, number>;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        r.title.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        QUIZ_STATUS_LABELS[r.status].toLowerCase().includes(q)
      );
    });
  }, [query, rows]);

  return (
    <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
      {/* Barre de recherche */}
      <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50/50 flex items-center gap-2">
        <Search className="h-4 w-4 text-zinc-400 shrink-0" />
        <Input
          type="search"
          placeholder="Rechercher un quiz (titre, description, statut)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 h-9 border-zinc-200"
        />
        <span className="text-xs text-zinc-500 tabular-nums shrink-0">
          {filtered.length} / {rows.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center text-sm text-zinc-500">
          {query
            ? "Aucun quiz ne correspond à votre recherche."
            : "Aucun quiz pour le moment. Créez votre premier quiz ci-dessus."}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200">
            <tr>
              <th className="px-4 py-3 text-left">Titre</th>
              <th className="px-4 py-3 text-left">Statut</th>
              <th className="px-4 py-3 text-left">Questions</th>
              <th className="px-4 py-3 text-left">Origine</th>
              <th className="px-4 py-3 text-left">MAJ</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {filtered.map((q) => {
              const dup = duplicateQuiz.bind(null, q.id);
              const del = deleteQuiz.bind(null, q.id);
              return (
                <tr key={q.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/parametres/quiz/${q.id}`}
                      className="font-medium text-cyan-700 hover:underline"
                    >
                      {q.title}
                    </Link>
                    {q.description && (
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {q.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "text-xs px-2 py-0.5 rounded-full border font-semibold " +
                        QUIZ_STATUS_COLORS[q.status]
                      }
                    >
                      {QUIZ_STATUS_LABELS[q.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600">
                    {questionsCount[q.id] ?? 0} question
                    {(questionsCount[q.id] ?? 0) > 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {q.created_by_trainer_id ? "Formateur" : "Admin"}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {new Date(q.updated_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        title="Aperçu vue apprenant (mode démo, rien n'est enregistré)"
                        render={
                          <Link
                            href={`/parametres/quiz/${q.id}/preview`}
                            target="_blank"
                          />
                        }
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <form action={dup}>
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          title="Dupliquer ce quiz"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                      <form action={del}>
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          title="Supprimer ce quiz"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
