import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ConventionSignForm } from "./_form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signature de convention de formation",
  robots: "noindex, nofollow",
};

export default async function ConventionSignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: link } = await supabase
    .from("signature_links")
    .select(
      `
      id, convention_id, expires_at, used_at,
      convention:session_conventions(
        id, status, contact_name, contact_email, signed_at, signed_by_name,
        company:companies(name),
        session:sessions(start_date, end_date, formation:formations(title))
      )
      `,
    )
    .eq("token", token)
    .not("convention_id", "is", null)
    .maybeSingle();

  if (!link) return <ExpiredCard reason="Lien invalide ou inconnu." />;

  type LinkRow = {
    id: string;
    convention_id: string;
    expires_at: string;
    used_at: string | null;
    convention: {
      id: string;
      status: string;
      contact_name: string | null;
      contact_email: string | null;
      signed_at: string | null;
      signed_by_name: string | null;
      company: { name: string } | null;
      session: {
        start_date: string;
        end_date: string;
        formation: { title: string } | null;
      } | null;
    } | null;
  };
  const row = link as unknown as LinkRow;

  if (new Date(row.expires_at) < new Date()) {
    return (
      <ExpiredCard reason="Ce lien de signature a expiré (30 jours après son émission)." />
    );
  }

  const convention = row.convention;
  if (!convention) {
    return <ExpiredCard reason="Convention introuvable ou retirée." />;
  }

  // Organisation pour le logo (via la session)
  const { data: org } = convention.session
    ? await supabase
        .from("sessions")
        .select("organization:organizations(name, logo_url)")
        .eq("formation_id", convention.session.formation?.title ? null : null) // dummy, not used
        .limit(0)
        .maybeSingle()
    : { data: null };
  void org; // pas utilisé directement, on peut récupérer simplement par jointure plus tard

  const alreadySigned = convention.status === "signed";

  return (
    <main
      className="min-h-screen flex items-start justify-center px-4 py-8 sm:py-16"
      style={{ background: "linear-gradient(135deg, #f8fafc, #e0f2fe)" }}
    >
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
        <header className="pb-4 border-b border-zinc-200">
          <div className="text-xs uppercase tracking-widest text-blue-700 font-bold">
            Convention de formation
          </div>
          <h1 className="text-lg sm:text-xl font-black text-zinc-900 leading-tight mt-1">
            Signature en ligne
          </h1>
        </header>

        <section className="space-y-1 text-sm">
          <div className="text-zinc-600 text-xs uppercase tracking-wider font-semibold">
            Entreprise
          </div>
          <div className="font-semibold">{convention.company?.name ?? "—"}</div>

          <div className="text-zinc-600 mt-3 text-xs uppercase tracking-wider font-semibold">
            Formation
          </div>
          <div className="font-medium">
            {convention.session?.formation?.title ?? "Formation"}
          </div>
          {convention.session && (
            <div className="text-zinc-500">
              du{" "}
              {new Date(convention.session.start_date).toLocaleDateString(
                "fr-FR",
              )}{" "}
              au{" "}
              {new Date(convention.session.end_date).toLocaleDateString("fr-FR")}
            </div>
          )}

          {convention.contact_name && (
            <>
              <div className="text-zinc-600 mt-3 text-xs uppercase tracking-wider font-semibold">
                À signer par
              </div>
              <div className="font-medium">{convention.contact_name}</div>
            </>
          )}
        </section>

        {alreadySigned ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-center space-y-2">
            <div className="text-4xl">✅</div>
            <h2 className="font-bold text-emerald-900">
              Convention déjà signée
            </h2>
            {convention.signed_by_name && convention.signed_at && (
              <p className="text-sm text-emerald-800/90">
                Signée par <strong>{convention.signed_by_name}</strong> le{" "}
                {new Date(convention.signed_at).toLocaleDateString("fr-FR")}
              </p>
            )}
          </div>
        ) : (
          <ConventionSignForm
            token={token}
            conventionId={convention.id}
            defaultName={convention.contact_name ?? ""}
          />
        )}

        <footer className="text-[11px] text-zinc-400 text-center pt-4 border-t border-zinc-200">
          Signature électronique horodatée et tracée pour audit.
        </footer>
      </div>
    </main>
  );
}

function ExpiredCard({ reason }: { reason: string }) {
  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: "linear-gradient(135deg, #f8fafc, #fee2e2)" }}
    >
      <div className="max-w-md bg-white rounded-2xl shadow-xl p-8 text-center space-y-3">
        <div className="text-5xl">⚠️</div>
        <h1 className="text-xl font-bold">Lien indisponible</h1>
        <p className="text-zinc-600 text-sm">{reason}</p>
      </div>
    </main>
  );
}
