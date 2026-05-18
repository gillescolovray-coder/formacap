import type { CatalogBlocks } from "./types";

/**
 * Contenu pré-rempli quand on crée le catalogue pour la première fois.
 * Pensé pour CAP NUMÉRIQUE mais générique : l'utilisateur ajuste ensuite
 * dans l'admin /catalogue.
 */
export const DEFAULT_BLOCKS: CatalogBlocks = {
  presentation: {
    enabled: true,
    title: "Présentation",
    html: `<p>Notre cabinet accompagne <strong>PME et Grands Comptes</strong> dans leurs projets de formation. Nos formations peuvent avoir lieu en <strong>présentiel, distanciel ou blended</strong>.</p><p><em>Osez le changement, nous vous accompagnons dans vos besoins.</em></p>`,
  },
  about: {
    enabled: true,
    title: "Le fondateur",
    photo_url: null,
    html: `<p>Une triple compétence acquise au fil de plus de 25 ans d'expérience professionnelle dans le domaine de la construction/BTP, et une expertise reconnue en marchés publics.</p>`,
  },
  engagements: {
    enabled: true,
    title: "Nos engagements",
    intro:
      "Des garanties claires pour vos formations : notre engagement qualité et notre certification Qualiopi.",
    items: [
      {
        title: "Certification Qualiopi",
        description:
          "Processus certifié pour la catégorie « Action de Formation », gage de qualité reconnu par l'État.",
      },
      {
        title: "100 % de recommandation",
        description:
          "Sur les 12 derniers mois, l'intégralité de nos +650 apprenants recommandent les formations suivies.",
      },
      {
        title: "Formateur expert métier",
        description:
          "Tous nos intervenants sont des professionnels en activité, avec une expérience terrain prouvée.",
      },
      {
        title: "Pédagogie active",
        description:
          "Alternance théorie / pratique, mise en situation et exercices tout au long de la journée.",
      },
    ],
  },
  modalities: {
    enabled: true,
    title: "Choisissez la modalité qui vous convient",
    intro:
      "Présentiel, distanciel ou hybride : nous adaptons le format à vos contraintes et à votre objectif.",
    items: [
      {
        label: "Présentiel",
        description:
          "Sessions en groupe de 3 à 10 apprenants, dans vos locaux ou en inter-entreprise. Mise en situation et évaluation des acquis.",
      },
      {
        label: "Classe virtuelle",
        description:
          "De 3 à 7 personnes en visio. Partage d'écran, échanges en direct avec le formateur, évaluation des acquis.",
      },
      {
        label: "Blended Learning",
        description:
          "50 % présentiel + 50 % distanciel, avec un formateur référent qui suit votre progression jusqu'au bout.",
      },
      {
        label: "E-learning",
        description:
          "100 % digital, parcours d'intégration en autonomie sur notre plateforme LMS, accessible 24/7.",
      },
    ],
  },
  testimonials: {
    enabled: false,
    title: "Ils nous font confiance",
    intro:
      "Des entreprises de toutes tailles nous font confiance pour leurs formations.",
    items: [],
  },
  cta: {
    enabled: true,
    title: "Prenez votre futur en main",
    description: "Cliquez ci-dessous pour vous inscrire à l'une de nos formations ou nous contacter.",
    primary_label: "Je m'inscris",
    primary_url: "mailto:contact@example.com?subject=Inscription%20formation",
    secondary_label: "Nous contacter",
    secondary_url: "mailto:contact@example.com",
  },
  legal: {
    enabled: true,
    html: `<p>Les informations légales (raison sociale, SIRET, NDA, adresse) sont reprises automatiquement depuis vos paramètres d'organisation.</p>`,
  },
};

/**
 * Garantit qu'un objet "blocks" reçu depuis la BDD respecte le schéma attendu,
 * en complétant avec les valeurs par défaut les champs manquants.
 * Utile pour la rétro-compatibilité quand on enrichit le schéma.
 */
export function normalizeBlocks(raw: unknown): CatalogBlocks {
  const r = (raw ?? {}) as Partial<CatalogBlocks>;
  const safeArray = <T>(v: unknown, fallback: T[]): T[] =>
    Array.isArray(v) ? (v as T[]) : fallback;
  return {
    presentation: {
      enabled: r.presentation?.enabled ?? DEFAULT_BLOCKS.presentation.enabled,
      title: r.presentation?.title ?? DEFAULT_BLOCKS.presentation.title,
      html: r.presentation?.html ?? DEFAULT_BLOCKS.presentation.html,
    },
    about: {
      enabled: r.about?.enabled ?? DEFAULT_BLOCKS.about.enabled,
      title: r.about?.title ?? DEFAULT_BLOCKS.about.title,
      photo_url: r.about?.photo_url ?? null,
      html: r.about?.html ?? DEFAULT_BLOCKS.about.html,
    },
    engagements: {
      enabled: r.engagements?.enabled ?? DEFAULT_BLOCKS.engagements.enabled,
      title: r.engagements?.title ?? DEFAULT_BLOCKS.engagements.title,
      intro: r.engagements?.intro ?? DEFAULT_BLOCKS.engagements.intro,
      items: safeArray(r.engagements?.items, DEFAULT_BLOCKS.engagements.items),
    },
    modalities: {
      enabled: r.modalities?.enabled ?? DEFAULT_BLOCKS.modalities.enabled,
      title: r.modalities?.title ?? DEFAULT_BLOCKS.modalities.title,
      intro: r.modalities?.intro ?? DEFAULT_BLOCKS.modalities.intro,
      items: safeArray(r.modalities?.items, DEFAULT_BLOCKS.modalities.items),
    },
    testimonials: {
      enabled: r.testimonials?.enabled ?? DEFAULT_BLOCKS.testimonials.enabled,
      title: r.testimonials?.title ?? DEFAULT_BLOCKS.testimonials.title,
      intro: r.testimonials?.intro ?? DEFAULT_BLOCKS.testimonials.intro,
      items: safeArray(r.testimonials?.items, DEFAULT_BLOCKS.testimonials.items),
    },
    cta: {
      enabled: r.cta?.enabled ?? DEFAULT_BLOCKS.cta.enabled,
      title: r.cta?.title ?? DEFAULT_BLOCKS.cta.title,
      description: r.cta?.description ?? DEFAULT_BLOCKS.cta.description,
      primary_label: r.cta?.primary_label ?? DEFAULT_BLOCKS.cta.primary_label,
      primary_url: r.cta?.primary_url ?? DEFAULT_BLOCKS.cta.primary_url,
      secondary_label:
        r.cta?.secondary_label ?? DEFAULT_BLOCKS.cta.secondary_label,
      secondary_url: r.cta?.secondary_url ?? DEFAULT_BLOCKS.cta.secondary_url,
    },
    legal: {
      enabled: r.legal?.enabled ?? DEFAULT_BLOCKS.legal.enabled,
      html: r.legal?.html ?? DEFAULT_BLOCKS.legal.html,
    },
  };
}
