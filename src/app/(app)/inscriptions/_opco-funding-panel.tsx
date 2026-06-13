"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Banknote,
  Download,
  Eye,
  FileUp,
  Link2,
  Loader2,
  Scale,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  createOpcoAgreement,
  deleteOpcoAgreement,
  extractOpcoFromPdfAction,
  linkExistingOpcoAgreement,
  redistributeOpcoAgreementEqually,
  undoOpcoRepartition,
  unlinkOpcoAgreement,
} from "./opco-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMMON_OPCO_NAMES } from "@/lib/opco/types";
import { cn } from "@/lib/utils";


type ExistingAgreement = {
  id: string;
  opco_name: string;
  dossier_number: string | null;
  agreement_date: string | null;
  total_amount_ht: number | null;
  pdf_url: string | null;
  pdf_filename: string | null;
};

type LinkedAgreement = ExistingAgreement & {
  amount_ht: number | null;
  /** true si l'accord est déjà réparti à parts égales entre ≥2 apprenants. */
  isEvenlyDistributed?: boolean;
};

type SessionInscription = {
  id: string;
  first_name: string | null;
  last_name: string;
  full_name: string;
};

type Props = {
  inscriptionId: string;
  sessionId: string | null;
  linkedAgreements: LinkedAgreement[];
  availableAgreements: ExistingAgreement[];
  sessionInscriptions: SessionInscription[];
  /** Si true, la modale "Nouvel accord" s'ouvre automatiquement au
   *  premier rendu. Utilisé par le picker Financement de l'onglet
   *  Participants (query param ?openOpcoModal=1). */
  autoOpenCreate?: boolean;
  /** Pre-remplit le champ "Nom OPCO" lors de l ouverture de la modale
   *  de creation. Permet la conversion d une declaration portail
   *  prescripteur en accord officiel (Gilles 2026-06-01, piste C). */
  prefillOpcoName?: string | null;
};

/**
 * Panneau Accords OPCO — version simplifiée :
 * - Affiche uniquement la LISTE des accords rattachés (avec boutons œil,
 *   téléchargement, détacher, supprimer).
 * - Deux gros boutons d'action ouvrent des MODALES (rendues via portal,
 *   hors du formulaire principal) : « Nouvel accord » / « Rattacher
 *   un existant ».
 * - Plus d'imbrication HTML <form> → opérations stables.
 */
export function OpcoFundingPanel({
  inscriptionId,
  sessionId,
  linkedAgreements,
  availableAgreements,
  sessionInscriptions,
  autoOpenCreate = false,
  prefillOpcoName = null,
}: Props) {
  const [openCreate, setOpenCreate] = useState(autoOpenCreate);
  const [openLink, setOpenLink] = useState(false);

  // Affichage réactif (2026-05-13) : on observe en direct la valeur du
  // <select id="financing_mode"> pour afficher/masquer ce panneau sans
  // avoir à enregistrer + recharger la fiche. Le panneau reste visible
  // si des accords sont déjà rattachés (pour ne jamais cacher des
  // données existantes).
  const [liveModeIsOpco, setLiveModeIsOpco] = useState<boolean>(true);
  useEffect(() => {
    const sel = document.getElementById(
      "financing_mode",
    ) as HTMLSelectElement | null;
    if (!sel) return;
    const update = () => setLiveModeIsOpco(sel.value === "opco");
    update();
    sel.addEventListener("change", update);
    return () => sel.removeEventListener("change", update);
  }, []);

  const isVisible = liveModeIsOpco || linkedAgreements.length > 0;
  if (!isVisible) return null;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Banknote className="h-5 w-5 text-violet-700" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-violet-900">
          Accords de financement OPCO
        </h3>
      </div>

      {/* Liste des accords rattachés */}
      {linkedAgreements.length > 0 ? (
        <ul className="space-y-2">
          {linkedAgreements.map((a) => (
            <LinkedAgreementCard
              key={a.id}
              agreement={a}
              inscriptionId={inscriptionId}
            />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500 italic">
          Aucun accord rattaché à cet apprenant.
        </p>
      )}

      {/* Boutons d'ajout */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          onClick={() => setOpenCreate(true)}
          className="bg-violet-600 hover:bg-violet-700"
        >
          <FileUp className="h-4 w-4" />
          Nouvel accord (PDF + saisie)
        </Button>
        {availableAgreements.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOpenLink(true)}
          >
            <Link2 className="h-4 w-4" />
            Rattacher un accord existant
          </Button>
        )}
      </div>

      {/* MODALES (rendues via portal — hors form principal) */}
      <CreateAgreementModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        inscriptionId={inscriptionId}
        sessionId={sessionId}
        sessionInscriptions={sessionInscriptions}
        prefillOpcoName={prefillOpcoName}
      />
      <LinkAgreementModal
        open={openLink}
        onClose={() => setOpenLink(false)}
        inscriptionId={inscriptionId}
        availableAgreements={availableAgreements}
      />
    </div>
  );
}

// =========================================================
// Carte d'un accord rattaché (avec boutons d'action)
// =========================================================

function LinkedAgreementCard({
  agreement: a,
  inscriptionId,
}: {
  agreement: LinkedAgreement;
  inscriptionId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function unlink() {
    if (
      !confirm(
        `Détacher cet accord de l'apprenant courant ?\n\n` +
          `L'accord reste disponible pour d'autres apprenants.`,
      )
    )
      return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("agreement_id", a.id);
      const res = await unlinkOpcoAgreement(inscriptionId, fd);
      if (!res.ok) {
        alert("Erreur lors du détachement : " + res.error);
        return;
      }
      router.refresh();
    });
  }

  function redistribute() {
    if (
      !confirm(
        `Répartir le montant total de l'accord à PARTS ÉGALES entre les ` +
          `apprenants OPCO de la même entreprise sur cette session ?\n\n` +
          `Total accord : ${a.total_amount_ht?.toLocaleString("fr-FR") ?? "—"} € HT\n\n` +
          `Les apprenants de la même entreprise en financement OPCO mais ` +
          `non encore rattachés à un accord (déclarations « avec ` +
          `subrogation ») seront automatiquement rattachés à cet accord, ` +
          `puis le total sera réparti équitablement.`,
      )
    )
      return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("agreement_id", a.id);
      const res = await redistributeOpcoAgreementEqually(inscriptionId, fd);
      if (!res.ok) {
        alert("Répartition impossible : " + res.error);
        return;
      }
      router.refresh();
    });
  }

  function undoRedistribution() {
    if (
      !confirm(
        `Annuler la répartition à parts égales ?\n\n` +
          `Le montant total de l'accord sera replacé sur l'apprenant courant, ` +
          `et remis à zéro pour les autres apprenants rattachés. Vous pourrez ` +
          `ensuite re-répartir ou saisir les montants manuellement.`,
      )
    )
      return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("agreement_id", a.id);
      const res = await undoOpcoRepartition(inscriptionId, fd);
      if (!res.ok) {
        alert("Annulation impossible : " + res.error);
        return;
      }
      router.refresh();
    });
  }

  function deleteAgreement() {
    if (
      !confirm(
        `Supprimer définitivement cet accord OPCO ?\n\n` +
          `OPCO : ${a.opco_name}\n` +
          `Dossier : ${a.dossier_number ?? "—"}\n\n` +
          `Le PDF stocké et tous les rattachements seront effacés.`,
      )
    )
      return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("agreement_id", a.id);
      const res = await deleteOpcoAgreement(inscriptionId, fd);
      if (!res.ok) {
        alert("Erreur lors de la suppression : " + res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="rounded-lg bg-white border border-violet-200 p-3 flex items-start gap-3">
      <div className="h-9 w-9 shrink-0 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center">
        <Banknote className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0 text-sm">
        <p className="font-bold text-violet-900">
          {a.opco_name}
          {a.dossier_number && (
            <span className="ml-2 text-xs font-mono text-slate-500">
              n° {a.dossier_number}
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {a.agreement_date && (
            <span>
              Accord du{" "}
              {new Date(a.agreement_date).toLocaleDateString("fr-FR")}
            </span>
          )}
          {a.amount_ht !== null && (
            <span className="font-bold text-amber-700 tabular-nums">
              {a.amount_ht.toLocaleString("fr-FR", {
                minimumFractionDigits: 2,
              })}{" "}
              € HT pour cet apprenant
            </span>
          )}
          {a.total_amount_ht !== null && a.total_amount_ht !== a.amount_ht && (
            <span className="text-slate-400">
              ({a.total_amount_ht.toLocaleString("fr-FR")} € total accord)
            </span>
          )}
        </p>
        {a.pdf_filename && (
          <p className="text-[11px] text-slate-400 truncate mt-0.5 italic">
            📎 {a.pdf_filename}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {a.pdf_url && (
          <a
            href={a.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Visualiser l'accord PDF dans un nouvel onglet"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-cyan-300 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 hover:border-cyan-500 transition-colors"
          >
            <Eye className="h-4 w-4" />
          </a>
        )}
        {a.pdf_url && (
          <a
            href={a.pdf_url}
            download={a.pdf_filename ?? "accord-opco.pdf"}
            title="Télécharger l'accord PDF"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
          >
            <Download className="h-4 w-4" />
          </a>
        )}
        {a.total_amount_ht !== null &&
          (a.isEvenlyDistributed ? (
            <>
              <span
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold"
                title="Le montant de l'accord est réparti à parts égales entre les apprenants rattachés."
              >
                <Scale className="h-3.5 w-3.5" />
                Réparti ✓
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                title="Annuler la répartition (remettre le total sur l'apprenant courant)"
                className="text-amber-700"
                onClick={undoRedistribution}
                disabled={pending}
              >
                Annuler
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              title="Répartir le montant total de l'accord à parts égales entre les apprenants OPCO de l'entreprise sur la session"
              className="text-violet-700 border-violet-200 hover:bg-violet-50"
              onClick={redistribute}
              disabled={pending}
            >
              <Scale className="h-3.5 w-3.5" />
              Répartir
            </Button>
          ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Détacher de cet apprenant"
          className="text-slate-500"
          onClick={unlink}
          disabled={pending}
        >
          Détacher
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          title="Supprimer définitivement l'accord"
          className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
          onClick={deleteAgreement}
          disabled={pending}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Supprimer
        </Button>
      </div>
    </li>
  );
}

// =========================================================
// Modale générique
// =========================================================

function Modal({
  open,
  onClose,
  title,
  icon: Icon,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: typeof Banknote;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-2xl bg-white shadow-2xl border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-br from-violet-50 to-cyan-50 flex items-start justify-between gap-4 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-violet-700" />
            </div>
            <h2 className="text-base font-bold tracking-tight">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-red-600"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// =========================================================
// Modale : Création d'un nouvel accord
// =========================================================

type DetectedLearner = {
  full_name: string;
  amount_ht: number | null;
  matched_inscription_id: string | null;
};

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchInscription(
  pdfName: string,
  pool: SessionInscription[],
): string | null {
  const target = new Set(normalizeName(pdfName).split(" ").filter(Boolean));
  if (target.size === 0) return null;
  for (const ins of pool) {
    const tokens = new Set(
      normalizeName(ins.full_name).split(" ").filter(Boolean),
    );
    let common = 0;
    for (const t of target) if (tokens.has(t)) common++;
    if (common >= 2) return ins.id;
  }
  return null;
}

function CreateAgreementModal({
  open,
  onClose,
  inscriptionId,
  sessionId,
  sessionInscriptions,
  prefillOpcoName,
}: {
  open: boolean;
  onClose: () => void;
  inscriptionId: string;
  sessionId: string | null;
  sessionInscriptions: SessionInscription[];
  prefillOpcoName?: string | null;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouvel accord OPCO"
      icon={FileUp}
    >
      <CreateAgreementForm
        inscriptionId={inscriptionId}
        sessionId={sessionId}
        sessionInscriptions={sessionInscriptions}
        onCancel={onClose}
        prefillOpcoName={prefillOpcoName}
      />
    </Modal>
  );
}

function CreateAgreementForm({
  inscriptionId,
  sessionId,
  sessionInscriptions,
  onCancel,
  prefillOpcoName,
}: {
  inscriptionId: string;
  sessionId: string | null;
  sessionInscriptions: SessionInscription[];
  onCancel: () => void;
  prefillOpcoName?: string | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extracting, startExtracting] = useTransition();
  const [extractionInfo, setExtractionInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [opcoName, setOpcoName] = useState(prefillOpcoName?.trim() ?? "");
  const [dossierNumber, setDossierNumber] = useState("");
  const [agreementDate, setAgreementDate] = useState("");
  const [totalAmountHt, setTotalAmountHt] = useState("");
  const [myAmountHt, setMyAmountHt] = useState("");

  const [detectedLearners, setDetectedLearners] = useState<DetectedLearner[]>(
    [],
  );
  const [otherIds, setOtherIds] = useState<Set<string>>(new Set());
  const [otherAmounts, setOtherAmounts] = useState<Record<string, string>>({});

  function runExtraction(f: File) {
    startExtracting(async () => {
      const fd = new FormData();
      fd.append("pdf_file", f);
      const res = await extractOpcoFromPdfAction(fd);
      if (!res.ok) {
        setExtractionInfo(`Extraction impossible : ${res.error}`);
        return;
      }
      const d = res.data;
      let filled = 0;
      if (d.opco_name && !opcoName) {
        setOpcoName(d.opco_name);
        filled++;
      }
      if (d.dossier_number && !dossierNumber) {
        setDossierNumber(d.dossier_number);
        filled++;
      }
      if (d.agreement_date && !agreementDate) {
        setAgreementDate(d.agreement_date);
        filled++;
      }
      if (d.total_amount_ht !== null && !totalAmountHt) {
        setTotalAmountHt(String(d.total_amount_ht));
        filled++;
      }
      if (
        d.total_amount_ht !== null &&
        !myAmountHt &&
        d.learners.length <= 1
      ) {
        setMyAmountHt(String(d.total_amount_ht));
      }
      const detected: DetectedLearner[] = d.learners.map((l) => ({
        full_name: l.full_name,
        amount_ht: l.amount_ht,
        matched_inscription_id: matchInscription(
          l.full_name,
          sessionInscriptions,
        ),
      }));
      setDetectedLearners(detected);
      const presetIds = new Set<string>();
      const presetAmounts: Record<string, string> = {};
      for (const dl of detected) {
        if (
          dl.matched_inscription_id &&
          dl.matched_inscription_id !== inscriptionId
        ) {
          presetIds.add(dl.matched_inscription_id);
          if (dl.amount_ht !== null) {
            presetAmounts[dl.matched_inscription_id] = String(dl.amount_ht);
          }
        }
      }
      setOtherIds(presetIds);
      setOtherAmounts(presetAmounts);
      setExtractionInfo(
        filled > 0
          ? `${filled} champ${filled > 1 ? "s" : ""} pré-rempli${filled > 1 ? "s" : ""} depuis le PDF${d.learners.length > 0 ? ` · ${d.learners.length} apprenant${d.learners.length > 1 ? "s" : ""} détecté${d.learners.length > 1 ? "s" : ""}` : ""}.`
          : "PDF lu, mais aucune donnée structurée détectée.",
      );
    });
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      setFile(f);
      if (fileInputRef.current) {
        const dt = new DataTransfer();
        dt.items.add(f);
        fileInputRef.current.files = dt.files;
      }
      runExtraction(f);
    }
  }

  function toggleOther(id: string) {
    setOtherIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const router = useRouter();
  const [submitting, startSubmitting] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  /**
   * Soumission programmatique. Les actions OPCO renvoient maintenant un
   * `ActionResult { ok, error? }` — pas de redirect server-side.
   * - Sur succès : on rafraîchit la page (router.refresh) pour recharger
   *   la liste des accords, puis on ferme la modale.
   * - Sur échec : on affiche le message dans la modale.
   */
  function handleSubmit() {
    setSubmitError(null);
    if (!opcoName.trim()) {
      setSubmitError("Le nom de l'OPCO est obligatoire.");
      return;
    }
    startSubmitting(async () => {
      const fd = new FormData();
      fd.append("opco_name", opcoName);
      fd.append("dossier_number", dossierNumber);
      fd.append("agreement_date", agreementDate);
      fd.append("total_amount_ht", totalAmountHt);
      fd.append("my_amount_ht", myAmountHt);
      fd.append("session_id", sessionId ?? "");
      if (file) fd.append("pdf_file", file);
      for (const id of otherIds) {
        fd.append("other_inscription_ids", id);
        const amount = otherAmounts[id];
        if (amount) fd.append(`other_amount_${id}`, amount);
      }
      const res = await createOpcoAgreement(inscriptionId, fd);
      if (!res.ok) {
        setSubmitError(res.error);
        return;
      }
      router.refresh();
      onCancel();
    });
  }

  return (
    <div className="space-y-4">
      {/* Zone de drop */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors",
          dragOver
            ? "border-violet-500 bg-violet-50"
            : "border-slate-300 bg-slate-50 hover:border-violet-400 hover:bg-violet-50/50",
        )}
      >
        {extracting ? (
          <Loader2 className="h-8 w-8 mx-auto text-violet-500 mb-2 animate-spin" />
        ) : (
          <FileUp className="h-8 w-8 mx-auto text-violet-500 mb-2" />
        )}
        {file ? (
          <p className="text-sm font-bold text-violet-900">{file.name}</p>
        ) : (
          <>
            <p className="text-sm font-medium">Glissez ici l&apos;accord PDF</p>
            <p className="text-xs text-slate-500 mt-1">
              Depuis Gmail, Outlook ou l&apos;explorateur · ou cliquez pour
              parcourir
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          name="pdf_file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            if (f) runExtraction(f);
          }}
        />
      </div>

      {extractionInfo && (
        <div className="rounded-md bg-cyan-50 border border-cyan-200 px-3 py-2 text-xs text-cyan-800 inline-flex items-start gap-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-cyan-600" />
          <span>{extractionInfo}</span>
        </div>
      )}

      {/* Champs */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="opco_name" required className="text-xs">
            OPCO
          </Label>
          <input
            id="opco_name"
            name="opco_name"
            list="common-opcos"
            required
            value={opcoName}
            onChange={(e) => setOpcoName(e.target.value)}
            placeholder="Ex : Constructys"
            className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500"
          />
          <datalist id="common-opcos">
            {COMMON_OPCO_NAMES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <Label htmlFor="dossier_number" className="text-xs">
            N° dossier OPCO
          </Label>
          <Input
            id="dossier_number"
            name="dossier_number"
            value={dossierNumber}
            onChange={(e) => setDossierNumber(e.target.value)}
            placeholder="Ex : 4026009528.01"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="agreement_date" className="text-xs">
            Date de l&apos;accord
          </Label>
          <Input
            id="agreement_date"
            name="agreement_date"
            type="date"
            value={agreementDate}
            onChange={(e) => setAgreementDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="total_amount_ht" className="text-xs">
            Montant total HT (accord)
          </Label>
          <Input
            id="total_amount_ht"
            name="total_amount_ht"
            type="number"
            step="0.01"
            value={totalAmountHt}
            onChange={(e) => setTotalAmountHt(e.target.value)}
            placeholder="Ex : 168.00"
          />
        </div>
        <div className="md:col-span-2 space-y-1">
          <Label htmlFor="my_amount_ht" className="text-xs">
            Part allouée à cet apprenant (HT)
          </Label>
          <Input
            id="my_amount_ht"
            name="my_amount_ht"
            type="number"
            step="0.01"
            value={myAmountHt}
            onChange={(e) => setMyAmountHt(e.target.value)}
            placeholder="Laissez vide si l'accord couvre uniquement cet apprenant"
          />
        </div>
      </div>

      {/* Champ caché : session de l'accord */}
      <input type="hidden" name="session_id" value={sessionId ?? ""} />

      {/* Multi-affectation : uniquement les apprenants détectés dans le PDF */}
      {detectedLearners.length > 0 && (
        <div className="rounded-md bg-slate-50 border border-slate-200 p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-600 inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Apprenants mentionnés sur l&apos;accord ({detectedLearners.length})
          </p>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {detectedLearners.map((dl, i) => {
              const matchedId = dl.matched_inscription_id;
              const isCurrent = matchedId === inscriptionId;
              const isCheckable = matchedId !== null && !isCurrent;
              const checked =
                matchedId !== null && otherIds.has(matchedId);
              return (
                <li
                  key={i}
                  className={cn(
                    "flex items-center gap-2 text-xs rounded px-2 py-1.5",
                    isCheckable
                      ? "hover:bg-white"
                      : "bg-amber-50/60 border border-amber-200",
                  )}
                >
                  {isCheckable ? (
                    <input
                      type="checkbox"
                      id={`dl-${i}`}
                      name="other_inscription_ids"
                      value={matchedId!}
                      checked={checked}
                      onChange={() => toggleOther(matchedId!)}
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                  ) : (
                    <span className="h-3.5 w-3.5 inline-flex items-center justify-center text-[10px] text-amber-600">
                      •
                    </span>
                  )}
                  <label
                    htmlFor={isCheckable ? `dl-${i}` : undefined}
                    className={cn(
                      "flex-1 truncate",
                      isCheckable ? "cursor-pointer" : "",
                    )}
                  >
                    <span className="font-semibold">{dl.full_name}</span>
                    {dl.amount_ht !== null && (
                      <span className="text-slate-500 ml-2 tabular-nums">
                        ({dl.amount_ht.toLocaleString("fr-FR", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        € HT)
                      </span>
                    )}
                    {isCurrent && (
                      <span className="ml-2 text-[10px] uppercase font-bold text-cyan-700">
                        ↳ apprenant courant
                      </span>
                    )}
                    {!matchedId && (
                      <span className="ml-2 text-[10px] uppercase font-bold text-amber-700">
                        ↳ non inscrit sur la session
                      </span>
                    )}
                  </label>
                  {checked && matchedId && (
                    <input
                      type="number"
                      step="0.01"
                      name={`other_amount_${matchedId}`}
                      value={otherAmounts[matchedId] ?? ""}
                      onChange={(e) =>
                        setOtherAmounts((prev) => ({
                          ...prev,
                          [matchedId]: e.target.value,
                        }))
                      }
                      placeholder="€ HT"
                      className="w-20 h-7 rounded border border-slate-300 px-2 text-xs"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {submitError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {submitError}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 sticky bottom-0 bg-white">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          Annuler
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={submitting}
          className="bg-violet-600 hover:bg-violet-700"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileUp className="h-4 w-4" />
          )}
          Enregistrer l&apos;accord
        </Button>
      </div>
    </div>
  );
}

// =========================================================
// Modale : Rattacher un accord existant
// =========================================================

function LinkAgreementModal({
  open,
  onClose,
  inscriptionId,
  availableAgreements,
}: {
  open: boolean;
  onClose: () => void;
  inscriptionId: string;
  availableAgreements: ExistingAgreement[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState("");
  const [amountHt, setAmountHt] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function deleteSelected() {
    if (!selectedId) return;
    const a = availableAgreements.find((x) => x.id === selectedId);
    if (
      !confirm(
        `Supprimer définitivement cet accord OPCO ?\n\n` +
          `OPCO : ${a?.opco_name ?? ""}\n` +
          `Dossier : ${a?.dossier_number ?? "—"}\n\n` +
          `Le PDF stocké sera également effacé.`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("agreement_id", selectedId);
      const res = await deleteOpcoAgreement(inscriptionId, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function handleLink() {
    if (!selectedId) {
      setError("Sélectionnez un accord à rattacher.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("agreement_id", selectedId);
      fd.append("amount_ht", amountHt);
      const res = await linkExistingOpcoAgreement(inscriptionId, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rattacher un accord existant"
      icon={Link2}
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="agreement_id_select" required className="text-xs">
            Accord existant
          </Label>
          <select
            id="agreement_id_select"
            required
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm"
          >
            <option value="">— Choisir un accord —</option>
            {availableAgreements.map((a) => (
              <option key={a.id} value={a.id}>
                {a.opco_name}
                {a.dossier_number ? ` · ${a.dossier_number}` : ""}
                {a.agreement_date
                  ? ` · ${new Date(a.agreement_date).toLocaleDateString("fr-FR")}`
                  : ""}
                {a.total_amount_ht !== null
                  ? ` · ${a.total_amount_ht.toLocaleString("fr-FR")} €`
                  : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="amount_ht_input" className="text-xs">
            Part allouée à cet apprenant (HT)
          </Label>
          <Input
            id="amount_ht_input"
            type="number"
            step="0.01"
            value={amountHt}
            onChange={(e) => setAmountHt(e.target.value)}
            placeholder="Ex : 168.00"
          />
        </div>
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <div className="flex justify-between gap-2 border-t border-slate-100 pt-3">
          {selectedId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={deleteSelected}
              className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
              title="Supprimer définitivement cet accord (en cas d'erreur)"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleLink}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              Rattacher
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
