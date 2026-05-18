"use client";

import { useEffect, useState } from "react";
import { Bell, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { UpperCaseInput } from "@/components/ui/uppercase-input";
import { Label } from "@/components/ui/label";
import {
  COMPANY_CONTACT_ROLE_LABELS,
  type CompanyContactRole,
} from "@/lib/companies/types";

/**
 * Payload de l'événement "sirene:add-director" — déclenché depuis
 * SireneLookup pour transformer un dirigeant en contact.
 */
export type AddDirectorDetail = {
  first_name: string;
  last_name: string;
  job_title: string;
  role: CompanyContactRole;
};

type DraftContact = {
  id: number;
  civility: string;
  first_name: string;
  last_name: string;
  job_title: string;
  role: CompanyContactRole;
  service: string;
  email: string;
  phone: string;
  mobile: string;
  is_primary: boolean;
  notify_inscription_validated: boolean;
  notify_session_opened: boolean;
  notify_session_cancelled: boolean;
  notify_session_completed: boolean;
  notify_admin_documents: boolean;
  notify_invoices: boolean;
  notify_certificates: boolean;
};

const NOTIFY_FIELDS: Array<{
  key: keyof Pick<
    DraftContact,
    | "notify_inscription_validated"
    | "notify_session_opened"
    | "notify_session_cancelled"
    | "notify_session_completed"
    | "notify_admin_documents"
    | "notify_invoices"
    | "notify_certificates"
  >;
  label: string;
}> = [
  { key: "notify_admin_documents", label: "Documents administratifs" },
  { key: "notify_inscription_validated", label: "Inscription validée" },
  { key: "notify_session_opened", label: "Ouverture session" },
  { key: "notify_session_cancelled", label: "Annulation" },
  { key: "notify_session_completed", label: "Fin de session" },
  { key: "notify_invoices", label: "Factures" },
  { key: "notify_certificates", label: "Attestations" },
];

function emptyContact(id: number): DraftContact {
  return {
    id,
    civility: "",
    first_name: "",
    last_name: "",
    job_title: "",
    role: "autre",
    service: "",
    email: "",
    phone: "",
    mobile: "",
    is_primary: false,
    notify_inscription_validated: false,
    notify_session_opened: false,
    notify_session_cancelled: false,
    notify_session_completed: false,
    notify_admin_documents: false,
    notify_invoices: false,
    notify_certificates: false,
  };
}

export function ContactsBuilder() {
  const [contacts, setContacts] = useState<DraftContact[]>([]);
  const [nextId, setNextId] = useState(1);

  function addContact() {
    setContacts((prev) => [...prev, emptyContact(nextId)]);
    setNextId((n) => n + 1);
  }

  function removeContact(id: number) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }

  // Écoute des événements émis par SireneLookup quand l'utilisateur
  // valide l'ajout d'un dirigeant comme contact.
  useEffect(() => {
    function onAddDirector(e: Event) {
      const detail = (e as CustomEvent<AddDirectorDetail>).detail;
      if (!detail) return;
      setContacts((prev) => {
        // Évite les doublons sur (prénom, nom)
        const exists = prev.some(
          (c) =>
            c.first_name.trim().toLowerCase() ===
              detail.first_name.trim().toLowerCase() &&
            c.last_name.trim().toLowerCase() ===
              detail.last_name.trim().toLowerCase(),
        );
        if (exists) return prev;
        const newId =
          prev.length === 0 ? 1 : Math.max(...prev.map((c) => c.id)) + 1;
        const next: DraftContact = {
          ...emptyContact(newId),
          first_name: detail.first_name,
          last_name: detail.last_name,
          job_title: detail.job_title,
          role: detail.role,
        };
        return [...prev, next];
      });
      setNextId((n) => n + 1);
    }
    function onPing() {
      window.dispatchEvent(new CustomEvent("sirene:contacts-builder-ready"));
    }
    window.addEventListener("sirene:add-director", onAddDirector);
    window.addEventListener("sirene:ping-contacts-builder", onPing);
    // Signaler aux émetteurs (SireneLookup) qu'un ContactsBuilder est
    // monté — leur permet d'afficher le bouton "Ajouter aux contacts".
    window.dispatchEvent(new CustomEvent("sirene:contacts-builder-ready"));
    return () => {
      window.removeEventListener("sirene:add-director", onAddDirector);
      window.removeEventListener("sirene:ping-contacts-builder", onPing);
    };
  }, []);

  function updateContact<K extends keyof DraftContact>(
    id: number,
    key: K,
    value: DraftContact[K],
  ) {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [key]: value } : c)),
    );
  }

  return (
    <div className="space-y-4">
      <input
        type="hidden"
        name="contacts_payload"
        value={JSON.stringify(contacts.map(({ id: _id, ...rest }) => rest))}
      />

      {contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center">
          <p className="text-sm text-slate-500 mb-3">
            Aucun contact ajouté. Vous pouvez en ajouter un ou plusieurs (RH,
            responsable de service…) qui recevront les notifications.
          </p>
          <Button type="button" onClick={addContact} variant="outline">
            <UserPlus className="h-4 w-4" />
            Ajouter un premier contact
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {contacts.map((c, idx) => (
            <li
              key={c.id}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 p-4 space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Contact {idx + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeContact(c.id)}
                  className="text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Retirer
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-[auto_1fr_1fr_1fr]">
                <div className="space-y-1.5">
                  <Label className="text-xs">Civilité</Label>
                  <select
                    value={c.civility}
                    onChange={(e) =>
                      updateContact(c.id, "civility", e.target.value)
                    }
                    className="flex h-9 w-full min-w-[5.5rem] rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value=""></option>
                    <option value="M.">M.</option>
                    <option value="Mme">Mme</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Prénom</Label>
                  <Input
                    value={c.first_name}
                    onChange={(e) =>
                      updateContact(c.id, "first_name", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label required className="text-xs">
                    Nom
                  </Label>
                  <UpperCaseInput
                    value={c.last_name}
                    onChange={(e) =>
                      updateContact(c.id, "last_name", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Fonction / titre</Label>
                  <Input
                    value={c.job_title}
                    onChange={(e) =>
                      updateContact(c.id, "job_title", e.target.value)
                    }
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Rôle</Label>
                  <select
                    value={c.role}
                    onChange={(e) =>
                      updateContact(
                        c.id,
                        "role",
                        e.target.value as CompanyContactRole,
                      )
                    }
                    className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm"
                  >
                    {(
                      Object.keys(
                        COMPANY_CONTACT_ROLE_LABELS,
                      ) as CompanyContactRole[]
                    ).map((k) => (
                      <option key={k} value={k}>
                        {COMPANY_CONTACT_ROLE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Service</Label>
                  <Input
                    value={c.service}
                    onChange={(e) =>
                      updateContact(c.id, "service", e.target.value)
                    }
                    placeholder="RH, Comptabilité…"
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={c.email}
                    onChange={(e) =>
                      updateContact(c.id, "email", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Téléphone</Label>
                  <PhoneInput
                    defaultValue={c.phone}
                    onValueChange={(v) => updateContact(c.id, "phone", v)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mobile</Label>
                  <PhoneInput
                    defaultValue={c.mobile}
                    onValueChange={(v) => updateContact(c.id, "mobile", v)}
                  />
                </div>
              </div>

              <div className="rounded-lg bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900 p-3 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-cyan-700 inline-flex items-center gap-1.5">
                  <Bell className="h-3.5 w-3.5" />
                  Notifications à recevoir
                </p>
                <div className="grid gap-1.5 md:grid-cols-2 text-sm">
                  {NOTIFY_FIELDS.map((f) => (
                    <label
                      key={f.key}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={c[f.key]}
                        onChange={(e) =>
                          updateContact(c.id, f.key, e.target.checked)
                        }
                        className="h-4 w-4 rounded border-slate-300 text-cyan-600"
                      />
                      <span>{f.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={c.is_primary}
                  onChange={(e) =>
                    updateContact(c.id, "is_primary", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-slate-300 text-amber-600"
                />
                Contact principal
              </label>
            </li>
          ))}

          <li>
            <Button type="button" variant="outline" onClick={addContact}>
              <UserPlus className="h-4 w-4" />
              Ajouter un autre contact
            </Button>
          </li>
        </ul>
      )}
    </div>
  );
}
