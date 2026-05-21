"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "inscriptions:session-table-columns";
const HEADER_STORAGE_KEY = "inscriptions:session-header-items";

// =========================================================================
// Colonnes du tableau (par-apprenant, dans le tableau déplié)
// =========================================================================

export type ColumnKey =
  | "demandeur"
  | "entreprise"
  | "source"
  | "canal_inscription"
  | "financement"
  | "montant"
  | "etape"
  | "recue"
  | "ouvrir";

// Refonte 2026-05-21 (Gilles) : les colonnes "code_postal" et "ville" ont
// été fusionnées dans la colonne "entreprise" (affichage sur 2 lignes :
// nom de la société puis CP · Ville en dessous).
export const ALL_COLUMNS: {
  key: ColumnKey;
  label: string;
  defaultOn: boolean;
}[] = [
  { key: "demandeur", label: "Demandeur", defaultOn: true },
  { key: "entreprise", label: "Entreprise (avec CP + Ville)", defaultOn: true },
  { key: "source", label: "Source (canal de communication)", defaultOn: false },
  { key: "canal_inscription", label: "Source d'inscription", defaultOn: true },
  { key: "financement", label: "Financement", defaultOn: true },
  { key: "montant", label: "Montant HT", defaultOn: true },
  { key: "etape", label: "Étape", defaultOn: true },
  { key: "recue", label: "Reçue le", defaultOn: true },
  { key: "ouvrir", label: "Action", defaultOn: true },
];

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = ALL_COLUMNS.reduce(
  (acc, col) => {
    acc[col.key] = col.defaultOn;
    return acc;
  },
  {} as Record<ColumnKey, boolean>,
);

// =========================================================================
// Éléments de l'en-tête de session (au-dessus du tableau)
// =========================================================================

export type HeaderKey =
  | "modality"
  | "inter_intra"
  | "code"
  | "date"
  | "lieu"
  | "formateur"
  | "compteur"
  | "pastilles";

export const ALL_HEADER_ITEMS: {
  key: HeaderKey;
  label: string;
  defaultOn: boolean;
}[] = [
  { key: "modality", label: "Badge modalité (Présentiel / Distanciel…)", defaultOn: true },
  { key: "inter_intra", label: "Badge INTER / INTRA", defaultOn: true },
  { key: "code", label: "Référence formation (code interne)", defaultOn: true },
  { key: "date", label: "Date de session", defaultOn: true },
  { key: "lieu", label: "Lieu (icône + popover)", defaultOn: true },
  { key: "formateur", label: "Formateur (icône + popover)", defaultOn: true },
  { key: "compteur", label: "Compteur participants (X / Y)", defaultOn: true },
  { key: "pastilles", label: "Pastilles d'étapes (Nouvelle demande, Confirmé…)", defaultOn: true },
];

const DEFAULT_HEADER: Record<HeaderKey, boolean> = ALL_HEADER_ITEMS.reduce(
  (acc, h) => {
    acc[h.key] = h.defaultOn;
    return acc;
  },
  {} as Record<HeaderKey, boolean>,
);

// =========================================================================
// Context partagé
// =========================================================================

type Ctx = {
  visible: Record<ColumnKey, boolean>;
  headerVisible: Record<HeaderKey, boolean>;
  hydrated: boolean;
  toggle: (k: ColumnKey) => void;
  toggleHeader: (k: HeaderKey) => void;
  reset: () => void;
};

const InscriptionColumnsContext = createContext<Ctx | null>(null);

export function InscriptionColumnsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [visible, setVisible] =
    useState<Record<ColumnKey, boolean>>(DEFAULT_VISIBLE);
  const [headerVisible, setHeaderVisible] =
    useState<Record<HeaderKey, boolean>>(DEFAULT_HEADER);
  const [hydrated, setHydrated] = useState(false);

  // Lecture du localStorage au mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        const next: Record<ColumnKey, boolean> = { ...DEFAULT_VISIBLE };
        for (const c of ALL_COLUMNS) {
          if (typeof parsed[c.key] === "boolean") next[c.key] = parsed[c.key];
        }
        setVisible(next);
      }
    } catch {
      // ignore
    }
    try {
      const rawH = localStorage.getItem(HEADER_STORAGE_KEY);
      if (rawH) {
        const parsedH = JSON.parse(rawH) as Record<string, boolean>;
        const nextH: Record<HeaderKey, boolean> = { ...DEFAULT_HEADER };
        for (const h of ALL_HEADER_ITEMS) {
          if (typeof parsedH[h.key] === "boolean")
            nextH[h.key] = parsedH[h.key];
        }
        setHeaderVisible(nextH);
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  // Persistance
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visible));
    } catch {
      // ignore
    }
  }, [visible, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(HEADER_STORAGE_KEY, JSON.stringify(headerVisible));
    } catch {
      // ignore
    }
  }, [headerVisible, hydrated]);

  const ctx: Ctx = {
    visible,
    headerVisible,
    hydrated,
    toggle: (k) => setVisible((v) => ({ ...v, [k]: !v[k] })),
    toggleHeader: (k) =>
      setHeaderVisible((v) => ({ ...v, [k]: !v[k] })),
    reset: () => {
      setVisible(DEFAULT_VISIBLE);
      setHeaderVisible(DEFAULT_HEADER);
    },
  };

  return (
    <InscriptionColumnsContext.Provider value={ctx}>
      {children}
    </InscriptionColumnsContext.Provider>
  );
}

export function useInscriptionColumns() {
  const ctx = useContext(InscriptionColumnsContext);
  if (!ctx) {
    return {
      visible: DEFAULT_VISIBLE,
      headerVisible: DEFAULT_HEADER,
      hydrated: true,
      toggle: () => {},
      toggleHeader: () => {},
      reset: () => {},
    };
  }
  return ctx;
}

/**
 * Wrapper conditionnel : rend `children` uniquement si l'élément
 * d'en-tête est activé dans la conf utilisateur.
 *
 * Utilisé dans page.tsx pour masquer/afficher les badges, icônes,
 * compteur, pastilles… de l'en-tête de chaque session.
 */
export function HeaderItem({
  k,
  children,
}: {
  k: HeaderKey;
  children: ReactNode;
}) {
  const { headerVisible } = useInscriptionColumns();
  if (!headerVisible[k]) return null;
  return <>{children}</>;
}

/**
 * Bouton de personnalisation à placer dans la barre de filtres.
 */
export function ColumnsSettingsButton() {
  const {
    visible,
    headerVisible,
    hydrated,
    toggle,
    toggleHeader,
    reset,
  } = useInscriptionColumns();
  const [open, setOpen] = useState(false);
  const v = hydrated ? visible : DEFAULT_VISIBLE;
  const h = hydrated ? headerVisible : DEFAULT_HEADER;
  const colCount = ALL_COLUMNS.filter((c) => v[c.key]).length;
  const headerCount = ALL_HEADER_ITEMS.filter((c) => h[c.key]).length;
  const totalOn = colCount + headerCount;
  const totalAll = ALL_COLUMNS.length + ALL_HEADER_ITEMS.length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
          open
            ? "bg-cyan-600 text-white border-cyan-600 shadow-sm"
            : "bg-white text-slate-700 border-slate-300 hover:border-cyan-400 hover:bg-cyan-50",
        )}
        title="Personnaliser l'affichage du tableau et des en-têtes de session"
      >
        <Settings2 className="h-3.5 w-3.5" />
        Personnaliser ({totalOn}/{totalAll})
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-20 w-[420px] max-h-[80vh] overflow-y-auto rounded-xl bg-white border border-cyan-200 shadow-lg p-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-800">
              Personnalisation de l&apos;affichage
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="text-[11px] text-cyan-700 hover:underline font-bold"
              >
                Réinitialiser
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[11px] text-slate-500 hover:underline"
              >
                Fermer
              </button>
            </div>
          </div>

          {/* Section : éléments de l'en-tête de session */}
          <div className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 pb-1 border-b border-slate-100">
              En-tête de session ({headerCount}/{ALL_HEADER_ITEMS.length})
            </p>
            <div className="grid grid-cols-1 gap-0.5">
              {ALL_HEADER_ITEMS.map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-cyan-50 rounded px-1.5 py-1"
                >
                  <input
                    type="checkbox"
                    checked={h[item.key]}
                    onChange={() => toggleHeader(item.key)}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Section : colonnes du tableau */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 pb-1 border-b border-slate-100">
              Colonnes du tableau ({colCount}/{ALL_COLUMNS.length})
            </p>
            <div className="grid grid-cols-2 gap-0.5">
              {ALL_COLUMNS.map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-cyan-50 rounded px-1.5 py-1"
                >
                  <input
                    type="checkbox"
                    checked={v[col.key]}
                    onChange={() => toggle(col.key)}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
