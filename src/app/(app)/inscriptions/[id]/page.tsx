import Link from "next/link";
import {
  Activity,
  HelpCircle,
  Save,
  Send,
  Trash2,
  UserCheck,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InscriptionForm } from "../_form";
import {
  addNote,
  changeStageFromForm,
  convertToEnrollment,
  deleteInscription,
  updateInscription,
} from "../actions";
import { OpcoFundingPanel } from "../_opco-funding-panel";
import { BillingPanel } from "./_billing-panel";
import { EmployerAmountField } from "./_employer-amount-field";
import { ReferentPicker } from "../_referent-picker";
import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/page-header";
import { SectionsControls } from "@/components/sections-controls";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  FINANCING_MODE_LABELS,
  INSCRIPTION_EVENT_LABELS,
  INSCRIPTION_SOURCE_LABELS,
  type InscriptionEvent,
  type InscriptionRequest,
  type InscriptionStage,
} from "@/lib/inscriptions/types";

export default async function InscriptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    stageChanged?: string;
    noteAdded?: string;
    converted?: string;
    error?: string;
    /** Si "1", on auto-ouvre la modale "Nouvel accord OPCO". Utilisé par
     *  le bouton « + Créer un nouvel accord (PDF + OCR) » du picker
     *  Financement de l'onglet Participants. */
    openOpcoModal?: string;
    /** Pre-remplit le champ "Nom OPCO" dans la modale de creation
     *  (Piste C — conversion d une declaration portail prescripteur
     *  en accord officiel, Gilles 2026-06-01). */
    prefill_opco_name?: string;
    /** Contexte de retour (ex: "participants" → bouton retour vers
     *  /sessions/{session_id}/participants après création OPCO). */
    return_to?: string;
    session_id?: string;
    /** Si "1", la fiche est un BROUILLON fraîchement créé par
     *  /inscriptions/new. Affichage adapté : titre "Nouvelle demande
     *  d'inscription", bouton Annuler qui supprime le brouillon. */
    fresh?: string;
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const role = (membership?.role as string | undefined) ?? "";
  const canDelete = role === "admin";

  const [
    { data: request, error },
    { data: stages },
    { data: events },
    { data: sessions },
    { data: parcours },
    { data: companies },
    { data: learners },
    { data: linkedFundings },
    { data: allAgreements },
    { data: otherInscriptionsRaw },
    { data: opcos },
  ] = await Promise.all([
    supabase
      .from("inscription_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle<InscriptionRequest>(),
    supabase
      .from("inscription_stages")
      .select("*")
      .eq("is_active", true)
      .order("position", { ascending: true }),
    supabase
      .from("inscription_events")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("sessions")
      .select(
        "id, start_date, end_date, formation:formations(title)",
      )
      .order("start_date", { ascending: false })
      .limit(100),
    supabase
      .from("parcours")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("companies")
      .select(
        "id, name, type, representant_civility, representant_first_name, representant_last_name, representant_job_title",
      )
      .order("name"),
    supabase
      .from("learners")
      .select(
        "id, first_name, last_name, email, phone, mobile, job_title, civility, company_id, company:companies(name)",
      )
      .eq("is_active", true)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    // Accords OPCO déjà rattachés à cette inscription
    supabase
      .from("inscription_opco_fundings")
      .select(
        "amount_ht, agreement:opco_funding_agreements(id, opco_name, dossier_number, agreement_date, total_amount_ht, pdf_url, pdf_filename)",
      )
      .eq("inscription_id", id),
    // Tous les accords OPCO de l'organisation (pour proposer la liaison
    // d'un accord existant à cet apprenant)
    supabase
      .from("opco_funding_agreements")
      .select(
        "id, opco_name, dossier_number, agreement_date, total_amount_ht, pdf_url, pdf_filename",
      )
      .order("agreement_date", { ascending: false })
      .limit(100),
    // Autres inscriptions auxquelles l'utilisateur peut affecter
    // l'accord (multi-apprenants pour un même accord). Le filtrage
    // par session est fait en JS après chargement, car on ne connaît
    // pas encore target_session_id à ce stade (avant que `request`
    // soit résolu).
    supabase
      .from("inscription_requests")
      .select(
        "id, prospect_first_name, prospect_last_name, target_session_id",
      )
      .neq("id", id)
      .limit(200),
    // Référentiel OPCO (Gilles 2026-05-21) — utilisé par le dropdown
    // de financement quand mode = "opco". Triés alphabétiquement.
    supabase
      .from("opcos")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  if (error) throw error;
  if (!request) notFound();

  // === Référents pédagogiques (R6 — Gilles 2026-05-13) ===
  // Si l'apprenant a une société, on charge ses contacts entreprise +
  // la liste des référents déjà sélectionnés pour cette inscription.
  // Si pas de société (particulier), on ne charge rien — l'UI masque
  // le bloc.
  const companyIdForReferents = request.company_id as string | null;
  const [
    { data: companyContactsForReferents },
    { data: currentReferents },
  ] = await Promise.all([
    companyIdForReferents
      ? supabase
          .from("company_contacts")
          .select(
            "id, first_name, last_name, email, phone, mobile, job_title, role",
          )
          .eq("company_id", companyIdForReferents)
          .order("last_name", { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    supabase
      .from("inscription_referent_contacts")
      .select("contact_id")
      .eq("inscription_id", id),
  ]);
  const referentsCompanyName = companyIdForReferents
    ? (
        await supabase
          .from("companies")
          .select("name")
          .eq("id", companyIdForReferents)
          .maybeSingle()
      ).data?.name ?? null
    : null;
  const selectedReferentIds = (
    (currentReferents ?? []) as Array<{ contact_id: string }>
  ).map((r) => r.contact_id);

  const stagesArr = (stages ?? []) as InscriptionStage[];
  const eventsArr = (events ?? []) as InscriptionEvent[];
  const stageMap = new Map(stagesArr.map((s) => [s.id, s]));
  const currentStage = request.stage_id
    ? stageMap.get(request.stage_id)
    : null;

  // Refonte tarification 2026-05-31 : nom de l entreprise targetee pour
  // affichage dans le BillingPanel. Lecture best-effort, null si pas
  // d entreprise definie ou inaccessible.
  let billingTargetCompanyName: string | null = null;
  if (request.billing_target_company_id) {
    const { data: billCompany } = await supabase
      .from("companies")
      .select("name")
      .eq("id", request.billing_target_company_id)
      .maybeSingle<{ name: string | null }>();
    billingTargetCompanyName = billCompany?.name ?? null;
  }
  const billingTotalHt =
    request.billing_total_ht !== null &&
    request.billing_total_ht !== undefined
      ? Number(request.billing_total_ht)
      : null;
  const billingUnitPriceHt =
    request.billing_unit_price_ht !== null &&
    request.billing_unit_price_ht !== undefined
      ? Number(request.billing_unit_price_ht)
      : null;

  const update = updateInscription.bind(null, id);
  const remove = deleteInscription.bind(null, id);
  const transition = changeStageFromForm.bind(null, id);
  const note = addNote.bind(null, id);
  const convert = convertToEnrollment.bind(null, id);

  // Génération des URLs signées (30 min) pour tous les PDFs des accords
  // OPCO. Le bucket "opco-agreements" est privé : les liens publics ne
  // fonctionneraient pas. À la place, on génère un URL signé temporaire
  // qui permet d'ouvrir / télécharger le PDF même sans session active.
  // Le mapping est calculé une fois par chargement de page.
  const OPCO_BUCKET = "opco-agreements";
  const SIGNED_URL_EXPIRES_IN = 30 * 60; // 30 minutes
  async function resolveSignedUrl(
    stored: string | null | undefined,
  ): Promise<string | null> {
    if (!stored) return null;
    // Compatibilité : si une ancienne URL publique a été stockée, on
    // tente d'en extraire le path pour générer un URL signé propre.
    let path = stored;
    if (stored.startsWith("http")) {
      const marker = `/${OPCO_BUCKET}/`;
      const idx = stored.indexOf(marker);
      if (idx === -1) return stored; // URL non reconnue : on laisse tel quel
      path = stored.substring(idx + marker.length);
    }
    const { data } = await supabase.storage
      .from(OPCO_BUCKET)
      .createSignedUrl(path, SIGNED_URL_EXPIRES_IN);
    return data?.signedUrl ?? null;
  }
  const linkedAgreementUrls = new Map<string, string | null>();
  const availableAgreementUrls = new Map<string, string | null>();
  await Promise.all([
    ...(linkedFundings ?? []).map(async (row) => {
      const ag = row.agreement as unknown as {
        id: string;
        pdf_url: string | null;
      } | null;
      if (ag?.id) {
        linkedAgreementUrls.set(ag.id, await resolveSignedUrl(ag.pdf_url));
      }
    }),
    ...(allAgreements ?? []).map(async (a) => {
      availableAgreementUrls.set(
        a.id as string,
        await resolveSignedUrl(a.pdf_url as string | null),
      );
    }),
  ]);

  // Si la fiche vient juste d'être créée comme brouillon depuis
  // /inscriptions/new (query.fresh === "1"), on affiche un titre
  // dédié pour que l'utilisateur sache qu'il est en mode "création"
  // et non en édition d'une fiche existante.
  const isFreshDraft = query.fresh === "1";
  const computedName =
    [request.prospect_first_name, request.prospect_last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "Demande d'inscription";
  const fullName = isFreshDraft
    ? "Nouvelle demande d'inscription"
    : computedName;

  const queryRecord = query as Record<string, string | undefined>;
  const additionalCount = queryRecord.additional
    ? Number.parseInt(queryRecord.additional, 10)
    : 0;
  const notifs = [
    query.created && "Demande créée avec succès.",
    query.updated && "Modifications enregistrées.",
    additionalCount > 0 &&
      `${additionalCount} apprenant${additionalCount > 1 ? "s" : ""} supplémentaire${additionalCount > 1 ? "s" : ""} également inscrit${additionalCount > 1 ? "s" : ""}.`,
    query.stageChanged && "Étape mise à jour.",
    query.noteAdded && "Note ajoutée.",
    query.converted && "Demande convertie en inscription. Apprenant créé.",
    queryRecord.opcoAdded && "Accord OPCO enregistré.",
    queryRecord.opcoLinked && "Accord OPCO rattaché.",
    queryRecord.opcoUnlinked && "Accord OPCO détaché.",
    queryRecord.opcoDeleted && "Accord OPCO supprimé.",
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader
        title={fullName}
        description={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {currentStage && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border whitespace-nowrap"
                style={{
                  backgroundColor: `${currentStage.color}15`,
                  borderColor: currentStage.color ?? "#94a3b8",
                  color: currentStage.color ?? "#475569",
                }}
              >
                {currentStage.name}
              </span>
            )}
            <span className="text-slate-500">
              {INSCRIPTION_SOURCE_LABELS[request.source]}
            </span>
            {request.financing_mode && (
              <span className="text-slate-500">
                · {FINANCING_MODE_LABELS[request.financing_mode]}
              </span>
            )}
            {request.has_special_needs && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 text-xs font-medium">
                ♿ Besoin spécifique
              </span>
            )}
          </div>
        }
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Inscriptions", href: "/inscriptions" },
          { label: isFreshDraft ? "Nouvelle" : fullName },
        ]}
        actions={
          <>
            <BackButton fallbackHref="/inscriptions" />
            {isFreshDraft ? (
              /* En mode brouillon : le bouton "Annuler" supprime
                 réellement la fiche (qui est vide) pour ne pas laisser
                 de fantôme en BDD. Utilise la même action `remove` que
                 le bouton Supprimer existant. */
              <form action={remove}>
                <Button type="submit" variant="outline" size="sm">
                  Annuler
                </Button>
              </form>
            ) : (
              canDelete && (
                <form action={remove}>
                  <Button type="submit" variant="outline" size="sm">
                    <Trash2 className="h-4 w-4" />
                    Supprimer
                  </Button>
                </form>
              )
            )}
            <Button
              type="submit"
              size="sm"
              form="form-inscription"
              title={
                isFreshDraft
                  ? "Enregistrer cette nouvelle inscription"
                  : "Enregistrer les modifications"
              }
            >
              <Save className="h-4 w-4" />
              {isFreshDraft ? "Créer la demande" : "Enregistrer"}
            </Button>
          </>
        }
      />

      <div className="p-8 max-w-5xl space-y-6">
        {notifs.map((m, i) => (
          <div
            key={i}
            className="rounded-xl bg-cyan-50 border border-cyan-200 p-3 text-sm text-cyan-700"
          >
            {m}
          </div>
        ))}
        {query.error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {query.error}
          </div>
        )}

        {/* Bloc « Avancer dans le workflow » supprimé (Gilles 2026-05-21).
            Le changement d'étape se fait désormais uniquement via le
            StageQuickChanger du tableau des inscriptions (vue
            /inscriptions ou /sessions/[id]/participants). */}

        <SectionsControls
          storageKey={`inscription-sections:${id}`}
          defaultOpenIds={["source", "demandeur"]}
          forceDefaultOpen={query.fresh === "1"}
        >
          {/* Barre enregistrement haut */}
          <div className="flex items-center justify-end gap-3 rounded-xl bg-cyan-50 border border-cyan-200 px-4 py-3">
            <span className="text-xs text-cyan-800 mr-auto">
              Pensez à enregistrer après modification.
            </span>
            <Button
              variant="outline"
              type="button"
              size="sm"
              nativeButton={false}
              render={<Link href="/inscriptions" />}
            >
              Retour
            </Button>
            <Button type="submit" size="sm" form="form-inscription">
              <Save className="h-4 w-4" />
              Enregistrer
            </Button>
          </div>

          <form id="form-inscription" action={update}>
            {/* Contexte de retour propagé depuis /inscriptions/new
                (cas d'un brouillon créé depuis l'onglet Participants
                d'une session). updateInscription lit ces champs pour
                rediriger vers la session après save. */}
            {query.return_to && (
              <input
                type="hidden"
                name="return_to"
                value={query.return_to}
              />
            )}
            {query.session_id && (
              <input
                type="hidden"
                name="session_id"
                value={query.session_id}
              />
            )}
            <InscriptionForm
              request={request}
              referentsSlot={
                // R6 : bloc Référents pédagogiques rendu DANS le
                // formulaire, entre l'Entreprise et la cible Session/
                // Parcours. Masqué si l'apprenant n'a pas de société.
                companyIdForReferents ? (
                  <div className="rounded-lg bg-cyan-50/40 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900 p-4 space-y-3">
                    <div>
                      <h3 className="text-sm font-bold inline-flex items-center gap-1.5">
                        <UserCheck className="h-4 w-4 text-cyan-700" />
                        Référents pédagogiques de{" "}
                        {referentsCompanyName ?? "la société"}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Contacts entreprise qui recevront en{" "}
                        <strong>copie (CC)</strong> les emails liés à cet
                        apprenant : confirmation d&apos;inscription,
                        convocation, convention, attestation.
                      </p>
                    </div>
                    <ReferentPicker
                      inscriptionId={id}
                      companyId={companyIdForReferents}
                      companyName={referentsCompanyName}
                      contacts={
                        (companyContactsForReferents ?? []) as Array<{
                          id: string;
                          first_name: string | null;
                          last_name: string | null;
                          email: string | null;
                          phone: string | null;
                          mobile: string | null;
                          job_title: string | null;
                          role: string | null;
                        }>
                      }
                      selectedContactIds={selectedReferentIds}
                    />
                  </div>
                ) : null
              }
              sessions={(sessions ?? []).map((s) => {
                const f = s.formation as unknown as { title: string } | null;
                return {
                  id: s.id as string,
                  label: `${f?.title ?? "Session"} · ${new Date(s.start_date as string).toLocaleDateString("fr-FR")}`,
                };
              })}
              parcours={(parcours ?? []).map((p) => ({
                id: p.id as string,
                label: p.name as string,
              }))}
              companies={(companies ?? []).map((c) => ({
                id: c.id as string,
                name: c.name as string,
                type: (c.type as string | null) ?? null,
              }))}
              learners={(learners ?? []).map((l) => {
                const company = l.company as unknown as {
                  name: string;
                } | null;
                return {
                  id: l.id as string,
                  first_name: l.first_name as string | null,
                  last_name: l.last_name as string,
                  email: l.email as string | null,
                  phone: (l.phone as string | null) ?? null,
                  mobile: (l.mobile as string | null) ?? null,
                  job_title: (l.job_title as string | null) ?? null,
                  civility: (l.civility as string | null) ?? null,
                  company_id: (l.company_id as string | null) ?? null,
                  company_name: company?.name ?? null,
                };
              })}
              opcos={opcos ?? []}
              financementExtra={
                // On rend TOUJOURS le composant côté serveur : il décide
                // lui-même de sa visibilité en observant le <select> en
                // direct (réactif sans save+reload). Permet à l'utilisateur
                // de voir le panneau apparaître dès qu'il choisit "OPCO"
                // dans le mode de financement. Cf. memory pour la règle.
                <OpcoFundingPanel
                    inscriptionId={id}
                    autoOpenCreate={query.openOpcoModal === "1"}
                    prefillOpcoName={query.prefill_opco_name ?? null}
                    linkedAgreements={(linkedFundings ?? []).flatMap((row) => {
                      const ag = row.agreement as unknown as {
                        id: string;
                        opco_name: string;
                        dossier_number: string | null;
                        agreement_date: string | null;
                        total_amount_ht: number | null;
                        pdf_url: string | null;
                        pdf_filename: string | null;
                      } | null;
                      if (!ag) return [];
                      return [
                        {
                          id: ag.id,
                          opco_name: ag.opco_name,
                          dossier_number: ag.dossier_number,
                          agreement_date: ag.agreement_date,
                          total_amount_ht:
                            ag.total_amount_ht !== null
                              ? Number(ag.total_amount_ht)
                              : null,
                          pdf_url:
                            linkedAgreementUrls.get(ag.id) ?? null,
                          pdf_filename: ag.pdf_filename,
                          amount_ht:
                            row.amount_ht !== null &&
                            row.amount_ht !== undefined
                              ? Number(row.amount_ht)
                              : null,
                        },
                      ];
                    })}
                    availableAgreements={(allAgreements ?? [])
                      .filter(
                        (a) =>
                          !(linkedFundings ?? []).some((lf) => {
                            const ag = lf.agreement as unknown as {
                              id: string;
                            } | null;
                            return ag?.id === a.id;
                          }),
                      )
                      .map((a) => ({
                        id: a.id as string,
                        opco_name: a.opco_name as string,
                        dossier_number: a.dossier_number as string | null,
                        agreement_date: a.agreement_date as string | null,
                        total_amount_ht:
                          a.total_amount_ht !== null
                            ? Number(a.total_amount_ht)
                            : null,
                        pdf_url:
                          availableAgreementUrls.get(a.id as string) ?? null,
                        pdf_filename: a.pdf_filename as string | null,
                      }))}
                    sessionId={request.target_session_id ?? null}
                    sessionInscriptions={(otherInscriptionsRaw ?? [])
                      .filter(
                        (oi) =>
                          request.target_session_id &&
                          (oi.target_session_id as string | null) ===
                            request.target_session_id,
                      )
                      .map((oi) => {
                        const fullName =
                          [oi.prospect_first_name, oi.prospect_last_name]
                            .filter(Boolean)
                            .join(" ")
                            .trim() || "Apprenant";
                        return {
                          id: oi.id as string,
                          first_name: oi.prospect_first_name as string | null,
                          last_name:
                            (oi.prospect_last_name as string | null) ?? "",
                          full_name: fullName,
                        };
                      })}
                  />
              }
            />
          </form>

          {/* Bloc Facturation (refonte tarification 2026-05-31) — affiche
              qui CAP facture + combien, calcul auto OU saisie manuelle. */}
          <BillingPanel
            inscriptionId={id}
            billingTargetCompanyId={request.billing_target_company_id ?? null}
            billingTargetCompanyName={billingTargetCompanyName}
            billingPricingMode={request.billing_pricing_mode ?? null}
            billingUnitPriceHt={billingUnitPriceHt}
            billingTotalHt={billingTotalHt}
            billingManuallyOverridden={!!request.billing_manually_overridden}
            billingNotes={request.billing_notes ?? null}
          />

          {/* Décomposition OPCO + Employeur (refonte 2026-06-01) —
              visible uniquement si au moins 1 accord OPCO rattaché. */}
          {(() => {
            const opcoTotalHt = (linkedFundings ?? []).reduce(
              (acc, row) => {
                const amt =
                  row.amount_ht !== null && row.amount_ht !== undefined
                    ? Number(row.amount_ht)
                    : 0;
                return acc + (Number.isFinite(amt) && amt > 0 ? amt : 0);
              },
              0,
            );
            const hasOpcoFundings =
              (linkedFundings ?? []).length > 0 && opcoTotalHt > 0;
            const employerAmountStored =
              (
                request as unknown as {
                  employer_amount_ht?: number | string | null;
                }
              ).employer_amount_ht;
            const employerAmountNum =
              employerAmountStored !== null &&
              employerAmountStored !== undefined
                ? Number(employerAmountStored)
                : null;
            return (
              <EmployerAmountField
                inscriptionId={id}
                totalHt={billingTotalHt}
                opcoTotalHt={opcoTotalHt}
                employerAmountStored={employerAmountNum}
                hasOpcoFundings={hasOpcoFundings}
              />
            );
          })()}

          {/* Note rapide */}
          <div className="rounded-xl bg-amber-50/40 border border-amber-200 p-4 space-y-3">
            <p className="text-sm font-bold inline-flex items-center gap-1.5 text-amber-800">
              <Send className="h-4 w-4" />
              Ajouter une note dans la timeline
            </p>
            <form action={note} className="space-y-2">
              <Textarea
                name="note"
                rows={2}
                placeholder="Ex: Appel téléphonique, RDV planifié, document reçu…"
                required
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" variant="outline">
                  Ajouter à la timeline
                </Button>
              </div>
            </form>
          </div>

          {/* Timeline */}
          <div className="rounded-xl bg-white border border-slate-200 p-5 space-y-3">
            <p className="text-sm font-bold uppercase tracking-wider text-slate-500 inline-flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Historique de la demande ({eventsArr.length})
            </p>
            {eventsArr.length === 0 ? (
              <p className="text-sm text-slate-400 italic">
                Aucun événement.
              </p>
            ) : (
              <ol className="relative border-l-2 border-slate-200 pl-5 space-y-3">
                {eventsArr.map((e) => {
                  const fromStage = e.from_stage_id
                    ? stageMap.get(e.from_stage_id)
                    : null;
                  const toStage = e.to_stage_id
                    ? stageMap.get(e.to_stage_id)
                    : null;
                  const note =
                    (e.payload as { note?: string; comment?: string })?.note ??
                    (e.payload as { comment?: string })?.comment ??
                    null;
                  return (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-cyan-500 ring-2 ring-white" />
                      <div className="text-xs text-slate-400">
                        {new Date(e.created_at).toLocaleString("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </div>
                      <p className="text-sm font-medium">
                        {INSCRIPTION_EVENT_LABELS[e.event_type] ??
                          e.event_type}
                        {e.event_type === "stage_changed" &&
                          fromStage &&
                          toStage && (
                            <span className="text-slate-500 font-normal">
                              {" "}
                              : {fromStage.name} →{" "}
                              <strong>{toStage.name}</strong>
                            </span>
                          )}
                        {e.event_type === "stage_changed" &&
                          !fromStage &&
                          toStage && (
                            <span className="text-slate-500 font-normal">
                              {" "}
                              vers <strong>{toStage.name}</strong>
                            </span>
                          )}
                      </p>
                      {note && (
                        <p className="text-sm text-slate-600 mt-0.5 italic">
                          “{note}”
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Barre enregistrement bas */}
          <div className="mt-2 flex items-center justify-between gap-3">
            {canDelete ? (
              <form action={remove}>
                <Button type="submit" variant="destructive">
                  <Trash2 className="h-4 w-4" />
                  Supprimer
                </Button>
              </form>
            ) : (
              <span />
            )}
            <div className="flex gap-3">
              <Button
                variant="outline"
                type="button"
                nativeButton={false}
                render={<Link href="/inscriptions" />}
              >
                Retour
              </Button>
              <Button type="submit" form="form-inscription">
                <Save className="h-4 w-4" />
                Enregistrer
              </Button>
            </div>
          </div>
        </SectionsControls>
      </div>
    </>
  );
}
