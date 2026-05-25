import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureEnrollmentPortalToken } from "@/lib/portal/express-signup";
import { CheckCircle2, Circle, GraduationCap } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quiz — Sélectionnez votre nom",
  robots: "noindex, nofollow",
};

type Params = { token: string };

/**
 * Page PUBLIQUE quiz par QR code session.
 *
 * Le formateur affiche un seul QR code, l'apprenant scanne et choisit
 * son nom dans la liste de la session. Il est ensuite redirigé vers
 * son /mon-parcours/[token]/quiz personnel qui gère :
 *   - quiz d'entrée (phase = pre) — jouable une seule fois
 *   - quiz de sortie (phase = post) — jouable une seule fois
 *
 * Gilles 2026-05-25 : "un seul code QR et l'apprenant sélectionne
 * son nom et prénom pour jouer le quiz d'entrée et de sortie. Prévoir
 * un test pour qu'on ne puisse pas jouer le quiz 2 fois par la même
 * personne le matin et l'après-midi".
 *
 * Anti-rejeu : géré par la table quiz_attempts (unique sur
 * enrollment_id + quiz_template_id + phase) et par la page
 * /mon-parcours/[token]/quiz qui détecte les attempts existants et
 * passe en mode lecture si la phase est déjà jouée.
 */
export default async function QuizSessionPublicPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  // 1. Vérifier le token + expiration
  const { data: tokenRow } = await supabase
    .from("session_quiz_tokens")
    .select("session_id, expires_at")
    .eq("token", token)
    .maybeSingle<{ session_id: string; expires_at: string }>();
  if (!tokenRow) {
    return <ExpiredCard reason="Lien invalide ou inconnu." />;
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return (
      <ExpiredCard reason="Ce lien a expiré. Demande un nouveau lien à ton formateur." />
    );
  }

  // 2. Charger la session + formation + quiz + organisation
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, start_date, end_date, quiz_template_id, formation:formations(title, quiz_template_id), organization:organizations(name, logo_url)",
    )
    .eq("id", tokenRow.session_id)
    .maybeSingle<{
      id: string;
      start_date: string;
      end_date: string;
      quiz_template_id: string | null;
      formation: { title: string; quiz_template_id: string | null } | null;
      organization: { name: string; logo_url: string | null } | null;
    }>();
  if (!session) {
    return <ExpiredCard reason="Session introuvable." />;
  }
  const effectiveQuizId =
    session.quiz_template_id ?? session.formation?.quiz_template_id ?? null;
  if (!effectiveQuizId) {
    return (
      <ExpiredCard reason="Aucun quiz n'est rattaché à cette session. Contactez votre formateur." />
    );
  }
  const { data: quiz } = await supabase
    .from("quiz_templates")
    .select("title, description, status")
    .eq("id", effectiveQuizId)
    .maybeSingle<{ title: string; description: string | null; status: string }>();
  if (!quiz || quiz.status !== "published") {
    return <ExpiredCard reason="Le quiz n'est pas encore publié." />;
  }

  // 3. Liste des inscrits + statut pre/post de chacun
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("id, learner:learners(civility, first_name, last_name)")
    .eq("session_id", session.id);

  type Enr = {
    id: string;
    learner: {
      civility: string | null;
      first_name: string | null;
      last_name: string | null;
    } | null;
  };
  const list = ((enrollments ?? []) as unknown as Enr[]);
  const enrollmentIds = list.map((e) => e.id);

  const { data: attempts } =
    enrollmentIds.length > 0
      ? await supabase
          .from("quiz_attempts")
          .select("enrollment_id, phase, completed_at")
          .in("enrollment_id", enrollmentIds)
          .eq("quiz_template_id", effectiveQuizId)
      : { data: [] };

  type Attempt = {
    enrollment_id: string;
    phase: "pre" | "post";
    completed_at: string | null;
  };
  const attemptsByEnr = new Map<string, { pre?: Attempt; post?: Attempt }>();
  (attempts as Attempt[] | null)?.forEach((a) => {
    const cur = attemptsByEnr.get(a.enrollment_id) ?? {};
    if (a.phase === "pre") cur.pre = a;
    if (a.phase === "post") cur.post = a;
    attemptsByEnr.set(a.enrollment_id, cur);
  });

  // Tri alphabétique sur le nom puis le prénom (UX scan)
  list.sort((a, b) => {
    const an = `${a.learner?.last_name ?? ""} ${a.learner?.first_name ?? ""}`
      .trim()
      .toLowerCase();
    const bn = `${b.learner?.last_name ?? ""} ${b.learner?.first_name ?? ""}`
      .trim()
      .toLowerCase();
    return an.localeCompare(bn);
  });

  const orgName = session.organization?.name ?? "";
  const orgLogo = session.organization?.logo_url ?? null;

  // Server action : redirige vers le portail apprenant /quiz
  async function gotoLearnerQuiz(formData: FormData): Promise<void> {
    "use server";
    const enrollmentId = String(formData.get("enrollmentId") ?? "");
    if (!enrollmentId) return;
    const sb = createAdminClient();
    // Sécurité : on revérifie le token côté action et que l'enrollment
    // appartient bien à la session du token.
    const { data: tk } = await sb
      .from("session_quiz_tokens")
      .select("session_id, expires_at")
      .eq("token", token)
      .maybeSingle<{ session_id: string; expires_at: string }>();
    if (!tk || new Date(tk.expires_at) < new Date()) return;
    const { data: enr } = await sb
      .from("session_enrollments")
      .select("session_id")
      .eq("id", enrollmentId)
      .maybeSingle<{ session_id: string }>();
    if (!enr || enr.session_id !== tk.session_id) return;
    const learnerToken = await ensureEnrollmentPortalToken(sb, enrollmentId);
    redirect(`/mon-parcours/${learnerToken}/quiz`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-5">
        <header className="text-center space-y-2">
          {orgLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={orgLogo}
              alt={orgName}
              className="h-12 mx-auto mb-2 object-contain"
            />
          )}
          <div className="text-xs uppercase tracking-widest text-amber-700 font-bold">
            Quiz d&apos;évaluation
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900">
            {quiz.title}
          </h1>
          <p className="text-sm text-zinc-600">
            {session.formation?.title}
          </p>
          <p className="text-xs text-zinc-500">
            Sélectionnez votre nom dans la liste pour jouer le quiz
            d&apos;entrée ou de sortie.
          </p>
        </header>

        {list.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
            Aucun apprenant inscrit sur cette session.
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map((e) => {
              const fullName = [e.learner?.first_name, e.learner?.last_name]
                .filter(Boolean)
                .join(" ")
                .trim();
              const slots = attemptsByEnr.get(e.id) ?? {};
              const preDone = !!slots.pre?.completed_at;
              const postDone = !!slots.post?.completed_at;
              const allDone = preDone && postDone;
              return (
                <li key={e.id}>
                  <form action={gotoLearnerQuiz}>
                    <input type="hidden" name="enrollmentId" value={e.id} />
                    <button
                      type="submit"
                      disabled={allDone}
                      className={
                        "w-full text-left rounded-xl border-2 p-4 flex items-center justify-between gap-3 transition " +
                        (allDone
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800 cursor-default"
                          : "bg-white border-zinc-200 hover:border-amber-400 hover:bg-amber-50 active:bg-amber-100 cursor-pointer")
                      }
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <GraduationCap
                          className={
                            "h-5 w-5 shrink-0 " +
                            (allDone ? "text-emerald-600" : "text-amber-600")
                          }
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-zinc-900 truncate">
                            {fullName || "Apprenant"}
                          </div>
                          <div className="text-[11px] text-zinc-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                            <StatusBadge done={preDone} label="Entrée" />
                            <StatusBadge done={postDone} label="Sortie" />
                          </div>
                        </div>
                      </div>
                      {allDone ? (
                        <span className="text-[11px] font-medium text-emerald-700 shrink-0">
                          Terminé
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-amber-700 shrink-0">
                          C&apos;est moi →
                        </span>
                      )}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <footer className="text-center text-[11px] text-zinc-400 pt-2">
          Le quiz se joue une fois en début et une fois en fin de session.
          Si vous l&apos;avez déjà rempli, votre nom apparaît en vert.
        </footer>
      </div>
    </div>
  );
}

function StatusBadge({ done, label }: { done: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {done ? (
        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
      ) : (
        <Circle className="h-3 w-3 text-zinc-300" />
      )}
      <span className={done ? "text-emerald-700" : "text-zinc-500"}>
        {label}
      </span>
    </span>
  );
}

function ExpiredCard({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md bg-white rounded-xl shadow-md border border-zinc-200 p-6 text-center space-y-3">
        <h1 className="text-lg font-bold">Quiz indisponible</h1>
        <p className="text-sm text-zinc-600">{reason}</p>
      </div>
    </div>
  );
}
