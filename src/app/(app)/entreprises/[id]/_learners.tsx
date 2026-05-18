import Link from "next/link";
import {
  ChevronDown,
  GraduationCap,
  Mail,
  Phone,
  Plus,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type LearnerRow = {
  id: string;
  first_name: string | null;
  last_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  is_active: boolean;
};

type Props = {
  companyId: string;
  learners: LearnerRow[];
};

/**
 * Section « Apprenants rattachés » d'une fiche entreprise.
 * Liste les apprenants déjà rattachés (lecture seule, lien vers leur fiche)
 * + bouton de création rapide qui pré-remplit l'entreprise via le query
 * param `?company_id=`.
 */
export function LearnersSection({ companyId, learners }: Props) {
  return (
    <details
      open={learners.length > 0}
      className="group rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden"
    >
      <summary className="cursor-pointer list-none px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-4 hover:bg-zinc-50/60 dark:hover:bg-zinc-950/30 transition-colors">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold inline-flex items-center gap-1.5">
            <GraduationCap className="h-4 w-4 text-emerald-600" />
            Apprenants rattachés
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Personnes de l&apos;entreprise inscrites (ou potentiellement
            inscrites) à une formation. Distinct des contacts entreprise
            ci-dessus.
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            {learners.length} apprenant{learners.length > 1 ? "s" : ""}{" "}
            rattaché{learners.length > 1 ? "s" : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href={`/apprenants/new?company_id=${companyId}`} />}
            title="Créer un nouvel apprenant rattaché à cette entreprise (l'entreprise sera pré-remplie)"
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Créer un apprenant
          </Button>
          <ChevronDown
            className="h-4 w-4 text-zinc-400 transition-transform group-open:rotate-180"
            aria-hidden
          />
        </div>
      </summary>

      {learners.length === 0 ? (
        <div className="px-6 py-6 text-center text-sm text-slate-500">
          Aucun apprenant rattaché pour le moment. Cliquez sur «&nbsp;Créer
          un apprenant&nbsp;» pour en ajouter un.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {learners.map((l) => {
            const fullName = `${l.first_name ?? ""} ${l.last_name}`.trim();
            const initials =
              `${l.first_name?.[0] ?? ""}${l.last_name?.[0] ?? ""}`.toUpperCase() ||
              "?";
            return (
              <li
                key={l.id}
                className="px-6 py-3 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs font-bold flex items-center justify-center">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/apprenants/${l.id}`}
                      className="font-semibold text-sm hover:underline inline-flex items-center gap-2"
                    >
                      {fullName}
                      {!l.is_active && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                          Inactif
                        </span>
                      )}
                    </Link>
                    <p className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                      {l.job_title && (
                        <span className="font-medium">{l.job_title}</span>
                      )}
                      {l.email && (
                        <a
                          href={`mailto:${l.email}`}
                          className="inline-flex items-center gap-1 text-cyan-700 hover:underline"
                        >
                          <Mail className="h-3 w-3" />
                          {l.email}
                        </a>
                      )}
                      {l.mobile ? (
                        <a
                          href={`tel:${l.mobile}`}
                          className="inline-flex items-center gap-1 hover:text-cyan-700 tabular-nums"
                        >
                          <Smartphone className="h-3 w-3" />
                          {l.mobile}
                        </a>
                      ) : l.phone ? (
                        <a
                          href={`tel:${l.phone}`}
                          className="inline-flex items-center gap-1 hover:text-cyan-700 tabular-nums"
                        >
                          <Phone className="h-3 w-3" />
                          {l.phone}
                        </a>
                      ) : null}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
