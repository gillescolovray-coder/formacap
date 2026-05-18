import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkCertificateEligibility,
  computeTotalHours,
} from "@/lib/portal/realization-certificate";
import { PrintButton } from "./_print-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Certificat de réalisation — CAP NUMERIQUE",
  robots: "noindex, nofollow",
};

type Params = { token: string };

/**
 * Certificat de réalisation au format A4 imprimable.
 *
 * Conformité Qualiopi : "L'organisme délivre à chaque stagiaire un
 * certificat / une attestation de fin de formation indiquant la nature
 * de la formation, la durée et les résultats."
 *
 * Le certificat n'est consultable que si :
 *  - La session est terminée
 *  - La présence (signatures émargement) ≥ seuil organisation (défaut 80%)
 */
export default async function CertificatePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  // 1. Token → enrollment + tous les éléments nécessaires
  const { data: portalRow } = await supabase
    .from("enrollment_portal_tokens")
    .select(
      "enrollment_id, enrollment:session_enrollments(id, session_id, learner:learners(civility, first_name, last_name), session:sessions(id, start_date, end_date, modality, formation:formations(title, duration_hours), organization:organizations(id, name, logo_url, address, postal_code, city, siret, nda, realization_certificate_threshold_percent, signature_stamp_path)))",
    )
    .eq("token", token)
    .maybeSingle<{
      enrollment_id: string;
      enrollment: {
        id: string;
        session_id: string;
        learner: {
          civility: string | null;
          first_name: string | null;
          last_name: string | null;
        } | null;
        session: {
          id: string;
          start_date: string;
          end_date: string;
          modality: string | null;
          formation: {
            title: string;
            duration_hours: number | null;
          } | null;
          organization: {
            id: string;
            name: string;
            logo_url: string | null;
            address: string | null;
            postal_code: string | null;
            city: string | null;
            siret: string | null;
            nda: string | null;
            realization_certificate_threshold_percent: number | null;
            signature_stamp_path: string | null;
          } | null;
        } | null;
      } | null;
    }>();

  if (
    !portalRow ||
    !portalRow.enrollment ||
    !portalRow.enrollment.session ||
    !portalRow.enrollment.session.organization
  ) {
    return <NotEligibleCard reason="Certificat indisponible." />;
  }

  const enrollment = portalRow.enrollment;
  const session = enrollment.session!;
  const org = session.organization!;
  const learner = enrollment.learner;
  const learnerName = [learner?.first_name, learner?.last_name]
    .filter(Boolean)
    .join(" ") || "Apprenant";
  const civility = learner?.civility ?? "";
  const formationTitle = session.formation?.title ?? "Formation";

  const threshold = org.realization_certificate_threshold_percent ?? 80;

  // 2. Vérifier éligibilité
  const eligibility = await checkCertificateEligibility(
    supabase,
    enrollment.id,
    session.id,
    session.end_date,
    threshold,
  );

  if (eligibility.kind !== "eligible") {
    return (
      <NotEligibleCard
        reason={
          eligibility.kind === "session_not_ended"
            ? "Le certificat sera disponible à la fin de la formation."
            : `Présence insuffisante : ${eligibility.ratio.percent}% de signatures recueillies (seuil requis : ${eligibility.thresholdPercent}%). Contactez votre formateur si vous pensez qu'il y a une erreur.`
        }
        backHref={`/mon-parcours/${token}`}
      />
    );
  }

  // 3. Charger les jours pour calculer la durée
  const { data: days } = await supabase
    .from("session_days")
    .select(
      "morning_start, morning_end, afternoon_start, afternoon_end",
    )
    .eq("session_id", session.id);
  const totalHours = computeTotalHours(
    (days ?? []) as Array<{
      morning_start: string | null;
      morning_end: string | null;
      afternoon_start: string | null;
      afternoon_end: string | null;
    }>,
  );
  const declaredHours = session.formation?.duration_hours ?? totalHours;

  // 4. Signature dirigeant (bucket privé → base64 data URL)
  let signatureDataUrl: string | null = null;
  if (org.signature_stamp_path) {
    const { data: sigBlob } = await supabase.storage
      .from("organization-signatures")
      .download(org.signature_stamp_path);
    if (sigBlob) {
      const buf = Buffer.from(await sigBlob.arrayBuffer());
      const mime = sigBlob.type || "image/png";
      signatureDataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    }
  }

  // 5. Numéro du certificat (sera stable car basé sur l'ID enrollment)
  const certifNumber = `CR-${enrollment.id.slice(0, 8).toUpperCase()}`;

  return (
    <>
      {/* Barre d'actions imprimable masquée à l'impression */}
      <div className="print:hidden bg-zinc-100 border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <Link
            href={`/mon-parcours/${token}`}
            className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900"
          >
            <ChevronLeft className="h-4 w-4" />
            Retour
          </Link>
          <PrintButton />
        </div>
      </div>

      {/* Le certificat lui-même : A4 portrait */}
      <div className="bg-zinc-200 print:bg-white py-6 print:py-0 min-h-screen print:min-h-0">
        <div
          className="bg-white shadow-lg print:shadow-none mx-auto p-12 print:p-0 text-zinc-900"
          style={{
            width: "210mm",
            minHeight: "297mm",
            padding: "20mm",
            boxSizing: "border-box",
          }}
        >
          {/* En-tête */}
          <header className="flex items-start justify-between mb-12">
            <div className="flex-1">
              {org.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={org.logo_url}
                  alt={org.name}
                  style={{ maxHeight: "28mm", maxWidth: "70mm", objectFit: "contain" }}
                />
              )}
            </div>
            <div className="text-right text-[10pt] text-zinc-600 leading-tight">
              <div className="font-bold text-zinc-900">{org.name}</div>
              {org.address && <div>{org.address}</div>}
              {(org.postal_code || org.city) && (
                <div>
                  {[org.postal_code, org.city].filter(Boolean).join(" ")}
                </div>
              )}
              {org.siret && <div>SIRET : {org.siret}</div>}
              {org.nda && (
                <div>N° déclaration d&apos;activité : {org.nda}</div>
              )}
            </div>
          </header>

          {/* Titre */}
          <div className="text-center mb-10">
            <div className="text-[10pt] uppercase tracking-[0.3em] text-zinc-500 font-bold mb-2">
              Conformément à l&apos;article L.6353-1 du Code du travail
            </div>
            <h1
              className="text-[28pt] font-bold leading-tight"
              style={{ color: "#1e40af" }}
            >
              Certificat de réalisation
            </h1>
            <div className="text-[10pt] text-zinc-500 mt-2">
              N° {certifNumber}
            </div>
          </div>

          {/* Corps */}
          <div className="text-[12pt] leading-relaxed space-y-5 mb-12">
            <p>
              Je soussigné, représentant légal de{" "}
              <strong>{org.name}</strong>, certifie que :
            </p>

            <div className="bg-blue-50 rounded-lg p-5 text-center">
              <div className="text-[10pt] uppercase tracking-wider text-blue-700 font-bold mb-1">
                L&apos;apprenant
              </div>
              <div className="text-[18pt] font-bold text-zinc-900">
                {civility ? `${civility} ` : ""}
                {learnerName}
              </div>
            </div>

            <p>a suivi l&apos;action de formation suivante :</p>

            <div className="bg-blue-50 rounded-lg p-5 space-y-2">
              <div>
                <div className="text-[9pt] uppercase tracking-wider text-blue-700 font-bold">
                  Intitulé
                </div>
                <div className="text-[14pt] font-bold text-zinc-900">
                  {formationTitle}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11pt]">
                <div>
                  <span className="text-blue-700 font-bold text-[9pt] uppercase tracking-wider block">
                    Dates
                  </span>
                  <span className="font-semibold">
                    du{" "}
                    {new Date(session.start_date).toLocaleDateString("fr-FR")}{" "}
                    au{" "}
                    {new Date(session.end_date).toLocaleDateString("fr-FR")}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700 font-bold text-[9pt] uppercase tracking-wider block">
                    Durée
                  </span>
                  <span className="font-semibold">
                    {formatHours(declaredHours)}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700 font-bold text-[9pt] uppercase tracking-wider block">
                    Modalité
                  </span>
                  <span className="font-semibold capitalize">
                    {session.modality ?? "—"}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700 font-bold text-[9pt] uppercase tracking-wider block">
                    Présence
                  </span>
                  <span className="font-semibold">
                    {eligibility.ratio.signedSlots} /{" "}
                    {eligibility.ratio.totalSlots} demi-journées (
                    {eligibility.ratio.percent}%)
                  </span>
                </div>
              </div>
            </div>

            <p>
              et l&apos;a réalisée dans le respect des conditions prévues
              par la convention. Le présent certificat est délivré à
              l&apos;apprenant pour valoir ce que de droit.
            </p>
          </div>

          {/* Signature */}
          <div className="flex justify-end mt-16">
            <div className="text-center">
              <div className="text-[10pt] text-zinc-600 mb-1">
                Fait le{" "}
                {new Date().toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
              <div className="font-bold mb-2">{org.name}</div>
              {signatureDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signatureDataUrl}
                  alt="Cachet et signature"
                  style={{
                    maxHeight: "30mm",
                    maxWidth: "65mm",
                    objectFit: "contain",
                    display: "block",
                    margin: "0 auto",
                    mixBlendMode: "multiply",
                  }}
                />
              )}
              <div className="text-[10pt] text-zinc-500 italic mt-1">
                Cachet et signature
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CSS print : on cache la barre d'actions, on enlève les marges body */}
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { margin: 0; background: white !important; }
        }
      `}</style>
    </>
  );
}

function formatHours(h: number): string {
  if (!h || h <= 0) return "—";
  const whole = Math.floor(h);
  const frac = Math.round((h - whole) * 60);
  if (frac === 0) return `${whole} h`;
  return `${whole} h ${frac.toString().padStart(2, "0")}`;
}

function NotEligibleCard({
  reason,
  backHref,
}: {
  reason: string;
  backHref?: string;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md bg-white rounded-xl shadow-md border border-zinc-200 p-6 text-center space-y-3">
        <div className="text-4xl">🔒</div>
        <h1 className="text-lg font-bold">Certificat indisponible</h1>
        <p className="text-sm text-zinc-600">{reason}</p>
        {backHref && (
          <Link
            href={backHref}
            className="inline-block mt-2 text-sm text-cyan-700 hover:underline"
          >
            Retour à mon espace
          </Link>
        )}
      </div>
    </div>
  );
}
