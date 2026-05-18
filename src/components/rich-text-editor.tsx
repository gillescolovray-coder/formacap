"use client";

import * as React from "react";
import { Extension } from "@tiptap/core";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";
import { TextAlign } from "@tiptap/extension-text-align";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Palette,
  Pilcrow,
  Plus,
  Quote,
  Type,
  Underline as UnderlineIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Extension TipTap minimale pour gérer la taille de police via un
 * attribut `fontSize` sur la marque `textStyle`. Stocke et restaure le
 * style inline `font-size` dans le HTML.
 */
const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] as string[] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null as string | null,
            parseHTML: (element: HTMLElement) =>
              element.style.fontSize?.replace(/['"]+/g, "") || null,
            renderHTML: (attrs: { fontSize?: string | null }) => {
              if (!attrs.fontSize) return {};
              return { style: `font-size: ${attrs.fontSize}` };
            },
          },
        },
      },
    ];
  },
});

/** Tailles disponibles via les boutons +/- (en pixels). */
const FONT_SIZES = ["10px", "12px", "14px", "16px", "18px", "20px", "24px", "30px", "36px"];
const DEFAULT_FONT_SIZE = "16px";

function adjustFontSize(editor: Editor, direction: 1 | -1) {
  const current =
    (editor.getAttributes("textStyle").fontSize as string | undefined) ||
    DEFAULT_FONT_SIZE;
  const idx = FONT_SIZES.indexOf(current);
  // Si non trouvé, on part de la taille par défaut
  const baseIdx = idx >= 0 ? idx : FONT_SIZES.indexOf(DEFAULT_FONT_SIZE);
  const nextIdx = Math.min(
    FONT_SIZES.length - 1,
    Math.max(0, baseIdx + direction),
  );
  const nextSize = FONT_SIZES[nextIdx];
  // setMark sur textStyle pour appliquer la nouvelle taille
  editor
    .chain()
    .focus()
    .setMark("textStyle", { fontSize: nextSize })
    .run();
}

const COLORS = [
  { label: "Noir", value: "#18181b" },
  { label: "Gris", value: "#71717a" },
  { label: "Rouge", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Vert", value: "#16a34a" },
  { label: "Bleu", value: "#2563eb" },
  { label: "Violet", value: "#9333ea" },
];

const FONT_FAMILIES = [
  { label: "Par défaut", value: "" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Times", value: '"Times New Roman", serif' },
  { label: "Courier", value: '"Courier New", monospace' },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
];

type ToolbarButtonProps = {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
};

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "h-8 w-8 inline-flex items-center justify-center rounded-md text-sm transition-colors",
        active
          ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
          : "text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 rounded-t-md">
      {/* Text style group */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Gras (Ctrl+B)"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Italique (Ctrl+I)"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        title="Souligné (Ctrl+U)"
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>

      <div className="h-5 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setParagraph().run()}
        active={editor.isActive("paragraph")}
        title="Paragraphe normal"
      >
        <Pilcrow className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        active={editor.isActive("heading", { level: 2 })}
        title="Titre de section"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        active={editor.isActive("heading", { level: 3 })}
        title="Sous-titre"
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>

      <div className="h-5 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Liste à puces"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Liste numérotée"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        title="Citation"
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>

      <div className="h-5 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        active={editor.isActive({ textAlign: "left" })}
        title="Aligner à gauche"
      >
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        active={editor.isActive({ textAlign: "center" })}
        title="Centrer"
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        active={editor.isActive({ textAlign: "right" })}
        title="Aligner à droite"
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>

      <div className="h-5 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

      {/* Color picker (dropdown) */}
      <div className="relative group">
        <button
          type="button"
          className="h-8 inline-flex items-center gap-1 px-2 rounded-md text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
          title="Couleur du texte"
        >
          <Palette className="h-4 w-4" />
        </button>
        <div className="absolute z-20 top-full left-0 mt-1 hidden group-hover:flex group-focus-within:flex flex-wrap gap-1 p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-md w-40">
          {COLORS.map((c) => (
            <button
              type="button"
              key={c.value}
              onClick={() =>
                editor.chain().focus().setColor(c.value).run()
              }
              title={c.label}
              className="h-6 w-6 rounded border border-zinc-300 dark:border-zinc-700"
              style={{ backgroundColor: c.value }}
            />
          ))}
          <button
            type="button"
            onClick={() => editor.chain().focus().unsetColor().run()}
            title="Retirer la couleur"
            className="h-6 px-2 text-xs rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Aucune
          </button>
        </div>
      </div>

      {/* Taille de police : boutons + et - */}
      <ToolbarButton
        onClick={() => adjustFontSize(editor, -1)}
        title="Diminuer la taille de la police"
      >
        <Minus className="h-3 w-3" />
        <span className="text-[10px] font-bold">A</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => adjustFontSize(editor, +1)}
        title="Augmenter la taille de la police"
      >
        <span className="text-[14px] font-bold leading-none">A</span>
        <Plus className="h-3 w-3" />
      </ToolbarButton>

      <div className="h-5 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

      {/* Font family */}
      <div className="relative group">
        <button
          type="button"
          className="h-8 inline-flex items-center gap-1 px-2 rounded-md text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
          title="Police"
        >
          <Type className="h-4 w-4" />
        </button>
        <div className="absolute z-20 top-full left-0 mt-1 hidden group-hover:flex group-focus-within:flex flex-col gap-0.5 p-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-md min-w-[160px]">
          {FONT_FAMILIES.map((f) => (
            <button
              type="button"
              key={f.label}
              onClick={() => {
                if (f.value === "") {
                  editor.chain().focus().unsetFontFamily().run();
                } else {
                  editor.chain().focus().setFontFamily(f.value).run();
                }
              }}
              className="text-left px-2 py-1.5 text-sm rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
              style={{ fontFamily: f.value || undefined }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
};

/**
 * API impérative exposée via ref pour permettre l'insertion de texte
 * brut (ex: variables {{...}}) au curseur, sans appliquer le marquage
 * en cours (gras, couleur…). Utilisé par ConventionEmailForm pour les
 * boutons d'insertion de variables.
 */
export type RichTextEditorHandle = {
  /** Insère du texte brut au curseur en réinitialisant les marks. */
  insertPlainText: (text: string) => void;
};

export const RichTextEditor = React.forwardRef<
  RichTextEditorHandle,
  RichTextEditorProps
>(function RichTextEditor(
  { value, onChange, placeholder, minHeight = 180 },
  ref,
) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none p-3 focus:outline-none",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_blockquote]:border-l-4 [&_blockquote]:border-zinc-300 [&_blockquote]:dark:border-zinc-700 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-zinc-600 [&_blockquote]:dark:text-zinc-400",
          "[&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1",
          "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1",
        ),
        "data-placeholder": placeholder ?? "",
        style: `min-height: ${minHeight}px`,
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  React.useImperativeHandle(
    ref,
    () => ({
      insertPlainText: (text: string) => {
        if (!editor) return;
        // unsetAllMarks + clearNodes garantit que le texte inséré
        // n'hérite pas du formatage en cours (gras, couleur, taille…).
        editor
          .chain()
          .focus()
          .unsetAllMarks()
          .insertContent(text)
          .run();
      },
    }),
    [editor],
  );

  // Synchronise la valeur externe vers l'éditeur (utile quand le parent
  // remplace le contenu, ex: application d'un modèle prédéfini). La
  // condition value !== getHTML() évite la boucle avec onUpdate.
  React.useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  return (
    <div className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
});
