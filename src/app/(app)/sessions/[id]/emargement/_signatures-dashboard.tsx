import { AlertTriangle, CheckCircle2, FileSignature } from "lucide-react";

type DashboardProps = {
  /** Liste des inscriptions actives. */
  enrollments: Array<{ enrollmentId: string; learnerName: string }>;
  /** Périodes (date + matin/après-midi) — n'inclut que les jours de session. */
  periodDates: string[];
  /** Signatures reçues : index `${enrollmentId}|${date}|${moment}|${role}`. */
  signaturesIndex: Map<string, true>;
};

const MOMENTS = ["morning", "afternoon"] as const;

function isPast(date: string, moment: "morning" | "afternoon"): boolean {
  // On considère une demi-journée comme passée si on est après 13h pour le
  // matin ou minuit pour l'après-midi (date + 1 jour).
  const now = new Date();
  const ref = new Date(date + "T00:00:00");
  if (moment === "morning") {
    ref.setHours(13, 0, 0, 0);
  } else {
    ref.setHours(23, 59, 59, 999);
  }
  return now >= ref;
}

/**
 * Dashboard de suivi des signatures électroniques pour une session.
 *
 * Affiché sur la page d'émargement, au-dessus de la grille. Compte les
 * signatures attendues vs. reçues (apprenants + formateur) et liste les
 * créneaux passés sans signature pour faciliter les relances.
 */
export function SignaturesDashboard({
  enrollments,
  periodDates,
  signaturesIndex,
}: DashboardProps) {
  // Demi-journées passées (sur lesquelles on attend une signature)
  const pastSlots = periodDates.flatMap((d) =>
    MOMENTS.filter((m) => isPast(d, m)).map((m) => ({ date: d, moment: m })),
  );

  const totalLearnerSlots = pastSlots.length * enrollments.length;
  const totalTrainerSlots = pastSlots.length;

  let learnerSigned = 0;
  let trainerSigned = 0;
  const missingPerEnrollment = new Map<string, number>();

  for (const slot of pastSlots) {
    if (signaturesIndex.has(`__trainer__|${slot.date}|${slot.moment}`)) {
      trainerSigned++;
    }
    for (const e of enrollments) {
      if (
        signaturesIndex.has(
          `${e.enrollmentId}|${slot.date}|${slot.moment}|learner`,
        )
      ) {
        learnerSigned++;
      } else {
        missingPerEnrollment.set(
          e.enrollmentId,
          (missingPerEnrollment.get(e.enrollmentId) ?? 0) + 1,
        );
      }
    }
  }

  const learnerPct =
    totalLearnerSlots > 0 ? (learnerSigned / totalLearnerSlots) * 100 : 0;
  const trainerPct =
    totalTrainerSlots > 0 ? (trainerSigned / totalTrainerSlots) * 100 : 0;

  if (totalLearnerSlots === 0 && totalTrainerSlots === 0) {
    return (
      <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <FileSignature className="h-4 w-4 text-cyan-600" />
          Suivi des signatures
        </h3>
        <p className="text-xs text-zinc-500 mt-1">
          La session n&apos;a pas encore commencé — aucune signature attendue
          pour l&apos;instant.
        </p>
      </section>
    );
  }

  const missingCount = Array.from(missingPerEnrollment.values()).reduce(
    (a, b) => a + b,
    0,
  );

  const missingByLearner = enrollments
    .map((e) => ({
      ...e,
      missing: missingPerEnrollment.get(e.enrollmentId) ?? 0,
    }))
    .filter((x) => x.missing > 0)
    .sort((a, b) => b.missing - a.missing);

  return (
    <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <FileSignature className="h-4 w-4 text-cyan-600" />
            Suivi des signatures
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {pastSlots.length} demi-journée{pastSlots.length > 1 ? "s" : ""}{" "}
            terminée{pastSlots.length > 1 ? "s" : ""} · {enrollments.length}{" "}
            apprenant{enrollments.length > 1 ? "s" : ""}.
          </p>
        </div>
        {missingCount === 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Complet
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full">
            <AlertTriangle className="h-3.5 w-3.5" />
            {missingCount} manque{missingCount > 1 ? "nt" : ""}
          </span>
        )}
      </header>

      {/* Barres de progression */}
      <div className="grid md:grid-cols-2 gap-3">
        <ProgressCard
          label="Signatures apprenants"
          done={learnerSigned}
          total={totalLearnerSlots}
          pct={learnerPct}
        />
        <ProgressCard
          label="Signatures formateur"
          done={trainerSigned}
          total={totalTrainerSlots}
          pct={trainerPct}
        />
      </div>

      {/* Détail par apprenant manquant */}
      {missingByLearner.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-zinc-700 dark:text-zinc-300 font-medium">
            Voir les apprenants à relancer ({missingByLearner.length})
          </summary>
          <ul className="mt-2 space-y-1 ml-4">
            {missingByLearner.map((m) => (
              <li
                key={m.enrollmentId}
                className="flex items-center justify-between gap-2"
              >
                <span className="font-medium">{m.learnerName}</span>
                <span className="text-amber-700 dark:text-amber-400">
                  {m.missing} créneau{m.missing > 1 ? "x" : ""} sans signature
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ProgressCard({
  label,
  done,
  total,
  pct,
}: {
  label: string;
  done: number;
  total: number;
  pct: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
          {label}
        </span>
        <span className="text-xs tabular-nums text-zinc-500">
          {done} / {total}
        </span>
      </div>
      <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
        <div
          className={`h-full transition-all ${
            pct >= 100
              ? "bg-emerald-500"
              : pct >= 50
                ? "bg-cyan-500"
                : "bg-amber-500"
          }`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <div className="text-xs font-bold tabular-nums">
        {pct.toFixed(0)} %
      </div>
    </div>
  );
}
