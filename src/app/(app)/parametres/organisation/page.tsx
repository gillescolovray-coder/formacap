import {
  Award,
  Building2,
  Clock,
  FileText,
  ImageIcon,
  Megaphone,
  PenTool,
  QrCode,
  Upload,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  removeCommercialBanner,
  removeLogo,
  removeQualiopiCertificate,
  removeSignatureStamp,
  updateDefaultHours,
  updateEmargementSettings,
  updateLegalMentions,
  updateOrgIdentity,
  uploadCommercialBanner,
  uploadLogo,
  uploadQualiopiCertificate,
  uploadSignatureStamp,
} from "./actions";
import { DefaultHoursForm } from "./_default-hours-form";
import { LegalMentionsForm } from "./_legal-mentions-form";
import { OrgIdentityForm } from "./_identity-form";
import { ParametresNav } from "../_nav";

type OrgInfo = {
  id: string;
  name: string;
  logo_url: string | null;
  legal_mentions: string | null;
  siret: string | null;
  nda: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  default_morning_start: string | null;
  default_morning_end: string | null;
  default_afternoon_start: string | null;
  default_afternoon_end: string | null;
  qualiopi_certificate_path: string | null;
  qualiopi_certificate_filename: string | null;
  qualiopi_certificate_expires_at: string | null;
  qualiopi_certificate_uploaded_at: string | null;
  commercial_banner_path: string | null;
  commercial_banner_filename: string | null;
  commercial_banner_uploaded_at: string | null;
  signature_stamp_path: string | null;
  signature_stamp_filename: string | null;
  signature_stamp_uploaded_at: string | null;
  emargement_token_ttl_days: number | null;
  realization_certificate_threshold_percent: number | null;
};

/** Tronque "HH:MM:SS" → "HH:MM" pour <input type="time">. */
function trimTime(t: string | null | undefined): string {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export default async function OrganizationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
    deleted?: string;
    hoursSaved?: string;
    legalSaved?: string;
    identitySaved?: string;
    qualiopiSaved?: string;
    qualiopiDeleted?: string;
    bannerSaved?: string;
    bannerDeleted?: string;
    signatureSaved?: string;
    signatureDeleted?: string;
    emargementSaved?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select(
      "role, organization:organizations(id, name, logo_url, legal_mentions, siret, nda, address, postal_code, city, phone, email, website, default_morning_start, default_morning_end, default_afternoon_start, default_afternoon_end, qualiopi_certificate_path, qualiopi_certificate_filename, qualiopi_certificate_expires_at, qualiopi_certificate_uploaded_at, commercial_banner_path, commercial_banner_filename, commercial_banner_uploaded_at, signature_stamp_path, signature_stamp_filename, signature_stamp_uploaded_at, emargement_token_ttl_days, realization_certificate_threshold_percent)",
    )
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  const org =
    (membership?.organization as unknown as OrgInfo | null) ?? null;

  if (!membership || !org) {
    return (
      <>
        <PageHeader
          title="Paramètres de l'organisation"
          breadcrumbs={[
            { label: "Tableau de bord", href: "/dashboard" },
            { label: "Paramètres" },
          ]}
        />
        <ParametresNav />
        <div className="p-8 max-w-2xl">
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 p-4 text-sm text-amber-700 dark:text-amber-300">
            Accès réservé aux administrateurs de l&apos;organisation.
          </div>
        </div>
      </>
    );
  }

  const upload = uploadLogo.bind(null, org.id);
  const remove = removeLogo.bind(null, org.id);
  const saveHours = updateDefaultHours.bind(null, org.id);
  const saveLegal = updateLegalMentions.bind(null, org.id);
  const saveIdentity = updateOrgIdentity.bind(null, org.id);
  const uploadCert = uploadQualiopiCertificate.bind(null, org.id);
  const removeCert = removeQualiopiCertificate.bind(null, org.id);
  const uploadBanner = uploadCommercialBanner.bind(null, org.id);
  const removeBanner = removeCommercialBanner.bind(null, org.id);
  const uploadSignature = uploadSignatureStamp.bind(null, org.id);
  const removeSignature = removeSignatureStamp.bind(null, org.id);
  const saveEmargement = updateEmargementSettings.bind(null, org.id);

  // URL publique du bandeau (bucket public, pas besoin de signer)
  const bannerUrl = org.commercial_banner_path
    ? supabase.storage
        .from("organization-banners")
        .getPublicUrl(org.commercial_banner_path).data.publicUrl
    : null;

  // URL signée de la signature (bucket privé). 5min de TTL, suffisant
  // pour afficher l'aperçu dans le formulaire après chargement de la page.
  const signatureUrl = org.signature_stamp_path
    ? (
        await supabase.storage
          .from("organization-signatures")
          .createSignedUrl(org.signature_stamp_path, 300)
      ).data?.signedUrl ?? null
    : null;

  // État du certificat Qualiopi (alerte si expire dans <3 mois ou expiré)
  const certExpiresAt = org.qualiopi_certificate_expires_at
    ? new Date(org.qualiopi_certificate_expires_at)
    : null;
  const now = new Date();
  const daysUntilExpiry = certExpiresAt
    ? Math.ceil(
        (certExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      )
    : null;
  const certStatus: "expired" | "warning" | "ok" | "missing" =
    !org.qualiopi_certificate_path
      ? "missing"
      : daysUntilExpiry === null
        ? "missing"
        : daysUntilExpiry < 0
          ? "expired"
          : daysUntilExpiry < 90
            ? "warning"
            : "ok";

  return (
    <>
      <PageHeader
        title="Paramètres de l'organisation"
        description={org.name}
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres" },
        ]}
      />
      <ParametresNav />
      <div className="p-8 max-w-2xl space-y-6">
        {params.error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {params.error}
          </div>
        )}
        {params.success && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Logo mis à jour.
          </div>
        )}
        {params.deleted && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Logo supprimé.
          </div>
        )}
        {params.hoursSaved && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Horaires par défaut enregistrés.
          </div>
        )}
        {params.legalSaved && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Mentions légales enregistrées.
          </div>
        )}
        {params.identitySaved && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Identité de l&apos;organisation enregistrée.
          </div>
        )}
        {params.qualiopiSaved && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Certificat Qualiopi enregistré.
          </div>
        )}
        {params.qualiopiDeleted && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Certificat Qualiopi supprimé.
          </div>
        )}
        {params.bannerSaved && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Bandeau commercial enregistré.
          </div>
        )}
        {params.bannerDeleted && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Bandeau commercial supprimé.
          </div>
        )}
        {params.signatureSaved && (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 p-4 text-sm text-rose-700 dark:text-rose-300">
            Signature et cachet enregistrés.
          </div>
        )}
        {params.signatureDeleted && (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 p-4 text-sm text-rose-700 dark:text-rose-300">
            Signature et cachet supprimés.
          </div>
        )}

        {/* Identité légale : raison sociale, SIRET, NDA, adresse, contact… */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Identité de l&apos;organisation
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Coordonnées légales reprises dans les conventions de formation,
              attestations et autres documents Qualiopi. Renseigne au minimum
              le SIRET et le N° de Déclaration d&apos;Activité.
            </p>
          </div>
          <OrgIdentityForm
            action={saveIdentity}
            initial={{
              name: org.name,
              siret: org.siret,
              nda: org.nda,
              address: org.address,
              postal_code: org.postal_code,
              city: org.city,
              phone: org.phone,
              email: org.email,
              website: org.website,
            }}
          />
        </section>

        {/* Logo */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Logo de l&apos;organisation
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Ce logo apparaîtra sur les documents imprimés (feuilles
              d&apos;émargement, conventions, attestations…).
            </p>
          </div>

          {/* Aperçu du logo actuel */}
          <div className="flex items-center gap-4 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-6">
            {org.logo_url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={org.logo_url}
                  alt={`Logo ${org.name}`}
                  className="max-h-24 max-w-[200px] object-contain"
                />
                <form action={remove}>
                  <Button type="submit" variant="destructive" size="sm">
                    Supprimer le logo
                  </Button>
                </form>
              </>
            ) : (
              <div className="flex items-center gap-3 text-zinc-500">
                <div className="h-20 w-20 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
                </div>
                <p className="text-sm">Aucun logo défini.</p>
              </div>
            )}
          </div>

          {/* Upload */}
          <form action={upload} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="logo">
                {org.logo_url ? "Remplacer le logo" : "Uploader un logo"}
              </Label>
              <input
                id="logo"
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                required
                className="block w-full text-sm text-zinc-600 dark:text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-zinc-900 file:text-white hover:file:bg-zinc-800 dark:file:bg-white dark:file:text-zinc-900 dark:hover:file:bg-zinc-200 cursor-pointer"
              />
              <p className="text-xs text-zinc-500">
                Formats acceptés : PNG, JPEG, SVG, WebP. Taille max : 2 Mo.
                Idéalement un fichier carré ou rectangulaire large avec fond
                transparent.
              </p>
            </div>
            <Button type="submit">
              <Upload className="h-4 w-4" />
              Envoyer
            </Button>
          </form>
        </section>

        {/* Mentions légales — placées juste sous le logo, reprises en
            pied de page de tous les documents imprimables (feuilles
            d'émargement, conventions, attestations…). */}
        <section
          id="legal-mentions"
          className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4"
        >
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Mentions légales
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Texte repris en <strong>pied de page de tous les documents
              imprimables</strong> (convention, convocation, feuille
              d&apos;émargement, catalogue). Indiquez ici votre raison
              sociale, SIRET, numéro de déclaration d&apos;activité, adresse,
              téléphone, email — toutes les informations légales obligatoires.
              Mise en forme riche disponible (gras, italique, couleurs).
            </p>
          </div>

          <LegalMentionsForm
            action={saveLegal}
            initialHtml={org.legal_mentions ?? ""}
          />
        </section>

        {/* Certificat Qualiopi — fichier officiel téléchargé en pièce
            jointe lors de l'envoi d'une convention de formation par email
            (cf. R8 / Sprint Qualiopi 2026-05-14). Alerte visuelle si le
            certificat expire dans <3 mois ou est déjà expiré. */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-600" />
              Certificat Qualiopi
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Le PDF du certificat Qualiopi en cours de validité de votre
              organisme. Il est joint automatiquement à chaque convention
              de formation envoyée par email aux entreprises.
            </p>
          </div>

          {certStatus === "expired" && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              ⚠️ <strong>Certificat expiré</strong> depuis le{" "}
              {certExpiresAt?.toLocaleDateString("fr-FR")} ·{" "}
              <strong>
                Renouvelez-le rapidement
              </strong>{" "}
              et remplacez le PDF ci-dessous.
            </div>
          )}
          {certStatus === "warning" && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              ⏰ Certificat valide jusqu&apos;au{" "}
              <strong>{certExpiresAt?.toLocaleDateString("fr-FR")}</strong>{" "}
              — soit dans {daysUntilExpiry} jours. Pensez au renouvellement.
            </div>
          )}
          {certStatus === "ok" && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
              ✓ Certificat valide jusqu&apos;au{" "}
              <strong>{certExpiresAt?.toLocaleDateString("fr-FR")}</strong>.
            </div>
          )}
          {certStatus === "missing" && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-sm text-zinc-600">
              Aucun certificat Qualiopi téléversé pour l&apos;instant. Les
              conventions seront envoyées sans pièce jointe certificat.
            </div>
          )}

          {/* Aperçu du certificat actuel + suppression */}
          {org.qualiopi_certificate_path && (
            <div className="flex items-center gap-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-amber-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {org.qualiopi_certificate_filename ?? "Certificat.pdf"}
                </p>
                {org.qualiopi_certificate_uploaded_at && (
                  <p className="text-xs text-zinc-500">
                    Téléversé le{" "}
                    {new Date(
                      org.qualiopi_certificate_uploaded_at,
                    ).toLocaleDateString("fr-FR")}
                  </p>
                )}
              </div>
              <form action={removeCert}>
                <Button type="submit" variant="destructive" size="sm">
                  Supprimer
                </Button>
              </form>
            </div>
          )}

          {/* Upload */}
          <form action={uploadCert} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="qualiopi_file">
                  {org.qualiopi_certificate_path
                    ? "Remplacer le certificat (PDF)"
                    : "Téléverser le certificat (PDF)"}
                </Label>
                <input
                  id="qualiopi_file"
                  name="file"
                  type="file"
                  accept="application/pdf"
                  required
                  className="block w-full text-sm text-zinc-600 dark:text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-zinc-900 file:text-white hover:file:bg-zinc-800 dark:file:bg-white dark:file:text-zinc-900 cursor-pointer"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qualiopi_expires_at">
                  Date d&apos;expiration *
                </Label>
                <Input
                  id="qualiopi_expires_at"
                  name="expires_at"
                  type="date"
                  required
                  defaultValue={
                    org.qualiopi_certificate_expires_at ?? undefined
                  }
                  className="text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-zinc-500">
              PDF uniquement. Taille max : 5 Mo. La date d&apos;expiration
              est utilisée pour vous alerter quand le renouvellement
              approche (3 mois avant).
            </p>
            <Button type="submit">
              <Upload className="h-4 w-4" />
              Enregistrer le certificat
            </Button>
          </form>
        </section>

        {/* Bandeau commercial — image affichée sur la 1ère page des
            conventions de formation pour faire connaître les autres
            produits/services de l'OF (cross-selling). Décision Gilles
            2026-05-14. */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-violet-600" />
              Bandeau commercial
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Image présentant vos autres produits/services, affichée sur
              la première page des conventions de formation envoyées aux
              entreprises. Format recommandé : bandeau horizontal (largeur
              ~1500 px, hauteur 200-300 px).
            </p>
          </div>

          {/* Aperçu du bandeau actuel + suppression */}
          {bannerUrl ? (
            <div className="space-y-3">
              <div className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bannerUrl}
                  alt="Bandeau commercial"
                  className="w-full h-auto"
                />
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                <span>
                  {org.commercial_banner_filename ?? "banner.png"}
                  {org.commercial_banner_uploaded_at && (
                    <>
                      {" "}
                      · téléversé le{" "}
                      {new Date(
                        org.commercial_banner_uploaded_at,
                      ).toLocaleDateString("fr-FR")}
                    </>
                  )}
                </span>
                <form action={removeBanner}>
                  <Button type="submit" variant="destructive" size="sm">
                    Supprimer
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-sm text-zinc-600">
              Aucun bandeau commercial téléversé pour l&apos;instant.
            </div>
          )}

          {/* Upload */}
          <form action={uploadBanner} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="banner_file">
                {bannerUrl ? "Remplacer le bandeau" : "Téléverser un bandeau"}
              </Label>
              <input
                id="banner_file"
                name="file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                className="block w-full text-sm text-zinc-600 dark:text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-zinc-900 file:text-white hover:file:bg-zinc-800 dark:file:bg-white dark:file:text-zinc-900 cursor-pointer"
              />
              <p className="text-xs text-zinc-500">
                Formats acceptés : PNG, JPEG, WebP. Taille max : 3 Mo. Évitez
                les textes trop petits qui seraient illisibles à
                l&apos;impression.
              </p>
            </div>
            <Button type="submit">
              <Upload className="h-4 w-4" />
              Envoyer le bandeau
            </Button>
          </form>
        </section>

        {/* Signature & cachet du dirigeant — apposés automatiquement sur
            les documents générés (convention, attestation, etc.) dans le
            cadre "Pour l'Organisme". Bucket PRIVÉ car document sensible. */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <PenTool className="h-5 w-5 text-rose-600" />
              Signature & cachet
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Image combinée du cachet de l&apos;organisme et de la signature
              du dirigeant. Apposée automatiquement sur les documents
              générés (convention, attestation…) dans la zone «&nbsp;Pour
              l&apos;Organisme&nbsp;». Conseillé : fond transparent (PNG),
              largeur ~600 px, hauteur ~250 px.
            </p>
            <p className="text-xs text-rose-700 dark:text-rose-400 mt-2">
              🔒 Stocké dans un bucket privé (jamais accessible publiquement).
              Seuls les administrateurs de l&apos;organisation peuvent le
              téléverser ou le supprimer.
            </p>
          </div>

          {/* Aperçu de la signature actuelle + suppression */}
          {signatureUrl ? (
            <div className="space-y-3">
              <div className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#fafafa_0%_50%)] [background-size:14px_14px] p-3 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signatureUrl}
                  alt="Signature et cachet"
                  className="max-h-40 max-w-full object-contain"
                />
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                <span>
                  {org.signature_stamp_filename ?? "signature.png"}
                  {org.signature_stamp_uploaded_at && (
                    <>
                      {" "}
                      · téléversée le{" "}
                      {new Date(
                        org.signature_stamp_uploaded_at,
                      ).toLocaleDateString("fr-FR")}
                    </>
                  )}
                </span>
                <form action={removeSignature}>
                  <Button type="submit" variant="destructive" size="sm">
                    Supprimer
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-sm text-zinc-600">
              Aucune signature téléversée. La zone «&nbsp;Cachet et
              signature&nbsp;» des documents apparaîtra vide.
            </div>
          )}

          {/* Upload */}
          <form action={uploadSignature} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="signature_file">
                {signatureUrl
                  ? "Remplacer la signature"
                  : "Téléverser une signature"}
              </Label>
              <input
                id="signature_file"
                name="file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                className="block w-full text-sm text-zinc-600 dark:text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-zinc-900 file:text-white hover:file:bg-zinc-800 dark:file:bg-white dark:file:text-zinc-900 cursor-pointer"
              />
              <p className="text-xs text-zinc-500">
                Formats acceptés : PNG (recommandé, fond transparent), JPEG,
                WebP. Taille max : 2 Mo.
              </p>
            </div>
            <Button type="submit">
              <Upload className="h-4 w-4" />
              Envoyer la signature
            </Button>
          </form>
        </section>

        {/* Horaires par défaut des formations */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Horaires par défaut des formations
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Ces horaires s&apos;appliquent automatiquement à chaque
              nouvelle session que vous créez. Vous pourrez toujours les
              ajuster jour par jour dans le planning détaillé d&apos;une
              session.
            </p>
          </div>

          <DefaultHoursForm
            action={saveHours}
            defaults={{
              morning_start: trimTime(org.default_morning_start),
              morning_end: trimTime(org.default_morning_end),
              afternoon_start: trimTime(org.default_afternoon_start),
              afternoon_end: trimTime(org.default_afternoon_end),
            }}
          />
        </section>

        {/* Paramètres d'émargement */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Émargement électronique
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Réglages du QR code de signature en ligne que vous projetez
              aux apprenants pendant la session.
            </p>
          </div>

          {params.emargementSaved && (
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              Paramètres d&apos;émargement enregistrés.
            </div>
          )}

          <form action={saveEmargement} className="space-y-3">
            <div className="space-y-1.5 max-w-md">
              <Label htmlFor="emargement_token_ttl_days">
                Durée de validité du QR code après la fin de la session
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="emargement_token_ttl_days"
                  name="emargement_token_ttl_days"
                  type="number"
                  min={0}
                  max={90}
                  step={1}
                  defaultValue={org.emargement_token_ttl_days ?? 7}
                  className="w-24"
                />
                <span className="text-sm text-zinc-600">jours</span>
              </div>
              <p className="text-xs text-zinc-500">
                Au-delà de ce délai, le lien d&apos;émargement scanné
                affichera «&nbsp;Lien expiré&nbsp;». Vous pourrez
                régénérer un nouveau QR code à tout moment. Recommandé&nbsp;:
                7 jours (laisse une semaine pour rattraper un oubli, mais
                évite les signatures tardives non contrôlées).
              </p>
            </div>

            <div className="space-y-1.5 max-w-md pt-3 border-t border-zinc-100">
              <Label htmlFor="realization_certificate_threshold_percent">
                Seuil de présence pour le certificat de réalisation
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="realization_certificate_threshold_percent"
                  name="realization_certificate_threshold_percent"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  defaultValue={
                    org.realization_certificate_threshold_percent ?? 80
                  }
                  className="w-24"
                />
                <span className="text-sm text-zinc-600">%</span>
              </div>
              <p className="text-xs text-zinc-500">
                Pourcentage minimum de demi-journées signées pour qu&apos;un
                apprenant puisse télécharger son certificat de réalisation
                depuis son portail. En-dessous, la carte reste grisée avec
                une explication. Recommandé&nbsp;: 80&nbsp;% (standard
                Qualiopi).
              </p>
            </div>

            <Button type="submit">Enregistrer</Button>
          </form>
        </section>
      </div>
    </>
  );
}
