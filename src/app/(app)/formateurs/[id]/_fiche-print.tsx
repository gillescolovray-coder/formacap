"use client";

import { useEffect } from "react";
import {
  TRAINER_DOCUMENT_KIND_LABELS,
  TRAINER_STATUS_LABELS,
  TRAINER_VALIDATION_STATUS_LABELS,
  type Trainer,
} from "@/lib/trainers/types";

type LinkedFormation = {
  formation_id: string;
  justification: string | null;
  formation: { id: string; title: string } | null;
};

type Props = {
  trainer: Trainer;
  linked: LinkedFormation[];
  orgName: string;
  orgLogo: string | null;
};

function emptyText(value: string | null | undefined): string {
  if (!value || value.trim() === "") return "—";
  return value;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-slate-100 last:border-0">
      <span className="text-slate-600 text-xs">{label}</span>
      <span className="font-medium text-right text-xs">{value}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="break-inside-avoid mb-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-700 border-b-2 border-cyan-600 pb-1 mb-2">
        {title}
      </h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

export function TrainerFichePrint({
  trainer,
  linked,
  orgName,
  orgLogo,
}: Props) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  const fullAddress = [
    trainer.address,
    trainer.postal_code,
    trainer.city,
    trainer.country,
  ]
    .filter(Boolean)
    .join(", ");

  const isExternal = trainer.status !== "salarie";

  return (
    <div className="bg-white text-slate-900 min-h-screen">
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      <div className="no-print sticky top-0 bg-cyan-600 text-white px-6 py-3 flex items-center justify-between">
        <span className="text-sm font-medium">
          Fiche de référencement formateur — Ctrl+P pour enregistrer en PDF
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-white text-cyan-700 px-3 py-1 text-xs font-semibold hover:bg-cyan-50"
        >
          Imprimer
        </button>
      </div>

      <div className="max-w-[210mm] mx-auto p-10 text-[12px] leading-relaxed">
        <header className="flex items-start justify-between gap-4 mb-6 pb-4 border-b-4 border-cyan-600">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-700 font-bold mb-1">
              Fiche de référencement formateur — Qualiopi crit. 5
            </p>
            <h1 className="text-2xl font-black tracking-tight">
              {trainer.last_name.toUpperCase()} {trainer.first_name}
            </h1>
            <p className="text-slate-500 mt-1">
              {TRAINER_STATUS_LABELS[trainer.status]}
              {trainer.company_name && ` · ${trainer.company_name}`}
            </p>
          </div>
          <div className="text-right text-[10px] text-slate-500">
            {orgLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={orgLogo}
                alt={orgName}
                className="max-h-16 max-w-[120px] object-contain ml-auto mb-2"
              />
            )}
            <p className="font-semibold text-slate-700">{orgName}</p>
            <p>Édité le {new Date().toLocaleDateString("fr-FR")}</p>
            <p>
              Statut :{" "}
              {TRAINER_VALIDATION_STATUS_LABELS[trainer.validation_status]}
            </p>
          </div>
        </header>

        {/* 1 — Identité & contact */}
        <Section title="Identification & contact">
          <Row label="Nom complet" value={`${trainer.last_name.toUpperCase()} ${trainer.first_name}`} />
          <Row label="Statut" value={TRAINER_STATUS_LABELS[trainer.status]} />
          <Row label="Email" value={emptyText(trainer.email)} />
          <Row label="Téléphone" value={emptyText(trainer.phone)} />
          <Row label="Mobile" value={emptyText(trainer.mobile)} />
          <Row label="Adresse" value={emptyText(fullAddress)} />
        </Section>

        {/* 2 — Cadre légal externe */}
        {isExternal && (
          <Section title="Cadre légal & SIRET">
            <Row label="Raison sociale" value={emptyText(trainer.company_name)} />
            <Row label="Forme juridique" value={emptyText(trainer.legal_form)} />
            <Row label="SIRET" value={emptyText(trainer.siret)} />
            <Row label="N° déclaration d'activité" value={emptyText(trainer.nda)} />
            <Row label="RIB au dossier" value={trainer.rib_on_file ? "Oui" : "Non"} />
          </Section>
        )}

        {/* 3 — Cadre contractuel */}
        <Section title="Cadre contractuel">
          <Row label="Type de contrat" value={emptyText(trainer.contract_type)} />
          <Row
            label="Référence"
            value={emptyText(trainer.contract_reference)}
          />
          <Row
            label="Période"
            value={
              trainer.contract_start_date || trainer.contract_end_date
                ? `${trainer.contract_start_date ? new Date(trainer.contract_start_date).toLocaleDateString("fr-FR") : "—"} → ${trainer.contract_end_date ? new Date(trainer.contract_end_date).toLocaleDateString("fr-FR") : "—"}`
                : "—"
            }
          />
        </Section>

        {/* 4 — Domaines */}
        <Section title="Domaines d'intervention">
          <Row
            label="Domaines"
            value={
              trainer.intervention_domains?.join(", ") || "—"
            }
          />
          <Row
            label="Publics visés"
            value={trainer.target_audiences?.join(", ") || "—"}
          />
          <Row
            label="Niveaux"
            value={trainer.intervention_levels?.join(", ") || "—"}
          />
          <Row
            label="Modalités"
            value={trainer.modalities?.join(", ") || "—"}
          />
        </Section>

        {/* 5 — Compétences */}
        <Section title="Compétences & expérience">
          <Row
            label="Années d'expérience pro"
            value={trainer.years_pro_experience ?? "—"}
          />
          <Row
            label="Années d'expérience formation"
            value={trainer.years_training_experience ?? "—"}
          />
          {trainer.technical_skills && (
            <div className="py-1">
              <p className="text-slate-600 text-xs">Compétences techniques :</p>
              <p className="text-xs whitespace-pre-wrap mt-0.5">
                {trainer.technical_skills}
              </p>
            </div>
          )}
          {trainer.pedagogical_skills && (
            <div className="py-1">
              <p className="text-slate-600 text-xs">Compétences pédagogiques :</p>
              <p className="text-xs whitespace-pre-wrap mt-0.5">
                {trainer.pedagogical_skills}
              </p>
            </div>
          )}
          {trainer.example_trainings && (
            <div className="py-1">
              <p className="text-slate-600 text-xs">Exemples de formations animées :</p>
              <p className="text-xs whitespace-pre-wrap mt-0.5">
                {trainer.example_trainings}
              </p>
            </div>
          )}
        </Section>

        {/* 6 — Adéquation Qualiopi */}
        <Section title="Adéquation Qualiopi (indic. 21)">
          {trainer.competence_justification ? (
            <p className="text-xs whitespace-pre-wrap">
              {trainer.competence_justification}
            </p>
          ) : (
            <p className="text-xs italic text-slate-400">
              Justification de compétence non renseignée — à compléter avant audit.
            </p>
          )}
          {linked.length > 0 && (
            <div className="mt-3">
              <p className="text-slate-600 text-xs font-semibold mb-1">
                Formations animables :
              </p>
              <ul className="text-xs list-disc pl-4 space-y-1">
                {linked.map((l) => (
                  <li key={l.formation_id}>
                    <span className="font-medium">
                      {l.formation?.title ?? "—"}
                    </span>
                    {l.justification && (
                      <span className="text-slate-500"> — {l.justification}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        {/* 7 — Évaluation */}
        <Section title="Évaluation">
          <Row
            label="Satisfaction moyenne"
            value={
              trainer.satisfaction_avg !== null
                ? `${trainer.satisfaction_avg.toFixed(1)} / ${trainer.satisfaction_scale ?? 5}`
                : "—"
            }
          />
          <Row
            label="Date dernière évaluation"
            value={
              trainer.last_evaluation_date
                ? new Date(trainer.last_evaluation_date).toLocaleDateString(
                    "fr-FR",
                  )
                : "—"
            }
          />
          <Row
            label="Réclamations"
            value={trainer.has_complaints ? "Oui" : "Non"}
          />
          {trainer.evaluation_notes && (
            <p className="text-xs whitespace-pre-wrap mt-1">
              {trainer.evaluation_notes}
            </p>
          )}
        </Section>

        {/* 8 — CPD (Qualiopi 22) */}
        <Section title="Maintien & développement des compétences (indic. 22)">
          <Row
            label="Date dernière action"
            value={
              trainer.last_cpd_date
                ? new Date(trainer.last_cpd_date).toLocaleDateString("fr-FR")
                : "—"
            }
          />
          {trainer.cpd_actions && (
            <p className="text-xs whitespace-pre-wrap mt-1">
              {trainer.cpd_actions}
            </p>
          )}
        </Section>

        {/* 9 — Documents administratifs (externes) */}
        {isExternal && (
          <Section title="Documents administratifs">
            <Row
              label="URSSAF"
              value={
                trainer.urssaf_attestation_on_file
                  ? `Oui${trainer.urssaf_expires_on ? ` (expire le ${new Date(trainer.urssaf_expires_on).toLocaleDateString("fr-FR")})` : ""}`
                  : "Non"
              }
            />
            <Row
              label="RC pro"
              value={
                trainer.rc_pro_on_file
                  ? `Oui${trainer.rc_pro_expires_on ? ` (expire le ${new Date(trainer.rc_pro_expires_on).toLocaleDateString("fr-FR")})` : ""}`
                  : "Non"
              }
            />
            <Row
              label="Kbis / SIRENE"
              value={trainer.kbis_on_file ? "Oui" : "Non"}
            />
          </Section>
        )}

        {/* 10 — Engagement qualité */}
        <Section title="Engagement qualité">
          <Row
            label="Charte signée"
            value={
              trainer.charter_signed
                ? `Oui${trainer.charter_signed_on ? ` le ${new Date(trainer.charter_signed_on).toLocaleDateString("fr-FR")}` : ""}`
                : "Non"
            }
          />
          <Row
            label="Procédure handicap connue"
            value={trainer.handicap_procedure_ack ? "Oui" : "Non"}
          />
          <Row
            label="Règlement intérieur connu"
            value={trainer.ri_ack ? "Oui" : "Non"}
          />
        </Section>

        {/* 11 — Documents joints */}
        {trainer.documents.length > 0 && (
          <Section title="Documents joints">
            <ul className="text-xs space-y-0.5">
              {trainer.documents.map((d, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>
                    <span className="font-semibold">
                      {TRAINER_DOCUMENT_KIND_LABELS[d.kind]}
                    </span>{" "}
                    — {d.file_name}
                    {d.label && ` (${d.label})`}
                  </span>
                  {d.expires_on && (
                    <span className="text-slate-500">
                      expire le{" "}
                      {new Date(d.expires_on).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <footer className="mt-8 pt-4 border-t border-slate-200 text-[10px] text-slate-400">
          <p>
            Fiche conservée pour audit Qualiopi (critère 5, indicateurs 21 et
            22). Document interne — {orgName}.
          </p>
        </footer>
      </div>
    </div>
  );
}
