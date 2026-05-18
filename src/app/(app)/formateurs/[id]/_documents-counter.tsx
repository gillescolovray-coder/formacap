"use client";

import {
  DocumentsCounter as GenericCounter,
  type DocumentCounterItem,
} from "@/components/documents-counter";
import {
  TRAINER_DOCUMENT_KIND_LABELS,
  type TrainerDocument,
} from "@/lib/trainers/types";

type Props = {
  documents: TrainerDocument[];
};

export function DocumentsCounter({ documents }: Props) {
  const items: DocumentCounterItem[] = documents.map((d) => ({
    kind: d.kind,
    kindLabel: TRAINER_DOCUMENT_KIND_LABELS[d.kind],
    fileName: d.file_name,
    label: d.label,
    expiresOn: d.expires_on ?? null,
  }));
  return <GenericCounter documents={items} />;
}
