"use client";

import { useState, useTransition } from "react";
import {
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Globe,
  MapPin,
  Plus,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { submitPreinscription } from "./actions";

type LearnerForm = {
  uid: string; // identifiant local pour le rendu
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
};

function newLearner(): LearnerForm {
  return {
    uid: `l-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    jobTitle: "",
  };
}

export type PublicSession = {
  id: string;
  reference: string | null;
  start_date: string | null;
  end_date: string | null;
  modality: string | null;
  formation: {
    id: string;
    title: string;
    subtitle: string | null;
    duration_hours: number | null;
    duration_days: number | null;
    programme_pdf_url: string | null;
  } | null;
  location_detail: {
    name: string | null;
    address: string | null;
    postal_code: string | null;
    city: string | null;
  } | null;
  video_app: string | null;
};

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "—";
  if (!end || end === start) return formatDate(start);
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sameMonth =
    s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  if (sameMonth) {
    return `${s.getDate()} – ${e.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export function PreinscriptionClient({
  token,
  partnerName,
  sessions,
}: {
  token: string;
  partnerName: string;
  sessions: PublicSession[];
}) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Entreprise (en premier — un seul bloc)
  const [companyName, setCompanyName] = useState("");
  const [companySiret, setCompanySiret] = useState("");
  const [companyCity, setCompanyCity] = useState("");
  // Contact référent pédagogique (RH / responsable formation côté
  // entreprise) — recevra la convention. Email obligatoire.
  const [contactFirst, setContactFirst] = useState("");
  const [contactLast, setContactLast] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactRole, setContactRole] = useState("");
  // Apprenants (tableau, min 1)
  const [learners, setLearners] = useState<LearnerForm[]>([newLearner()]);
  // Financement : trois choix mutuellement exclusifs (Qualiopi indic. 9).
  // Si OPCO, on demande le nom de l'OPCO pour faciliter le suivi côté admin.
  const [financing, setFinancing] = useState<
    "employeur" | "opco_sans_sub" | "opco_avec_sub"
  >("employeur");
  const [opcoName, setOpcoName] = useState("");
  // Message global
  const [message, setMessage] = useState("");

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  function updateLearner(uid: string, patch: Partial<LearnerForm>) {
    setLearners((prev) =>
      prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)),
    );
  }
  function addLearner() {
    setLearners((prev) => [...prev, newLearner()]);
  }
  function removeLearner(uid: string) {
    setLearners((prev) =>
      prev.length <= 1 ? prev : prev.filter((l) => l.uid !== uid),
    );
  }

  function submit() {
    setError(null);
    if (!selectedId) {
      setError("Choisissez une session.");
      return;
    }
    if (!companyName.trim()) {
      setError("La raison sociale de l'entreprise est obligatoire.");
      return;
    }
    if (!contactFirst.trim() || !contactLast.trim()) {
      setError("Le contact référent (prénom et nom) est obligatoire.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(contactEmail.trim())) {
      setError("Email du contact référent invalide (recevra la convention).");
      return;
    }
    for (const l of learners) {
      if (!l.firstName.trim() || !l.lastName.trim()) {
        setError("Le prénom et le nom sont obligatoires pour chaque apprenant.");
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(l.email.trim())) {
        setError(
          `Email invalide pour ${l.firstName || "?"} ${l.lastName || "?"}.`,
        );
        return;
      }
    }
    if (financing !== "employeur" && !opcoName.trim()) {
      setError("Indiquez le nom de l'OPCO de financement.");
      return;
    }
    startTransition(async () => {
      const res = await submitPreinscription({
        token,
        sessionId: selectedId,
        learners: learners.map((l) => ({
          first_name: l.firstName.trim(),
          last_name: l.lastName.trim(),
          email: l.email.trim(),
          phone: l.phone.trim() || null,
          job_title: l.jobTitle.trim() || null,
        })),
        company: {
          name: companyName.trim(),
          siret: companySiret.trim() || null,
          city: companyCity.trim() || null,
        },
        contact_referent: {
          first_name: contactFirst.trim(),
          last_name: contactLast.trim(),
          email: contactEmail.trim(),
          phone: contactPhone.trim() || null,
          role: contactRole.trim() || null,
        },
        financing:
          financing === "employeur"
            ? { mode: "employeur" }
            : {
                mode: "opco",
                opco_name: opcoName.trim(),
                subrogation: financing === "opco_avec_sub",
              },
        message: message.trim() || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Erreur lors de l'envoi.");
        return;
      }
      setDoneCount(res.created);
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-300 p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-emerald-900">
          {doneCount > 1
            ? `${doneCount} pré-inscriptions enregistrées !`
            : "Pré-inscription enregistrée !"}
        </h2>
        <p className="text-sm text-emerald-800 mt-2">
          {partnerName} va valider {doneCount > 1 ? "ces demandes" : "votre demande"} et reviendra vers vous rapidement avec les modalités définitives.
        </p>
      </div>
    );
  }

  // Panneau d'inscription (entreprise + apprenants + message), réutilisable
  // → inséré DIRECTEMENT sous la carte de session sélectionnée pour ne pas
  // faire scroller en bas de page.
  const inscriptionPanel = selected ? (
    <section className="rounded-2xl bg-white border-2 border-cyan-300 p-5 space-y-4 mt-2 relative">
      {/* Bouton de fermeture en haut à droite : reclic sur la carte
          ferme aussi le panneau, mais le ✕ est plus visible. */}
      <button
        type="button"
        onClick={() => setSelectedId("")}
        className="absolute top-3 right-3 inline-flex items-center justify-center h-7 w-7 rounded-full text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
        title="Fermer le formulaire de pré-inscription"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>
      <h2 className="text-sm font-bold text-zinc-700 uppercase tracking-wider pr-10">
        2. Entreprise
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          label="Raison sociale"
          required
          value={companyName}
          onChange={setCompanyName}
          icon={Building2}
          className="sm:col-span-2"
        />
        <Field
          label="SIRET (optionnel)"
          value={companySiret}
          onChange={setCompanySiret}
          placeholder="14 chiffres"
        />
        <Field label="Ville" value={companyCity} onChange={setCompanyCity} />
      </div>

      {/* Contact référent pédagogique côté entreprise — recevra la
          convention de formation et les documents administratifs. */}
      <div className="pt-3 mt-2 border-t border-zinc-100 space-y-3">
        <div>
          <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wider inline-flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-cyan-600" />
            Contact référent pédagogique (recevra la convention)
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Personne RH / responsable formation côté entreprise — distincte
            de l&apos;apprenant. C&apos;est elle qui recevra la convention
            de formation.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Prénom"
            required
            value={contactFirst}
            onChange={setContactFirst}
          />
          <Field
            label="Nom"
            required
            value={contactLast}
            onChange={setContactLast}
          />
          <Field
            label="Email (convention)"
            type="email"
            required
            value={contactEmail}
            onChange={setContactEmail}
          />
          <Field
            label="Téléphone"
            value={contactPhone}
            onChange={setContactPhone}
            placeholder="06 …"
          />
          <Field
            label="Fonction"
            value={contactRole}
            onChange={setContactRole}
            placeholder="Ex : Responsable formation"
            className="sm:col-span-2"
          />
        </div>
      </div>

      <div className="pt-4 border-t border-zinc-100">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 className="text-sm font-bold text-zinc-700 uppercase tracking-wider inline-flex items-center gap-2">
            <Users className="h-4 w-4 text-cyan-600" />
            3. Apprenant{learners.length > 1 ? "s" : ""} à inscrire
            <span className="text-[10px] font-normal text-zinc-500">
              ({learners.length})
            </span>
          </h2>
          <button
            type="button"
            onClick={addLearner}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-cyan-300 bg-cyan-50 text-cyan-700 text-xs font-bold hover:bg-cyan-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter un apprenant
          </button>
        </div>

        <div className="space-y-4">
          {learners.map((l, idx) => (
            <div
              key={l.uid}
              className="rounded-lg border border-zinc-200 bg-zinc-50/40 p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                  Apprenant {idx + 1}
                </p>
                {learners.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLearner(l.uid)}
                    className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800"
                    title="Retirer cet apprenant"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Retirer
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label="Prénom"
                  required
                  value={l.firstName}
                  onChange={(v) => updateLearner(l.uid, { firstName: v })}
                  icon={User}
                />
                <Field
                  label="Nom"
                  required
                  value={l.lastName}
                  onChange={(v) => updateLearner(l.uid, { lastName: v })}
                />
                <Field
                  label="Email"
                  type="email"
                  required
                  value={l.email}
                  onChange={(v) => updateLearner(l.uid, { email: v })}
                />
                <Field
                  label="Téléphone"
                  value={l.phone}
                  onChange={(v) => updateLearner(l.uid, { phone: v })}
                  placeholder="06 …"
                />
                <Field
                  label="Fonction"
                  value={l.jobTitle}
                  onChange={(v) => updateLearner(l.uid, { jobTitle: v })}
                  placeholder="Ex : Chargé de mission"
                  className="sm:col-span-2"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Étape 4 : financement (OPCO / employeur direct) */}
      <div className="pt-4 border-t border-zinc-100 space-y-3">
        <h2 className="text-sm font-bold text-zinc-700 uppercase tracking-wider">
          4. Financement
        </h2>
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
              desc: "L'OPCO paie directement l'organisme de formation",
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
                name="financing"
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
          <Field
            label="Nom de l'OPCO"
            required
            value={opcoName}
            onChange={setOpcoName}
            placeholder="Ex : Constructys, OCAPIAT, AFDAS, OPCO EP…"
          />
        )}
      </div>

      <div className="pt-4 border-t border-zinc-100">
        <label className="block text-[11px] uppercase tracking-wider font-bold text-zinc-600 mb-1">
          5. Message (optionnel)
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Besoins spécifiques, contraintes, numéro de dossier…"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400"
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-zinc-500 italic">
          {learners.length > 1
            ? `Ces ${learners.length} pré-inscriptions seront transmises à ${partnerName} pour validation.`
            : `Cette demande sera transmise à ${partnerName} pour validation.`}
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending
            ? "Envoi en cours…"
            : learners.length > 1
              ? `Envoyer les ${learners.length} pré-inscriptions`
              : "Envoyer ma pré-inscription"}
          {!pending && <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </section>
  ) : null;

  return (
    <div className="space-y-4">
      {/* Étape 1 : choix de session — sous forme de liste cliquable.
          Le formulaire d'inscription (entreprise + apprenants) s'insère
          juste sous la carte sélectionnée pour éviter un scroll en bas. */}
      <section>
        <h2 className="text-sm font-bold text-zinc-700 uppercase tracking-wider mb-2">
          1. Choisissez une formation
        </h2>
        <div className="grid grid-cols-1 gap-2">
          {sessions.map((s) => {
            const isSel = s.id === selectedId;
            return (
              <div key={s.id} className="space-y-2">
              <button
                type="button"
                onClick={() => setSelectedId(isSel ? "" : s.id)}
                className={
                  isSel
                    ? "w-full text-left rounded-xl border-2 border-cyan-500 bg-cyan-50/60 p-4 shadow-sm transition-all"
                    : "w-full text-left rounded-xl border border-zinc-200 bg-white p-4 hover:border-cyan-300 hover:shadow-sm transition-all"
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-zinc-900 leading-snug">
                      {s.formation?.title ?? "(formation supprimée)"}
                    </h3>
                    {s.formation?.subtitle && (
                      <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                        {s.formation.subtitle}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
                      <span className="inline-flex items-center gap-1 font-bold text-zinc-900">
                        <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                        {formatDateRange(s.start_date, s.end_date)}
                      </span>
                      {(() => {
                        const d = s.formation?.duration_days;
                        const h = s.formation?.duration_hours;
                        const dayLabel =
                          d != null && d > 0
                            ? Number.isInteger(d)
                              ? `${d} j`
                              : `${d.toFixed(1)} j`
                            : null;
                        const hourLabel =
                          h != null && h > 0 ? `${h} h` : null;
                        const dur =
                          dayLabel && hourLabel
                            ? `${dayLabel} / ${hourLabel}`
                            : dayLabel ?? hourLabel;
                        if (!dur) return null;
                        return (
                          <span className="inline-flex items-center gap-1 text-zinc-600">
                            <Clock className="h-3.5 w-3.5 text-zinc-400" />
                            {dur}
                          </span>
                        );
                      })()}
                    </div>
                    {s.modality === "presentiel" && s.location_detail && (
                      <div className="flex items-start gap-1.5 mt-1 text-xs text-zinc-600">
                        <MapPin className="h-3.5 w-3.5 text-zinc-400 mt-0.5 shrink-0" />
                        <span>
                          {s.location_detail.name && (
                            <span className="font-semibold">
                              {s.location_detail.name}
                            </span>
                          )}
                          {(() => {
                            const addr = [
                              s.location_detail.address,
                              [
                                s.location_detail.postal_code,
                                s.location_detail.city,
                              ]
                                .filter(Boolean)
                                .join(" "),
                            ]
                              .filter((x) => x && x.length > 0)
                              .join(", ");
                            if (!addr) return null;
                            return (
                              <span
                                className={
                                  s.location_detail.name
                                    ? " block text-[11px] text-zinc-500"
                                    : ""
                                }
                              >
                                {addr}
                              </span>
                            );
                          })()}
                        </span>
                      </div>
                    )}
                    {s.modality === "distanciel" && s.video_app && (
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-zinc-600">
                        <Globe className="h-3.5 w-3.5 text-zinc-400" />
                        <span>{s.video_app}</span>
                      </div>
                    )}
                  </div>
                  <span
                    className={
                      s.modality === "presentiel"
                        ? "inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider shrink-0"
                        : "inline-flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold uppercase tracking-wider shrink-0"
                    }
                  >
                    {s.modality === "presentiel" ? "Présentiel" : "Distanciel"}
                  </span>
                </div>
                {s.formation?.programme_pdf_url && (
                  <div className="mt-2">
                    <a
                      href={s.formation.programme_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[11px] text-cyan-700 hover:underline"
                    >
                      <FileText className="h-3 w-3" />
                      Voir le programme détaillé (PDF)
                    </a>
                  </div>
                )}
              </button>
              {isSel && inscriptionPanel}
              </div>
            );
          })}
        </div>
      </section>
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
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] uppercase tracking-wider font-bold text-zinc-600 mb-1">
        {label}
        {required && <span className="text-rose-600 ml-0.5">*</span>}
      </label>
      <div className="relative">
        {Icon && (
          <Icon className="h-4 w-4 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={
            Icon
              ? "h-9 w-full pl-8 pr-2 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400"
              : "h-9 w-full px-2 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400"
          }
        />
      </div>
    </div>
  );
}
