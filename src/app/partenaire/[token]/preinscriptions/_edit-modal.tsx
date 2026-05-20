"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { updatePreinscription } from "./actions";

export function EditPreinscriptionModal({
  token,
  requestId,
  initial,
  onClose,
}: {
  token: string;
  requestId: string;
  initial: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    job_title: string | null;
  };
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState(initial.first_name ?? "");
  const [lastName, setLastName] = useState(initial.last_name ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [jobTitle, setJobTitle] = useState(initial.job_title ?? "");

  function submit() {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError("Prénom et nom obligatoires.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Email invalide.");
      return;
    }
    startTransition(async () => {
      const res = await updatePreinscription(token, requestId, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        job_title: jobTitle.trim() || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 sticky top-0 bg-white">
          <h2 className="font-bold text-zinc-900 text-base">
            Modifier l&apos;apprenant
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-3">
          <p className="text-[11px] text-zinc-500 italic">
            Corrigez les informations de l&apos;apprenant avant validation —
            utile en cas d&apos;email en double ou de faute de frappe.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Prénom"
              required
              value={firstName}
              onChange={setFirstName}
            />
            <Field
              label="Nom"
              required
              value={lastName}
              onChange={setLastName}
            />
            <Field
              label="Email"
              required
              type="email"
              value={email}
              onChange={setEmail}
              className="sm:col-span-2"
            />
            <Field
              label="Téléphone"
              value={phone}
              onChange={setPhone}
              placeholder="06 …"
            />
            <Field
              label="Fonction"
              value={jobTitle}
              onChange={setJobTitle}
              placeholder="Ex : Chargé de mission"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end p-4 border-t border-zinc-200 sticky bottom-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-md border border-zinc-300 bg-white text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-md bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-700 disabled:opacity-50"
          >
            {pending ? "Enregistrement…" : "Enregistrer les modifications"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] uppercase tracking-wider font-bold text-zinc-600 mb-1">
        {label}
        {required && <span className="text-rose-600 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full px-2 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400"
      />
    </div>
  );
}
