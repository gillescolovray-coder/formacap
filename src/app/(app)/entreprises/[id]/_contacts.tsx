import {
  Bell,
  Briefcase,
  ChevronDown,
  Mail,
  Phone,
  Smartphone,
  Star,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { UpperCaseInput } from "@/components/ui/uppercase-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  COMPANY_CONTACT_ROLE_BADGE_CLASSES,
  COMPANY_CONTACT_ROLE_LABELS,
  type CompanyContact,
  type CompanyContactRole,
} from "@/lib/companies/types";
import {
  addContact,
  deleteContact,
  updateContact,
} from "./contacts/actions";

type ContactsSectionProps = {
  companyId: string;
  contacts: CompanyContact[];
};

const NOTIFY_FIELDS: Array<{
  key:
    | "notify_inscription_validated"
    | "notify_session_opened"
    | "notify_session_cancelled"
    | "notify_session_completed"
    | "notify_admin_documents"
    | "notify_invoices"
    | "notify_certificates";
  label: string;
  hint: string;
}> = [
  {
    key: "notify_admin_documents",
    label: "Documents administratifs",
    hint: "Devis, conventions, conditions générales",
  },
  {
    key: "notify_inscription_validated",
    label: "Inscription validée",
    hint: "Confirmation d'inscription d'un apprenant",
  },
  {
    key: "notify_session_opened",
    label: "Ouverture de session",
    hint: "Démarrage d'une session de formation",
  },
  {
    key: "notify_session_cancelled",
    label: "Annulation",
    hint: "Annulation d'une session ou d'une inscription",
  },
  {
    key: "notify_session_completed",
    label: "Fin de session",
    hint: "Session terminée, bilan disponible",
  },
  {
    key: "notify_invoices",
    label: "Factures",
    hint: "Envoi des factures",
  },
  {
    key: "notify_certificates",
    label: "Attestations",
    hint: "Attestations de formation des apprenants",
  },
];

function ContactCard({
  companyId,
  contact,
}: {
  companyId: string;
  contact: CompanyContact;
}) {
  const update = updateContact.bind(null, companyId, contact.id);
  const remove = deleteContact.bind(null, companyId, contact.id);
  const fullName = `${contact.first_name ?? ""} ${contact.last_name}`.trim();
  const activeNotifs = NOTIFY_FIELDS.filter((f) => contact[f.key]);

  return (
    <details className="group bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-900/80 transition-colors">
      <summary className="cursor-pointer list-none px-6 py-3 flex items-center gap-3">
        <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">
          {`${contact.first_name?.[0] ?? ""}${contact.last_name?.[0] ?? ""}`.toUpperCase() ||
            "?"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate flex items-center gap-1.5">
            {fullName || "Contact"}
            {contact.is_primary && (
              <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
            )}
            <span
              className={cn(
                "inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ml-1",
                COMPANY_CONTACT_ROLE_BADGE_CLASSES[contact.role],
              )}
            >
              {COMPANY_CONTACT_ROLE_LABELS[contact.role]}
            </span>
          </p>
          <p className="text-xs text-slate-500 truncate flex flex-wrap items-center gap-x-2 mt-0.5">
            {contact.job_title && (
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3 w-3" />
                {contact.job_title}
              </span>
            )}
            {contact.service && (
              <span className="text-slate-400">· {contact.service}</span>
            )}
            {contact.email && (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {contact.email}
              </span>
            )}
            {contact.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {contact.phone}
              </span>
            )}
            {contact.mobile && (
              <span className="inline-flex items-center gap-1">
                <Smartphone className="h-3 w-3" />
                {contact.mobile}
              </span>
            )}
          </p>
        </div>
        {activeNotifs.length > 0 && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 text-xs font-bold border border-cyan-200 dark:border-cyan-900"
            title={activeNotifs.map((n) => n.label).join(", ")}
          >
            <Bell className="h-3 w-3" />
            {activeNotifs.length}
          </span>
        )}
      </summary>

      {/* Edition complète */}
      <div className="px-6 pb-5 border-t border-slate-100 dark:border-slate-800/50 pt-4 bg-slate-50/30 dark:bg-slate-900/30">
        <form action={update} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[auto_1fr_1fr_1fr]">
            <div className="space-y-1.5">
              <Label className="text-xs">Civilité</Label>
              <select
                name="civility"
                defaultValue={contact.civility ?? ""}
                className="flex h-9 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
              >
                <option value="">—</option>
                <option value="M.">M.</option>
                <option value="Mme">Mme</option>
                <option value="Autre">Autre</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prénom</Label>
              <Input
                name="first_name"
                defaultValue={contact.first_name ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label required className="text-xs">
                Nom
              </Label>
              <UpperCaseInput
                name="last_name"
                required
                defaultValue={contact.last_name}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fonction / titre</Label>
              <Input
                name="job_title"
                defaultValue={contact.job_title ?? ""}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Rôle dans l&apos;entreprise</Label>
              <select
                name="role"
                defaultValue={contact.role}
                className="flex h-9 w-full rounded-md border border-slate-300 bg-white dark:bg-slate-900 px-3 py-1 text-sm shadow-sm"
              >
                {Object.entries(COMPANY_CONTACT_ROLE_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Service / département</Label>
              <Input
                name="service"
                defaultValue={contact.service ?? ""}
                placeholder="Ex: RH, Comptabilité, Direction commerciale"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input
                name="email"
                type="email"
                defaultValue={contact.email ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Téléphone</Label>
              <PhoneInput
                name="phone"
                defaultValue={contact.phone ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mobile</Label>
              <PhoneInput
                name="mobile"
                defaultValue={contact.mobile ?? ""}
              />
            </div>
          </div>

          {/* Notifications */}
          <div className="rounded-lg bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 inline-flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" />
              Que ce contact doit-il recevoir ?
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {NOTIFY_FIELDS.map((f) => (
                <label
                  key={f.key}
                  className="flex items-start gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    name={f.key}
                    defaultChecked={contact[f.key]}
                    className="h-4 w-4 mt-0.5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <span>
                    <span className="font-medium">{f.label}</span>
                    <span className="block text-[11px] text-slate-500">
                      {f.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              name="notes"
              rows={2}
              defaultValue={contact.notes ?? ""}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                name="is_primary"
                defaultChecked={contact.is_primary}
                className="h-4 w-4 rounded border-slate-300 text-amber-600"
              />
              Contact principal
            </label>
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                Enregistrer
              </Button>
            </div>
          </div>
        </form>
        <form action={remove} className="mt-2 flex justify-end">
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Supprimer ce contact
          </Button>
        </form>
      </div>
    </details>
  );
}

export function ContactsSection({
  companyId,
  contacts,
}: ContactsSectionProps) {
  const add = addContact.bind(null, companyId);

  return (
    <details
      id="contacts"
      open={contacts.length > 0}
      className="group rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden scroll-mt-6"
    >
      <summary className="cursor-pointer list-none px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 hover:bg-zinc-50/60 dark:hover:bg-zinc-950/30 transition-colors">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Contacts entreprise</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Personnes ressources de l&apos;entreprise (RH, comptabilité,
            direction…) qui <strong>ne participent pas</strong> aux
            formations — uniquement destinataires des notifications. Pour
            les personnes inscrites en formation, voir <em>Apprenants
            rattachés</em> ci-dessous.
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            {contacts.length} personne{contacts.length > 1 ? "s" : ""}{" "}
            rattachée{contacts.length > 1 ? "s" : ""}.
          </p>
        </div>
        <ChevronDown
          className="h-4 w-4 text-zinc-400 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>

      {/* Liste */}
      {contacts.length > 0 && (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {contacts.map((c) => (
            <li key={c.id}>
              <ContactCard companyId={companyId} contact={c} />
            </li>
          ))}
        </ul>
      )}

      {/* Formulaire d'ajout */}
      <details className="border-t-2 border-cyan-200 dark:border-cyan-900 bg-cyan-50/40 dark:bg-cyan-950/20">
        <summary className="cursor-pointer list-none px-6 py-3.5 flex items-center justify-between gap-3 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 transition-colors group">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-cyan-800 dark:text-cyan-200">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-cyan-600 text-white shadow-sm group-hover:bg-cyan-700 transition-colors">
              <UserPlus className="h-4 w-4" />
            </span>
            Ajouter un contact
          </span>
          <span className="text-[11px] text-cyan-700 dark:text-cyan-400 font-medium group-open:hidden">
            Cliquez pour ouvrir le formulaire ▾
          </span>
          <span className="text-[11px] text-cyan-700 dark:text-cyan-400 font-medium hidden group-open:inline">
            Cliquez pour fermer ▴
          </span>
        </summary>
        <form action={add} className="px-6 pb-5 pt-2 space-y-4">
          <div className="grid gap-3 md:grid-cols-[auto_1fr_1fr_1fr]">
            <div className="space-y-1.5">
              <Label className="text-xs">Civilité</Label>
              <select
                name="civility"
                defaultValue=""
                className="flex h-9 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
              >
                <option value="">—</option>
                <option value="M.">M.</option>
                <option value="Mme">Mme</option>
                <option value="Autre">Autre</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prénom</Label>
              <Input name="first_name" />
            </div>
            <div className="space-y-1.5">
              <Label required className="text-xs">
                Nom
              </Label>
              <UpperCaseInput name="last_name" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fonction</Label>
              <Input name="job_title" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Rôle</Label>
              <select
                name="role"
                defaultValue="autre"
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
              <Input name="service" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input name="email" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Téléphone</Label>
              <PhoneInput name="phone" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mobile</Label>
              <PhoneInput name="mobile" />
            </div>
          </div>
          <div className="rounded-lg bg-cyan-50/40 border border-cyan-200 p-3 space-y-2">
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
                    name={f.key}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600"
                  />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                name="is_primary"
                className="h-4 w-4 rounded border-slate-300 text-amber-600"
              />
              Contact principal
            </label>
            <Button type="submit">
              <UserPlus className="h-4 w-4" />
              Ajouter
            </Button>
          </div>
        </form>
      </details>
    </details>
  );
}
