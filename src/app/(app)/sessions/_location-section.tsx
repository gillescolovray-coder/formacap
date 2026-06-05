"use client";

import { useState } from "react";
import { MapPin, Video } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/section-header";
import { RichTextEditor } from "@/components/rich-text-editor";
import { MODALITY_LABELS, type FormationModality } from "@/lib/formations/types";
import type { TrainingSession } from "@/lib/sessions/types";
import {
  LocationPicker,
  type LocationPickerItem,
} from "./_location-picker";

/** Convertit un texte brut (avec sauts de ligne) en HTML simple
 *  (paragraphes <p> + listes à puces pour les lignes commençant par "•").
 *  Sert à initialiser l'éditeur riche depuis une valeur historique en
 *  texte brut, ou à appliquer un modèle prédéfini. */
function plainTextToHtml(text: string): string {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  const flushList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushList();
      continue;
    }
    if (line.startsWith("• ") || line.startsWith("- ")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${line.slice(2).trim()}</li>`);
    } else {
      flushList();
      out.push(`<p>${line}</p>`);
    }
  }
  flushList();
  return out.join("");
}

/** Détecte si une chaîne contient du HTML (présence d'une balise). */
function isHtmlContent(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

type Props = {
  session?: TrainingSession;
  locations?: LocationPickerItem[];
};

const VIDEO_APPS = [
  "Zoom",
  "Microsoft Teams",
  "Google Meet",
  "Webex",
  "GoToMeeting",
  "Skype",
  "Jitsi Meet",
  "Autre",
] as const;

const VIDEO_APP_TEMPLATES: Record<string, string> = {
  Zoom:
    "Cette session se déroule sur Zoom.\n\n• Cliquez sur le lien Zoom indiqué dans cette convocation 5 minutes avant le début.\n• Si vous n'avez pas l'application Zoom, vous pourrez rejoindre la session directement depuis votre navigateur (Chrome, Edge, Firefox).\n• Activez votre micro et votre caméra (obligatoire pour l'émargement Qualiopi).\n• En cas de souci de connexion, contactez votre formateur par téléphone.",
  "Microsoft Teams":
    "Cette session se déroule sur Microsoft Teams.\n\n• Cliquez sur le lien Teams indiqué dans cette convocation 5 minutes avant le début.\n• Vous pouvez rejoindre via l'application Teams (recommandé) ou directement depuis votre navigateur.\n• Aucun compte Microsoft n'est nécessaire pour rejoindre en tant qu'invité.\n• Activez votre micro et votre caméra (obligatoire pour l'émargement Qualiopi).\n• En cas de souci de connexion, contactez votre formateur par téléphone.",
  "Google Meet":
    "Cette session se déroule sur Google Meet.\n\n• Cliquez sur le lien Google Meet indiqué dans cette convocation 5 minutes avant le début.\n• Aucun compte Google n'est nécessaire pour rejoindre.\n• Meet fonctionne directement dans votre navigateur (Chrome conseillé), sans installation.\n• Activez votre micro et votre caméra (obligatoire pour l'émargement Qualiopi).\n• En cas de souci de connexion, contactez votre formateur par téléphone.",
  Webex:
    "Cette session se déroule sur Cisco Webex.\n\n• Cliquez sur le lien Webex indiqué dans cette convocation 5 minutes avant le début.\n• Vous pouvez rejoindre via l'application Webex ou directement depuis votre navigateur.\n• Activez votre micro et votre caméra (obligatoire pour l'émargement Qualiopi).\n• En cas de souci de connexion, contactez votre formateur par téléphone.",
  GoToMeeting:
    "Cette session se déroule sur GoToMeeting.\n\n• Cliquez sur le lien GoToMeeting indiqué dans cette convocation 5 minutes avant le début.\n• L'application GoToMeeting peut s'installer automatiquement au premier lancement.\n• Activez votre micro et votre caméra (obligatoire pour l'émargement Qualiopi).\n• En cas de souci de connexion, contactez votre formateur par téléphone.",
  Skype:
    "Cette session se déroule sur Skype.\n\n• Cliquez sur le lien Skype indiqué dans cette convocation 5 minutes avant le début.\n• Skype peut être utilisé via l'application ou directement depuis votre navigateur (Skype for Web).\n• Activez votre micro et votre caméra (obligatoire pour l'émargement Qualiopi).\n• En cas de souci de connexion, contactez votre formateur par téléphone.",
  "Jitsi Meet":
    "Cette session se déroule sur Jitsi Meet.\n\n• Cliquez sur le lien Jitsi indiqué dans cette convocation 5 minutes avant le début.\n• Aucun compte n'est nécessaire, Jitsi fonctionne directement dans votre navigateur.\n• Activez votre micro et votre caméra (obligatoire pour l'émargement Qualiopi).\n• En cas de souci de connexion, contactez votre formateur par téléphone.",
};

/** Ensemble des textes pré-générés (plain text) : permet de détecter
 *  les valeurs historiques saisies en texte brut. */
const TEMPLATE_TEXTS = new Set(Object.values(VIDEO_APP_TEMPLATES));

/** Versions HTML des modèles (utilisées par l'éditeur riche). */
const VIDEO_APP_TEMPLATES_HTML: Record<string, string> = Object.fromEntries(
  Object.entries(VIDEO_APP_TEMPLATES).map(([k, v]) => [k, plainTextToHtml(v)]),
);
const TEMPLATE_HTMLS = new Set(Object.values(VIDEO_APP_TEMPLATES_HTML));

function isKnownApp(value: string): boolean {
  return (VIDEO_APPS as readonly string[]).includes(value) && value !== "Autre";
}

export function LocationSection({ session, locations }: Props) {
  const initialModality = (session?.modality ?? "") as FormationModality | "";
  const initialLocationId = session?.location_id ?? "";

  const initialVideoAppRaw = session?.video_app ?? "";
  const initialVideoAppSelect = initialVideoAppRaw
    ? isKnownApp(initialVideoAppRaw)
      ? initialVideoAppRaw
      : "Autre"
    : "";
  const initialVideoAppCustom =
    initialVideoAppRaw && !isKnownApp(initialVideoAppRaw)
      ? initialVideoAppRaw
      : "";

  const [modality, setModality] = useState<FormationModality | "">(
    initialModality,
  );
  const [locationId, setLocationId] = useState<string>(initialLocationId);
  const [videoAppSelect, setVideoAppSelect] = useState<string>(
    initialVideoAppSelect,
  );
  const [videoAppCustom, setVideoAppCustom] = useState<string>(
    initialVideoAppCustom,
  );
  // video_instructions est désormais stocké en HTML (TipTap). Pour les
  // sessions historiques saisies en texte brut, on convertit à la volée.
  const initialVideoInstructionsRaw = session?.video_instructions ?? "";
  const [videoInstructions, setVideoInstructions] = useState<string>(
    isHtmlContent(initialVideoInstructionsRaw)
      ? initialVideoInstructionsRaw
      : plainTextToHtml(initialVideoInstructionsRaw),
  );
  // Hybride : pourcentage du temps en présentiel (0-100). Le %
  // distanciel se déduit (100 - presentiel). Affiché dans la convention.
  const [presentielPercent, setPresentielPercent] = useState<string>(
    session?.presentiel_percent != null
      ? String(session.presentiel_percent)
      : "",
  );

  const showLocationBlock = modality !== "distanciel";
  const showVideoBlock = modality === "distanciel" || modality === "hybride";
  const showPercentBlock = modality === "hybride";
  const showFreeAddress = !locationId;
  const isCustomApp = videoAppSelect === "Autre";
  const effectiveVideoApp = isCustomApp ? videoAppCustom : videoAppSelect;

  const currentTemplateHtml = VIDEO_APP_TEMPLATES_HTML[videoAppSelect] ?? "";
  const isTextATemplate =
    videoInstructions.trim() === "" ||
    TEMPLATE_HTMLS.has(videoInstructions) ||
    TEMPLATE_TEXTS.has(videoInstructions);
  const showUseTemplateButton =
    !!currentTemplateHtml && videoInstructions !== currentTemplateHtml;

  const handleVideoAppChange = (value: string) => {
    setVideoAppSelect(value);
    if (value === "Autre") {
      // Si l'utilisateur passe sur "Autre" et que le texte courant
      // est un de nos modèles, on vide pour qu'il rédige le sien.
      if (
        TEMPLATE_HTMLS.has(videoInstructions) ||
        TEMPLATE_TEXTS.has(videoInstructions)
      ) {
        setVideoInstructions("");
      }
      return;
    }
    setVideoAppCustom("");
    const templateHtml = VIDEO_APP_TEMPLATES_HTML[value];
    if (!templateHtml) return;
    // On remplace le texte uniquement s'il est vide ou s'il s'agit
    // d'un de nos modèles (= pas personnalisé). Sinon, on préserve
    // le texte custom de l'utilisateur (un bouton lui permettra de
    // basculer manuellement sur le modèle s'il le souhaite).
    if (
      videoInstructions.trim() === "" ||
      TEMPLATE_HTMLS.has(videoInstructions) ||
      TEMPLATE_TEXTS.has(videoInstructions)
    ) {
      setVideoInstructions(templateHtml);
    }
  };

  const applyCurrentTemplate = () => {
    if (currentTemplateHtml) setVideoInstructions(currentTemplateHtml);
  };

  return (
    <section className="space-y-5">
      <SectionHeader
        icon={MapPin}
        title="Lieu & modalité"
        description="Adresse, salle ou lien visioconférence."
        accent="rose"
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="modality">Modalité</Label>
          <select
            id="modality"
            name="modality"
            value={modality}
            onChange={(e) =>
              setModality(e.target.value as FormationModality | "")
            }
            className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
          >
            <option value="">Présentiel / Distanciel / Hybride</option>
            {(
              Object.keys(MODALITY_LABELS) as Array<
                keyof typeof MODALITY_LABELS
              >
            ).map((key) => (
              <option key={key} value={key}>
                {MODALITY_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        {/* Hybride : répartition % présentiel / % distanciel.
            On stocke uniquement % présentiel, l'autre se déduit. */}
        {showPercentBlock && (
          <div className="md:col-span-2 space-y-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/15 p-4">
            <Label htmlFor="presentiel_percent">
              Répartition du temps de formation{" "}
              <span className="text-xs text-amber-700 dark:text-amber-300 font-normal">
                (obligatoire pour hybride — convention art. I)
              </span>
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id="presentiel_percent"
                name="presentiel_percent"
                type="number"
                min={0}
                max={100}
                step={1}
                value={presentielPercent}
                onChange={(e) => setPresentielPercent(e.target.value)}
                placeholder="Ex: 70"
                className="w-28"
              />
              <span className="text-sm">% en présentiel</span>
              <span className="text-sm text-slate-500">
                →{" "}
                {presentielPercent.trim() !== "" &&
                Number.isFinite(Number(presentielPercent)) &&
                Number(presentielPercent) >= 0 &&
                Number(presentielPercent) <= 100
                  ? `${100 - Number(presentielPercent)} % en distanciel`
                  : "— % en distanciel"}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Entrez le % de temps effectué en présentiel (le reste sera
              comptabilisé en distanciel). Ces taux apparaîtront dans la
              convention de formation.
            </p>
          </div>
        )}

        {/* Bloc Lieu : masqué si distanciel pur */}
        {showLocationBlock && (
          <>
            {locations && locations.length > 0 && (
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="location_id">
                  Lieu référencé{" "}
                  <span className="text-xs text-slate-500 font-normal">
                    (recommandé pour Qualiopi)
                  </span>
                </Label>
                <LocationPicker
                  locations={locations}
                  defaultValue={session?.location_id ?? null}
                  onChange={setLocationId}
                />
              </div>
            )}
            {showFreeAddress && (
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="location">
                  Adresse de la session (texte libre)
                </Label>
                <Input
                  id="location"
                  name="location"
                  defaultValue={session?.location ?? ""}
                  placeholder="Ex: Salle A, 12 rue de la Paix, 75002 Paris"
                />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  À renseigner obligatoirement si vous n&apos;avez pas
                  sélectionné un lieu référencé.
                </p>
              </div>
            )}
          </>
        )}

        {/* Bloc Visio : visible uniquement si Distanciel ou Hybride */}
        {showVideoBlock && (
          <div className="md:col-span-2 space-y-4 rounded-lg border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/30 dark:bg-cyan-950/15 p-4">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-cyan-700 dark:text-cyan-400" />
              <p className="text-sm font-semibold text-cyan-900 dark:text-cyan-200">
                Visioconférence
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="video_app_select">Application utilisée</Label>
                <select
                  id="video_app_select"
                  value={videoAppSelect}
                  onChange={(e) => handleVideoAppChange(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                >
                  <option value="">— Choisir une application —</option>
                  {VIDEO_APPS.map((app) => (
                    <option key={app} value={app}>
                      {app}
                    </option>
                  ))}
                </select>
                {/* Valeur réellement envoyée au serveur */}
                <input
                  type="hidden"
                  name="video_app"
                  value={effectiveVideoApp}
                />
                {isCustomApp && (
                  <Input
                    placeholder="Nom de l'application"
                    value={videoAppCustom}
                    onChange={(e) => setVideoAppCustom(e.target.value)}
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="video_link">Lien de la visio</Label>
                <Input
                  id="video_link"
                  name="video_link"
                  type="url"
                  defaultValue={session?.video_link ?? ""}
                  placeholder="https://…"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="video_instructions">
                  Consignes de connexion (reprises dans la convocation)
                </Label>
                {showUseTemplateButton && (
                  <button
                    type="button"
                    onClick={applyCurrentTemplate}
                    className="text-xs font-medium text-cyan-700 dark:text-cyan-400 hover:underline"
                    title={`Remplacer le texte par le modèle ${videoAppSelect}`}
                  >
                    ↻ Utiliser le modèle {videoAppSelect}
                  </button>
                )}
              </div>
              <RichTextEditor
                value={videoInstructions}
                onChange={setVideoInstructions}
                placeholder="Ex : Connectez-vous 5 minutes avant le début. Activez votre micro et caméra. En cas de souci, contactez le formateur au …"
                minHeight={160}
              />
              {/* Valeur HTML envoyée au serveur */}
              <input
                type="hidden"
                name="video_instructions"
                value={videoInstructions}
              />
              <p className="text-xs text-slate-500">
                Ces consignes seront envoyées à l&apos;apprenant dans sa
                convocation (exigence Qualiopi). Vous pouvez mettre en
                forme le texte (gras, listes, couleurs…).
                {isTextATemplate
                  ? " Le texte change automatiquement quand vous changez d'application."
                  : " Texte personnalisé : il ne changera plus automatiquement."}
              </p>
            </div>
          </div>
        )}

        {/* Lien Drive des supports — override du programme (toujours visible).
            Vide = hérite de la formation. Accessible aux apprenants APRÈS
            émargement. Gilles 2026-06-05. */}
        <div className="space-y-1.5 mt-4">
          <Label htmlFor="support_drive_url">
            Lien des supports (Google Drive)
          </Label>
          <input
            id="support_drive_url"
            name="support_drive_url"
            type="url"
            defaultValue={session?.support_drive_url ?? ""}
            placeholder="Laissez vide pour hériter du lien du programme"
            className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-zinc-900 px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
          />
          <p className="text-xs text-zinc-500">
            Vide = utilise le lien du programme de formation. Accessible aux
            apprenants <strong>après leur émargement</strong>.
          </p>
        </div>
      </div>
    </section>
  );
}
