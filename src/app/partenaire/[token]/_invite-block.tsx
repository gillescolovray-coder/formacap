"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Globe, Handshake, Mail, Share2 } from "lucide-react";

type FilterKey = "all" | "distanciel" | "mine";

const FILTER_DEFS: Array<{
  key: FilterKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  param: string;
}> = [
  {
    key: "all",
    label: "Tout le catalogue",
    description: "Toutes les sessions visibles dans votre catalogue.",
    icon: Share2,
    param: "",
  },
  {
    key: "distanciel",
    label: "Distanciel uniquement",
    description: "Seulement les sessions INTER distanciel public.",
    icon: Globe,
    param: "distanciel",
  },
  {
    key: "mine",
    label: "Mes sessions (où je suis prescripteur)",
    description:
      "Seulement les sessions où vous êtes prescripteur référent.",
    icon: Handshake,
    param: "mine",
  },
];

/**
 * Bloc « Inviter mes entreprises » : 3 variantes de lien public selon
 * un filtre (tout / distanciel / sessions propres). Permet au partenaire
 * de diffuser des liens ciblés selon son destinataire.
 *
 * Aucun tarif visible côté apprenant final.
 */
export function InviteBlock({
  token,
  partnerName,
  organizationName,
  showOwnSessionsFilter,
}: {
  token: string;
  partnerName: string;
  organizationName: string;
  /** True pour afficher l'option « Mes sessions » (prescripteurs avec
   *  show_own_intra ; sinon le filtre n'a pas de sens). */
  showOwnSessionsFilter: boolean;
}) {
  const [origin, setOrigin] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const def =
    FILTER_DEFS.find((f) => f.key === activeFilter) ?? FILTER_DEFS[0];
  const publicUrl = origin
    ? def.param
      ? `${origin}/preinscription/${token}?filter=${def.param}`
      : `${origin}/preinscription/${token}`
    : "";

  async function copyLink() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const mailtoSubject = encodeURIComponent(
    `Inscription à nos formations ${organizationName}`,
  );
  const mailtoBody = encodeURIComponent(
    `Bonjour,

Vous trouverez ci-dessous le lien permettant de pré-inscrire vos collaborateurs à nos formations :

${publicUrl}

Remplissez le formulaire et nous reviendrons rapidement vers vous avec les modalités définitives (dates, lieu, tarif, modalités de financement).

Cordialement,
${partnerName}`,
  );

  const visibleFilters = FILTER_DEFS.filter(
    (f) => f.key !== "mine" || showOwnSessionsFilter,
  );

  return (
    <section className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 p-4 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <Share2 className="h-6 w-6 text-amber-700 shrink-0 mt-1" />
        <div>
          <h2 className="text-lg font-bold text-zinc-900">
            Inviter mes entreprises à se pré-inscrire
          </h2>
          <p className="text-sm text-zinc-700 mt-1">
            Choisissez quel sous-ensemble de votre catalogue diffuser, puis
            copiez le lien ou envoyez-le par email. Vos clients verront vos
            formations <strong>sans aucun tarif</strong> — vous appliquerez
            ensuite vos propres prix. Chaque pré-inscription apparaîtra dans
            l&apos;onglet « À valider ».
          </p>
        </div>
      </div>

      {/* Choix du filtre — un bouton-pastille par variante */}
      <div className="flex flex-wrap gap-2 mb-3">
        {visibleFilters.map((f) => {
          const Icon = f.icon;
          const active = activeFilter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveFilter(f.key)}
              className={
                active
                  ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-600 text-white text-xs font-bold shadow"
                  : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-amber-300 text-amber-800 text-xs font-medium hover:bg-amber-50"
              }
              title={f.description}
            >
              <Icon className="h-3.5 w-3.5" />
              {f.label}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-zinc-600 italic mb-2">{def.description}</p>

      <div className="bg-white rounded-lg border border-amber-200 p-3 mb-3">
        <p className="text-[10px] uppercase tracking-wider text-amber-700 font-bold mb-1">
          Lien public à diffuser
        </p>
        <code className="font-mono text-[11px] sm:text-xs text-zinc-700 break-all block">
          {publicUrl || "Chargement…"}
        </code>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:flex-wrap">
        <button
          type="button"
          onClick={copyLink}
          disabled={!publicUrl}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-50"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copié !
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copier le lien
            </>
          )}
        </button>
        {publicUrl && (
          <a
            href={`mailto:?subject=${mailtoSubject}&body=${mailtoBody}`}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-white border border-amber-300 text-amber-800 text-sm font-bold hover:bg-amber-50"
          >
            <Mail className="h-4 w-4" />
            Envoyer par email
          </a>
        )}
      </div>
    </section>
  );
}
