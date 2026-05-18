/**
 * Modèles personnalisables des documents Qualiopi (convocation, émargement).
 *
 * Les blocs `html_*` sont stockés en HTML enrichi (issu de TipTap), à injecter
 * tels quels dans la page d'impression via dangerouslySetInnerHTML.
 */

export type ConvocationBlocks = {
  /** Paragraphe d'introduction. */
  intro_html: string;
  /** Recommandations / consignes pratiques avant la session. */
  recommendations_html: string;
  /** Formule de politesse + signature. */
  closing_html: string;
  /** Mentions complémentaires en pied (en plus des mentions légales orga). */
  extra_legal_html: string;
  /** Style du cadre "Consignes de connexion" affiché sur les
   *  convocations distancielles. Permet d'ajuster taille / couleurs
   *  pour le distinguer visuellement du reste du document. */
  consignes_style: ConvocationConsignesStyle;
};

export type ConvocationConsignesStyle = {
  /** Taille du texte dans le cadre (pt). 9-14 raisonnable. */
  font_size_pt: number;
  /** Couleur du texte (#hex). */
  text_color: string;
  /** Couleur de fond du cadre (#hex). */
  bg_color: string;
  /** Couleur de la bordure du cadre (#hex). */
  border_color: string;
};

/**
 * Modèle EMAIL de la convention de formation : texte personnalisable de
 * l'email envoyé au contact RH avec la convention PDF en pièce jointe.
 *
 * Variables substituables (au moment de l'envoi) :
 *   {{contact_name}}    nom du contact RH
 *   {{formation_title}} titre de la formation
 *   {{company_name}}    raison sociale de l'entreprise bénéficiaire
 *   {{org_name}}        nom de l'organisme de formation
 *   {{public_url}}      lien de signature en ligne
 *   {{signature_button}}  bouton "Signer la convention en ligne" (HTML prêt)
 */
export type ConventionEmailBlocks = {
  /** Sujet de l'email (texte simple, variables {{...}} OK). */
  subject_template: string;
  /** Paragraphe d'introduction (HTML riche, ex: "Bonjour {{contact_name}},"). */
  intro_html: string;
  /** Corps principal de l'email (description + bouton de signature). */
  main_html: string;
  /** Formule de clôture (signature). */
  closing_html: string;
};

/**
 * Modèle EMAIL de la CONVOCATION : texte personnalisable de l'email
 * envoyé à l'apprenant avec la convocation PDF en pièce jointe.
 *
 * Variables substituables :
 *   {{learner_name}}    nom + prénom de l'apprenant
 *   {{learner_civility}} civilité (M. / Mme)
 *   {{formation_title}} titre de la formation
 *   {{session_date}}    date(s) de session
 *   {{session_location}} lieu (Distanciel ou adresse)
 *   {{duration_days}}   durée en jours
 *   {{duration_hours}}  nombre d'heures
 *   {{company_name}}    raison sociale (si apprenant rattaché à une société)
 *   {{org_name}}        nom de l'organisme de formation
 */
export type ConvocationEmailBlocks = {
  subject_template: string;
  intro_html: string;
  main_html: string;
  closing_html: string;
};

/**
 * Email envoyé AU FORMATEUR (animateur) lors de la confirmation
 * d'une session. Variables disponibles :
 *   {{trainer_name}}        nom complet du formateur
 *   {{formation_title}}     intitulé de la formation
 *   {{client_name}}         entreprise(s) bénéficiaire(s)
 *   {{session_date}}        dates de la session (formatées FR)
 *   {{session_hours}}       horaires (matin / après-midi)
 *   {{duration_hours}}      durée totale
 *   {{session_modality}}    présentiel / distanciel / hybride
 *   {{session_location}}    lieu ou lien de connexion
 *   {{nb_participants}}     nombre d'apprenants inscrits
 *   {{org_name}}            nom de l'organisme
 *   {{portal_url}}          lien vers le portail formateur
 */
export type TrainerConvocationEmailBlocks = {
  subject_template: string;
  intro_html: string;
  main_html: string;
  closing_html: string;
};

export type EmargementBlocks = {
  /** Texte d'en-tête (au-dessus de la grille). */
  header_html: string;
  /** Texte de pied (sous la grille de signatures). */
  footer_html: string;
};

/**
 * Configuration typographique partagée entre header et footer des
 * documents. Permet de paramétrer police, taille et couleur du texte
 * (R10 — Gilles 2026-05-14, customisation des templates).
 *
 * Les polices disponibles sont limitées à celles supportées par
 * Puppeteer dans son env de rendu PDF + lisibles à l'écran (sans
 * chargement de webfonts externes pour éviter les bugs de rendu).
 */
export type DocTypography = {
  /** Famille de police : "Calibri", "Arial", "Helvetica", "Times", "Georgia". */
  font_family: string;
  /** Taille de police en points (pt). Range raisonnable : 7-12. */
  font_size_pt: number;
  /** Couleur du texte (CSS color, ex: "#475569"). */
  text_color: string;
};

export const FONT_FAMILY_OPTIONS = [
  { value: "Calibri", label: "Calibri" },
  { value: "Arial", label: "Arial" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Georgia", label: "Georgia" },
] as const;

/**
 * Configuration visuelle des en-têtes et pieds de page de la
 * CONVENTION de formation. L'utilisateur coche ce qu'il veut afficher,
 * et l'application génère le HTML automatiquement (cf. lib/pdf/templates.ts).
 *
 * Pas de HTML à écrire pour l'utilisateur.
 */
export type ConventionHeaderConfig = DocTypography & {
  /** Afficher le logo de l'organisation (à gauche). */
  show_logo: boolean;
  /** Afficher le titre du document "Convention — <Formation>" (à droite). */
  show_title: boolean;
  /** Couleur de la bordure en bas de l'en-tête (séparateur). */
  border_color: string;
};

export type ConventionFooterConfig = DocTypography & {
  show_org_name: boolean;
  show_org_address: boolean;
  show_org_siret: boolean;
  show_org_nda: boolean;
  show_org_phone: boolean;
  show_org_email: boolean;
  /** Afficher "Page X / Y" à droite. */
  show_page_number: boolean;
  /** Couleur de la bordure en haut du pied (séparateur). */
  border_color: string;
};

export type ConventionDocBlocks = {
  header: ConventionHeaderConfig;
  footer: ConventionFooterConfig;
};

/** Typographie par défaut pour header et footer. */
const DEFAULT_TYPOGRAPHY: DocTypography = {
  font_family: "Calibri",
  font_size_pt: 9,
  text_color: "#475569",
};

export const DEFAULT_CONVENTION_DOC_BLOCKS: ConventionDocBlocks = {
  header: {
    ...DEFAULT_TYPOGRAPHY,
    // Par défaut, PAS de logo dans le mini-header répété sur chaque
    // page : le GRAND en-tête (logo + coords) figure déjà dans le
    // corps de la page 1, donc ce serait un doublon visuel.
    show_logo: false,
    show_title: true,
    border_color: "#1e40af",
  },
  footer: {
    ...DEFAULT_TYPOGRAPHY,
    font_size_pt: 8, // footer légèrement plus petit que header
    show_org_name: true,
    show_org_address: true,
    show_org_siret: true,
    show_org_nda: true,
    show_org_phone: true,
    show_org_email: true,
    show_page_number: true,
    border_color: "#1e40af",
  },
};

export type DocumentTemplate = {
  id: string;
  organization_id: string;
  type: "convocation" | "emargement";
  color_primary: string;
  color_secondary: string;
  blocks: ConvocationBlocks | EmargementBlocks;
  created_at: string;
  updated_at: string;
};

export const DEFAULT_CONVOCATION_CONSIGNES_STYLE: ConvocationConsignesStyle = {
  font_size_pt: 11,
  // Bleu foncé pour la lisibilité (avant : #334155 gris-bleu).
  text_color: "#1e40af",
  bg_color: "#eff6ff",
  border_color: "#bfdbfe",
};

export const DEFAULT_CONVOCATION_BLOCKS: ConvocationBlocks = {
  intro_html: `<p>Nous avons le plaisir de vous confirmer votre inscription à la formation indiquée ci-dessus, organisée par notre organisme.</p><p>Vous trouverez ci-dessous les informations pratiques relatives à cette session.</p>`,
  recommendations_html: `<p>En cas d'empêchement, merci de nous prévenir dans les meilleurs délais par SMS au <strong>06 65 02 31 32</strong> ou par email <strong>contact@capnumerique.com</strong>.</p><p>Nous vous souhaitons une excellente formation.</p>`,
  closing_html: `<p>Bien cordialement,</p>`,
  extra_legal_html: ``,
  consignes_style: DEFAULT_CONVOCATION_CONSIGNES_STYLE,
};

/**
 * Contenu par défaut de l'email de convention (= texte historiquement
 * codé en dur dans actions.ts avant la mise en place de ce modèle).
 * Si Gilles ne touche à rien, le comportement reste identique.
 */
export const DEFAULT_CONVENTION_EMAIL_BLOCKS: ConventionEmailBlocks = {
  subject_template: `Convention de formation à signer — {{formation_title}}`,
  intro_html: `<p>Bonjour {{contact_name}},</p>`,
  main_html: `<p>Veuillez trouver ci-joint la <strong>convention de formation</strong> relative à la session <strong>« {{formation_title}} »</strong>, à signer pour la société <strong>{{company_name}}</strong>.</p><p>Vous pouvez signer directement en ligne en cliquant sur le bouton ci-dessous :</p><p>{{signature_button}}</p><p>Lien valable 30 jours.</p>`,
  closing_html: `<p>Bien cordialement,<br/><strong>{{org_name}}</strong></p>`,
};

/**
 * Contenu par défaut de l'email de convocation. Reprend le ton de la
 * convocation existante (intro + infos pratiques + clôture).
 */
export const DEFAULT_CONVOCATION_EMAIL_BLOCKS: ConvocationEmailBlocks = {
  subject_template: `Convocation à la formation — {{formation_title}} ({{session_date}})`,
  intro_html: `<p>Bonjour {{learner_name}},</p>`,
  main_html: `<p>Nous avons le plaisir de vous confirmer votre inscription à la formation <strong>« {{formation_title}} »</strong>.</p><p>Vous trouverez ci-joint votre <strong>convocation</strong> avec toutes les informations pratiques :</p><ul><li><strong>Date(s) :</strong> {{session_date}}</li><li><strong>Durée :</strong> {{duration_days}} ({{duration_hours}})</li><li><strong>Lieu :</strong> {{session_location}}</li></ul><p>Merci de bien vouloir vous présenter 15 minutes avant le début de la session pour les formalités d'accueil.</p>`,
  closing_html: `<p>Bien cordialement,<br/><strong>{{org_name}}</strong></p>`,
};

/**
 * Modèle par défaut de la convocation FORMATEUR — basé sur le
 * texte fourni par Gilles (2026-05-16). Le formateur clique sur
 * {{portal_url}} pour accéder à son agenda et ses sessions.
 */
export const DEFAULT_TRAINER_CONVOCATION_EMAIL_BLOCKS: TrainerConvocationEmailBlocks = {
  subject_template: `Convocation animation — {{formation_title}} ({{session_date}})`,
  intro_html: `<p>Bonjour {{trainer_name}},</p>`,
  main_html: `<p>Nous vous informons que la session de formation suivante est <strong>confirmée et ouverte</strong> :</p>
<ul>
  <li><strong>Intitulé :</strong> {{formation_title}}</li>
  <li><strong>Client / entreprise bénéficiaire :</strong> {{client_name}}</li>
  <li><strong>Dates :</strong> {{session_date}}</li>
  <li><strong>Horaires :</strong> {{session_hours}}</li>
  <li><strong>Durée :</strong> {{duration_hours}}</li>
  <li><strong>Modalité :</strong> {{session_modality}}</li>
  <li><strong>Lieu / lien de connexion :</strong> {{session_location}}</li>
  <li><strong>Nombre de participants prévus :</strong> {{nb_participants}}</li>
</ul>
<p>Vous êtes convoqué(e) afin d'assurer l'animation pédagogique de cette session conformément au programme de formation validé.</p>
<p>Nous vous remercions de prévoir les éléments nécessaires au bon déroulement de l'action : support pédagogique, liste des participants, feuille d'émargement, test de positionnement, évaluation des acquis et évaluation à chaud, selon les modalités prévues pour cette session.</p>
<p>Merci également de nous signaler toute difficulté, absence, incident technique ou besoin particulier constaté avant ou pendant la formation.</p>
<p><strong>👉 Accéder à votre espace formateur :</strong> <a href="{{portal_url}}">{{portal_url}}</a></p>
<p>Vous y retrouverez l'agenda de vos sessions, la liste des participants, les supports, l'émargement et les évaluations.</p>
<p>Nous vous remercions de bien vouloir confirmer votre disponibilité pour cette intervention.</p>`,
  closing_html: `<p>Cordialement,<br/><strong>{{org_name}}</strong></p>`,
};

export const DEFAULT_EMARGEMENT_BLOCKS: EmargementBlocks = {
  header_html: `<p>Cette feuille d'émargement atteste de la présence des apprenants à la session de formation. Chaque apprenant signe pour chaque demi-journée à laquelle il participe.</p>`,
  footer_html: `<p><strong>Le formateur</strong> certifie l'exactitude des informations ci-dessus et atteste avoir dispensé l'action de formation conformément aux conditions de réalisation prévues.</p>`,
};

export function normalizeConvocationBlocks(raw: unknown): ConvocationBlocks {
  const r = (raw ?? {}) as Partial<ConvocationBlocks>;
  const cs = (r.consignes_style ?? {}) as Partial<ConvocationConsignesStyle>;
  const d = DEFAULT_CONVOCATION_CONSIGNES_STYLE;
  return {
    intro_html: r.intro_html ?? DEFAULT_CONVOCATION_BLOCKS.intro_html,
    recommendations_html:
      r.recommendations_html ??
      DEFAULT_CONVOCATION_BLOCKS.recommendations_html,
    closing_html: r.closing_html ?? DEFAULT_CONVOCATION_BLOCKS.closing_html,
    extra_legal_html:
      r.extra_legal_html ?? DEFAULT_CONVOCATION_BLOCKS.extra_legal_html,
    consignes_style: {
      font_size_pt: cs.font_size_pt ?? d.font_size_pt,
      text_color: cs.text_color ?? d.text_color,
      bg_color: cs.bg_color ?? d.bg_color,
      border_color: cs.border_color ?? d.border_color,
    },
  };
}

export function normalizeEmargementBlocks(raw: unknown): EmargementBlocks {
  const r = (raw ?? {}) as Partial<EmargementBlocks>;
  return {
    header_html: r.header_html ?? DEFAULT_EMARGEMENT_BLOCKS.header_html,
    footer_html: r.footer_html ?? DEFAULT_EMARGEMENT_BLOCKS.footer_html,
  };
}

export function normalizeConventionEmailBlocks(
  raw: unknown,
): ConventionEmailBlocks {
  const r = (raw ?? {}) as Partial<ConventionEmailBlocks>;
  const d = DEFAULT_CONVENTION_EMAIL_BLOCKS;
  return {
    subject_template: r.subject_template ?? d.subject_template,
    intro_html: r.intro_html ?? d.intro_html,
    main_html: r.main_html ?? d.main_html,
    closing_html: r.closing_html ?? d.closing_html,
  };
}

export function normalizeConvocationEmailBlocks(
  raw: unknown,
): ConvocationEmailBlocks {
  const r = (raw ?? {}) as Partial<ConvocationEmailBlocks>;
  const d = DEFAULT_CONVOCATION_EMAIL_BLOCKS;
  return {
    subject_template: r.subject_template ?? d.subject_template,
    intro_html: r.intro_html ?? d.intro_html,
    main_html: r.main_html ?? d.main_html,
    closing_html: r.closing_html ?? d.closing_html,
  };
}

export function normalizeTrainerConvocationEmailBlocks(
  raw: unknown,
): TrainerConvocationEmailBlocks {
  const r = (raw ?? {}) as Partial<TrainerConvocationEmailBlocks>;
  const d = DEFAULT_TRAINER_CONVOCATION_EMAIL_BLOCKS;
  return {
    subject_template: r.subject_template ?? d.subject_template,
    intro_html: r.intro_html ?? d.intro_html,
    main_html: r.main_html ?? d.main_html,
    closing_html: r.closing_html ?? d.closing_html,
  };
}

export function normalizeConventionDocBlocks(
  raw: unknown,
): ConventionDocBlocks {
  const r = (raw ?? {}) as Partial<ConventionDocBlocks>;
  const defaults = DEFAULT_CONVENTION_DOC_BLOCKS;
  return {
    header: {
      font_family: r.header?.font_family ?? defaults.header.font_family,
      font_size_pt: r.header?.font_size_pt ?? defaults.header.font_size_pt,
      text_color: r.header?.text_color ?? defaults.header.text_color,
      show_logo: r.header?.show_logo ?? defaults.header.show_logo,
      show_title: r.header?.show_title ?? defaults.header.show_title,
      border_color: r.header?.border_color ?? defaults.header.border_color,
    },
    footer: {
      font_family: r.footer?.font_family ?? defaults.footer.font_family,
      font_size_pt: r.footer?.font_size_pt ?? defaults.footer.font_size_pt,
      text_color: r.footer?.text_color ?? defaults.footer.text_color,
      show_org_name: r.footer?.show_org_name ?? defaults.footer.show_org_name,
      show_org_address:
        r.footer?.show_org_address ?? defaults.footer.show_org_address,
      show_org_siret:
        r.footer?.show_org_siret ?? defaults.footer.show_org_siret,
      show_org_nda: r.footer?.show_org_nda ?? defaults.footer.show_org_nda,
      show_org_phone:
        r.footer?.show_org_phone ?? defaults.footer.show_org_phone,
      show_org_email:
        r.footer?.show_org_email ?? defaults.footer.show_org_email,
      show_page_number:
        r.footer?.show_page_number ?? defaults.footer.show_page_number,
      border_color: r.footer?.border_color ?? defaults.footer.border_color,
    },
  };
}
