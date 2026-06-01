"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Identity = {
  name: string;
  siret: string | null;
  nda: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  legal_representative_name: string | null;
  legal_representative_role: string | null;
};

export function OrgIdentityForm({
  action,
  initial,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initial: Identity;
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Raison sociale" name="name" defaultValue={initial.name} required />
        <Field
          label="SIRET"
          name="siret"
          defaultValue={initial.siret}
          placeholder="ex. 522 316 884 00033"
        />
        <Field
          label="N° de Déclaration d'Activité (NDA)"
          name="nda"
          defaultValue={initial.nda}
          placeholder="ex. 82 38 04928 38"
          help="Numéro Qualiopi délivré par la DREETS, repris dans les conventions et attestations."
          spanFull
        />
        <Field
          label="Adresse"
          name="address"
          defaultValue={initial.address}
          placeholder="ex. 5 A Rue Simone Veil"
          spanFull
        />
        <Field
          label="Code postal"
          name="postal_code"
          defaultValue={initial.postal_code}
          placeholder="69530"
        />
        <Field
          label="Ville"
          name="city"
          defaultValue={initial.city}
          placeholder="BRIGNAIS"
        />
        <Field
          label="Téléphone"
          name="phone"
          defaultValue={initial.phone}
          placeholder="+33 6 65 02 31 32"
        />
        <Field
          label="Email"
          name="email"
          defaultValue={initial.email}
          type="email"
          placeholder="contact@capnumerique.com"
        />
        <Field
          label="Site web"
          name="website"
          defaultValue={initial.website}
          type="url"
          placeholder="https://www.capnumerique.com"
          spanFull
        />
        <Field
          label="Représentant légal — Nom complet"
          name="legal_representative_name"
          defaultValue={initial.legal_representative_name}
          placeholder="ex. Gilles COLOVRAY"
          help="Insere automatiquement sur les attestations (« Je soussigné(e), <Nom>, représentant légal de … »)."
        />
        <Field
          label="Représentant légal — Fonction"
          name="legal_representative_role"
          defaultValue={initial.legal_representative_role}
          placeholder="ex. Gérant, Président, Directeur"
          help="Optionnel — affiché si renseigné."
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit">Enregistrer l&apos;identité</Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  required = false,
  help,
  spanFull = false,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  type?: string;
  required?: boolean;
  help?: string;
  spanFull?: boolean;
}) {
  return (
    <div className={spanFull ? "md:col-span-2 space-y-1.5" : "space-y-1.5"}>
      <Label htmlFor={name}>
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        required={required}
      />
      {help && <p className="text-[11px] text-zinc-500">{help}</p>}
    </div>
  );
}
