import { ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TRAINER_DOCUMENT_KIND_LABELS,
  type TrainerDocument,
} from "@/lib/trainers/types";
import {
  removeTrainerDocument,
  uploadTrainerDocument,
} from "./documents/actions";
import { DocumentsCounter } from "./_documents-counter";

type Props = {
  trainerId: string;
  documents: TrainerDocument[];
};

export function DocumentsSection({ trainerId, documents }: Props) {
  const upload = uploadTrainerDocument.bind(null, trainerId);

  return (
    <CollapsibleSection
      icon={FileText}
      title="Documents joints"
      description="CV, diplômes, contrat, attestations URSSAF/RC pro, Kbis…"
      accent="rose"
      headerExtra={<DocumentsCounter documents={documents} />}
    >
      <div className="space-y-5">
        {/* Liste des documents */}
        {documents.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            Aucun document pour l&apos;instant.
          </p>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc, idx) => {
              const remove = removeTrainerDocument.bind(
                null,
                trainerId,
                doc.file_url,
              );
              const isExpired =
                doc.expires_on &&
                new Date(doc.expires_on) < new Date();
              return (
                <li
                  key={`${doc.file_url}-${idx}`}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3"
                >
                  <FileText className="h-5 w-5 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
                        {TRAINER_DOCUMENT_KIND_LABELS[doc.kind]}
                      </span>
                      {doc.label && (
                        <span className="text-xs text-slate-500">
                          {doc.label}
                        </span>
                      )}
                      {doc.expires_on && (
                        <span
                          className={
                            isExpired
                              ? "text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 font-medium"
                              : "text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          }
                        >
                          {isExpired ? "Expiré le " : "Expire le "}
                          {new Date(doc.expires_on).toLocaleDateString(
                            "fr-FR",
                          )}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate">
                      {doc.file_name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Ajouté le{" "}
                      {new Date(doc.uploaded_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-cyan-700 dark:text-cyan-400 hover:underline text-sm"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Voir
                  </a>
                  <form action={remove}>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      title="Supprimer ce document"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        {/* Formulaire d'ajout */}
        <form
          action={upload}
          className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 space-y-3"
        >
          <div className="grid gap-3 md:grid-cols-[1fr_2fr_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="kind" className="text-xs">
                Type de document
              </Label>
              <select
                id="kind"
                name="kind"
                defaultValue="cv"
                className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              >
                {Object.entries(TRAINER_DOCUMENT_KIND_LABELS).map(
                  ([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="label" className="text-xs">
                Libellé (optionnel)
              </Label>
              <Input
                id="label"
                name="label"
                placeholder="Ex: Diplôme master MEEF, RC pro 2026…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expires_on" className="text-xs">
                Date d&apos;expiration
              </Label>
              <Input id="expires_on" name="expires_on" type="date" />
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="file" className="text-xs">
                Fichier (max 10 Mo)
              </Label>
              <Input
                id="file"
                name="file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                required
              />
            </div>
            <Button type="submit">
              <Upload className="h-4 w-4" />
              Téléverser
            </Button>
          </div>
        </form>
      </div>
    </CollapsibleSection>
  );
}
