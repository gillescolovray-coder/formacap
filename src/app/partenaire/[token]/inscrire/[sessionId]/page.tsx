import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Euro,
  Send,
  User,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEffectivePartnerPrice } from "@/lib/portal/partner-pricing";
import { resolvePartnerContext } from "../../_resolve";
import { submitPartnerEnrollmentForm } from "../../actions";

type Params = { token: string; sessionId: string };

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function PartnerInscribePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token, sessionId } = await params;
  const { error } = await searchParams;
  const ctx = await resolvePartnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();

  // Session + formation + tarif effectif (override ou calculé).
  // Éligibilité :
  //   - INTER distanciel public (tout partenaire)
  //   - OU INTRA rattachée à ce partenaire (prescripteur uniquement)
  const { data: sessionRaw } = await supabase
    .from("sessions")
    .select(
      `
      id, reference, start_date, end_date, status, format, prescriber_company_id,
      formation:formations!inner(id, title, subtitle, duration_hours, duration_days, modality)
    `,
    )
    .eq("id", sessionId)
    .eq("organization_id", ctx.company.organization_id)
    .maybeSingle();
  if (!sessionRaw) notFound();
  const session = sessionRaw as unknown as {
    id: string;
    reference: string | null;
    start_date: string | null;
    end_date: string | null;
    status: string;
    format: string;
    prescriber_company_id: string | null;
    formation:
      | {
          id: string;
          title: string;
          subtitle: string | null;
          duration_hours: number | null;
          duration_days: number | null;
          modality: string;
        }
      | Array<{
          id: string;
          title: string;
          subtitle: string | null;
          duration_hours: number | null;
          duration_days: number | null;
          modality: string;
        }>;
  };
  const formation = Array.isArray(session.formation)
    ? session.formation[0]
    : session.formation;
  if (!formation) notFound();
  const isInterDistanciel =
    session.format === "inter" && formation.modality === "distanciel";
  const isOwnIntra = session.prescriber_company_id === ctx.company.id;
  if (!isInterDistanciel && !isOwnIntra) notFound();
  if (ctx.company.type === "of" && !isInterDistanciel) notFound();

  // Cherche un override formation, puis applique le helper
  const { data: priceRow } = await supabase
    .from("partner_pricing")
    .select("unit_price_ht")
    .eq("company_id", ctx.company.id)
    .eq("formation_id", formation.id)
    .maybeSingle<{ unit_price_ht: string | number }>();

  const effective = computeEffectivePartnerPrice({
    partnerType: ctx.company.type,
    dailyRateDistancielHt: ctx.company.daily_rate_distanciel_ht,
    dailyRatePresentielHt: ctx.company.daily_rate_presentiel_ht,
    quizUnitPriceHt: ctx.company.quiz_unit_price_ht,
    overrideHt: priceRow ? Number(priceRow.unit_price_ht) : undefined,
    durationDays: formation.duration_days,
    durationHours: formation.duration_hours,
    modality: (formation.modality ?? null) as
      | "presentiel"
      | "distanciel"
      | "hybride"
      | null,
  });

  if (effective.price === null) {
    return (
      <div className="space-y-4">
        <Link
          href={`/partenaire/${token}/catalogue`}
          className="inline-flex items-center gap-1 text-sm text-cyan-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au catalogue
        </Link>
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-6">
          <p className="text-sm text-amber-900">
            Aucun tarif n&apos;est défini pour cette formation. Merci de
            contacter {ctx.organization.name} avant inscription.
          </p>
        </div>
      </div>
    );
  }
  const unitPriceHt = effective.price;

  return (
    <div className="space-y-5 max-w-3xl">
      <Link
        href={`/partenaire/${token}/catalogue`}
        className="inline-flex items-center gap-1 text-sm text-cyan-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour au catalogue
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-zinc-900">
          Inscrire un apprenant
        </h1>
        <p className="text-sm text-zinc-600 mt-1">
          Renseignez les informations de l&apos;apprenant. L&apos;inscription
          est <strong>immédiate</strong> et la convocation sera générée
          ensuite par {ctx.organization.name}.
        </p>
      </header>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Récap session */}
      <section className="rounded-2xl bg-gradient-to-br from-cyan-50 to-indigo-50 border border-cyan-200 p-5">
        <p className="text-[10px] uppercase tracking-widest text-cyan-700 font-bold">
          Session sélectionnée
        </p>
        <h2 className="text-lg font-bold text-zinc-900 mt-1">
          {formation.title}
        </h2>
        {formation.subtitle && (
          <p className="text-sm text-zinc-600">{formation.subtitle}</p>
        )}
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 text-xs">
          <div>
            <dt className="text-zinc-500 uppercase tracking-wider text-[10px] font-bold mb-0.5">
              Début
            </dt>
            <dd className="font-medium inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-zinc-400" />
              {formatDate(session.start_date)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500 uppercase tracking-wider text-[10px] font-bold mb-0.5">
              Durée
            </dt>
            <dd className="font-medium inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-zinc-400" />
              {formation.duration_hours ? `${formation.duration_hours} h` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500 uppercase tracking-wider text-[10px] font-bold mb-0.5">
              Tarif partenaire
            </dt>
            <dd className="font-bold text-emerald-700 tabular-nums inline-flex items-center gap-1">
              <Euro className="h-3.5 w-3.5" />
              {unitPriceHt.toFixed(2)} HT
            </dd>
            {effective.explain && (
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {effective.explain}
              </p>
            )}
          </div>
        </dl>
      </section>

      {/* Formulaire */}
      <form
        action={submitPartnerEnrollmentForm}
        className="rounded-2xl bg-white border border-zinc-200 p-5 space-y-4"
      >
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="session_id" value={sessionId} />

        <h3 className="font-bold text-zinc-900 inline-flex items-center gap-2">
          <User className="h-4 w-4 text-cyan-600" />
          Apprenant à inscrire
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            name="first_name"
            label="Prénom"
            required
            autoComplete="given-name"
          />
          <Field
            name="last_name"
            label="Nom"
            required
            autoComplete="family-name"
          />
          <Field
            name="email"
            label="Email"
            type="email"
            required
            autoComplete="email"
          />
          <Field name="phone" label="Téléphone" autoComplete="tel" />
          <div className="sm:col-span-2">
            <Field name="job_title" label="Fonction" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-700 mb-1">
            Message (optionnel)
          </label>
          <textarea
            name="message"
            rows={3}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            placeholder="Informations complémentaires (besoin d'adaptation, prise en charge…)"
          />
        </div>

        <div className="pt-2 flex items-center justify-between gap-3 flex-wrap border-t border-zinc-100">
          <p className="text-[11px] text-zinc-500 max-w-sm">
            En soumettant ce formulaire, vous certifiez que l&apos;apprenant a
            consenti à l&apos;inscription et au traitement de ses données.
          </p>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-700"
          >
            <Send className="h-4 w-4" />
            Inscrire l&apos;apprenant
          </button>
        </div>
      </form>

      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 inline-flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
        <span>
          L&apos;inscription est validée automatiquement. Vous retrouverez
          l&apos;apprenant dans <strong>Mes inscriptions</strong> dès
          l&apos;envoi.
        </span>
      </div>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required = false,
  autoComplete,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-zinc-700 mb-1">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        name={name}
        required={required}
        autoComplete={autoComplete}
        className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm"
      />
    </div>
  );
}
