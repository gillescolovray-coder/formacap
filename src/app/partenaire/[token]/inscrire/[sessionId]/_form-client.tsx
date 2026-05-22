"use client";

import { useState } from "react";
import {
  Building2,
  Euro,
  Plus,
  Send,
  Trash2,
  User,
} from "lucide-react";
import { SireneLookup } from "@/app/(app)/entreprises/_sirene-lookup";
import type { SireneCompany } from "@/lib/sirene/types";
import { submitPartnerBatchEnrollmentForm } from "../../actions";

type LearnerForm = {
  uid: string; // clé interne React
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  birthYear: string;
};

type CompanyForm = {
  siret: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
};

function emptyLearner(): LearnerForm {
  return {
    uid: Math.random().toString(36).slice(2, 11),
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    jobTitle: "",
    birthYear: "",
  };
}

export function PartnerInscribeForm({
  token,
  sessionId,
  unitPriceHt,
  partnerType,
}: {
  token: string;
  sessionId: string;
  unitPriceHt: number;
  /** Type du partenaire (OF vs prescripteur) — détermine le workflow.
   *  Pour les OF : pas de convention → contact référent facultatif
   *  et masqué par défaut. Pour les prescripteurs : obligatoire. */
  partnerType: "of" | "prescripteur";
}) {
  const [company, setCompany] = useState<CompanyForm>({
    siret: "",
    name: "",
    address: "",
    postalCode: "",
    city: "",
  });
  const [learners, setLearners] = useState<LearnerForm[]>([emptyLearner()]);
  // Financement : Employeur direct / OPCO sans subro / OPCO avec subro.
  // Qualiopi indic. 9 — info à tracer côté inscription_request.
  const [financing, setFinancing] = useState<
    "employeur" | "opco_sans_sub" | "opco_avec_sub"
  >("employeur");
  const [opcoName, setOpcoName] = useState("");
  // Contact référent pédagogique (RH / responsable formation côté
  // entreprise) — distinct des apprenants, recevra la convention.
  const [contact, setContact] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "",
  });

  function handleSirenePick(c: SireneCompany) {
    setCompany({
      siret: c.siret ?? "",
      name: c.name ?? "",
      address: c.address ?? "",
      postalCode: c.postal_code ?? "",
      city: c.city ?? "",
    });
  }

  function updateCompany<K extends keyof CompanyForm>(
    key: K,
    value: CompanyForm[K],
  ) {
    setCompany((c) => ({ ...c, [key]: value }));
  }

  function updateLearner(
    uid: string,
    key: keyof Omit<LearnerForm, "uid">,
    value: string,
  ) {
    setLearners((arr) =>
      arr.map((l) => (l.uid === uid ? { ...l, [key]: value } : l)),
    );
  }

  function addLearner() {
    setLearners((arr) => [...arr, emptyLearner()]);
  }

  function removeLearner(uid: string) {
    setLearners((arr) =>
      arr.length === 1 ? arr : arr.filter((l) => l.uid !== uid),
    );
  }

  const totalHt = unitPriceHt * learners.length;
  const financingOk =
    financing === "employeur" ? true : opcoName.trim().length > 0;
  const contactOk =
    contact.firstName.trim().length > 0 &&
    contact.lastName.trim().length > 0 &&
    /^\S+@\S+\.\S+$/.test(contact.email.trim());
  const canSubmit =
    company.siret.trim().length > 0 &&
    company.name.trim().length > 0 &&
    financingOk &&
    contactOk &&
    learners.every(
      (l) =>
        l.firstName.trim() &&
        l.lastName.trim() &&
        /^\S+@\S+\.\S+$/.test(l.email.trim()),
    );

  return (
    <form action={submitPartnerBatchEnrollmentForm} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="session_id" value={sessionId} />
      <input
        type="hidden"
        name="company"
        value={JSON.stringify(company)}
      />
      <input
        type="hidden"
        name="learners"
        value={JSON.stringify(
          learners.map((l) => ({
            firstName: l.firstName,
            lastName: l.lastName,
            email: l.email,
            phone: l.phone,
            jobTitle: l.jobTitle,
            birthYear: l.birthYear,
          })),
        )}
      />
      {/* Financement sérialisé pour la server action */}
      <input
        type="hidden"
        name="financing"
        value={JSON.stringify(
          financing === "employeur"
            ? { mode: "employeur" }
            : {
                mode: "opco",
                opco_name: opcoName.trim(),
                subrogation: financing === "opco_avec_sub",
              },
        )}
      />
      <input
        type="hidden"
        name="contact_referent"
        value={JSON.stringify({
          first_name: contact.firstName.trim(),
          last_name: contact.lastName.trim(),
          email: contact.email.trim(),
          phone: contact.phone.trim() || null,
          role: contact.role.trim() || null,
        })}
      />

      {/* ===== ENTREPRISE DES APPRENANTS ===== */}
      <section className="rounded-2xl bg-white border border-zinc-200 p-5 space-y-4">
        <h3 className="font-bold text-zinc-900 inline-flex items-center gap-2">
          <Building2 className="h-4 w-4 text-cyan-600" />
          Entreprise des apprenants
        </h3>
        <p className="text-xs text-zinc-500 -mt-2">
          Recherchez par SIRET, SIREN ou raison sociale. Les champs se
          remplissent automatiquement.
        </p>

        <SireneLookup compact onPick={handleSirenePick} />

        {/* Champs entreprise (auto-remplis, modifiables) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-zinc-100">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-zinc-700 mb-1">
              Raison sociale <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={company.name}
              onChange={(e) => updateCompany("name", e.target.value)}
              required
              className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1">
              SIRET <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={company.siret}
              onChange={(e) => updateCompany("siret", e.target.value)}
              required
              maxLength={20}
              placeholder="14 chiffres"
              className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1">
              Adresse
            </label>
            <input
              type="text"
              value={company.address}
              onChange={(e) => updateCompany("address", e.target.value)}
              className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1">
              Code postal
            </label>
            <input
              type="text"
              value={company.postalCode}
              onChange={(e) => updateCompany("postalCode", e.target.value)}
              className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1">
              Ville
            </label>
            <input
              type="text"
              value={company.city}
              onChange={(e) => updateCompany("city", e.target.value)}
              className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm"
            />
          </div>
        </div>

        {/* Contact référent / Personne qui inscrit l'apprenant.
            Adaptatif selon le type de partenaire (Gilles 2026-05-22) :
            - PRESCRIPTEUR : contact référent pédagogique obligatoire
              (recevra la convention de formation)
            - OF : personne qui inscrit (workflow simplifié sans
              convention, juste contact pour rappel/SAV) */}
        <div className="pt-3 mt-2 border-t border-zinc-100 space-y-3">
          <div>
            <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider inline-flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-cyan-600" />
              {partnerType === "of"
                ? "Personne qui inscrit l'apprenant"
                : "Contact référent pédagogique (recevra la convention)"}
            </h4>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {partnerType === "of"
                ? "Vos coordonnées pour un contact éventuel (vous, en tant qu'organisme partenaire). Facultatif."
                : "Personne RH / responsable formation côté entreprise — distincte des apprenants. C'est elle qui recevra la convention de formation et les documents administratifs."}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Prénom{" "}
                {partnerType === "prescripteur" && (
                  <span className="text-rose-500">*</span>
                )}
              </label>
              <input
                type="text"
                value={contact.firstName}
                onChange={(e) =>
                  setContact((c) => ({ ...c, firstName: e.target.value }))
                }
                required={partnerType === "prescripteur"}
                className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Nom{" "}
                {partnerType === "prescripteur" && (
                  <span className="text-rose-500">*</span>
                )}
              </label>
              <input
                type="text"
                value={contact.lastName}
                onChange={(e) =>
                  setContact((c) => ({ ...c, lastName: e.target.value }))
                }
                required={partnerType === "prescripteur"}
                className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Email{" "}
                {partnerType === "prescripteur" && (
                  <span className="text-rose-500">*</span>
                )}
              </label>
              <input
                type="email"
                value={contact.email}
                onChange={(e) =>
                  setContact((c) => ({ ...c, email: e.target.value }))
                }
                required={partnerType === "prescripteur"}
                className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Téléphone
              </label>
              <input
                type="text"
                value={contact.phone}
                onChange={(e) =>
                  setContact((c) => ({ ...c, phone: e.target.value }))
                }
                placeholder="06 …"
                className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm"
              />
            </div>
            {partnerType === "prescripteur" && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Fonction
                </label>
                <input
                  type="text"
                  value={contact.role}
                  onChange={(e) =>
                    setContact((c) => ({ ...c, role: e.target.value }))
                  }
                  placeholder="Ex : Responsable formation"
                  className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm"
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===== LISTE DES APPRENANTS ===== */}
      <section className="rounded-2xl bg-white border border-zinc-200 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-bold text-zinc-900 inline-flex items-center gap-2">
            <User className="h-4 w-4 text-cyan-600" />
            Apprenants à inscrire
            <span className="text-xs font-medium text-zinc-500">
              ({learners.length})
            </span>
          </h3>
          <button
            type="button"
            onClick={addLearner}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-cyan-300 bg-cyan-50 text-cyan-700 text-sm font-medium hover:bg-cyan-100"
          >
            <Plus className="h-4 w-4" />
            Ajouter un apprenant
          </button>
        </div>

        {learners.map((l, idx) => (
          <div
            key={l.uid}
            className="rounded-lg border border-zinc-200 p-4 space-y-3 bg-zinc-50/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                Apprenant {idx + 1}
              </span>
              {learners.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLearner(l.uid)}
                  className="text-zinc-400 hover:text-rose-600 p-1"
                  title="Retirer cet apprenant"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Prénom <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={l.firstName}
                  onChange={(e) =>
                    updateLearner(l.uid, "firstName", e.target.value)
                  }
                  required
                  className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Nom <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={l.lastName}
                  onChange={(e) =>
                    updateLearner(l.uid, "lastName", e.target.value)
                  }
                  required
                  className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  value={l.email}
                  onChange={(e) =>
                    updateLearner(l.uid, "email", e.target.value)
                  }
                  required
                  className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Fonction
                </label>
                <input
                  type="text"
                  value={l.jobTitle}
                  onChange={(e) =>
                    updateLearner(l.uid, "jobTitle", e.target.value)
                  }
                  className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Téléphone
                </label>
                <input
                  type="tel"
                  value={l.phone}
                  onChange={(e) =>
                    updateLearner(l.uid, "phone", e.target.value)
                  }
                  className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Année de naissance
                </label>
                <input
                  type="text"
                  value={l.birthYear}
                  onChange={(e) =>
                    updateLearner(l.uid, "birthYear", e.target.value)
                  }
                  maxLength={4}
                  placeholder="ex : 1985"
                  className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white tabular-nums"
                />
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ===== FINANCEMENT ===== */}
      <section className="rounded-2xl bg-white border border-zinc-200 p-5 space-y-3">
        <h3 className="font-bold text-zinc-900 inline-flex items-center gap-2">
          <Euro className="h-4 w-4 text-emerald-600" />
          Financement
        </h3>
        <p className="text-xs text-zinc-500 -mt-2">
          Mode de prise en charge déclaré (Qualiopi indic. 9). Identique pour
          tous les apprenants du lot.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {([
            {
              key: "employeur",
              label: "Employeur",
              desc: "Paiement direct par l'entreprise",
            },
            {
              key: "opco_sans_sub",
              label: "OPCO sans subrogation",
              desc: "L'entreprise paie, l'OPCO la rembourse",
            },
            {
              key: "opco_avec_sub",
              label: "OPCO avec subrogation",
              desc: "L'OPCO paie directement CAP NUMÉRIQUE",
            },
          ] as const).map((opt) => (
            <label
              key={opt.key}
              className={
                financing === opt.key
                  ? "rounded-lg border-2 border-cyan-500 bg-cyan-50/60 p-3 cursor-pointer flex flex-col gap-1 text-sm transition-all"
                  : "rounded-lg border border-zinc-200 bg-white p-3 cursor-pointer flex flex-col gap-1 text-sm hover:border-cyan-300 transition-all"
              }
            >
              <input
                type="radio"
                name="financing-choice"
                value={opt.key}
                checked={financing === opt.key}
                onChange={() => setFinancing(opt.key)}
                className="sr-only"
              />
              <span className="font-bold text-zinc-900 inline-flex items-center gap-1.5">
                <span
                  className={
                    financing === opt.key
                      ? "h-3 w-3 rounded-full border-2 border-cyan-600 bg-cyan-600 ring-2 ring-white"
                      : "h-3 w-3 rounded-full border-2 border-zinc-300"
                  }
                />
                {opt.label}
              </span>
              <span className="text-[11px] text-zinc-500 leading-snug">
                {opt.desc}
              </span>
            </label>
          ))}
        </div>
        {(financing === "opco_sans_sub" || financing === "opco_avec_sub") && (
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1">
              Nom de l&apos;OPCO <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={opcoName}
              onChange={(e) => setOpcoName(e.target.value)}
              required
              placeholder="Ex : Constructys, OCAPIAT, AFDAS, OPCO EP…"
              className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm"
            />
          </div>
        )}
      </section>

      {/* ===== MESSAGE OPTIONNEL ===== */}
      <section className="rounded-2xl bg-white border border-zinc-200 p-5">
        <label className="block text-xs font-bold text-zinc-700 mb-1">
          Message (optionnel)
        </label>
        <textarea
          name="message"
          rows={2}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Informations complémentaires (prise en charge, adaptations…)"
        />
      </section>

      {/* ===== RÉCAP + CTA ===== */}
      <section className="rounded-2xl bg-gradient-to-br from-emerald-50 to-cyan-50 border border-emerald-200 p-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-emerald-700">
              Total inscription
            </p>
            <p className="text-2xl font-bold text-emerald-900 tabular-nums">
              {totalHt.toFixed(2)} € HT
            </p>
            <p className="text-xs text-zinc-600 mt-0.5">
              {learners.length} apprenant{learners.length > 1 ? "s" : ""} ×{" "}
              {unitPriceHt.toFixed(2)} € HT
            </p>
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4" />
            Inscrire {learners.length} apprenant{learners.length > 1 ? "s" : ""}
          </button>
        </div>
        {!canSubmit && (
          <p className="text-[11px] text-zinc-600 mt-2">
            Remplissez les champs obligatoires (SIRET, raison sociale,
            prénom/nom/email pour chaque apprenant) pour activer le bouton.
          </p>
        )}
      </section>
    </form>
  );
}
