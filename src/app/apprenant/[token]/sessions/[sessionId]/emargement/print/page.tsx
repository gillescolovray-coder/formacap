import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLearnerContext } from "../../../../_resolve";
import { PrintButton } from "@/app/(app)/sessions/[id]/emargement/print/_print-button";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { token: string; sessionId: string };

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(s: string | null): string {
  if (!s) return "—";
  return s.slice(0, 5);
}

/**
 * Feuille de présence (émargement) INDIVIDUELLE — portail apprenant.
 *
 * Accès public via token apprenant. Ne montre QUE les signatures de
 * l'apprenant concerné (+ celle du formateur sur ses créneaux) — pas
 * les autres participants (choix Gilles 2026-06-04, RGPD).
 *
 * Gate : téléchargeable uniquement quand la formation est terminée
 * (end_date < aujourd'hui).
 */
export default async function LearnerEmargementPrintPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token, sessionId } = await params;
  if (!UUID_REGEX.test(sessionId)) notFound();

  const ctx = await resolveLearnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();

  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select("id, session_id, learner_id, status")
    .eq("session_id", sessionId)
    .eq("learner_id", ctx.learner.id)
    .neq("status", "cancelled")
    .maybeSingle<{
      id: string;
      session_id: string;
      learner_id: string;
      status: string | null;
    }>();
  if (!enrollment) notFound();

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, internal_code, start_date, end_date, modality, location, formation:formations(title), trainer:trainers!trainer_id(first_name, last_name), trainer_name",
    )
    .eq("id", sessionId)
    .eq("organization_id", ctx.learner.organization_id)
    .maybeSingle();
  if (!session) notFound();

  const sess = session as unknown as {
    id: string;
    internal_code: string | null;
    start_date: string | null;
    end_date: string | null;
    modality: string | null;
    location: string | null;
    formation: { title: string } | Array<{ title: string }> | null;
    trainer:
      | { first_name: string; last_name: string }
      | Array<{ first_name: string; last_name: string }>
      | null;
    trainer_name: string | null;
  };
  const formation = Array.isArray(sess.formation)
    ? sess.formation[0] ?? null
    : sess.formation;
  const trainerJoined = Array.isArray(sess.trainer)
    ? sess.trainer[0] ?? null
    : sess.trainer;
  const trainerName =
    sess.trainer_name ??
    (trainerJoined
      ? `${trainerJoined.first_name} ${trainerJoined.last_name}`
      : null);

  const today = new Date().toISOString().slice(0, 10);
  const isFinished = Boolean(sess.end_date && sess.end_date < today);

  // Gate : pas de feuille tant que la formation n'est pas terminée.
  if (!isFinished) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md bg-white rounded-xl shadow-md border border-zinc-200 p-6 text-center space-y-3">
          <Lock className="h-10 w-10 text-zinc-400 mx-auto" />
          <h1 className="text-lg font-bold text-zinc-900">
            Feuille de présence indisponible
          </h1>
          <p className="text-sm text-zinc-600">
            Votre feuille de présence sera téléchargeable une fois la formation
            terminée.
          </p>
          <Link
            href={`/apprenant/${token}/sessions/${sessionId}`}
            className="inline-block px-4 py-2 border rounded-md text-sm"
          >
            Retour à la formation
          </Link>
        </div>
      </div>
    );
  }

  const { data: daysRaw } = await supabase
    .from("session_days")
    .select(
      "day_date, morning_start, morning_end, afternoon_start, afternoon_end",
    )
    .eq("session_id", sessionId)
    .order("day_date", { ascending: true });
  const days = (daysRaw ?? []) as Array<{
    day_date: string;
    morning_start: string | null;
    morning_end: string | null;
    afternoon_start: string | null;
    afternoon_end: string | null;
  }>;

  const { data: sigRaw } = await supabase
    .from("attendance_signatures")
    .select("period_date, moment, signer_role, signer_name, signature_data, signed_at")
    .eq("enrollment_id", enrollment.id);
  type Sig = {
    period_date: string;
    moment: "morning" | "afternoon";
    signer_role: "learner" | "trainer";
    signer_name: string;
    signature_data: string;
    signed_at: string;
  };
  const sigMap = new Map<string, Sig>();
  for (const s of (sigRaw ?? []) as Sig[]) {
    sigMap.set(`${s.period_date}:${s.moment}:${s.signer_role}`, s);
  }

  // Organisation (logo + cachet)
  const { data: organization } = await supabase
    .from("organizations")
    .select("name, logo_url, signature_stamp_path, legal_mentions")
    .eq("id", ctx.learner.organization_id)
    .maybeSingle<{
      name: string;
      logo_url: string | null;
      signature_stamp_path: string | null;
      legal_mentions: string | null;
    }>();
  const orgName = organization?.name ?? "CAP NUMÉRIQUE";
  const orgLogo = organization?.logo_url ?? null;
  const orgLegalMentions = organization?.legal_mentions ?? null;

  const fullName =
    [ctx.learner.civility, ctx.learner.first_name, ctx.learner.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "—";
  const company = ctx.learner.company_name;

  const editedOn = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const moments: Array<{ key: "morning" | "afternoon"; label: string }> = [
    { key: "morning", label: "Matin" },
    { key: "afternoon", label: "Après-midi" },
  ];

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { margin: 14mm; size: portrait; }
              body { background: white !important; }
              .no-print { display: none !important; }
            }
            body { font-family: system-ui, sans-serif; }
          `,
        }}
      />
      <div className="min-h-screen bg-white p-6 sm:p-8 max-w-[800px] mx-auto">
        <div className="no-print mb-6 flex gap-2">
          <PrintButton />
          <Link
            href={`/apprenant/${token}/sessions/${sessionId}`}
            className="px-4 py-2 border rounded-md text-sm"
          >
            Retour
          </Link>
        </div>

        {/* En-tête */}
        <div className="border-b-2 border-slate-300 pb-4 mb-6 flex items-start justify-between gap-6">
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
          <div className="text-right text-xs text-slate-500">
            <div>Édité le {editedOn}</div>
          </div>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-blue-900 mb-1">
            Feuille de présence
          </h1>
          <p className="text-sm text-slate-600 italic">
            Attestation d&apos;assiduité individuelle
          </p>
        </div>

        {/* Identité */}
        <div className="rounded-lg ring-1 ring-slate-200 bg-slate-50 p-4 mb-6 text-sm space-y-1">
          <div>
            <span className="text-slate-500">Apprenant : </span>
            <strong className="text-slate-900">{fullName}</strong>
          </div>
          {company && (
            <div>
              <span className="text-slate-500">Employeur : </span>
              {company}
            </div>
          )}
          <div>
            <span className="text-slate-500">Formation : </span>
            <strong>«&nbsp;{formation?.title ?? "—"}&nbsp;»</strong>
          </div>
          <div>
            <span className="text-slate-500">Dates : </span>
            {formatDate(sess.start_date)}
            {sess.end_date && sess.end_date !== sess.start_date
              ? ` – ${formatDate(sess.end_date)}`
              : ""}
          </div>
          {trainerName && (
            <div>
              <span className="text-slate-500">Formateur : </span>
              {trainerName}
            </div>
          )}
        </div>

        {/* Tableau d'émargement */}
        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600">
              <th className="border border-slate-300 px-2 py-2 text-left">
                Date
              </th>
              <th className="border border-slate-300 px-2 py-2 text-left">
                Créneau
              </th>
              <th className="border border-slate-300 px-2 py-2 text-left">
                Horaires
              </th>
              <th className="border border-slate-300 px-2 py-2 text-center">
                Signature apprenant
              </th>
              <th className="border border-slate-300 px-2 py-2 text-center">
                Signature formateur
              </th>
            </tr>
          </thead>
          <tbody>
            {days.flatMap((d) =>
              moments.map((m) => {
                const hasSlot =
                  m.key === "morning"
                    ? d.morning_start && d.morning_end
                    : d.afternoon_start && d.afternoon_end;
                if (!hasSlot) return null;
                const start =
                  m.key === "morning" ? d.morning_start : d.afternoon_start;
                const end =
                  m.key === "morning" ? d.morning_end : d.afternoon_end;
                const learnerSig = sigMap.get(
                  `${d.day_date}:${m.key}:learner`,
                );
                const trainerSig = sigMap.get(
                  `${d.day_date}:${m.key}:trainer`,
                );
                return (
                  <tr key={`${d.day_date}:${m.key}`}>
                    <td className="border border-slate-300 px-2 py-2 align-middle font-semibold">
                      {formatDate(d.day_date)}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 align-middle">
                      {m.label}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 align-middle text-slate-600">
                      {formatTime(start)} – {formatTime(end)}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 align-middle text-center">
                      {learnerSig ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={learnerSig.signature_data}
                          alt="Signature apprenant"
                          className="inline-block max-h-12 max-w-[140px] object-contain"
                        />
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 align-middle text-center">
                      {trainerSig ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={trainerSig.signature_data}
                          alt="Signature formateur"
                          className="inline-block max-h-12 max-w-[140px] object-contain"
                        />
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          Cette feuille de présence ne fait apparaître que les signatures de
          l&apos;apprenant désigné ci-dessus et de son formateur. Elle atteste
          la présence aux créneaux émargés. Document généré
          électroniquement par {orgName}.
        </p>

        {orgLegalMentions && (
          <footer
            className="mt-10 pt-3 border-t border-slate-300 text-[10px] text-slate-600 leading-relaxed text-center legal-mentions-footer"
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
