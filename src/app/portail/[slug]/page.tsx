import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  Clock,
  Users,
  MapPin,
  Euro,
  Accessibility,
  Target,
  CheckCircle2,
  FileDown,
  Calendar,
  ArrowLeft,
  GraduationCap,
} from "lucide-react";
import {
  getPublicFormation,
  idFromSlug,
  type PublicFormationDetail,
} from "@/lib/public-catalogue/queries";

export const dynamic = "force-dynamic";

const ODOO_SITE = "https://www.capnumerique.com";

function modalityLabel(m: string | null): string {
  switch ((m ?? "").toLowerCase()) {
    case "presentiel":
    case "présentiel":
      return "Présentiel";
    case "distanciel":
    case "visio":
      return "À distance";
    case "mixte":
    case "hybride":
      return "Mixte";
    default:
      return m ?? "Présentiel";
  }
}

function durationLabel(f: PublicFormationDetail): string {
  if (f.durationDays && f.durationDays > 0) {
    const h = f.durationHours ? ` (${f.durationHours} h)` : "";
    return `${f.durationDays} jour${f.durationDays > 1 ? "s" : ""}${h}`;
  }
  if (f.durationHours && f.durationHours > 0) return `${f.durationHours} h`;
  return "Nous consulter";
}

function priceLabel(f: PublicFormationDetail): string {
  if (f.publicPriceHt && f.publicPriceHt > 0) {
    return `${f.publicPriceHt.toLocaleString("fr-FR")} € HT`;
  }
  return "Sur devis";
}

function effectifLabel(f: PublicFormationDetail): string {
  if (f.minParticipants && f.maxParticipants)
    return `${f.minParticipants} à ${f.maxParticipants} participants`;
  if (f.maxParticipants) return `Jusqu'à ${f.maxParticipants} participants`;
  return "Nous consulter";
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const id = idFromSlug(slug);
  const f = id ? await getPublicFormation(id) : null;
  if (!f) return { title: "Formation — CAP Numérique" };
  return {
    title: `${f.title} — CAP Numérique`,
    description:
      f.subtitle ??
      f.generalObjective ??
      f.description ??
      `Formation ${f.title} — CAP Numérique, organisme certifié Qualiopi.`,
  };
}

/** Bloc texte affiché seulement si non vide. */
function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-[#1e3a8a] mb-3">
        <span className="text-[#9d1b51]">{icon}</span>
        {title}
      </h2>
      <div className="text-slate-700 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

/** Rend un texte multi-lignes en paragraphes / liste. */
function RichText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const isList = lines.length > 1 && lines.every((l) => l.trim().length < 200);
  if (isList) {
    return (
      <ul className="space-y-1.5">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2">
            <CheckCircle2 className="h-4 w-4 text-[#9d1b51] mt-1 shrink-0" />
            <span>{l.replace(/^[-•*]\s*/, "")}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <>
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </>
  );
}

export default async function FormationFichePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const id = idFromSlug(slug);
  const f = id ? await getPublicFormation(id) : null;
  if (!f) notFound();

  const devisHref = `${ODOO_SITE}/contactus?subject=${encodeURIComponent(
    `Demande de devis — ${f.title}`,
  )}`;

  return (
    <div className="bg-slate-50">
      {/* Hero */}
      <section className="bg-gradient-to-br from-[#1e3a8a] via-[#3b2a8a] to-[#9d1b51] text-white">
        <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
          <Link
            href="/portail"
            className="inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour au catalogue
          </Link>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {f.categoryName && (
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                {f.categoryName}
              </span>
            )}
            {f.isCpfEligible && (
              <span className="rounded-full bg-white text-[#9d1b51] px-3 py-1 text-xs font-bold">
                Éligible CPF
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-4xl font-black leading-tight">
            {f.title}
          </h1>
          {f.subtitle && (
            <p className="mt-3 text-white/85 text-lg max-w-3xl">{f.subtitle}</p>
          )}
        </div>
      </section>

      {/* Bandeau infos clés */}
      <section className="max-w-5xl mx-auto px-4 -mt-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              icon: <Clock className="h-5 w-5" />,
              label: "Durée",
              value: durationLabel(f),
            },
            {
              icon: <Users className="h-5 w-5" />,
              label: "Effectif",
              value: effectifLabel(f),
            },
            {
              icon: <MapPin className="h-5 w-5" />,
              label: "Modalité",
              value: modalityLabel(f.modality),
            },
            {
              icon: <Euro className="h-5 w-5" />,
              label: "Tarif",
              value: priceLabel(f),
            },
          ].map((b) => (
            <div
              key={b.label}
              className="rounded-xl bg-white border border-slate-200 shadow-sm p-3 text-center"
            >
              <div className="text-[#9d1b51] flex justify-center mb-1">
                {b.icon}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                {b.label}
              </div>
              <div className="text-sm font-bold text-slate-800 mt-0.5">
                {b.value}
              </div>
            </div>
          ))}
        </div>
        {(f.publicPriceHt ?? 0) > 0 && (
          <p className="text-center text-xs text-slate-500 mt-2">
            Tarif indicatif — finançable OPCO / CPF selon votre situation.
          </p>
        )}
      </section>

      {/* Corps */}
      <div className="max-w-5xl mx-auto px-4 py-8 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          {(f.description || f.generalObjective) && (
            <Section icon={<Target className="h-5 w-5" />} title="Présentation">
              {f.generalObjective && (
                <p className="font-medium text-slate-800">
                  {f.generalObjective}
                </p>
              )}
              {f.description && <RichText text={f.description} />}
            </Section>
          )}

          {f.operationalObjectives.length > 0 && (
            <Section
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Objectifs pédagogiques"
            >
              <ul className="space-y-1.5">
                {f.operationalObjectives.map((o, i) => (
                  <li key={i} className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#9d1b51] mt-1 shrink-0" />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {f.programmeDays.length > 0 && (
            <Section
              icon={<GraduationCap className="h-5 w-5" />}
              title="Programme"
            >
              <div className="space-y-4">
                {f.programmeDays.map((d, i) => (
                  <div key={i}>
                    <h3 className="font-bold text-slate-800 mb-2">
                      Jour {i + 1}
                    </h3>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {d.morning && (
                        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                          <div className="text-xs font-semibold text-[#9d1b51] uppercase mb-1">
                            Matin
                          </div>
                          <div className="text-sm whitespace-pre-line">
                            {d.morning}
                          </div>
                        </div>
                      )}
                      {d.afternoon && (
                        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                          <div className="text-xs font-semibold text-[#9d1b51] uppercase mb-1">
                            Après-midi
                          </div>
                          <div className="text-sm whitespace-pre-line">
                            {d.afternoon}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {f.targetAudience && (
            <Section icon={<Users className="h-5 w-5" />} title="Public visé">
              <RichText text={f.targetAudience} />
            </Section>
          )}

          {f.prerequisites && (
            <Section
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Prérequis"
            >
              <RichText text={f.prerequisites} />
            </Section>
          )}

          {(f.pedagogyApproach || f.teachingMethods || f.technicalMeans) && (
            <Section
              icon={<GraduationCap className="h-5 w-5" />}
              title="Méthodes pédagogiques"
            >
              {f.pedagogyApproach && <RichText text={f.pedagogyApproach} />}
              {f.teachingMethods && <RichText text={f.teachingMethods} />}
              {f.technicalMeans && <RichText text={f.technicalMeans} />}
            </Section>
          )}

          {f.evaluationMethods && (
            <Section
              icon={<Target className="h-5 w-5" />}
              title="Modalités d'évaluation"
            >
              <RichText text={f.evaluationMethods} />
            </Section>
          )}

          <Section
            icon={<Accessibility className="h-5 w-5" />}
            title="Accessibilité"
          >
            {f.accessibility ? (
              <RichText text={f.accessibility} />
            ) : (
              <p>
                Nos formations sont accessibles aux personnes en situation de
                handicap. Contactez-nous pour étudier ensemble les adaptations
                possibles.
              </p>
            )}
          </Section>
        </div>

        {/* Colonne latérale */}
        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:sticky lg:top-24">
            <div className="text-center">
              <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">
                Tarif
              </div>
              <div className="text-2xl font-black text-[#1e3a8a] mt-1">
                {priceLabel(f)}
              </div>
            </div>
            <a
              href={devisHref}
              className="mt-4 block text-center rounded-full bg-gradient-to-r from-[#1e3a8a] to-[#9d1b51] text-white font-bold px-5 py-3 shadow hover:opacity-90"
            >
              Demander un devis
            </a>
            <p className="text-center text-xs text-slate-400 mt-2">
              Réponse sous 48 h ouvrées
            </p>
            {f.programmePdfUrl && (
              <a
                href={f.programmePdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-2 rounded-full border border-[#1e3a8a] text-[#1e3a8a] font-semibold px-5 py-2.5 hover:bg-[#1e3a8a]/5"
              >
                <FileDown className="h-4 w-4" />
                Programme PDF
              </a>
            )}
          </div>

          {f.upcomingSessions.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="flex items-center gap-2 text-base font-bold text-[#1e3a8a] mb-3">
                <Calendar className="h-5 w-5 text-[#9d1b51]" />
                Prochaines sessions
              </h2>
              <ul className="space-y-2">
                {f.upcomingSessions.slice(0, 6).map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-slate-700">
                      {formatDate(s.start_date)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {modalityLabel(s.modality)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
