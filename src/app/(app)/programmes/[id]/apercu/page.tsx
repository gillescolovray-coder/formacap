import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "../../../sessions/[id]/emargement/print/_print-button";
import {
  BLOOM_LEVELS,
  type BloomObjective,
  type BloomLevelKey,
} from "@/lib/bloom/types";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LEVEL_LABEL: Record<string, string> = Object.fromEntries(
  BLOOM_LEVELS.map((l) => [l.key, l.label]),
);

/**
 * Aperçu imprimable (PDF via navigateur) d'un programme de formation —
 * rendu par défaut (Gilles 2026-06-08). À affiner avec le modèle CAP.
 */
export default async function ProgrammeApercuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: bp } = await supabase
    .from("program_blueprints")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!bp) notFound();

  const b = bp as {
    organization_id: string;
    internal_code: string | null;
    title: string;
    theme: string | null;
    target_audience: string | null;
    duration_hours: number | null;
    duration_days: number | null;
    general_objective: string | null;
    bloom_objectives: BloomObjective[] | null;
  };

  const { data: membership } = await supabase
    .from("organization_members")
    .select(
      "organization:organizations(name, logo_url, legal_mentions, legal_representative_name, legal_representative_role)",
    )
    .eq("profile_id", user.id)
    .eq("organization_id", b.organization_id)
    .maybeSingle();
  const organization = membership?.organization as unknown as {
    name: string | null;
    logo_url: string | null;
    legal_mentions: string | null;
    legal_representative_name: string | null;
    legal_representative_role: string | null;
  } | null;
  const orgName = organization?.name ?? "CAP NUMÉRIQUE";
  const orgLogo = organization?.logo_url ?? null;

  const objectives = b.bloom_objectives ?? [];

  return (
    <div className="min-h-screen bg-white p-8 max-w-[800px] mx-auto text-slate-800">
      <div className="no-print mb-6 flex gap-2">
        <PrintButton />
      </div>

      {/* En-tête */}
      <div className="border-b-2 border-slate-300 pb-4 mb-8 flex items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          {orgLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={orgLogo}
              alt={orgName}
              className="max-h-20 max-w-[180px] object-contain"
            />
          )}
          <div>
            <div className="text-sm uppercase tracking-widest text-slate-700 font-bold">
              {orgName}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Programme de formation
            </div>
          </div>
        </div>
        {b.internal_code && (
          <div className="text-right text-xs text-slate-500">
            Réf. {b.internal_code}
          </div>
        )}
      </div>

      {/* Titre */}
      <h1 className="text-2xl font-bold text-blue-900 mb-1 leading-tight">
        {b.title}
      </h1>
      {b.theme && (
        <p className="text-sm text-slate-500 italic mb-6">{b.theme}</p>
      )}

      {/* Caractéristiques */}
      <div className="grid grid-cols-2 gap-3 mb-8 text-sm">
        {b.target_audience && (
          <InfoBlock label="Public visé" value={b.target_audience} />
        )}
        <InfoBlock
          label="Durée"
          value={[
            b.duration_hours ? `${b.duration_hours} heures` : null,
            b.duration_days ? `${b.duration_days} jour(s)` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "À définir"}
        />
      </div>

      {/* Objectif général */}
      {b.general_objective && (
        <section className="mb-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1 mb-2">
            Objectif général
          </h2>
          <p className="text-sm leading-relaxed">{b.general_objective}</p>
        </section>
      )}

      {/* Objectifs opérationnels */}
      <section className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1 mb-3">
          Objectifs opérationnels
        </h2>
        {objectives.length === 0 ? (
          <p className="text-sm text-slate-400 italic">
            Aucun objectif défini.
          </p>
        ) : (
          <ol className="space-y-2 text-sm">
            {objectives.map((o, i) => (
              <li key={o.id ?? i} className="flex gap-2 items-start">
                <span className="font-bold text-blue-900 shrink-0">
                  {i + 1}.
                </span>
                <span className="flex-1">
                  {o.text}
                  {o.bloom_level && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-400">
                      [{LEVEL_LABEL[o.bloom_level as BloomLevelKey] ??
                        o.bloom_level}]
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Mentions légales */}
      {organization?.legal_mentions && (
        <footer className="mt-12 pt-4 border-t border-slate-200 text-[10px] text-slate-500 whitespace-pre-line leading-relaxed">
          {organization.legal_mentions}
        </footer>
      )}
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg ring-1 ring-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">
        {label}
      </div>
      <div className="text-sm text-slate-800">{value}</div>
    </div>
  );
}
