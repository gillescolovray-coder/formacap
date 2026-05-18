import { ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LOCATION_DOCUMENT_KIND_LABELS,
  type LocationDocument,
} from "@/lib/locations/types";
import {
  removeLocationDocument,
  uploadLocationDocument,
} from "./documents/actions";
import { DocumentsCounter } from "./_documents-counter";

type Props = {
  locationId: string;
  documents: LocationDocument[];
};

export function DocumentsSection({ locationId, documents }: Props) {
  const upload = uploadLocationDocument.bind(null, locationId);

  return (
    <CollapsibleSection
      icon={FileText}
      title="Documents joints"
      description="Photos, plan, attestation ERP, registre, devis, facture, contrat…"
      accent="rose"
      headerExtra={<DocumentsCounter documents={documents} />}
      id="documents-joints"
    >
      <div className="space-y-5">
        {documents.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            Aucun document pour ce lieu.
          </p>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc, idx) => {
              const remove = removeLocationDocument.bind(
                null,
                locationId,
                doc.file_url,
              );
              return (
                <li
                  key={`${doc.file_url}-${idx}`}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3"
                >
                  <FileText className="h-5 w-5 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
                        {LOCATION_DOCUMENT_KIND_LABELS[doc.kind]}
                      </span>
                      {doc.label && (
                        <span className="text-xs text-slate-500">
                          {doc.label}
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

        <form
          action={upload}
          className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 space-y-3"
        >
          <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
            <div className="space-y-1.5">
              <Label htmlFor="kind" className="text-xs">
                Type de document
              </Label>
              <select
                id="kind"
                name="kind"
                defaultValue="photo"
                className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              >
                {Object.entries(LOCATION_DOCUMENT_KIND_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="label" className="text-xs">
                Libellé (optionnel)
              </Label>
              <Input
                id="label"
                name="label"
                placeholder="Ex: Salle de réunion vue de la porte"
              />
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
