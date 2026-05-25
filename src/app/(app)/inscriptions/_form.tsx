import {
  Accessibility,
  ClipboardList,
  Euro,
  Send,
  User,
  Users,
} from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { AutoSyncBadge } from "@/components/auto-sync-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TargetPickers } from "./_target-pickers";
import { AdditionalLearners } from "./_additional-learners";
import { InscriptionChannelField } from "./_channel-field";
import { FinancingSection } from "./_financing-section";
import {
  INSCRIPTION_SOURCE_LABELS,
  type InscriptionRequest,
} from "@/lib/inscriptions/types";
import type { Opco } from "@/lib/opcos/types";

type SessionOption = { id: string; label: string };
type ParcoursOption = { id: string; label: string };
type CompanyOption = { id: string; name: string; type?: string | null };
type LearnerOption = {
  id: string;
  first_name: string | null;
  last_name: string;
  email: string | null;
  phone: string | null;
  /** Portable. Priorisé sur phone à l'auto-remplissage d'inscription. */
  mobile: string | null;
  job_title: string | null;
  civility: string | null;
  company_id: string | null;
  company_name: string | null;
};

type Props = {
  request?: InscriptionRequest;
  sessions: SessionOption[];
  parcours: ParcoursOption[];
  companies: CompanyOption[];
  learners: LearnerOption[];
  /** Référentiel des OPCO (Gilles 2026-05-21 — Phase 2 OPCO). Affiché
   *  comme dropdown quand mode_financement = "opco". */
  opcos: Opco[];
  /** Présélectionne la session cible (utile depuis la liste des sessions). */
  defaultSessionId?: string | null;
  defaultParcoursId?: string | null;
  defaultFormationId?: string | null;
  /**
   * Contenu additionnel rendu à la fin du bloc Financement (ex.
   * panneau « Accords OPCO »). Permet de garder la cohérence visuelle :
   * tout ce qui touche au financement reste groupé.
   */
  financementExtra?: React.ReactNode;
  /**
   * Slot des référents pédagogiques (R6 — Gilles 2026-05-13) rendu
   * entre l'Entreprise et la cible Session/Parcours, puisque le choix
   * des référents dépend de l'entreprise sélectionnée.
   */
  referentsSlot?: React.ReactNode;
};

export function InscriptionForm({
  request,
  sessions,
  parcours,
  companies,
  learners,
  opcos,
  defaultSessionId,
  defaultParcoursId,
  defaultFormationId,
  financementExtra,
  referentsSlot,
}: Props) {
  const sessionDefault =
    request?.target_session_id ?? defaultSessionId ?? "";
  const parcoursDefault =
    request?.target_parcours_id ?? defaultParcoursId ?? "";
  const formationDefault =
    request?.target_formation_id ?? defaultFormationId ?? "";

  // Champ caché pour transmettre target_formation_id (pas exposé à l'écran)
  const hiddenFormationInput = formationDefault ? (
    <input
      type="hidden"
      name="target_formation_id"
      value={formationDefault}
    />
  ) : null;
  return (
    <div className="space-y-4 inscription-fields">
      {/* Source de la demande — placée EN PREMIER : l'utilisateur définit
          d'abord d'où vient la demande (CAP NUMERIQUE direct / prescripteur
          / OF), ce qui conditionne ensuite le mode de financement et la
          saisie du demandeur. */}
      <CollapsibleSection
        icon={Send}
        title="Source de la demande"
        description="Comment la demande est-elle arrivée ?"
        accent="blue"
        defaultOpen
        id="source"
      >
        <div className="space-y-5">
          {/* Canal d'inscription : qui apporte la demande ?
              CAP NUMERIQUE en direct, un prescripteur, ou un autre OF. */}
          <div className="rounded-lg bg-blue-50/50 border border-blue-200 p-3.5">
            <InscriptionChannelField
              defaultChannel={request?.inscription_channel ?? "direct"}
              defaultCompanyId={request?.inscription_channel_company_id ?? null}
              companies={companies}
              formId="form-inscription"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="source">Canal technique</Label>
              <select
                id="source"
                name="source"
                form="form-inscription"
                defaultValue={request?.source ?? "email"}
                className="flex h-9 w-full rounded-md border border-slate-300 bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {Object.entries(INSCRIPTION_SOURCE_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="source_details">Détails de la source</Label>
              <Input
                id="source_details"
                name="source_details"
                form="form-inscription"
                defaultValue={request?.source_details ?? ""}
                placeholder="Ex: Formulaire site web - page Marchés publics"
              />
            </div>
          </div>
          {/* Champ caché : on préserve la valeur legacy `request_message`
              si elle existe (anciennes inscriptions saisies avant la
              suppression du textarea). Évite d'écraser l'historique. */}
          <input
            type="hidden"
            name="request_message"
            form="form-inscription"
            value={request?.request_message ?? ""}
          />
        </div>
      </CollapsibleSection>

      {/* Apprenant + Entreprise + Session (unifié) */}
      <CollapsibleSection
        icon={User}
        title="Demandeur, entreprise et formation"
        description="Recherchez un apprenant existant ou saisissez un nouveau prospect. L'entreprise se rattache automatiquement."
        accent="emerald"
        defaultOpen
        id="demandeur"
      >
        {/* Indicateur de synchronisation auto avec la fiche apprenant.
            Au clic, l'utilisateur voit la liste exacte des règles
            actives. Évite l'effet « boîte noire ». */}
        <div className="mb-3 flex items-center gap-2">
          <AutoSyncBadge
            title="Synchronisation avec la fiche apprenant"
            rules={[
              {
                field: "Email",
                target: "Fiche apprenant",
                condition: "Reporté si le champ est vide sur la fiche.",
              },
              {
                field: "Téléphone",
                target: "Fiche apprenant",
                condition: "Reporté si le champ est vide sur la fiche.",
              },
              {
                field: "Date de naissance",
                target: "Fiche apprenant",
                condition: "Reportée si le champ est vide sur la fiche.",
              },
              {
                field: "Fonction",
                target: "Fiche apprenant",
                condition: "Reportée si le champ est vide sur la fiche.",
              },
              {
                field: "Entreprise",
                target: "Fiche apprenant",
                condition: "Rattachée si l'apprenant n'a pas encore d'entreprise.",
              },
            ]}
            footnote={
              <>
                Une donnée déjà renseignée sur la fiche apprenant n&apos;est{" "}
                <strong>jamais écrasée</strong> par cette synchronisation.
                Modifiez-la directement depuis le module Apprenants si
                besoin.
              </>
            }
          />
        </div>
        {hiddenFormationInput}
        <TargetPickers
          learners={learners}
          companies={companies}
          sessions={sessions.map((s) => ({
            id: s.id,
            label: s.label,
            meta: null,
            modality: null,
          }))}
          parcoursOptions={parcours}
          defaults={{
            learnerId: request?.learner_id ?? null,
            companyId: request?.company_id ?? null,
            sessionId: sessionDefault || null,
            parcoursId: parcoursDefault || null,
            formationId: formationDefault || null,
            companyFreetext: request?.company_name_freetext ?? null,
            prospectFirstName: request?.prospect_first_name ?? null,
            prospectLastName: request?.prospect_last_name ?? null,
            prospectEmail: request?.prospect_email ?? null,
            prospectPhone: request?.prospect_phone ?? null,
            prospectMobile:
              (request as unknown as { prospect_mobile?: string | null } | null)
                ?.prospect_mobile ?? null,
            prospectBirthDate: request?.prospect_birth_date ?? null,
            // Civilité persistée sur l'inscription (migration 0098).
            // Bug Gilles 2026-05-26 : la valeur n'était pas relue au
            // chargement de la fiche, du coup le select repartait vide
            // après save même si la BDD avait la bonne valeur.
            prospectCivility:
              (request as unknown as {
                prospect_civility?: string | null;
              } | null)?.prospect_civility ?? null,
          }}
          referentsSlot={referentsSlot}
        />
      </CollapsibleSection>

      {/* Apprenants supplémentaires — multi-inscription (Gilles 2026-05-21).
          Permet d'inscrire plusieurs apprenants à la même session en une
          seule saisie. Tous héritent de l'entreprise et du financement
          ci-dessus. */}
      <CollapsibleSection
        icon={Users}
        title="Inscrire d'autres apprenants à cette session"
        description="Ajoutez d'un coup plusieurs apprenants — mêmes entreprise, session et financement."
        accent="blue"
        id="apprenants-supplementaires"
      >
        <AdditionalLearners learners={learners} />
      </CollapsibleSection>

      {/* Financement — section refondue en composant client pour gérer
          dynamiquement l'affichage du dropdown OPCO (Gilles 2026-05-21). */}
      <CollapsibleSection
        icon={Euro}
        title="Financement"
        description="Mode de prise en charge et montant prévisionnel."
        accent="amber"
        id="financement"
      >
        <FinancingSection
          defaultFinancingMode={request?.financing_mode ?? null}
          defaultFinancingDetails={request?.financing_details ?? null}
          defaultQuoteAmount={request?.quote_amount_ht ?? null}
          defaultOpcoId={
            (request as { opco_id?: string | null } | undefined)?.opco_id ??
            null
          }
          opcos={opcos}
          isCreate={!request}
        />
        {/* Slot : panneau Accord OPCO rendu directement à l'intérieur
            du bloc Financement pour que toute la logique de financement
            soit groupée visuellement. */}
        {financementExtra && (
          <div className="mt-5 pt-5 border-t border-amber-200/60">
            {financementExtra}
          </div>
        )}
      </CollapsibleSection>

      {/* Handicap (Qualiopi) */}
      <CollapsibleSection
        icon={Accessibility}
        title="Adaptation & handicap"
        description="Qualiopi indic. 19 — besoin spécifique de l'apprenant."
        accent="rose"
        id="handicap"
      >
        <div className="space-y-5">
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              name="has_special_needs"
              form="form-inscription"
              defaultChecked={request?.has_special_needs ?? false}
              className="h-4 w-4 mt-0.5 rounded border-slate-300 text-cyan-600"
            />
            <span>
              <span className="font-semibold">
                L&apos;apprenant déclare un besoin spécifique d&apos;adaptation
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">
                (handicap visible/invisible, besoin d&apos;adaptation
                pédagogique, matérielle ou logistique)
              </span>
            </span>
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="special_needs_details">
              Précisions sur le besoin
            </Label>
            <Textarea
              id="special_needs_details"
              name="special_needs_details"
              form="form-inscription"
              rows={3}
              defaultValue={request?.special_needs_details ?? ""}
              placeholder=" "
            />
            <p className="text-[11px] text-slate-500">
              💡 Si coché, le référent handicap sera notifié dans la timeline.
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Notes internes */}
      <CollapsibleSection
        icon={ClipboardList}
        title="Notes internes"
        description="Informations non transmises à l'apprenant."
        accent="zinc"
        id="notes"
      >
        <div className="space-y-1.5">
          <Label htmlFor="notes_internal">Notes</Label>
          <Textarea
            id="notes_internal"
            name="notes_internal"
            form="form-inscription"
            rows={4}
            defaultValue={request?.notes_internal ?? ""}
            placeholder=" "
          />
        </div>
      </CollapsibleSection>
    </div>
  );
}
