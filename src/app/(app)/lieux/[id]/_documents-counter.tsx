"use client";

import {
  DocumentsCounter as GenericCounter,
  type DocumentCounterItem,
} from "@/components/documents-counter";
import {
  LOCATION_DOCUMENT_KIND_LABELS,
  type LocationDocument,
} from "@/lib/locations/types";

type Props = {
  documents: LocationDocument[];
};

export function DocumentsCounter({ documents }: Props) {
  const items: DocumentCounterItem[] = documents.map((d) => ({
    kind: d.kind,
    kindLabel: LOCATION_DOCUMENT_KIND_LABELS[d.kind],
    fileName: d.file_name,
    label: d.label,
    expiresOn: null,
  }));
  return <GenericCounter documents={items} />;
}
