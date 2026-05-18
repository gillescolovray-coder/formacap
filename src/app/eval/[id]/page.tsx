import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "./_star-rating";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function submitEvaluation(formData: FormData) {
  "use server";
  const sessionId = formData.get("session_id") as string;
  if (!sessionId || !UUID_REGEX.test(sessionId)) {
    throw new Error("Session invalide");
  }

  const supabase = await createClient();
  // Vérifier que l'évaluation est ouverte
  const { data: session } = await supabase
    .from("sessions")
    .select("id, evaluation_open")
    .eq("id", sessionId)
    .maybeSingle<{ id: string; evaluation_open: boolean | null }>();
  if (!session || !session.evaluation_open) {
    throw new Error(
      "L'évaluation n'est plus ouverte pour cette session.",
    );
  }

  function readRating(name: string): number | null {
    const v = Number(formData.get(name));
    if (!Number.isFinite(v) || v < 1 || v > 5) return null;
    return Math.round(v);
  }

  const overall = readRating("rating_overall");
  if (!overall) {
    throw new Error("Merci de donner une note globale.");
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const { error } = await supabase.from("session_evaluations").insert({
    session_id: sessionId,
    rating_overall: overall,
    rating_content: readRating("rating_content"),
    rating_trainer: readRating("rating_trainer"),
    rating_conditions: readRating("rating_conditions"),
    rating_objectives: readRating("rating_objectives"),
    comment: (formData.get("comment") as string)?.trim() || null,
    submitter_ip: ip,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export default async function PublicEvaluationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string; error?: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();
  const query = await searchParams;

  const supabase = await createClient();
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, evaluation_open, start_date, end_date, formation:formations(id, title)",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      evaluation_open: boolean | null;
      start_date: string;
      end_date: string;
      formation: { id: string; title: string } | null;
    }>();

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold mb-2">Lien invalide</h1>
          <p className="text-sm text-zinc-600">
            Cette évaluation n&apos;existe pas ou a été supprimée.
          </p>
        </div>
      </div>
    );
  }

  if (!session.evaluation_open) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold mb-2">Évaluation fermée</h1>
          <p className="text-sm text-zinc-600">
            Cette évaluation n&apos;est plus ouverte aux nouvelles réponses.
            Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur,
            contactez votre formateur.
          </p>
        </div>
      </div>
    );
  }

  const formationTitle = session.formation?.title ?? "Formation";

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-blue-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
          {query.submitted ? (
            <div className="text-center py-8">
              <div className="h-16 w-16 rounded-full bg-emerald-100 mx-auto flex items-center justify-center mb-4">
                <Star className="h-8 w-8 text-emerald-600 fill-emerald-600" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Merci !</h1>
              <p className="text-zinc-600">
                Votre évaluation a bien été enregistrée. Elle nous aide à
                améliorer la qualité de nos formations.
              </p>
            </div>
          ) : (
            <>
              <header className="text-center pb-4 border-b border-zinc-200">
                <p className="text-xs uppercase tracking-wider font-bold text-cyan-700 mb-2">
                  Évaluation à chaud
                </p>
                <h1 className="text-2xl font-bold text-zinc-900">
                  {formationTitle}
                </h1>
                <p className="text-sm text-zinc-500 mt-1">
                  du {new Date(session.start_date).toLocaleDateString("fr-FR")}{" "}
                  au {new Date(session.end_date).toLocaleDateString("fr-FR")}
                </p>
              </header>

              {query.error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {query.error}
                </div>
              )}

              <p className="text-sm text-zinc-600 leading-relaxed">
                Votre avis nous est précieux pour améliorer la qualité de
                nos formations.
                <br />
                <strong>Cette évaluation est totalement anonyme.</strong>{" "}
                Elle ne prend que 2 minutes.
              </p>

              <form
                action={async (fd) => {
                  "use server";
                  try {
                    await submitEvaluation(fd);
                  } catch (e) {
                    const msg =
                      e instanceof Error ? e.message : "Erreur inconnue";
                    const { redirect } = await import("next/navigation");
                    redirect(
                      `/eval/${id}?error=${encodeURIComponent(msg)}`,
                    );
                  }
                  const { redirect } = await import("next/navigation");
                  redirect(`/eval/${id}?submitted=1`);
                }}
                className="space-y-6"
              >
                <input type="hidden" name="session_id" value={id} />

                <RatingField
                  name="rating_overall"
                  label="Note globale de la formation"
                  required
                />
                <RatingField
                  name="rating_content"
                  label="Qualité du contenu pédagogique"
                />
                <RatingField
                  name="rating_trainer"
                  label="Qualité du formateur"
                />
                <RatingField
                  name="rating_conditions"
                  label="Conditions matérielles (salle, supports, lien visio…)"
                />
                <RatingField
                  name="rating_objectives"
                  label="Atteinte des objectifs pédagogiques"
                />

                <div className="space-y-2">
                  <label
                    htmlFor="comment"
                    className="block text-sm font-medium text-zinc-700"
                  >
                    Commentaire libre
                  </label>
                  <Textarea
                    id="comment"
                    name="comment"
                    rows={4}
                    placeholder="Ce qui vous a plu, ce qui pourrait être amélioré, suggestions…"
                  />
                </div>

                <div className="pt-2">
                  <Button type="submit" className="w-full">
                    Envoyer mon évaluation
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RatingField({
  name,
  label,
  required,
}: {
  name: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-700">
        {label}
        {required && <span className="text-red-600 ml-1">*</span>}
      </label>
      <StarRating name={name} required={required} />
    </div>
  );
}
