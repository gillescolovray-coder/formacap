"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractAgreementFromPdf } from "@/lib/opco/extract";
import type { ExtractedAgreementData } from "@/lib/opco/types";

const BUCKET = "opco-agreements";
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 Mo

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

function parseDate(raw: FormDataEntryValue | null): string | null {
  return parseText(raw);
}

function parseAmount(raw: FormDataEntryValue | null): number | null {
  const s = parseText(raw);
  if (!s) return null;
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Répartit un montant total HT en `n` parts ÉGALES (Gilles 2026-06-12).
 * Arrondi à 2 décimales ; le reliquat d'arrondi est ajouté à la dernière
 * part pour que la somme = total exactement.
 */
function equalShares(total: number, n: number): number[] {
  if (n <= 0) return [];
  const round2 = (x: number) => Math.round(x * 100) / 100;
  const base = Math.floor((total / n) * 100) / 100;
  const shares = Array.from({ length: n }, () => base);
  const remainder = round2(total - base * n);
  shares[n - 1] = round2(base + remainder);
  return shares;
}

async function getOrgId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Aucune organisation");
  return { organizationId: data.organization_id as string, userId: user.id };
}

/**
 * Crée un nouvel accord de financement OPCO et le rattache à
 * l'inscription en cours. Si un fichier PDF est joint, il est
 * uploadé dans le bucket Supabase "opco-agreements".
 */
type ActionResult =
  | { ok: true; agreementId?: string }
  | { ok: false; error: string };

export async function createOpcoAgreement(
  inscriptionId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { organizationId, userId } = await getOrgId();
    const supabase = await createClient();

    const opcoName = parseText(formData.get("opco_name"));
    const dossierNumber = parseText(formData.get("dossier_number"));
    const agreementDate = parseDate(formData.get("agreement_date"));
    const totalAmountHt = parseAmount(formData.get("total_amount_ht"));
    const myAmountHt = parseAmount(formData.get("my_amount_ht"));
    const sessionId = parseText(formData.get("session_id"));

    if (!opcoName) {
      return { ok: false, error: "Le nom de l'OPCO est obligatoire" };
    }

    // Upload PDF (optionnel). On stocke uniquement le PATH dans la
    // colonne pdf_url (pas une URL publique) — les URLs sont générées
    // à la demande au moment de l'affichage avec un jeton temporaire
    // de 30 min, ce qui permet de garder le bucket privé.
    let pdfUrl: string | null = null;
    let pdfFilename: string | null = null;
    const file = formData.get("pdf_file") as File | null;
    if (file && file.size > 0) {
      if (file.size > MAX_SIZE_BYTES) {
        return { ok: false, error: "PDF trop volumineux (max 15 Mo)" };
      }
      const safeName = sanitizeFileName(file.name);
      const path = `${organizationId}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          contentType: file.type || "application/pdf",
          upsert: false,
        });
      if (uploadError) {
        return {
          ok: false,
          error: `Upload PDF impossible : ${uploadError.message}. Vérifiez que le bucket Supabase Storage "${BUCKET}" existe.`,
        };
      }
      pdfUrl = path; // path seul, pas d'URL publique
      pdfFilename = file.name;
    } else {
      pdfUrl = parseText(formData.get("pdf_url"));
      pdfFilename = parseText(formData.get("pdf_filename"));
    }

    // Création de l'accord
    const { data: agreement, error: agErr } = await supabase
      .from("opco_funding_agreements")
      .insert({
        organization_id: organizationId,
        opco_name: opcoName,
        dossier_number: dossierNumber,
        agreement_date: agreementDate,
        total_amount_ht: totalAmountHt,
        session_id: sessionId,
        pdf_url: pdfUrl,
        pdf_filename: pdfFilename,
        created_by: userId,
      })
      .select("id")
      .single();

    if (agErr || !agreement) {
      return {
        ok: false,
        error: `Création échouée : ${agErr?.message ?? "DB error"}. Vérifiez que les migrations 0028 et 0029 ont été exécutées.`,
      };
    }

    // Rattachement des apprenants : par défaut on RÉPARTIT le montant total
    // de l'accord à parts ÉGALES entre tous les apprenants rattachés
    // (Gilles 2026-06-12). Un montant saisi manuellement par apprenant
    // (my_amount_ht / other_amount_{id}) reste prioritaire.
    // Avant, l'apprenant courant recevait `myAmountHt ?? totalAmountHt`
    // (le TOTAL de l'accord) et les autres NULL -> total faux.
    const otherInscriptionIds = (
      formData.getAll("other_inscription_ids") as string[]
    )
      .map((s) => parseText(s))
      .filter((s): s is string => Boolean(s) && s !== inscriptionId);
    const allIds = [inscriptionId, ...otherInscriptionIds];
    const shares =
      totalAmountHt !== null
        ? equalShares(totalAmountHt, allIds.length)
        : allIds.map(() => null as number | null);
    const linkRows = allIds.map((iid, idx) => {
      const manual =
        idx === 0
          ? myAmountHt
          : parseAmount(formData.get(`other_amount_${iid}`));
      return {
        agreement_id: agreement.id,
        inscription_id: iid,
        amount_ht: manual ?? shares[idx] ?? null,
      };
    });
    const { error: linkErr } = await supabase
      .from("inscription_opco_fundings")
      .insert(linkRows);
    if (linkErr) {
      return {
        ok: false,
        error: `Rattachement échoué : ${linkErr.message}`,
      };
    }

    revalidatePath(`/inscriptions/${inscriptionId}`);
    revalidatePath("/inscriptions");
    return { ok: true, agreementId: agreement.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Erreur inattendue : ${msg}` };
  }
}

/**
 * Lie un accord existant à l'inscription courante (réutilisation
 * d'un accord déjà déposé pour un autre apprenant).
 */
export async function linkExistingOpcoAgreement(
  inscriptionId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const agreementId = parseText(formData.get("agreement_id"));
    const amountHt = parseAmount(formData.get("amount_ht"));

    if (!agreementId) {
      return { ok: false, error: "Aucun accord sélectionné" };
    }

    const supabase = await createClient();
    const { error } = await supabase.from("inscription_opco_fundings").insert({
      agreement_id: agreementId,
      inscription_id: inscriptionId,
      amount_ht: amountHt,
    });
    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath(`/inscriptions/${inscriptionId}`);
    revalidatePath("/inscriptions");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Erreur inattendue : ${msg}` };
  }
}

/**
 * Répartit le montant TOTAL d'un accord OPCO à PARTS ÉGALES entre les
 * apprenants OPCO de la MÊME ENTREPRISE présents sur la session
 * (Gilles 2026-06-12).
 *
 * Comportement "intelligent" : avant de répartir, on rattache
 * automatiquement à l'accord les apprenants de la même entreprise de la
 * session qui sont en financement OPCO mais PAS ENCORE rattachés à un
 * accord (déclarations provisoires "avec subrogation"). On ne touche pas
 * aux apprenants déjà rattachés à un AUTRE accord. Puis on répartit le
 * total à parts égales sur l'ensemble.
 */
export async function redistributeOpcoAgreementEqually(
  inscriptionId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const agreementId = parseText(formData.get("agreement_id"));
    if (!agreementId) return { ok: false, error: "Aucun accord sélectionné" };

    const supabase = await createClient();
    const { data: ag } = await supabase
      .from("opco_funding_agreements")
      .select("total_amount_ht, session_id")
      .eq("id", agreementId)
      .maybeSingle<{
        total_amount_ht: number | string | null;
        session_id: string | null;
      }>();
    const total =
      ag?.total_amount_ht !== null && ag?.total_amount_ht !== undefined
        ? Number(ag.total_amount_ht)
        : null;
    if (total === null || !Number.isFinite(total)) {
      return {
        ok: false,
        error:
          "Cet accord n'a pas de montant total renseigné : impossible de répartir.",
      };
    }
    const sessionId = ag?.session_id ?? null;

    // Entreprise de l'apprenant courant (via son learner).
    const { data: curInsc } = await supabase
      .from("inscription_requests")
      .select("learner_id, target_session_id, learner:learners(company_id)")
      .eq("id", inscriptionId)
      .maybeSingle();
    const curInscObj = (curInsc ?? null) as {
      learner_id?: string | null;
      target_session_id?: string | null;
      learner?:
        | { company_id: string | null }
        | Array<{ company_id: string | null }>
        | null;
    } | null;
    const curLearner = curInscObj?.learner
      ? Array.isArray(curInscObj.learner)
        ? curInscObj.learner[0] ?? null
        : curInscObj.learner
      : null;
    const companyId = curLearner?.company_id ?? null;
    const effectiveSessionId =
      sessionId ?? curInscObj?.target_session_id ?? null;

    // Apprenants déjà rattachés à CET accord.
    const { data: links } = await supabase
      .from("inscription_opco_fundings")
      .select("inscription_id")
      .eq("agreement_id", agreementId);
    const linkedIds = new Set(
      ((links ?? []) as Array<{ inscription_id: string }>).map(
        (l) => l.inscription_id,
      ),
    );

    // Candidats à rattacher automatiquement : apprenants OPCO de la même
    // entreprise sur la session, sans aucun accord rattaché (provisoires).
    if (companyId && effectiveSessionId) {
      const { data: sessionInsc } = await supabase
        .from("inscription_requests")
        .select("id, financing_mode, learner:learners(company_id)")
        .eq("target_session_id", effectiveSessionId)
        .eq("financing_mode", "opco");
      const sameCompanyIds = ((sessionInsc ?? []) as Array<{
        id: string;
        learner: { company_id: string | null } | Array<{ company_id: string | null }> | null;
      }>)
        .filter((row) => {
          const l = Array.isArray(row.learner)
            ? row.learner[0] ?? null
            : row.learner;
          return l?.company_id === companyId;
        })
        .map((row) => row.id);

      // Ne rattacher que ceux SANS aucune funding existante (provisoires).
      const newCandidates = sameCompanyIds.filter((id) => !linkedIds.has(id));
      if (newCandidates.length > 0) {
        const { data: existingFundings } = await supabase
          .from("inscription_opco_fundings")
          .select("inscription_id")
          .in("inscription_id", newCandidates);
        const alreadyFunded = new Set(
          ((existingFundings ?? []) as Array<{ inscription_id: string }>).map(
            (f) => f.inscription_id,
          ),
        );
        const toLink = newCandidates.filter((id) => !alreadyFunded.has(id));
        if (toLink.length > 0) {
          await supabase.from("inscription_opco_fundings").insert(
            toLink.map((iid) => ({
              agreement_id: agreementId,
              inscription_id: iid,
              amount_ht: null,
            })),
          );
          for (const iid of toLink) linkedIds.add(iid);
        }
      }
    }

    const ids = Array.from(linkedIds);
    if (ids.length === 0) {
      return { ok: false, error: "Aucun apprenant rattaché à cet accord." };
    }

    const shares = equalShares(total, ids.length);
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabase
        .from("inscription_opco_fundings")
        .update({ amount_ht: shares[i] })
        .eq("agreement_id", agreementId)
        .eq("inscription_id", ids[i]);
      if (error) return { ok: false, error: error.message };
    }

    revalidatePath(`/inscriptions/${inscriptionId}`);
    revalidatePath("/inscriptions");
    if (effectiveSessionId) {
      revalidatePath(`/sessions/${effectiveSessionId}/participants`);
      revalidatePath(`/sessions/${effectiveSessionId}`);
    }
    return { ok: true, agreementId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Erreur inattendue : ${msg}` };
  }
}

/**
 * Détache un accord d'une inscription (sans supprimer l'accord
 * lui-même, qui peut être lié à d'autres apprenants).
 */
export async function unlinkOpcoAgreement(
  inscriptionId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const agreementId = parseText(formData.get("agreement_id"));
    if (!agreementId) {
      return { ok: false, error: "Aucun accord à détacher" };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("inscription_opco_fundings")
      .delete()
      .eq("agreement_id", agreementId)
      .eq("inscription_id", inscriptionId);
    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath(`/inscriptions/${inscriptionId}`);
    revalidatePath("/inscriptions");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Erreur inattendue : ${msg}` };
  }
}

/**
 * Supprime complètement un accord OPCO (et tous ses liens —
 * cascade DB).
 */
export async function deleteOpcoAgreement(
  inscriptionId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const agreementId = parseText(formData.get("agreement_id"));
    if (!agreementId) {
      return { ok: false, error: "Aucun accord à supprimer" };
    }

    const supabase = await createClient();
    const { data: ag } = await supabase
      .from("opco_funding_agreements")
      .select("pdf_url")
      .eq("id", agreementId)
      .maybeSingle();
    if (ag?.pdf_url) {
      const stored = ag.pdf_url as string;
      // Compatibilité : ancien format = URL publique complète, nouveau
      // format = path direct dans le bucket.
      let path: string | null = null;
      if (stored.startsWith("http")) {
        const marker = `/${BUCKET}/`;
        const idx = stored.indexOf(marker);
        if (idx !== -1) {
          path = stored.substring(idx + marker.length);
        }
      } else {
        path = stored;
      }
      if (path) {
        await supabase.storage.from(BUCKET).remove([path]);
      }
    }
    const { error } = await supabase
      .from("opco_funding_agreements")
      .delete()
      .eq("id", agreementId);
    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath(`/inscriptions/${inscriptionId}`);
    revalidatePath("/inscriptions");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Erreur inattendue : ${msg}` };
  }
}

/**
 * Server Action exposée au composant client : reçoit un PDF d'accord
 * OPCO, le passe au parseur (avec détection automatique de l'OPCO et
 * extraction Constructys / générique) et renvoie les champs détectés.
 *
 * L'utilisateur peut ensuite les valider/ajuster avant de soumettre
 * définitivement le formulaire de création d'accord.
 */
export async function extractOpcoFromPdfAction(
  formData: FormData,
): Promise<
  | { ok: true; data: ExtractedAgreementData }
  | { ok: false; error: string }
> {
  try {
    const file = formData.get("pdf_file") as File | null;
    if (!file || file.size === 0) {
      return { ok: false, error: "Aucun fichier PDF reçu." };
    }
    if (file.size > MAX_SIZE_BYTES) {
      return { ok: false, error: "PDF trop volumineux (max 15 Mo)." };
    }
    const buffer = await file.arrayBuffer();
    const data = await extractAgreementFromPdf(buffer);
    return { ok: true, data };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Erreur inconnue lors de l'extraction.";
    return { ok: false, error: msg };
  }
}
