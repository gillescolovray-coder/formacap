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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  NOTE_ACTION_BADGE_CLASSES,
  NOTE_ACTION_LABELS,
  type NoteAction,
} from "@/lib/notes/types";
import { cn } from "@/lib/utils";

type ActionResult = { ok: true } | { ok: false; error: string };

export type NoteCardItem = {
  id: string;
  content: string;
  action_type: NoteAction | null;
  due_date: string | null;
  created_at: string;
  author_name?: string | null;
};

type Props = {
  /** Identifiant unique du panel (utilisé pour les ids des champs). */
  panelId: string;
  /** Liste de notes déjà triées (la plus récente en premier). */
  notes: NoteCardItem[];
  /** Action serveur pré-bindée à l'entité parente (ex: learnerId/enrollmentId). */
  addAction: (formData: FormData) => Promise<ActionResult>;
  updateAction: (formData: FormData) => Promise<ActionResult>;
  deleteAction: (formData: FormData) => Promise<ActionResult>;
  /** Texte affiché quand il n'y a aucune note. */
  emptyText?: string;
  /** Texte du placeholder du textarea d'ajout. */
  placeholder?: string;
  /** Couleur dominante : amber (par défaut), cyan, violet, emerald. */
  theme?: "amber" | "cyan" | "violet" | "emerald";
  /** Titre du bloc d'ajout. */
  title?: string;
};

const THEMES = {
  amber: {
    border: "border-amber-200",
    bg: "bg-amber-50/40",
    text: "text-amber-900",
    icon: "text-amber-700",
    button: "bg-amber-600 hover:bg-amber-700",
    rail: "border-amber-200",
    dot: "bg-amber-500",
    hover: "hover:bg-amber-50/40",
  },
  cyan: {
    border: "border-cyan-200",
    bg: "bg-cyan-50/40",
    text: "text-cyan-900",
    icon: "text-cyan-700",
    button: "bg-cyan-600 hover:bg-cyan-700",
    rail: "border-cyan-200",
    dot: "bg-cyan-500",
    hover: "hover:bg-cyan-50/40",
  },
  violet: {
    border: "border-violet-200",
    bg: "bg-violet-50/40",
    text: "text-violet-900",
    icon: "text-violet-700",
    button: "bg-violet-600 hover:bg-violet-700",
    rail: "border-violet-200",
    dot: "bg-violet-500",
    hover: "hover:bg-violet-50/40",
  },
  emerald: {
    border: "border-emerald-200",
    bg: "bg-emerald-50/40",
    text: "text-emerald-900",
    icon: "text-emerald-700",
    button: "bg-emerald-600 hover:bg-emerald-700",
    rail: "border-emerald-200",
    dot: "bg-emerald-500",
    hover: "hover:bg-emerald-50/40",
  },
} as const;

const ACTION_OPTIONS: Array<{ value: NoteAction; label: string }> = (
  Object.keys(NOTE_ACTION_LABELS) as NoteAction[]
).map((k) => ({ value: k, label: NOTE_ACTION_LABELS[k] }));

export function NoteListCard({
  panelId,
  notes,
  addAction,
  updateAction,
  deleteAction,
  emptyText = "Aucune note.",
  placeholder = "Saisir une note…",
  theme = "amber",
  title = "Nouvelle note",
}: Props) {
  const router = useRouter();
  const t = THEMES[theme];
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [actionType, setActionType] = useState<NoteAction | "">("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
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
      const res = await updateAction(fd);
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
      const res = await addAction(fd);
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
      const res = await deleteAction(fd);
      if (!res.ok) {
        alert("Erreur : " + res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className={cn("rounded-lg border p-4 space-y-3", t.border, t.bg)}>
        <div className="flex items-center gap-2">
          <StickyNote className={cn("h-4 w-4", t.icon)} />
          <p className={cn("text-sm font-bold", t.text)}>{title}</p>
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder={placeholder}
          className="bg-white"
        />
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto] items-end">
          <div className="space-y-1">
            <Label htmlFor={`${panelId}-action`} className="text-xs">
              Type d&apos;action (optionnel)
            </Label>
            <select
              id={`${panelId}-action`}
              value={actionType}
              onChange={(e) =>
                setActionType(e.target.value as NoteAction | "")
              }
              className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1"
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
            <Label htmlFor={`${panelId}-date`} className="text-xs">
              Date d&apos;échéance
            </Label>
            <Input
              id={`${panelId}-date`}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={pending}
            className={t.button}
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

      {notes.length === 0 ? (
        <p className="text-sm text-slate-400 italic px-1">{emptyText}</p>
      ) : (
        <ol className={cn("relative border-l-2 pl-5 space-y-3", t.rail)}>
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
                <span
                  className={cn(
                    "absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-2 ring-white",
                    t.dot,
                  )}
                />
                <div className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        {n.action_type && (
                          <span
                            className={cn(
                              "inline-block px-2 py-0.5 rounded font-bold uppercase tracking-wider",
                              NOTE_ACTION_BADGE_CLASSES[n.action_type],
                            )}
                          >
                            {NOTE_ACTION_LABELS[n.action_type]}
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
                        <div className="space-y-2">
                          <Textarea
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            rows={3}
                            autoFocus
                            className="bg-white"
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
                              className={t.button}
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
                          className={cn(
                            "text-sm text-slate-700 whitespace-pre-wrap break-words cursor-text rounded px-1 -mx-1 transition-colors",
                            t.hover,
                          )}
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
