"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import {
  addCompanyNote,
  deleteCompanyNote,
  updateCompanyNote,
} from "./notes-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  COMPANY_NOTE_ACTION_BADGE_CLASSES,
  COMPANY_NOTE_ACTION_LABELS,
  type CompanyNote,
  type CompanyNoteAction,
} from "@/lib/companies/types";
import { cn } from "@/lib/utils";

type Props = {
  companyId: string;
  notes: CompanyNote[];
};

const ACTION_OPTIONS: Array<{ value: CompanyNoteAction; label: string }> = (
  Object.keys(COMPANY_NOTE_ACTION_LABELS) as CompanyNoteAction[]
).map((k) => ({ value: k, label: COMPANY_NOTE_ACTION_LABELS[k] }));

/**
 * Timeline de notes datées sur une fiche entreprise.
 * - Saisie en haut : zone texte + sélection d'action + date d'échéance
 * - Liste en dessous : la plus récente en premier, badge d'action coloré,
 *   horodatage, bouton de suppression individuel.
 */
export function NotesTimeline({ companyId, notes }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [actionType, setActionType] = useState<CompanyNoteAction | "">("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Édition inline : id de la note en cours d'édition + brouillon de texte
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  function startEditing(noteId: string, currentContent: string) {
    setEditingId(noteId);
    setEditingContent(currentContent);
    setEditError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingContent("");
    setEditError(null);
  }

  function saveEditing() {
    if (!editingId) return;
    setEditError(null);
    if (!editingContent.trim()) {
      setEditError("La note ne peut pas être vide.");
      return;
    }
    const noteId = editingId;
    const newContent = editingContent;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("note_id", noteId);
      fd.append("content", newContent);
      const res = await updateCompanyNote(companyId, fd);
      if (!res.ok) {
        setEditError(res.error);
        return;
      }
      cancelEditing();
      router.refresh();
    });
  }

  function handleAdd() {
    setError(null);
    if (!content.trim()) {
      setError("La note ne peut pas être vide.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.append("content", content);
      if (actionType) fd.append("action_type", actionType);
      if (dueDate) fd.append("due_date", dueDate);
      const res = await addCompanyNote(companyId, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setContent("");
      setActionType("");
      setDueDate("");
      router.refresh();
    });
  }

  function handleDelete(noteId: string) {
    if (!confirm("Supprimer cette note ?")) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("note_id", noteId);
      const res = await deleteCompanyNote(companyId, fd);
      if (!res.ok) {
        alert("Erreur : " + res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Zone d'ajout */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-amber-700" />
          <p className="text-sm font-bold text-amber-900">
            Nouvelle note
          </p>
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder="Ex : Appel téléphonique avec le DRH — devis à envoyer cette semaine."
          className="bg-white"
        />
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto] items-end">
          <div className="space-y-1">
            <Label htmlFor="action_type" className="text-xs">
              Type d&apos;action (optionnel)
            </Label>
            <select
              id="action_type"
              value={actionType}
              onChange={(e) =>
                setActionType(e.target.value as CompanyNoteAction | "")
              }
              className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              <option value="">— Aucune action particulière —</option>
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="due_date" className="text-xs">
              Date d&apos;échéance
            </Label>
            <Input
              id="due_date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={pending}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Ajouter
          </Button>
        </div>
        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            {error}
          </p>
        )}
      </div>

      {/* Timeline des notes existantes */}
      {notes.length === 0 ? (
        <p className="text-sm text-slate-400 italic px-1">
          Aucune note pour cette entreprise. Ajoutez la première ci-dessus.
        </p>
      ) : (
        <ol className="relative border-l-2 border-amber-200 pl-5 space-y-3">
          {notes.map((n) => {
            const dueDateObj = n.due_date ? new Date(n.due_date) : null;
            const isOverdue =
              dueDateObj !== null &&
              dueDateObj.getTime() < Date.now() &&
              n.action_type &&
              ["a_rappeler", "a_relancer", "rdv_planifie"].includes(
                n.action_type,
              );
            return (
              <li key={n.id} className="relative">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-amber-500 ring-2 ring-white" />
                <div className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        {n.action_type && (
                          <span
                            className={cn(
                              "inline-block px-2 py-0.5 rounded font-bold uppercase tracking-wider",
                              COMPANY_NOTE_ACTION_BADGE_CLASSES[n.action_type],
                            )}
                          >
                            {COMPANY_NOTE_ACTION_LABELS[n.action_type]}
                          </span>
                        )}
                        {dueDateObj && (
                          <span
                            className={cn(
                              "inline-block px-1.5 py-0.5 rounded text-[11px] font-bold",
                              isOverdue
                                ? "bg-red-100 text-red-800 border border-red-300"
                                : "bg-cyan-100 text-cyan-800 border border-cyan-300",
                            )}
                            title={
                              isOverdue
                                ? "Échéance dépassée"
                                : "Date prévue de l'action"
                            }
                          >
                            📅{" "}
                            {dueDateObj.toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "long",
                              year: "numeric",
                            })}
                            {isOverdue && " — en retard"}
                          </span>
                        )}
                        <span className="text-slate-400 ml-auto inline-flex items-center gap-2 flex-wrap justify-end">
                          <span>
                            Créée le{" "}
                            {new Date(n.created_at).toLocaleDateString(
                              "fr-FR",
                            )}{" "}
                            à{" "}
                            {new Date(n.created_at).toLocaleTimeString(
                              "fr-FR",
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </span>
                          {n.author_name && (
                            <span
                              className="font-semibold text-cyan-700"
                              title={`Note rédigée par ${n.author_name}`}
                            >
                              par {n.author_name}
                            </span>
                          )}
                        </span>
                      </div>
                      {editingId === n.id ? (
                        // Mode édition inline : seul le texte est modifiable
                        <div className="space-y-2">
                          <Textarea
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            rows={3}
                            autoFocus
                            className="bg-white border-amber-300 focus-visible:ring-amber-500"
                          />
                          {editError && (
                            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                              {editError}
                            </p>
                          )}
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={saveEditing}
                              disabled={pending}
                              className="bg-amber-600 hover:bg-amber-700"
                            >
                              {pending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              Enregistrer
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={cancelEditing}
                              disabled={pending}
                            >
                              <X className="h-3.5 w-3.5" />
                              Annuler
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p
                          className="text-sm text-slate-700 whitespace-pre-wrap break-words cursor-text hover:bg-amber-50/40 rounded px-1 -mx-1 transition-colors"
                          onClick={() => startEditing(n.id, n.content)}
                          title="Cliquer pour modifier le texte de la note"
                        >
                          {n.content}
                        </p>
                      )}
                    </div>
                    {editingId !== n.id && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditing(n.id, n.content)}
                          disabled={pending}
                          title="Modifier le texte de cette note"
                          className="text-cyan-700 hover:text-cyan-900"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(n.id)}
                          disabled={pending}
                          title="Supprimer cette note"
                          className="text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
