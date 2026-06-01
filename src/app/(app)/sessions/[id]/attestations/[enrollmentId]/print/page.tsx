import { notFound, redirect } from "next/navigation";
import { Award } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "../../../emargement/print/_print-button";
import type { SessionDay, TrainingSession } from "@/lib/sessions/types";
import { MODALITY_LABELS } from "@/lib/formations/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function timeToMin(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hh = Number(h);
  const mm = Number(m);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}
function diffMin(start: string | null, end: string | null): number {
  const s = timeToMin(start);
  const e = timeToMin(end);
  if (s === null || e === null || e <= s) return 0;
  return e - s;
}
function formatHours(h: number): string {
  if (h <= 0) return "0 h";
  const whole = Math.floor(h);
  const frac = Math.round((h - whole) * 60);
  if (frac === 0) return `${whole} heures`;
  return `${whole} h ${frac.toString().padStart(2, "0")}`;
}

export default async function AttestationPrintPage({
  params,
}: {
  params: Promise<{ id: string; enrollmentId: string }>;
}) {
  const { id, enrollmentId } = await params;
  if (!UUID_REGEX.test(id) || !UUID_REGEX.test(enrollmentId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "*, formation:formations(id, title), location_ref:formation_locations!location_id(id, name, address, postal_code, city), trainer:trainers!trainer_id(first_name, last_name)",
    )
    .eq("id", id)
    .maybeSingle<
      TrainingSession & {
        location_ref?: {
          name: string;
          address: string | null;
          postal_code: string | null;
          city: string | null;
        } | null;
        trainer?: { first_name: string; last_name: string } | null;
      }
    >();
  if (!session) notFound();

  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(first_name, last_name, email, civility, birth_date, birth_place, company:companies(name))",
    )
    .eq("id", enrollmentId)
    .eq("session_id", id)
    .maybeSingle<{
      id: string;
      learner: {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        civility: string | null;
        birth_date: string | null;
        birth_place: string | null;
        company: { name: string } | null;
      } | null;
    }>();
  if (!enrollment) notFound();

  const { data: sessionDays } = await supabase
    .from("session_days")
    .select("*")
    .eq("session_id", id)
    .order("day_date", { ascending: true });

  // Calcul des heures réellement suivies (basé sur les attendances)
  const { data: attendances } = await supabase
    .from("attendances")
    .select("period_date, moment, status")
    .eq("enrollment_id", enrollmentId);

  const { data: membership } = await supabase
    .from("organization_members")
    .select(
      "organization:organizations(name, logo_url, legal_mentions, signature_stamp_path, legal_representative_name, legal_representative_role)",
    )
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const organization = membership?.organization as unknown as {
    name: string;
    logo_url: string | null;
    legal_mentions: string | null;
    signature_stamp_path: string | null;
    legal_representative_name: string | null;
    legal_representative_role: string | null;
  } | null;
  const orgName = organization?.name ?? "CAP NUMÉRIQUE";
  const orgLogo = organization?.logo_url ?? null;
  const orgLegalMentions = organization?.legal_mentions ?? null;
  const orgLegalRepName = organization?.legal_representative_name ?? null;
  const orgLegalRepRole = organization?.legal_representative_role ?? null;

  // Cachet + signature OF (Gilles 2026-06-01)
  let orgSignatureUrl: string | null = null;
  if (organization?.signature_stamp_path) {
    const { data: signed } = await supabase.storage
      .from("organization-signatures")
      .createSignedUrl(organization.signature_stamp_path, 3600);
    orgSignatureUrl = signed?.signedUrl ?? null;
  }

  // Total des heures planifiées
  const sortedDays = (sessionDays ?? []).slice().sort((a, b) =>
    (a.day_date as string).localeCompare(b.day_date as string),
  );
  const totalPlanned = sortedDays.reduce((sum, raw) => {
    const d = raw as SessionDay;
    return (
      sum +
      diffMin(d.morning_start, d.morning_end) +
      diffMin(d.afternoon_start, d.afternoon_end)
    );
  }, 0);

  // Heures réellement suivies : on additionne les demi-journées où le
  // statut est "present" ou "late". Pour chaque demi-journée, on
  // calcule la durée correspondante depuis session_days.
  const attendanceMap = new Map<string, string>(); // "date:moment" → status
  (attendances ?? []).forEach((a) => {
    attendanceMap.set(
      `${a.period_date}:${a.moment}`,
      a.status as string,
    );
  });
  const dayByDate = new Map<string, SessionDay>();
  sortedDays.forEach((d) => {
    const sd = d as SessionDay;
    dayByDate.set(sd.day_date, sd);
  });
  let actualMinutes = 0;
  for (const sd of sortedDays) {
    const day = sd as SessionDay;
    const morningStatus = attendanceMap.get(`${day.day_date}:morning`);
    const afternoonStatus = attendanceMap.get(`${day.day_date}:afternoon`);
    if (morningStatus === "present" || morningStatus === "late") {
      actualMinutes += diffMin(day.morning_start, day.morning_end);
    }
    if (afternoonStatus === "present" || afternoonStatus === "late") {
      actualMinutes += diffMin(day.afternoon_start, day.afternoon_end);
    }
  }
  // Si aucune présence enregistrée, on suppose 100% (= heures planifiées)
  if ((attendances ?? []).length === 0) {
    actualMinutes = totalPlanned;
  }
  const totalPlannedHours = totalPlanned / 60;
  const actualHours = actualMinutes / 60;

  const learner = enrollment.learner;
  const civility = learner?.civility ?? "";
  const fullName = learner
    ? [learner.first_name, learner.last_name].filter(Boolean).join(" ")
    : "—";
  const company = learner?.company?.name ?? null;
  const birthDate = learner?.birth_date
    ? new Date(learner.birth_date).toLocaleDateString("fr-FR")
    : null;
  const birthPlace = learner?.birth_place ?? null;

  const trainerJoined = (
    session as unknown as {
      trainer?: { first_name: string; last_name: string } | null;
    }
  ).trainer;
  const trainerName =
    session.trainer_name ??
    (trainerJoined
      ? `${trainerJoined.first_name} ${trainerJoined.last_name}`
      : null);

  const today = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const startDate = new Date(session.start_date).toLocaleDateString("fr-FR");
  const endDate = new Date(session.end_date).toLocaleDateString("fr-FR");

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { margin: 18mm; size: portrait; }
              body { background: white !important; }
              .no-print { display: none !important; }
            }
            body { font-family: system-ui, sans-serif; }
          `,
        }}
      />
      <div className="min-h-screen bg-white p-8 max-w-[800px] mx-auto">
        <div className="no-print mb-6 flex gap-2">
          <PrintButton />
          <a
            href={`/sessions/${id}/attestations`}
            className="px-4 py-2 border rounded-md text-sm"
          >
            Retour
          </a>
        </div>

        {/* En-tête : logo */}
        <div className="border-b-2 border-slate-300 pb-4 mb-8 flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            {orgLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={orgLogo}
                alt={`Logo ${orgName}`}
                className="max-h-20 max-w-[180px] object-contain"
              />
            ) : (
              <div className="text-sm uppercase tracking-widest text-slate-700 font-bold">
                {orgName}
              </div>
            )}
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>Édité le {today}</div>
          </div>
        </div>

        {/* Titre */}
        <div className="text-center mb-10">
          <Award className="h-10 w-10 text-amber-500 mx-auto mb-2" />
          <h1 className="text-3xl font-bold text-blue-900 mb-1">
            Attestation de réalisation
          </h1>
          <p className="text-sm text-slate-600 italic">
            Article L.6353-1 du Code du travail
          </p>
        </div>

        {/* Corps */}
        <div className="text-sm leading-loose text-slate-800 mb-8 space-y-4">
          <p>
            Je soussigné(e)
            {orgLegalRepName ? (
              <>
                , <strong>{orgLegalRepName}</strong>
              </>
            ) : null}
            ,{" "}
            {orgLegalRepRole
              ? `${orgLegalRepRole.toLowerCase()} de `
              : "représentant légal de "}
            <strong>{orgName}</strong>, organisme de formation enregistré,
            atteste que :
          </p>

          <div className="rounded-lg ring-1 ring-slate-200 bg-slate-50 p-4 space-y-1.5 text-sm">
            <div>
              <strong className="text-slate-900">
                {[civility, fullName].filter(Boolean).join(" ")}
              </strong>
            </div>
            {birthDate && (
              <div className="text-xs text-slate-600">
                Né(e) le {birthDate}
                {birthPlace ? ` à ${birthPlace}` : ""}
              </div>
            )}
            {company && (
              <div className="text-xs text-slate-600">
                Employeur : {company}
              </div>
            )}
          </div>

          <p>
            a suivi l&apos;action de formation intitulée :
          </p>

          <p className="text-base font-bold text-blue-900 ml-4 my-2">
            «&nbsp;{session.formation?.title ?? "—"}&nbsp;»
          </p>

          <p>
            qui s&apos;est déroulée du <strong>{startDate}</strong> au{" "}
            <strong>{endDate}</strong>
            {session.modality
              ? ` en ${MODALITY_LABELS[session.modality].toLowerCase()}`
              : ""}
            {trainerName ? `, sous la responsabilité de ${trainerName}` : ""}
            .
          </p>

          <div className="rounded-lg ring-1 ring-amber-200 bg-amber-50 p-4 space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm">Durée totale prévue :</span>
              <strong className="text-base">
                {formatHours(totalPlannedHours)}
              </strong>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm">
                Durée réellement suivie par l&apos;apprenant :
              </span>
              <strong className="text-base text-emerald-700">
                {formatHours(actualHours)}
              </strong>
            </div>
            {totalPlannedHours > 0 && (
              <div className="flex items-baseline justify-between gap-3 pt-1.5 border-t border-amber-200">
                <span className="text-xs text-slate-600">
                  Taux d&apos;assiduité :
                </span>
                <strong className="text-sm text-slate-700">
                  {Math.round((actualHours / totalPlannedHours) * 100)} %
                </strong>
              </div>
            )}
          </div>

          <p>
            La présente attestation est délivrée à l&apos;intéressé(e) pour
            servir et valoir ce que de droit.
          </p>
        </div>

        {/* Signature + cachet OF en bas a droite (Gilles 2026-06-01) */}
        <div className="mt-12 grid grid-cols-2 gap-8">
          <div></div>
          <div className="text-sm">
            <p className="text-right">
              Fait le {today}
              <br />
              Pour <strong>{orgName}</strong>
            </p>
            <div className="border-t border-slate-300 mt-8 pt-2 text-right">
              {orgSignatureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={orgSignatureUrl}
                  alt="Cachet et signature de l'organisme"
                  className="inline-block max-h-24 max-w-[220px] object-contain"
                />
              ) : (
                <div className="h-20 text-xs text-slate-500 italic">
                  Cachet et signature
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pied de page : mentions légales */}
        {orgLegalMentions && (
          <footer
            className="mt-12 pt-3 border-t border-slate-300 text-[10px] text-slate-600 leading-relaxed text-center legal-mentions-footer"
            dangerouslySetInnerHTML={{ __html: orgLegalMentions }}
          />
        )}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              .legal-mentions-footer p { margin: 0 0 4px 0; }
              .legal-mentions-footer h2 { font-size: 11px; font-weight: bold; margin: 4px 0 2px 0; }
              .legal-mentions-footer h3 { font-size: 10px; font-weight: 600; margin: 4px 0 2px 0; }
              .legal-mentions-footer ul { list-style: disc; padding-left: 16px; margin: 2px 0; }
              .legal-mentions-footer ol { list-style: decimal; padding-left: 16px; margin: 2px 0; }
              .legal-mentions-footer a { color: #2563eb; text-decoration: underline; }
            `,
          }}
        />
      </div>
    </>
  );
}
