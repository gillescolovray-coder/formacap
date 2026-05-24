import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { trainerHasAccessToSession } from "@/lib/portal/trainer-session-access";
import { cn } from "@/lib/utils";
import { PrintButton } from "@/app/(app)/sessions/[id]/emargement/print/_print-button";
import type { SessionDay, TrainingSession } from "@/lib/sessions/types";
import type {
  AttendanceMoment,
  AttendanceStatus,
} from "@/lib/attendances/types";
import { loadEmargementTemplate } from "@/lib/document-templates/loader";

export const dynamic = "force-dynamic";

/**
 * Version imprimable de la feuille d'émargement — variante trainer.
 *
 * Calque de src/app/(app)/sessions/[id]/emargement/print/page.tsx
 * avec :
 *  - Auth par token portail formateur (au lieu de getUser())
 *  - Résolution organisation via sessions.organization_id (au lieu de
 *    organization_members.profile_id = user.id)
 *  - Lien "Retour" vers /formateur/[token]/sessions/[sessionId]/emargement
 *
 * Le rendu visuel et le template (en-tête/pied) sont identiques à
 * l'admin pour cohérence Qualiopi.
 */

function enumerateDates(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const start = new Date(startIso);
  const end = new Date(endIso);
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTimeShort(time: string | null) {
  if (!time) return "—";
  const [h, m] = time.split(":");
  const hours = Number(h);
  const minutes = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${minutes.toString().padStart(2, "0")}`;
}

function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return "—";
  return `${formatTimeShort(start)}–${formatTimeShort(end)}`;
}

function statusAbbr(status: AttendanceStatus) {
  switch (status) {
    case "present":
      return "✓";
    case "absent":
      return "✗";
    case "excused":
      return "E";
    case "late":
      return "R";
    default:
      return "—";
  }
}

const MOMENTS: AttendanceMoment[] = ["morning", "afternoon"];

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out.length > 0 ? out : [[]];
}

const MAX_LEARNERS_PER_PAGE = 5;
const MAX_DAYS_PER_PAGE = 5;

export default async function EmargementPrintPageFormateur({
  params,
}: {
  params: Promise<{ token: string; sessionId: string }>;
}) {
  const { token, sessionId } = await params;
  const supabase = createAdminClient();

  // Auth par token portail formateur
  const { data: tokenRow } = await supabase
    .from("trainer_portal_tokens")
    .select("trainer_id")
    .eq("token", token)
    .maybeSingle<{ trainer_id: string }>();
  if (!tokenRow) notFound();

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "*, formation:formations(id, title), location_ref:formation_locations!location_id(id, name, address, postal_code, city), trainer:trainers!trainer_id(first_name, last_name)",
    )
    .eq("id", sessionId)
    .maybeSingle<
      TrainingSession & {
        location_ref?: {
          id: string;
          name: string;
          address: string | null;
          postal_code: string | null;
          city: string | null;
        } | null;
        trainer?: {
          first_name: string;
          last_name: string;
        } | null;
      }
    >();

  if (!session) notFound();
  const access = await trainerHasAccessToSession(
    supabase,
    tokenRow.trainer_id,
    sessionId,
    session.trainer_id,
  );
  if (!access) notFound();

  const [{ data: enrollments }, { data: sessionDays }] = await Promise.all([
    supabase
      .from("session_enrollments")
      .select(
        "id, learner:learners(first_name, last_name, company:companies(name, siret))",
      )
      .eq("session_id", sessionId)
      .order("enrolled_at", { ascending: true }),
    supabase
      .from("session_days")
      .select("*")
      .eq("session_id", sessionId)
      .order("day_date", { ascending: true }),
  ]);

  const enrollmentIds = (enrollments ?? []).map((e) => e.id as string);

  const { data: fseRequests } = await supabase
    .from("inscription_requests")
    .select("id")
    .eq("target_session_id", sessionId)
    .eq("financing_mode", "fse")
    .limit(1);
  const hasFseFunding = (fseRequests?.length ?? 0) > 0;

  const [attendances, signatures] = await Promise.all([
    enrollmentIds.length > 0
      ? supabase
          .from("attendances")
          .select("enrollment_id, period_date, moment, status")
          .in("enrollment_id", enrollmentIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    enrollmentIds.length > 0
      ? supabase
          .from("attendance_signatures")
          .select(
            "enrollment_id, period_date, moment, signer_role, signer_name, signature_data, signed_at",
          )
          .in("enrollment_id", enrollmentIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  type SignatureRow = {
    enrollment_id: string;
    period_date: string;
    moment: AttendanceMoment;
    signer_role: "learner" | "trainer";
    signer_name: string;
    signature_data: string;
    signed_at: string;
  };
  const signatureIndex = new Map<string, SignatureRow>();
  (signatures ?? []).forEach((s) => {
    const row = s as SignatureRow;
    signatureIndex.set(
      `${row.enrollment_id}|${row.period_date}|${row.moment}|${row.signer_role}`,
      row,
    );
  });

  const trainerSignaturesByDateMoment = new Map<string, SignatureRow>();
  (signatures ?? []).forEach((s) => {
    const row = s as SignatureRow;
    if (row.signer_role !== "trainer") return;
    const key = `${row.period_date}|${row.moment}`;
    const existing = trainerSignaturesByDateMoment.get(key);
    if (!existing || existing.signed_at < row.signed_at) {
      trainerSignaturesByDateMoment.set(key, row);
    }
  });

  const sortedDays = (sessionDays ?? []).slice().sort((a, b) =>
    ((a as SessionDay).day_date ?? "").localeCompare(
      (b as SessionDay).day_date ?? "",
    ),
  );
  const dayByDate = new Map<string, SessionDay>();
  sortedDays.forEach((d) => {
    dayByDate.set((d as SessionDay).day_date, d as SessionDay);
  });
  const periodDates =
    sortedDays.length > 0
      ? sortedDays.map((d) => (d as SessionDay).day_date)
      : enumerateDates(session.start_date, session.end_date);

  const attendanceIndex = new Map<string, Map<string, AttendanceStatus>>();
  (attendances ?? []).forEach((a) => {
    const eId = a.enrollment_id as string;
    if (!attendanceIndex.has(eId)) attendanceIndex.set(eId, new Map());
    const key = `${a.period_date}:${a.moment}`;
    attendanceIndex.get(eId)!.set(key, a.status as AttendanceStatus);
  });

  // Résolution organisation : via session.organization_id (pas via
  // organization_members, qui requiert un profile_id Supabase Auth
  // que le formateur n'a pas).
  const sessionAny = session as unknown as {
    organization_id?: string | null;
    video_app?: string | null;
    video_link?: string | null;
  };
  const orgId = sessionAny.organization_id ?? null;
  const { data: organization } = orgId
    ? await supabase
        .from("organizations")
        .select("name, logo_url, legal_mentions")
        .eq("id", orgId)
        .maybeSingle<{
          name: string;
          logo_url: string | null;
          legal_mentions: string | null;
        }>()
    : { data: null };

  const orgName = organization?.name ?? "CAP NUMÉRIQUE";
  const orgLogo = organization?.logo_url ?? null;
  const orgLegalMentions = organization?.legal_mentions ?? null;

  const template = orgId
    ? await loadEmargementTemplate(orgId)
    : {
        color_primary: "#1e40af",
        color_secondary: "#06b6d4",
        blocks: { header_html: "", footer_html: "" },
      };

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
  const totalMinutes = sortedDays.reduce((sum, raw) => {
    const d = raw as SessionDay;
    return (
      sum +
      diffMin(d.morning_start, d.morning_end) +
      diffMin(d.afternoon_start, d.afternoon_end)
    );
  }, 0);
  const totalHours = totalMinutes / 60;
  const formatHours = (h: number): string => {
    if (h === 0) return "—";
    const whole = Math.floor(h);
    const frac = Math.round((h - whole) * 60);
    if (frac === 0) return `${whole} h`;
    return `${whole} h ${frac.toString().padStart(2, "0")}`;
  };
  const durationLabel =
    sortedDays.length > 0
      ? `${sortedDays.length} jour${sortedDays.length > 1 ? "s" : ""} · ${formatHours(totalHours)}`
      : null;

  const locationRef = (
    session as unknown as {
      location_ref?: {
        name: string;
        address: string | null;
        postal_code: string | null;
        city: string | null;
      } | null;
    }
  ).location_ref;
  let locationLabel: string | null = null;
  if (session.modality === "distanciel") {
    const app = sessionAny.video_app?.trim();
    locationLabel = app
      ? `Classe virtuelle - lien ${app.toUpperCase()}`
      : "Classe virtuelle";
  } else if (locationRef) {
    const parts = [
      locationRef.address,
      [locationRef.postal_code, locationRef.city].filter(Boolean).join(" "),
    ].filter(Boolean);
    locationLabel = parts.length > 0
      ? `${locationRef.name} — ${parts.join(", ")}`
      : locationRef.name;
  } else if (session.location) {
    locationLabel = session.location;
  }

  const modalityShortLabel = session.modality
    ? session.modality === "distanciel"
      ? "Distanciel"
      : session.modality === "hybride"
        ? "Hybride"
        : "Présentiel"
    : null;

  const trainerJoined = (
    session as unknown as {
      trainer?: { first_name: string; last_name: string } | null;
    }
  ).trainer;
  const trainerDisplayName = (() => {
    if (session.trainer_name) return session.trainer_name;
    if (trainerJoined) {
      return `${trainerJoined.first_name} ${trainerJoined.last_name}`;
    }
    return null;
  })();

  const allEnrollments = (enrollments ?? []) as unknown as Array<{
    id: string;
    learner: {
      first_name: string | null;
      last_name: string | null;
      company?: { name: string; siret?: string | null } | null;
    } | null;
  }>;
  const enrollmentChunks = chunkArray(allEnrollments, MAX_LEARNERS_PER_PAGE);
  const dayChunks = chunkArray(periodDates, MAX_DAYS_PER_PAGE);
  const pages: Array<{
    pageEnrollments: typeof allEnrollments;
    pageDates: string[];
    pageIndex: number;
    totalPages: number;
    enrollmentChunkIndex: number;
    enrollmentChunkCount: number;
    dayChunkIndex: number;
    dayChunkCount: number;
  }> = [];
  const totalPages = enrollmentChunks.length * dayChunks.length;
  let pageIndex = 0;
  for (let ei = 0; ei < enrollmentChunks.length; ei++) {
    for (let di = 0; di < dayChunks.length; di++) {
      pages.push({
        pageEnrollments: enrollmentChunks[ei],
        pageDates: dayChunks[di],
        pageIndex,
        totalPages,
        enrollmentChunkIndex: ei,
        enrollmentChunkCount: enrollmentChunks.length,
        dayChunkIndex: di,
        dayChunkCount: dayChunks.length,
      });
      pageIndex++;
    }
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            button[aria-label*="menu" i],
            button[aria-label*="sidebar" i] {
              display: none !important;
            }
            .legal-mentions-footer,
            .legal-mentions-footer * {
              font-size: 7pt !important;
              line-height: 1.3 !important;
              font-family: 'Calibri','Segoe UI',sans-serif !important;
            }
            .legal-mentions-footer {
              max-height: 1.3cm;
              overflow: hidden;
              color: #475569;
              padding: 1mm 8mm 0 8mm;
              border-top: 1px solid #1e40af !important;
              margin: 3mm 0 0 0 !important;
              text-align: center;
            }
            .legal-mentions-footer p { margin: 0 0 0.4mm 0 !important; }
            .legal-mentions-footer p:last-child { margin-bottom: 0 !important; }
            .legal-mentions-footer strong,
            .legal-mentions-footer b { font-weight: 700 !important; }
            .legal-mentions-footer h1,
            .legal-mentions-footer h2,
            .legal-mentions-footer h3 {
              margin: 0 0 0.5mm 0 !important;
              font-size: 8.5pt !important;
              font-weight: 700 !important;
              color: #1e40af !important;
              line-height: 1.25 !important;
            }
            @media print {
              @page { margin: 5mm 10mm; size: landscape; }
              body { background: white !important; }
              .no-print { display: none !important; }
              aside { display: none !important; }
              header { display: none !important; }
              nav { display: none !important; }
              main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
              html, body { margin: 0 !important; padding: 0 !important; }
              .emargement-page { break-inside: avoid; }
              .legal-mentions-footer,
              .legal-mentions-footer * {
                font-size: 6.5pt !important;
                line-height: 1.25 !important;
              }
              .legal-mentions-footer { max-height: 1.2cm !important; }
            }
            body { font-family: system-ui, sans-serif; }
          `,
        }}
      />
      <div className="min-h-screen bg-white px-8 pt-8 pb-2 max-w-[1400px] mx-auto">
        <div className="no-print mb-6 flex gap-2">
          <PrintButton />
          <a
            href={`/formateur/${token}/sessions/${sessionId}/emargement`}
            className="px-4 py-2 border rounded-md text-sm"
          >
            Retour
          </a>
        </div>

        {pages.map((page, pageIdx) => (
          <div
            key={`page-${pageIdx}`}
            className="emargement-page"
            style={{
              breakAfter: pageIdx < pages.length - 1 ? "page" : "auto",
            }}
          >
            {pages.length > 1 && (
              <div className="text-[10px] text-slate-500 italic text-right mb-1">
                Page {pageIdx + 1} / {pages.length}
                {page.dayChunkCount > 1 && (
                  <>
                    {" "}
                    · Jours {page.dayChunkIndex * MAX_DAYS_PER_PAGE + 1}–
                    {page.dayChunkIndex * MAX_DAYS_PER_PAGE +
                      page.pageDates.length}
                  </>
                )}
                {page.enrollmentChunkCount > 1 && (
                  <>
                    {" "}
                    · Apprenants{" "}
                    {page.enrollmentChunkIndex * MAX_LEARNERS_PER_PAGE + 1}–
                    {page.enrollmentChunkIndex * MAX_LEARNERS_PER_PAGE +
                      page.pageEnrollments.length}
                  </>
                )}
              </div>
            )}
            <div className="border-b-2 border-black pb-4 mb-6 flex items-start justify-between gap-6">
              <div className="flex items-start gap-4 shrink-0">
                {orgLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={orgLogo}
                    alt={`Logo ${orgName}`}
                    className="max-h-24 max-w-[200px] object-contain"
                  />
                ) : (
                  <div className="text-xs uppercase tracking-widest text-zinc-600 font-bold">
                    {orgName}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 text-right space-y-1">
                <h1
                  className="text-2xl font-bold"
                  style={{ color: template.color_primary }}
                >
                  Feuille d&apos;émargement
                </h1>
                <div
                  className="text-base font-bold mt-1"
                  style={{ color: template.color_primary }}
                >
                  {session.formation?.title ?? "—"}
                </div>
                <div className="text-sm">
                  <strong>Dates :</strong> du {formatDate(session.start_date)} au{" "}
                  {formatDate(session.end_date)}
                </div>
                {durationLabel && (
                  <div className="text-sm">
                    <strong>Durée :</strong> {durationLabel}
                  </div>
                )}
                {locationLabel && (
                  <div className="text-sm">
                    <strong>Lieu :</strong> {locationLabel}
                  </div>
                )}
                {trainerDisplayName && (
                  <div className="text-sm">
                    <strong>Formateur :</strong> {trainerDisplayName}
                  </div>
                )}
              </div>

              {hasFseFunding && (
                <div
                  className="flex flex-col items-center gap-1 shrink-0"
                  title="Action cofinancée par le Fonds Social Européen +"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logos/fse-cofinance.svg"
                    alt="Cofinancé par l'Union européenne — FSE+"
                    className="max-h-20 max-w-[160px] object-contain"
                  />
                  <span className="text-[9px] uppercase tracking-wider text-zinc-600 font-bold text-center leading-tight">
                    Cofinancé par
                    <br />
                    l&apos;Union européenne
                  </span>
                </div>
              )}
            </div>

            {template.blocks.header_html && (
              <div
                className="text-xs text-slate-700 leading-relaxed mb-4 rich-block"
                dangerouslySetInnerHTML={{ __html: template.blocks.header_html }}
              />
            )}

            <div className="rounded-lg overflow-hidden ring-1 ring-slate-200 shadow-sm">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th
                      rowSpan={2}
                      className="border-b border-r border-slate-200 px-3 py-3 text-left min-w-[180px] align-middle font-semibold text-slate-700 uppercase tracking-wider text-[11px]"
                    >
                      Apprenant
                    </th>
                    <th
                      rowSpan={2}
                      className="border-b border-r border-slate-200 px-3 py-3 text-left min-w-[120px] align-middle font-semibold text-slate-700 uppercase tracking-wider text-[11px]"
                    >
                      Entreprise
                    </th>
                    {page.pageDates.map((d) => (
                      <th
                        key={d}
                        colSpan={2}
                        className="border-b border-l border-slate-200 px-3 py-2 text-center font-semibold text-slate-700"
                      >
                        <div className="text-sm">{formatDate(d)}</div>
                        {modalityShortLabel && (
                          <div className="text-[10px] font-normal text-slate-500 italic mt-0.5">
                            {modalityShortLabel}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-slate-50">
                    {page.pageDates.flatMap((d) => {
                      const day = dayByDate.get(d);
                      return [
                        <th
                          key={`${d}-morning`}
                          className="border-b border-l border-slate-200 px-2 py-1.5 text-center text-[10px] font-medium text-slate-600 min-w-[80px]"
                        >
                          <div>Matin</div>
                          <div className="font-normal text-slate-500">
                            {formatRange(
                              day?.morning_start ?? null,
                              day?.morning_end ?? null,
                            )}
                          </div>
                        </th>,
                        <th
                          key={`${d}-afternoon`}
                          className="border-b border-slate-200 px-2 py-1.5 text-center text-[10px] font-medium text-slate-600 min-w-[80px]"
                        >
                          <div>A-M</div>
                          <div className="font-normal text-slate-500">
                            {formatRange(
                              day?.afternoon_start ?? null,
                              day?.afternoon_end ?? null,
                            )}
                          </div>
                        </th>,
                      ];
                    })}
                  </tr>
                </thead>
                <tbody>
                  {page.pageEnrollments.map((e, idx) => {
                    const learner = e.learner as unknown as {
                      first_name: string | null;
                      last_name: string | null;
                      company?: { name: string; siret?: string | null } | null;
                    } | null;
                    const name = learner
                      ? [learner.first_name, learner.last_name]
                          .filter(Boolean)
                          .join(" ")
                      : "—";
                    const keyMap =
                      attendanceIndex.get(e.id as string) ?? new Map();
                    const isLast = idx === page.pageEnrollments.length - 1;
                    return (
                      <tr
                        key={e.id as string}
                        className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}
                      >
                        <td
                          className={cn(
                            "border-r border-slate-200 px-3 py-3 align-middle font-medium text-slate-800",
                            !isLast && "border-b",
                          )}
                        >
                          {name}
                        </td>
                        <td
                          className={cn(
                            "border-r border-slate-200 px-3 py-3 text-slate-500 align-middle",
                            !isLast && "border-b",
                          )}
                        >
                          <div>{learner?.company?.name ?? "—"}</div>
                          {learner?.company?.siret && (
                            <div className="text-[9px] text-slate-400 mt-0.5">
                              SIRET : {learner.company.siret}
                            </div>
                          )}
                        </td>
                        {page.pageDates.flatMap((d) =>
                          MOMENTS.map((m) => {
                            const status =
                              keyMap.get(`${d}:${m}`) ??
                              ("not_recorded" as AttendanceStatus);
                            const sig = signatureIndex.get(
                              `${e.id as string}|${d}|${m}|learner`,
                            );
                            return (
                              <td
                                key={`${d}-${m}`}
                                className={cn(
                                  "px-1 py-1 text-center align-middle h-16 min-w-[80px] border-l border-slate-200",
                                  !isLast && "border-b",
                                )}
                              >
                                <div className="text-[9px] text-slate-400 leading-none mb-0.5">
                                  {statusAbbr(status)}
                                </div>
                                {sig ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={sig.signature_data}
                                    alt={`Signature de ${sig.signer_name}`}
                                    className="mx-auto h-10 max-w-full object-contain"
                                  />
                                ) : (
                                  <div className="text-[8px] text-slate-300 italic leading-none">
                                    signature
                                  </div>
                                )}
                              </td>
                            );
                          }),
                        )}
                      </tr>
                    );
                  })}

                  <tr className="bg-indigo-50/60 border-t-2 border-indigo-200">
                    <td className="border-r border-slate-200 px-3 py-3 align-middle">
                      <div className="text-[9px] uppercase tracking-wider font-bold text-indigo-700">
                        Formateur
                      </div>
                      <div className="font-semibold text-slate-800">
                        {trainerDisplayName ?? "—"}
                      </div>
                    </td>
                    <td className="border-r border-slate-200 px-3 py-3 text-slate-500 italic align-middle">
                      {orgName}
                    </td>
                    {page.pageDates.flatMap((d) =>
                      MOMENTS.map((m) => {
                        const sig = trainerSignaturesByDateMoment.get(
                          `${d}|${m}`,
                        );
                        return (
                          <td
                            key={`trainer-${d}-${m}`}
                            className="px-1 py-1 text-center align-middle h-16 min-w-[80px] border-l border-slate-200"
                          >
                            {sig ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={sig.signature_data}
                                alt="Signature formateur"
                                className="mx-auto h-10 max-w-full object-contain"
                              />
                            ) : (
                              <div className="text-[8px] text-slate-300 italic leading-none">
                                signature
                              </div>
                            )}
                          </td>
                        );
                      }),
                    )}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 text-[11px] text-slate-500 italic">
              <strong className="not-italic font-semibold text-slate-600">
                Légende :
              </strong>{" "}
              ✓ Présent · ✗ Absent · E Excusé · R En retard · — Non renseigné
            </div>

            {template.blocks.footer_html && (
              <div
                className="mt-6 text-xs text-slate-700 leading-relaxed rich-block"
                dangerouslySetInnerHTML={{ __html: template.blocks.footer_html }}
              />
            )}

            <div className="mt-10 grid grid-cols-2 gap-8 text-xs">
              <div>
                <div className="border-t border-slate-300 pt-2">
                  <strong className="text-slate-700">Formateur</strong>
                  <br />
                  <span className="text-slate-600">
                    {trainerDisplayName ?? ""}
                  </span>
                  <br />
                  <span className="text-slate-500 text-[11px] italic">
                    {trainerSignaturesByDateMoment.size > 0
                      ? "Signature électronique recueillie ci-dessus."
                      : "Signature et date :"}
                  </span>
                </div>
              </div>
              <div>
                <div className="border-t border-slate-300 pt-2">
                  <strong className="text-slate-700">
                    Responsable de l&apos;organisme
                  </strong>
                  <br />
                  <span className="text-slate-600">{orgName}</span>
                  <br />
                  <span className="text-slate-500 text-[11px] italic">
                    Signature et date :
                  </span>
                </div>
              </div>
            </div>

            {orgLegalMentions && (
              <footer
                className="mt-4 pt-1.5 border-t border-zinc-300 legal-mentions-footer"
                dangerouslySetInnerHTML={{ __html: orgLegalMentions }}
              />
            )}
          </div>
        ))}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              .rich-block p { margin: 0 0 6px 0; }
              .rich-block strong { color: ${template.color_primary}; }
              .rich-block ul { list-style: disc; padding-left: 16px; margin: 4px 0; }
              .rich-block ol { list-style: decimal; padding-left: 16px; margin: 4px 0; }
              .rich-block h2 { font-size: 13px; font-weight: bold; margin: 6px 0 4px; }
              .rich-block blockquote { border-left: 3px solid ${template.color_secondary}; padding-left: 8px; font-style: italic; color: #475569; margin: 4px 0; }
              .legal-mentions-footer p { margin: 0 0 4px 0; }
              .legal-mentions-footer h2 { font-size: 11px; font-weight: bold; margin: 4px 0 2px 0; }
              .legal-mentions-footer h3 { font-size: 10px; font-weight: 600; margin: 4px 0 2px 0; }
              .legal-mentions-footer ul { list-style: disc; padding-left: 16px; margin: 2px 0; }
              .legal-mentions-footer ol { list-style: decimal; padding-left: 16px; margin: 2px 0; }
              .legal-mentions-footer blockquote { border-left: 2px solid #d4d4d8; padding-left: 8px; font-style: italic; color: #71717a; margin: 4px 0; }
              .legal-mentions-footer a { color: #2563eb; text-decoration: underline; }
            `,
          }}
        />
      </div>
    </>
  );
}
