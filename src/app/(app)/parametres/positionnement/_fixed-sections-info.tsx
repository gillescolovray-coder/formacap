import { Lock, Pencil } from "lucide-react";

/**
 * Aperçu des sections du test de positionnement qui NE SONT PAS
 * modifiables par template (texte / questions fixes pour tous les
 * organismes). Affiché sur l'éditeur et sur la page détail pour que
 * l'utilisateur comprenne où s'insèrent ses attentes (Section 2) et
 * ses compétences (Section 5) dans le test complet.
 *
 * Gilles 2026-05-25 : "il faut me montrer les parties qui ne sont
 * pas modifiables pour le moment".
 */
export function PositioningFixedSectionsInfo() {
  return (
    <details className="rounded-xl bg-zinc-50 border border-zinc-200 group">
      <summary className="cursor-pointer p-4 flex items-start gap-2.5 list-none">
        <div className="rounded-lg bg-zinc-200 text-zinc-600 p-2 shrink-0">
          <Lock className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-zinc-800">
            Structure complète du test (sections fixes)
          </h3>
          <p className="text-xs text-zinc-600 mt-0.5">
            Cliquez pour voir le détail des 5 sections{" "}
            <strong>non modifiables</strong> du test (questions communes à
            tous les organismes pour respecter Qualiopi).
          </p>
        </div>
        <span className="text-xs text-zinc-400 shrink-0 group-open:rotate-180 transition-transform">
          ▼
        </span>
      </summary>

      <div className="px-4 pb-4 space-y-2.5">
        <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
          💡 <strong>Ce qui est modifiable par template</strong> : seules
          la <strong>Section 2 (Attentes)</strong> et la{" "}
          <strong>Section 5 (Compétences à auto-évaluer)</strong> changent
          d&apos;un template à l&apos;autre. Le reste est identique pour
          tous les apprenants — choix volontaire pour garantir la
          cohérence Qualiopi.
        </div>

        <FixedSection
          number={0}
          title="Vos informations (auto-rempli)"
          fields={[
            "Apprenant (civilité + nom)",
            "Entreprise · Fonction",
            "Formation · Dates · Modalité · Organisme",
          ]}
        />

        <FixedSection
          number={1}
          title="Niveau initial"
          fields={[
            "Quel est votre niveau actuel sur le thème de la formation ? (Débutant / Intermédiaire / Confirmé / Expert)",
            "Avez-vous déjà pratiqué ce sujet dans votre activité professionnelle ? (Jamais / Occasionnellement / Régulièrement / Quotidiennement)",
          ]}
        />

        <EditableMarker number={2} title="Attentes et besoins" />

        <FixedSection
          number={3}
          title="Prérequis et conditions de participation"
          fields={[
            "Disposez-vous des prérequis indiqués dans le programme ? (Oui / Partiellement / Non / Je ne sais pas)",
            "Pour une formation à distance ou hybride, disposez-vous du matériel nécessaire ? (Oui / Non / Non concerné)",
          ]}
        />

        <FixedSection
          number={4}
          title="Situation de handicap ou besoin d'adaptation"
          fields={[
            "Signalement d'un besoin d'adaptation (oui / non)",
            "Si oui : précisions + souhait d'être recontacté(e) par l'organisme",
          ]}
        />

        <EditableMarker number={5} title="Compétences à auto-évaluer" />

        <FixedSection
          number={6}
          title="Adéquation de la formation"
          fields={[
            "Cette formation vous semble-t-elle adaptée à votre besoin ? (Oui totalement / Oui partiellement / Non / À vérifier avec le formateur)",
            "Commentaires éventuels (texte libre)",
          ]}
        />

        <FixedSection
          number={7}
          title="Signature (facultative)"
          fields={["Signature au doigt — non obligatoire"]}
        />
      </div>
    </details>
  );
}

function FixedSection({
  number,
  title,
  fields,
}: {
  number: number;
  title: string;
  fields: string[];
}) {
  return (
    <section className="rounded-md bg-white border border-zinc-200 p-3 opacity-90">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="shrink-0 h-6 w-6 rounded bg-zinc-100 text-zinc-600 text-xs font-bold flex items-center justify-center">
          {number}
        </span>
        <h4 className="text-sm font-semibold text-zinc-700">{title}</h4>
        <span
          className="ml-auto inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider text-zinc-400 font-bold"
          title="Section non modifiable par template"
        >
          <Lock className="h-2.5 w-2.5" />
          Fixe
        </span>
      </div>
      <ul className="space-y-0.5 ml-8">
        {fields.map((f, i) => (
          <li
            key={i}
            className="text-[11px] text-zinc-600 leading-relaxed"
          >
            • {f}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Marqueur visuel pour les 2 sections éditables — pointe vers
 *  les listes de l'éditeur ci-dessous. */
function EditableMarker({
  number,
  title,
}: {
  number: number;
  title: string;
}) {
  return (
    <section className="rounded-md bg-amber-50 border border-amber-300 border-dashed p-3">
      <div className="flex items-center gap-2">
        <span className="shrink-0 h-6 w-6 rounded bg-amber-200 text-amber-800 text-xs font-bold flex items-center justify-center">
          {number}
        </span>
        <h4 className="text-sm font-semibold text-amber-900">{title}</h4>
        <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider text-amber-700 font-bold">
          <Pencil className="h-2.5 w-2.5" />
          Modifiable par template
        </span>
      </div>
      <p className="text-[11px] text-amber-800 ml-8 mt-1 italic">
        ← contenu défini par <strong>ce template</strong> (voir
        l&apos;éditeur ci-dessous).
      </p>
    </section>
  );
}
