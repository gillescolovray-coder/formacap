"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, GitMerge, Loader2, Users } from "lucide-react";
import { mergeLearners } from "../merge-actions";

export type DupLearner = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  cpVille: string | null;
  isTemporary: boolean;
  sessionsCount: number;
  sessionIds: string[];
};

export type DupGroup = {
  key: string;
  learners: DupLearner[];
};

/** Choisit par défaut la fiche la plus « riche » à conserver. */
function defaultSurvivor(learners: DupLearner[]): string {
  const sorted = [...learners].sort((a, b) => {
    if (b.sessionsCount !== a.sessionsCount)
      return b.sessionsCount - a.sessionsCount;
    if (a.isTemporary !== b.isTemporary) return a.isTemporary ? 1 : -1;
    if (Boolean(b.company) !== Boolean(a.company))
      return b.company ? 1 : -1;
    return 0;
  });
  return sorted[0]?.id ?? learners[0].id;
}

function GroupCard({ group }: { group: DupGroup }) {
  const router = useRouter();
  const [survivor, setSurvivor] = useState(() => defaultSurvivor(group.learners));
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Sessions partagées entre 2 fiches du groupe -> fusion bloquée pour ce couple.
  const sharedConflict = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of group.learners) {
      for (const s of l.sessionIds) {
        if (seen.has(s) && seen.get(s) !== l.id) return true;
        seen.set(s, l.id);
      }
    }
    return false;
  }, [group]);

  function doMerge() {
    setMsg(null);
    const dups = group.learners.filter((l) => l.id !== survivor);
    startTransition(async () => {
      let ok = 0;
      const errors: string[] = [];
      for (const d of dups) {
        const res = await mergeLearners(survivor, d.id);
        if (res.ok) ok += 1;
        else errors.push(`${d.name} : ${res.error}`);
      }
      if (errors.length === 0) {
        setMsg({ ok: true, text: `${ok} fiche(s) fusionnée(s).` });
      } else {
        setMsg({
          ok: false,
          text: `${ok} fusionnée(s). Problème : ${errors.join(" · ")}`,
        });
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-zinc-400" />
        <span className="text-sm font-semibold">
          {group.learners[0].name}
        </span>
        <span className="text-xs text-zinc-500">
          · {group.learners.length} fiches
        </span>
      </div>

      <p className="text-[11px] text-zinc-500">
        Choisissez la fiche à <strong>conserver</strong> (les autres y seront
        fusionnées, avec toutes leurs sessions) :
      </p>

      <div className="space-y-1.5">
        {group.learners.map((l) => (
          <label
            key={l.id}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer ${
              survivor === l.id
                ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20"
                : "border-zinc-200 dark:border-zinc-700"
            }`}
          >
            <input
              type="radio"
              name={`survivor-${group.key}`}
              checked={survivor === l.id}
              onChange={() => setSurvivor(l.id)}
              className="h-4 w-4 text-emerald-600"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{l.name}</span>
                {l.isTemporary && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                    Express
                  </span>
                )}
              </div>
              <span className="text-[11px] text-zinc-500">
                {[l.company, l.cpVille, l.email].filter(Boolean).join(" · ")}
                {` · ${l.sessionsCount} session(s)`}
              </span>
            </div>
            {survivor === l.id && (
              <span className="text-[10px] font-semibold text-emerald-700 whitespace-nowrap">
                À conserver
              </span>
            )}
          </label>
        ))}
      </div>

      {sharedConflict && (
        <p className="text-[11px] text-amber-700 inline-flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Deux de ces fiches partagent une même session : la fusion de ce
          couple sera refusée (à traiter à la main pour ne pas perdre
          d&apos;émargement/quiz).
        </p>
      )}

      {msg && (
        <p
          className={`text-xs font-medium ${
            msg.ok ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {msg.text}
        </p>
      )}

      <button
        type="button"
        onClick={doMerge}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white dark:text-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60 min-h-[40px]"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GitMerge className="h-4 w-4" />
        )}
        Fusionner dans la fiche conservée
      </button>
    </div>
  );
}

export function MergeDuplicates({ groups }: { groups: DupGroup[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-cyan-200 bg-cyan-50 dark:bg-cyan-950/20 p-4 text-sm text-cyan-900 dark:text-cyan-200">
        <strong>{groups.length}</strong> groupe(s) de doublons potentiels
        détecté(s). Vérifiez bien qu&apos;il s&apos;agit de la même personne
        avant de fusionner — l&apos;opération est <strong>définitive</strong>.
      </div>
      {groups.map((g) => (
        <GroupCard key={g.key} group={g} />
      ))}
    </div>
  );
}
