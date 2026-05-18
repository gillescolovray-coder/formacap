"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/rich-text-editor";
import type {
  ConventionDocBlocks,
  ConventionEmailBlocks,
  ConvocationBlocks,
  ConvocationEmailBlocks,
  EmargementBlocks,
  DocTypography,
  TrainerConvocationEmailBlocks,
} from "@/lib/document-templates/types";
import { FONT_FAMILY_OPTIONS } from "@/lib/document-templates/types";
import {
  saveConventionDocTemplate,
  saveConventionEmailTemplate,
  saveConvocationEmailTemplate,
  saveConvocationTemplate,
  saveEmargementTemplate,
  saveTrainerConvocationEmailTemplate,
} from "./actions";

const DEFAULT_PRIMARY = "#1e40af";
const DEFAULT_SECONDARY = "#06b6d4";

export function ConvocationForm({
  initial,
}: {
  initial: {
    color_primary: string;
    color_secondary: string;
    blocks: ConvocationBlocks;
  };
}) {
  const [intro, setIntro] = useState(initial.blocks.intro_html);
  const [reco, setReco] = useState(initial.blocks.recommendations_html);
  const [closing, setClosing] = useState(initial.blocks.closing_html);
  const [legal, setLegal] = useState(initial.blocks.extra_legal_html);
  // Style du cadre "Consignes de connexion" (distanciel)
  const [consignesFontSize, setConsignesFontSize] = useState(
    String(initial.blocks.consignes_style.font_size_pt),
  );
  const [consignesTextColor, setConsignesTextColor] = useState(
    initial.blocks.consignes_style.text_color,
  );
  const [consignesBgColor, setConsignesBgColor] = useState(
    initial.blocks.consignes_style.bg_color,
  );
  const [consignesBorderColor, setConsignesBorderColor] = useState(
    initial.blocks.consignes_style.border_color,
  );

  return (
    <form action={saveConvocationTemplate} className="space-y-6">
      <input type="hidden" name="intro_html" value={intro} />
      <input type="hidden" name="recommendations_html" value={reco} />
      <input type="hidden" name="closing_html" value={closing} />
      <input type="hidden" name="extra_legal_html" value={legal} />
      <input
        type="hidden"
        name="consignes_font_size_pt"
        value={consignesFontSize}
      />
      <input
        type="hidden"
        name="consignes_text_color"
        value={consignesTextColor}
      />
      <input
        type="hidden"
        name="consignes_bg_color"
        value={consignesBgColor}
      />
      <input
        type="hidden"
        name="consignes_border_color"
        value={consignesBorderColor}
      />

      <ColorRow
        defaultPrimary={initial.color_primary || DEFAULT_PRIMARY}
        defaultSecondary={initial.color_secondary || DEFAULT_SECONDARY}
      />

      <Section
        title="Paragraphe d'introduction"
        hint="Affiché juste après le titre. Apparaîtra avec le nom de la formation et de l'organisme automatiquement injectés."
      >
        <RichTextEditor value={intro} onChange={setIntro} minHeight={120} />
      </Section>

      <Section
        title="Recommandations / consignes"
        hint="Texte affiché entre le bloc « Informations pratiques » et la signature."
      >
        <RichTextEditor value={reco} onChange={setReco} minHeight={140} />
      </Section>

      <Section title="Formule de clôture" hint="Affichée juste avant la signature de l'organisme.">
        <RichTextEditor value={closing} onChange={setClosing} minHeight={80} />
      </Section>

      <Section
        title="Mentions complémentaires en pied (optionnel)"
        hint="Texte affiché tout en bas, en plus des mentions légales d'organisation."
      >
        <RichTextEditor value={legal} onChange={setLegal} minHeight={80} />
      </Section>

      {/* Style du cadre "Consignes de connexion" (apparaît uniquement
          sur les convocations distancielles). Permet d'ajuster taille
          texte + couleurs pour cohérence avec la charte de l'OF. */}
      <Section
        title="Style du cadre « Consignes de connexion » (distanciel)"
        hint="Apparence visuelle du bloc affiché sur les convocations distancielles. Le contenu (Zoom, Teams…) reste éditable sur chaque session."
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px]">Taille texte (pt)</Label>
            <Input
              type="number"
              min={7}
              max={16}
              step={1}
              value={consignesFontSize}
              onChange={(e) => setConsignesFontSize(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <ColorPickerRow
            label="Couleur texte"
            value={consignesTextColor}
            onChange={setConsignesTextColor}
          />
          <ColorPickerRow
            label="Couleur fond"
            value={consignesBgColor}
            onChange={setConsignesBgColor}
          />
          <ColorPickerRow
            label="Couleur bordure"
            value={consignesBorderColor}
            onChange={setConsignesBorderColor}
          />
        </div>
        {/* Aperçu live */}
        <div
          className="mt-3 rounded-lg p-3"
          style={{
            backgroundColor: consignesBgColor,
            border: `1px solid ${consignesBorderColor}`,
            color: consignesTextColor,
            fontSize: `${consignesFontSize}pt`,
          }}
        >
          <div
            className="uppercase tracking-wider font-bold mb-1.5"
            style={{
              fontSize: `${Math.max(Number(consignesFontSize) - 2, 8)}pt`,
              color: consignesBorderColor,
            }}
          >
            Consignes de connexion
          </div>
          <p>
            Aperçu : ce cadre affichera le texte saisi dans le champ
            « Consignes de connexion » de chaque fiche session.
          </p>
        </div>
      </Section>

      <div className="flex justify-end">
        <Button type="submit">Enregistrer le modèle convocation</Button>
      </div>
    </form>
  );
}

/** Petit row réutilisable couleur (color picker + champ hex). */
function ColorPickerRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <div className="flex items-center gap-1">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent cursor-pointer shrink-0"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          pattern="^#[0-9a-fA-F]{6}$"
          className="font-mono text-xs h-9"
        />
      </div>
    </div>
  );
}

/**
 * Variables disponibles pour le sujet et les blocs HTML de l'email
 * convention. Centralisé ici pour rendre les boutons "Insérer" cohérents
 * entre les 4 champs (sujet + intro + corps + clôture).
 */
const EMAIL_VARIABLES: Array<{ value: string; label: string }> = [
  { value: "contact_name", label: "Nom contact" },
  { value: "learner_names", label: "Nom apprenant(s)" },
  { value: "formation_title", label: "Titre formation" },
  { value: "company_name", label: "Société" },
  { value: "org_name", label: "Organisme" },
  { value: "duration_days", label: "Durée jours" },
  { value: "duration_hours", label: "Durée heures" },
  { value: "session_date", label: "Date session" },
  { value: "session_location", label: "Lieu" },
  { value: "public_url", label: "Lien URL" },
  { value: "signature_button", label: "Bouton signer" },
];

/**
 * Variables disponibles pour l'email de convocation. Pas de contact_name
 * ni de signature_button (la convocation ne nécessite pas de signature
 * en ligne). En revanche, learner_name + learner_civility sont
 * spécifiques à l'apprenant destinataire.
 */
const CONVOCATION_EMAIL_VARIABLES: Array<{ value: string; label: string }> = [
  { value: "learner_civility", label: "Civilité" },
  { value: "learner_name", label: "Nom apprenant" },
  { value: "formation_title", label: "Titre formation" },
  { value: "session_date", label: "Date session" },
  { value: "session_location", label: "Lieu" },
  { value: "duration_days", label: "Durée jours" },
  { value: "duration_hours", label: "Durée heures" },
  { value: "company_name", label: "Société (si applicable)" },
  { value: "org_name", label: "Organisme" },
];

/** Variables pour l'email de convocation FORMATEUR (Sprint E). */
const TRAINER_CONVOCATION_EMAIL_VARIABLES: Array<{
  value: string;
  label: string;
}> = [
  { value: "trainer_name", label: "Nom formateur" },
  { value: "formation_title", label: "Titre formation" },
  { value: "client_name", label: "Entreprise cliente" },
  { value: "session_date", label: "Dates session" },
  { value: "session_hours", label: "Horaires" },
  { value: "duration_hours", label: "Durée totale" },
  { value: "session_modality", label: "Modalité" },
  { value: "session_location", label: "Lieu / lien" },
  { value: "nb_participants", label: "Nb participants" },
  { value: "org_name", label: "Organisme" },
  { value: "portal_url", label: "Lien portail formateur" },
];

/**
 * Barre de chips cliquables pour insérer une variable {{...}} dans un
 * éditeur (Input ou RichTextEditor). Évite à l'utilisateur de taper
 * les accolades manuellement et garantit que la variable est insérée
 * SANS mise en forme parasite (gras, couleur de la ligne précédente…).
 */
function VariableChips({
  onInsert,
  variables = EMAIL_VARIABLES,
}: {
  onInsert: (variableToken: string) => void;
  /** Liste des variables à proposer. Par défaut = EMAIL_VARIABLES
   *  (convention). Pour la convocation, on passe
   *  CONVOCATION_EMAIL_VARIABLES qui n'inclut pas signature_button. */
  variables?: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500 self-center mr-1">
        Insérer :
      </span>
      {variables.map((v) => (
        <button
          key={v.value}
          type="button"
          onClick={() => onInsert(`{{${v.value}}}`)}
          title={`Insère {{${v.value}}}`}
          className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 hover:bg-cyan-100 text-zinc-700 hover:text-cyan-900 border border-zinc-200 hover:border-cyan-300 transition-colors"
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Insère du texte au curseur dans un <input> contrôlé (réact). Met à
 * jour l'état via setValue et conserve le focus + le curseur juste
 * après le texte inséré.
 */
function insertIntoControlledInput(
  inputRef: React.RefObject<HTMLInputElement | null>,
  currentValue: string,
  setValue: (v: string) => void,
  text: string,
) {
  const el = inputRef.current;
  if (!el) {
    setValue(currentValue + text);
    return;
  }
  const start = el.selectionStart ?? currentValue.length;
  const end = el.selectionEnd ?? currentValue.length;
  const next = currentValue.slice(0, start) + text + currentValue.slice(end);
  setValue(next);
  // Replace cursor après le texte inséré au prochain render
  requestAnimationFrame(() => {
    el.focus();
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
  });
}

/**
 * Form d'édition du modèle EMAIL de la convention de formation.
 * Texte personnalisable (sujet + 3 blocs HTML) envoyé au contact RH
 * avec la convention en pièce jointe. Variables substituables :
 *   {{contact_name}} {{formation_title}} {{company_name}} {{org_name}}
 *   {{public_url}}   {{signature_button}}
 */
export function ConventionEmailForm({
  initial,
}: {
  initial: {
    blocks: ConventionEmailBlocks;
  };
}) {
  const [subject, setSubject] = useState(initial.blocks.subject_template);
  const [intro, setIntro] = useState(initial.blocks.intro_html);
  const [main, setMain] = useState(initial.blocks.main_html);
  const [closing, setClosing] = useState(initial.blocks.closing_html);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const introRef = useRef<RichTextEditorHandle>(null);
  const mainRef = useRef<RichTextEditorHandle>(null);
  const closingRef = useRef<RichTextEditorHandle>(null);

  return (
    <form action={saveConventionEmailTemplate} className="space-y-6">
      <input type="hidden" name="intro_html" value={intro} />
      <input type="hidden" name="main_html" value={main} />
      <input type="hidden" name="closing_html" value={closing} />

      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900 space-y-1.5">
        <p className="font-semibold">
          Variables disponibles dans les textes (remplacées à l&apos;envoi)
        </p>
        <ul className="list-disc ml-5 space-y-0.5">
          <li>
            <code className="bg-white px-1 rounded">{"{{contact_name}}"}</code>{" "}
            — Nom du contact RH (ex: « Christina GIRARDIERE »)
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{learner_names}}"}</code>{" "}
            — Nom + prénom du/des apprenant(s) de cette société sur cette
            session, séparés par virgules (ex: « Jean DUPONT, Marie MARTIN »)
          </li>
          <li>
            <code className="bg-white px-1 rounded">
              {"{{formation_title}}"}
            </code>{" "}
            — Titre de la formation
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{company_name}}"}</code>{" "}
            — Raison sociale de la société bénéficiaire
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{org_name}}"}</code> —
            Nom de votre organisme
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{public_url}}"}</code> —
            Lien de signature en ligne (texte brut)
          </li>
          <li>
            <code className="bg-white px-1 rounded">
              {"{{signature_button}}"}
            </code>{" "}
            — Bouton bleu « Signer la convention en ligne » (HTML prêt à
            l&apos;emploi, à placer dans le corps)
          </li>
          <li className="pt-1 border-t border-amber-200 mt-1">
            <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700">
              Infos session / formation
            </span>
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{duration_days}}"}</code>{" "}
            — Durée en jours (ex: « 2 jours »)
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{duration_hours}}"}</code>{" "}
            — Nombre d&apos;heures (ex: « 14 h »)
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{session_date}}"}</code>{" "}
            — Date(s) de la session (ex: « Le 2 juin 2026 » ou « Du 2 au 3
            juin 2026 »)
          </li>
          <li>
            <code className="bg-white px-1 rounded">
              {"{{session_location}}"}
            </code>{" "}
            — Lieu (« Distanciel » ou adresse complète)
          </li>
        </ul>
      </div>

      <Section
        title="Sujet de l'email"
        hint="Texte affiché comme objet du mail. Clique sur une variable ci-dessous pour l'insérer au curseur."
      >
        <VariableChips
          onInsert={(token) =>
            insertIntoControlledInput(
              subjectInputRef,
              subject,
              setSubject,
              token,
            )
          }
        />
        <Input
          ref={subjectInputRef}
          name="subject_template"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Convention de formation à signer — {{formation_title}}"
        />
      </Section>

      <Section
        title="Paragraphe d'introduction"
        hint="Premier paragraphe (ex: « Bonjour {{contact_name}}, »)."
      >
        <VariableChips
          onInsert={(token) => introRef.current?.insertPlainText(token)}
        />
        <RichTextEditor
          ref={introRef}
          value={intro}
          onChange={setIntro}
          minHeight={80}
        />
      </Section>

      <Section
        title="Corps principal de l'email"
        hint="Texte explicatif + bouton de signature. Place la variable {{signature_button}} là où tu veux que le bouton bleu apparaisse."
      >
        <VariableChips
          onInsert={(token) => mainRef.current?.insertPlainText(token)}
        />
        <RichTextEditor
          ref={mainRef}
          value={main}
          onChange={setMain}
          minHeight={180}
        />
      </Section>

      <Section
        title="Formule de clôture / signature"
        hint="Affichée tout en bas du mail."
      >
        <VariableChips
          onInsert={(token) => closingRef.current?.insertPlainText(token)}
        />
        <RichTextEditor
          ref={closingRef}
          value={closing}
          onChange={setClosing}
          minHeight={80}
        />
      </Section>

      <div className="flex justify-end">
        <Button type="submit">Enregistrer le modèle email convention</Button>
      </div>
    </form>
  );
}

/**
 * Form d'édition du modèle EMAIL de la convocation. Identique en
 * structure au form convention_email mais avec les variables propres
 * à la convocation ({{learner_name}}, {{session_date}}, etc.).
 * Pas de bouton de signature : la convocation n'est pas signée.
 */
export function ConvocationEmailForm({
  initial,
}: {
  initial: {
    blocks: ConvocationEmailBlocks;
  };
}) {
  const [subject, setSubject] = useState(initial.blocks.subject_template);
  const [intro, setIntro] = useState(initial.blocks.intro_html);
  const [main, setMain] = useState(initial.blocks.main_html);
  const [closing, setClosing] = useState(initial.blocks.closing_html);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const introRef = useRef<RichTextEditorHandle>(null);
  const mainRef = useRef<RichTextEditorHandle>(null);
  const closingRef = useRef<RichTextEditorHandle>(null);

  return (
    <form action={saveConvocationEmailTemplate} className="space-y-6">
      <input type="hidden" name="intro_html" value={intro} />
      <input type="hidden" name="main_html" value={main} />
      <input type="hidden" name="closing_html" value={closing} />

      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900 space-y-1.5">
        <p className="font-semibold">
          Variables disponibles dans les textes (remplacées à l&apos;envoi)
        </p>
        <ul className="list-disc ml-5 space-y-0.5">
          <li>
            <code className="bg-white px-1 rounded">{"{{learner_civility}}"}</code>{" "}
            — Civilité de l&apos;apprenant (M., Mme…)
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{learner_name}}"}</code>{" "}
            — Prénom + nom de l&apos;apprenant destinataire
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{formation_title}}"}</code>{" "}
            — Titre de la formation
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{session_date}}"}</code>{" "}
            — Date(s) de la session
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{session_location}}"}</code>{" "}
            — Lieu (Distanciel ou adresse)
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{duration_days}}"}</code>{" "}
            — Durée en jours (ex: « 2 jours »)
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{duration_hours}}"}</code>{" "}
            — Nombre d&apos;heures (ex: « 14 h »)
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{company_name}}"}</code>{" "}
            — Société de l&apos;apprenant (si applicable, vide sinon)
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{org_name}}"}</code> —
            Nom de votre organisme
          </li>
        </ul>
      </div>

      <Section
        title="Sujet de l'email"
        hint="Texte affiché comme objet du mail. Clique sur une variable ci-dessous pour l'insérer au curseur."
      >
        <VariableChips
          variables={CONVOCATION_EMAIL_VARIABLES}
          onInsert={(token) =>
            insertIntoControlledInput(
              subjectInputRef,
              subject,
              setSubject,
              token,
            )
          }
        />
        <Input
          ref={subjectInputRef}
          name="subject_template"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Convocation à la formation — {{formation_title}} ({{session_date}})"
        />
      </Section>

      <Section
        title="Paragraphe d'introduction"
        hint="Premier paragraphe (ex: « Bonjour {{learner_name}}, »)."
      >
        <VariableChips
          variables={CONVOCATION_EMAIL_VARIABLES}
          onInsert={(token) => introRef.current?.insertPlainText(token)}
        />
        <RichTextEditor
          ref={introRef}
          value={intro}
          onChange={setIntro}
          minHeight={80}
        />
      </Section>

      <Section
        title="Corps principal de l'email"
        hint="Description de la formation, infos pratiques (date, lieu, durée…)."
      >
        <VariableChips
          variables={CONVOCATION_EMAIL_VARIABLES}
          onInsert={(token) => mainRef.current?.insertPlainText(token)}
        />
        <RichTextEditor
          ref={mainRef}
          value={main}
          onChange={setMain}
          minHeight={180}
        />
      </Section>

      <Section
        title="Formule de clôture / signature"
        hint="Affichée tout en bas du mail."
      >
        <VariableChips
          variables={CONVOCATION_EMAIL_VARIABLES}
          onInsert={(token) => closingRef.current?.insertPlainText(token)}
        />
        <RichTextEditor
          ref={closingRef}
          value={closing}
          onChange={setClosing}
          minHeight={80}
        />
      </Section>

      <div className="flex justify-end">
        <Button type="submit">Enregistrer le modèle email convocation</Button>
      </div>
    </form>
  );
}

/**
 * Form d'édition du modèle EMAIL de convocation FORMATEUR (Sprint E).
 * Envoyé à l'animateur quand une session passe en statut "confirmed".
 * Le lien {{portal_url}} pointe vers son espace formateur.
 */
export function TrainerConvocationEmailForm({
  initial,
}: {
  initial: {
    blocks: TrainerConvocationEmailBlocks;
  };
}) {
  const [subject, setSubject] = useState(initial.blocks.subject_template);
  const [intro, setIntro] = useState(initial.blocks.intro_html);
  const [main, setMain] = useState(initial.blocks.main_html);
  const [closing, setClosing] = useState(initial.blocks.closing_html);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const introRef = useRef<RichTextEditorHandle>(null);
  const mainRef = useRef<RichTextEditorHandle>(null);
  const closingRef = useRef<RichTextEditorHandle>(null);

  return (
    <form action={saveTrainerConvocationEmailTemplate} className="space-y-6">
      <input type="hidden" name="intro_html" value={intro} />
      <input type="hidden" name="main_html" value={main} />
      <input type="hidden" name="closing_html" value={closing} />

      <div className="rounded-xl bg-cyan-50 border border-cyan-200 p-4 text-xs text-cyan-900 space-y-1.5">
        <p className="font-semibold">
          Cet email est envoyé automatiquement au formateur quand vous
          cliquez sur «&nbsp;Confirmer la session&nbsp;».
        </p>
        <p className="text-cyan-800">
          Variables disponibles (remplacées à l&apos;envoi) :
        </p>
        <ul className="list-disc ml-5 space-y-0.5">
          <li>
            <code className="bg-white px-1 rounded">{"{{trainer_name}}"}</code>{" "}
            — Nom complet du formateur
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{formation_title}}"}</code>{" "}
            — Titre de la formation
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{client_name}}"}</code>{" "}
            — Entreprise(s) bénéficiaire(s)
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{session_date}}"}</code>{" "}
            — Dates de la session
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{session_hours}}"}</code>{" "}
            — Horaires (matin–après-midi)
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{duration_hours}}"}</code>{" "}
            — Durée totale
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{session_modality}}"}</code>{" "}
            — Présentiel / Distanciel / Hybride
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{session_location}}"}</code>{" "}
            — Lieu ou lien de connexion
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{nb_participants}}"}</code>{" "}
            — Nombre d&apos;apprenants inscrits
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{org_name}}"}</code> —
            Nom de votre organisme
          </li>
          <li>
            <code className="bg-white px-1 rounded">{"{{portal_url}}"}</code>{" "}
            — Lien vers le portail formateur (à conserver dans le mail)
          </li>
        </ul>
      </div>

      <Section
        title="Sujet de l'email"
        hint="Texte affiché comme objet du mail. Clique sur une variable pour l'insérer au curseur."
      >
        <VariableChips
          variables={TRAINER_CONVOCATION_EMAIL_VARIABLES}
          onInsert={(token) =>
            insertIntoControlledInput(
              subjectInputRef,
              subject,
              setSubject,
              token,
            )
          }
        />
        <Input
          ref={subjectInputRef}
          name="subject_template"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Convocation animation — {{formation_title}} ({{session_date}})"
        />
      </Section>

      <Section
        title="Paragraphe d'introduction"
        hint="Premier paragraphe (ex: « Bonjour {{trainer_name}}, »)."
      >
        <VariableChips
          variables={TRAINER_CONVOCATION_EMAIL_VARIABLES}
          onInsert={(token) => introRef.current?.insertPlainText(token)}
        />
        <RichTextEditor
          ref={introRef}
          value={intro}
          onChange={setIntro}
          minHeight={80}
        />
      </Section>

      <Section
        title="Corps principal de l'email"
        hint="Description de la session, demandes, et IMPORTANT : conserver le lien {{portal_url}} pour que le formateur accède à son portail."
      >
        <VariableChips
          variables={TRAINER_CONVOCATION_EMAIL_VARIABLES}
          onInsert={(token) => mainRef.current?.insertPlainText(token)}
        />
        <RichTextEditor
          ref={mainRef}
          value={main}
          onChange={setMain}
          minHeight={240}
        />
      </Section>

      <Section
        title="Formule de clôture / signature"
        hint="Affichée tout en bas du mail."
      >
        <VariableChips
          variables={TRAINER_CONVOCATION_EMAIL_VARIABLES}
          onInsert={(token) => closingRef.current?.insertPlainText(token)}
        />
        <RichTextEditor
          ref={closingRef}
          value={closing}
          onChange={setClosing}
          minHeight={80}
        />
      </Section>

      <div className="flex justify-end">
        <Button type="submit">Enregistrer le modèle email formateur</Button>
      </div>
    </form>
  );
}

/**
 * Form d'édition VISUELLE (cases à cocher) du modèle convention.
 * L'utilisateur n'a aucun HTML à écrire — il sélectionne juste ce
 * qu'il veut voir affiché dans l'en-tête et le pied de page.
 */
export function ConventionDocForm({
  initial,
}: {
  initial: {
    color_primary: string;
    color_secondary: string;
    blocks: ConventionDocBlocks;
  };
}) {
  const [header, setHeader] = useState(initial.blocks.header);
  // Le footer est conservé dans le state UNIQUEMENT pour préserver les
  // données existantes en base (rétro-compatibilité du JSON `blocks`).
  // Il n'est plus éditable depuis cette page : le pied de page est
  // désormais configuré globalement dans Paramètres → Organisation →
  // « Mentions légales » et s'applique automatiquement à tous les
  // documents (convention, convocation, émargement, catalogue).
  const footer = initial.blocks.footer;

  return (
    <form action={saveConventionDocTemplate} className="space-y-6">
      <input type="hidden" name="blocks_json" value={JSON.stringify({ header, footer })} />
      <input type="hidden" name="color_primary" value={initial.color_primary} />
      <input
        type="hidden"
        name="color_secondary"
        value={initial.color_secondary}
      />

      <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-xs text-blue-900">
        Coche ce que tu veux afficher dans l&apos;en-tête de la convention.
        L&apos;application génère le PDF automatiquement.
      </div>

      {/* En-tête */}
      <Section
        title="En-tête (en haut de chaque page A4)"
        hint="Bandeau fin avec logo et titre du document."
      >
        <div className="space-y-3">
          <CheckboxRow
            label="Afficher le logo de l'organisme (à gauche)"
            checked={header.show_logo}
            onChange={(v) => setHeader({ ...header, show_logo: v })}
          />
          <CheckboxRow
            label="Afficher le titre du document (à droite)"
            description="Affiche 'Convention — <Titre formation>'"
            checked={header.show_title}
            onChange={(v) => setHeader({ ...header, show_title: v })}
          />
          <SingleColorRow
            label="Couleur du séparateur (ligne du bas)"
            value={header.border_color}
            onChange={(v) => setHeader({ ...header, border_color: v })}
          />
          <TypographyRow
            typo={{
              font_family: header.font_family,
              font_size_pt: header.font_size_pt,
              text_color: header.text_color,
            }}
            onChange={(t) => setHeader({ ...header, ...t })}
          />
        </div>
      </Section>

      {/* Pied de page — déplacé vers Paramètres > Organisation */}
      <Section
        title="Pied de page"
        hint="La configuration est centralisée pour tous les documents."
      >
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
          <p className="font-medium mb-1">
            Le pied de page se configure une seule fois pour tous les
            documents.
          </p>
          <p className="text-xs">
            Va dans{" "}
            <a
              href="/parametres/organisation#legal-mentions"
              className="underline font-medium hover:text-amber-700"
            >
              Paramètres → Organisation → « Mentions légales »
            </a>{" "}
            pour modifier le texte (nom, SIRET, NDA, adresse, etc.) avec mise
            en forme riche (gras, italique, couleurs). Il s&apos;applique
            automatiquement à la convention, la convocation, la feuille
            d&apos;émargement et le catalogue.
          </p>
        </div>
      </Section>

      {/* APERÇU LIVE — uniquement l'en-tête (le pied de page n'est plus
          édité ici). */}
      <Section
        title="🔍 Aperçu de l'en-tête (rendu dans le PDF)"
        hint="Voici à quoi ressemblera l'en-tête de la convention. Mis à jour en temps réel."
      >
        <ConventionPreview header={header} />
      </Section>

      <div className="flex justify-end">
        <Button type="submit">Enregistrer le modèle convention</Button>
      </div>
    </form>
  );
}

/**
 * Aperçu live de l'en-tête et du pied de page de la convention.
 * Utilise des données factices ("CAP NUMÉRIQUE", SIRET d'exemple…)
 * pour montrer le rendu visuel sans avoir à générer un PDF.
 */
function ConventionPreview({
  header,
}: {
  header: ConventionDocBlocks["header"];
}) {
  // Données factices pour la prévisualisation
  const sample = {
    orgName: "CAP NUMÉRIQUE",
    docTitle: "Convention — Tableau de Suivi & planning chantier",
  };

  return (
    <div className="space-y-4">
      {/* Aperçu en-tête */}
      <div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1.5">
          En-tête (haut de chaque page A4)
        </div>
        <div className="bg-white rounded-md border border-zinc-200 shadow-sm overflow-hidden">
          <div className="bg-zinc-50 text-[9px] uppercase tracking-wider text-zinc-400 px-2 py-0.5">
            Page A4
          </div>
          <div className="px-4 py-3 min-h-[40px]">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "0 5mm",
                borderBottom: `1px solid ${header.border_color}`,
                paddingBottom: "8px",
                fontFamily: "Calibri, sans-serif",
              }}
            >
              <div>
                {header.show_logo ? (
                  <div
                    style={{
                      fontWeight: "bold",
                      fontSize: "11px",
                      color: header.border_color,
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                    }}
                  >
                    [LOGO] {sample.orgName}
                  </div>
                ) : (
                  <div style={{ color: "#cbd5e1", fontSize: "10px", fontStyle: "italic" }}>
                    (Pas de logo)
                  </div>
                )}
              </div>
              <div>
                {header.show_title ? (
                  <div
                    style={{
                      textAlign: "right",
                      fontSize: "9px",
                      color: header.border_color,
                      fontWeight: "bold",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {sample.docTitle}
                  </div>
                ) : (
                  <div style={{ color: "#cbd5e1", fontSize: "10px", fontStyle: "italic" }}>
                    (Pas de titre)
                  </div>
                )}
              </div>
            </div>
            <div className="text-[10px] text-zinc-400 italic text-center mt-2">
              … corps de la convention …
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-zinc-500 italic">
        💡 L&apos;aperçu utilise des données factices. Dans le vrai PDF, les
        infos sont remplies depuis ton organisation (Paramètres → Organisation).
        Le pied de page se configure via{" "}
        <a
          href="/parametres/organisation#legal-mentions"
          className="underline"
        >
          Paramètres → Organisation → Mentions légales
        </a>
        .
      </p>
    </div>
  );
}

function CheckboxRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950/40 cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 mt-0.5 rounded border-zinc-300 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-[11px] text-zinc-500 mt-0.5">{description}</div>
        )}
      </div>
    </label>
  );
}

/**
 * Bloc de customisation typographique : police + taille + couleur.
 * Réutilisé pour le header et le footer du modèle convention (R10 —
 * Gilles 2026-05-14). L'utilisateur règle ces 3 paramètres ; on les
 * remonte au parent qui injecte dans le JSON `blocks.{header|footer}`.
 */
function TypographyRow({
  typo,
  onChange,
}: {
  typo: DocTypography;
  onChange: (next: DocTypography) => void;
}) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 p-3 mt-3 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Typographie
      </p>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">Police</Label>
          <select
            value={typo.font_family}
            onChange={(e) => onChange({ ...typo, font_family: e.target.value })}
            className="flex h-9 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 text-sm"
          >
            {FONT_FAMILY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Taille (pt)</Label>
          <Input
            type="number"
            min={6}
            max={14}
            step={1}
            value={typo.font_size_pt}
            onChange={(e) =>
              onChange({
                ...typo,
                font_size_pt: Number(e.target.value) || typo.font_size_pt,
              })
            }
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Couleur du texte</Label>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={typo.text_color}
              onChange={(e) =>
                onChange({ ...typo, text_color: e.target.value })
              }
              className="h-9 w-10 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent cursor-pointer shrink-0"
            />
            <Input
              value={typo.text_color}
              onChange={(e) =>
                onChange({ ...typo, text_color: e.target.value })
              }
              pattern="^#[0-9a-fA-F]{6}$"
              className="font-mono text-xs h-9"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SingleColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
      <Label className="text-xs flex-1">{label}</Label>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent cursor-pointer"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        pattern="^#[0-9a-fA-F]{6}$"
        required
        className="font-mono w-28"
      />
    </div>
  );
}

export function EmargementForm({
  initial,
}: {
  initial: {
    color_primary: string;
    color_secondary: string;
    blocks: EmargementBlocks;
  };
}) {
  const [header, setHeader] = useState(initial.blocks.header_html);
  const [footer, setFooter] = useState(initial.blocks.footer_html);

  return (
    <form action={saveEmargementTemplate} className="space-y-6">
      <input type="hidden" name="header_html" value={header} />
      <input type="hidden" name="footer_html" value={footer} />

      <ColorRow
        defaultPrimary={initial.color_primary || DEFAULT_PRIMARY}
        defaultSecondary={initial.color_secondary || DEFAULT_SECONDARY}
      />

      <Section
        title="Texte d'en-tête de la feuille"
        hint="Texte affiché au-dessus de la grille de signatures."
      >
        <RichTextEditor value={header} onChange={setHeader} minHeight={100} />
      </Section>

      <Section
        title="Texte de pied de page"
        hint="Texte affiché en dessous de la grille (attestation, mentions, etc.)."
      >
        <RichTextEditor value={footer} onChange={setFooter} minHeight={100} />
      </Section>

      <div className="flex justify-end">
        <Button type="submit">Enregistrer le modèle émargement</Button>
      </div>
    </form>
  );
}

function ColorRow({
  defaultPrimary,
  defaultSecondary,
}: {
  defaultPrimary: string;
  defaultSecondary: string;
}) {
  const [primary, setPrimary] = useState(defaultPrimary);
  const [secondary, setSecondary] = useState(defaultSecondary);
  return (
    <Section title="Couleurs" hint="Reprises sur le titre, les bordures, les badges.">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="color_primary">Couleur principale</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              className="h-9 w-12 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent cursor-pointer"
            />
            <Input
              name="color_primary"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              pattern="^#[0-9a-fA-F]{6}$"
              required
              className="font-mono"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="color_secondary">Couleur secondaire</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              className="h-9 w-12 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent cursor-pointer"
            />
            <Input
              name="color_secondary"
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              pattern="^#[0-9a-fA-F]{6}$"
              required
              className="font-mono"
            />
          </div>
        </div>
      </div>
    </Section>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-zinc-500 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
