import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TrainingSession } from "@/lib/sessions/types";
import { MODALITY_LABELS } from "@/lib/formations/types";
import { loadConvocationTemplate } from "@/lib/document-templates/loader";
import {
  buildPortalUrl,
  getOrCreateEnrollmentPortalToken,
} from "@/lib/portal/enrollment-token";

async function getAppOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDateLong(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTimeShort(time: string | null) {
  if (!time) return "—";
  const [h, m] = time.split(":");
  const hh = Number(h);
  const mm = Number(m);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return time;
  if (mm === 0) return `${hh}h`;
  return `${hh}h${mm.toString().padStart(2, "0")}`;
}

export default async function ConvocationPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; enrollmentId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id, enrollmentId } = await params;
  const query = await searchParams;
  if (!UUID_REGEX.test(id) || !UUID_REGEX.test(enrollmentId)) notFound();

  // Auth : par défaut on exige un user connecté (route admin).
  // Mais si un `?token=` valide est fourni, on bypass l'auth admin et
  // on rend la page via service_role. Permet de servir le PDF en mode
  // public (lien envoyé par email Gmail à l'apprenant ou au RH).
  // Gilles 2026-05-22 — Option B délivrabilité Gmail.
  const supabase = query.token
    ? createAdminClient()
    : await createClient();
  if (!query.token) {
    const userSupabase = await createClient();
    const {
      data: { user },
    } = await userSupabase.auth.getUser();
    if (!user) redirect("/login");
  } else {
    // Vérification du token : doit correspondre à un
    // enrollment_portal_token actif pour ce enrollmentId.
    const { data: tokenRow } = await supabase
      .from("enrollment_portal_tokens")
      .select("enrollment_id")
      .eq("token", query.token)
      .maybeSingle<{ enrollment_id: string }>();
    if (!tokenRow || tokenRow.enrollment_id !== enrollmentId) {
      notFound();
    }
  }

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "*, formation:formations(id, title), location_ref:formation_locations!location_id(id, name, address, postal_code, city), trainer:trainers!trainer_id(first_name, last_name)",
    )
    .eq("id", id)
    .maybeSingle<
      TrainingSession & {
        location_ref?: {
          name: string;
          address: string | null;
          postal_code: string | null;
          city: string | null;
        } | null;
        trainer?: { first_name: string; last_name: string } | null;
      }
    >();
  if (!session) notFound();

  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(first_name, last_name, email, civility, company:companies(name))",
    )
    .eq("id", enrollmentId)
    .eq("session_id", id)
    .maybeSingle<{
      id: string;
      learner: {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        civility: string | null;
        company: { name: string } | null;
      } | null;
    }>();
  if (!enrollment) notFound();

  const { data: sessionDays } = await supabase
    .from("session_days")
    .select("*")
    .eq("session_id", id)
    .order("day_date", { ascending: true });

  // Récupération de l'organisation : via la session (qui porte
  // organization_id) plutôt que via le user — pour fonctionner aussi
  // en mode token public (où il n'y a pas de user.id).
  const sessionOrgId = (session as unknown as { organization_id: string })
    .organization_id;
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("id, name, logo_url, legal_mentions, signature_stamp_path")
    .eq("id", sessionOrgId)
    .maybeSingle<{
      id: string;
      name: string;
      logo_url: string | null;
      legal_mentions: string | null;
      signature_stamp_path: string | null;
    }>();
  const organization = orgRow
    ? {
        name: orgRow.name,
        logo_url: orgRow.logo_url,
        legal_mentions: orgRow.legal_mentions,
        signature_stamp_path: orgRow.signature_stamp_path,
      }
    : null;
  const organizationId = orgRow?.id;
  const orgName = organization?.name ?? "CAP NUMÉRIQUE";
  // logo_url + legal_mentions ne sont plus rendus dans le corps : ils
  // sont injectés par Puppeteer via headerTemplate (titre + date) et
  // footerTemplate (logo + mentions + Page X/Y), cf. PDF route convocation.

  // Signature & cachet du dirigeant — image apposée sous "CAP NUMERIQUE"
  // dans la clôture. Bucket PRIVÉ → download serveur + base64 data URL.
  let signatureDataUrl: string | null = null;
  if (organization?.signature_stamp_path) {
    const { data: sigBlob } = await supabase.storage
      .from("organization-signatures")
      .download(organization.signature_stamp_path);
    if (sigBlob) {
      const buf = Buffer.from(await sigBlob.arrayBuffer());
      const mime = sigBlob.type || "image/png";
      signatureDataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    }
  }

  // Token + URL du portail apprenant (QR code + lien cliquable).
  // Créé à la 1ère génération, persistant pour toute la durée de
  // la session (idempotent).
  const portal = await getOrCreateEnrollmentPortalToken(supabase, enrollmentId);
  const portalUrl = buildPortalUrl(await getAppOrigin(), portal.token);

  // Modèle de convocation personnalisé pour cette organisation
  const template = organizationId
    ? await loadConvocationTemplate(organizationId)
    : {
        color_primary: "#1e40af",
        color_secondary: "#06b6d4",
        blocks: {
          intro_html: "",
          recommendations_html: "",
          closing_html: "",
          extra_legal_html: "",
          consignes_style: {
            font_size_pt: 10,
            text_color: "#334155",
            bg_color: "#eff6ff",
            border_color: "#bfdbfe",
          },
        },
      };

  const learner = enrollment.learner;
  const civility = learner?.civility ?? "";
  const fullName = learner
    ? [learner.first_name, learner.last_name].filter(Boolean).join(" ")
    : "—";
  const company = learner?.company?.name ?? null;

  const trainerJoined = (
    session as unknown as {
      trainer?: { first_name: string; last_name: string } | null;
    }
  ).trainer;
  const trainerName =
    session.trainer_name ??
    (trainerJoined
      ? `${trainerJoined.first_name} ${trainerJoined.last_name}`
      : null);

  // Construction du libellé "Lieu" selon modalité
  const locationRef = (
    session as unknown as {
      location_ref?: {
        name: string;
        address: string | null;
        postal_code: string | null;
        city: string | null;
      } | null;
    }
  ).location_ref;
  const sessionAny = session as unknown as {
    video_app?: string | null;
    video_link?: string | null;
    video_instructions?: string | null;
  };
  let locationLabel: string | null = null;
  if (session.modality === "distanciel") {
    const app = sessionAny.video_app?.trim();
    locationLabel = app
      ? `Classe virtuelle — ${app.toUpperCase()}`
      : "Classe virtuelle";
  } else if (locationRef) {
    const parts = [
      locationRef.name,
      locationRef.address,
      [locationRef.postal_code, locationRef.city].filter(Boolean).join(" "),
    ].filter(Boolean);
    locationLabel = parts.join(", ");
  } else if (session.location) {
    locationLabel = session.location;
  }

  const sortedDays = (sessionDays ?? []).slice().sort((a, b) =>
    (a.day_date as string).localeCompare(b.day_date as string),
  );

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { margin: 18mm; size: portrait; }
              body { background: white !important; }
              .no-print { display: none !important; }
              /* Masque le sidebar FORMACAP et le bouton toggle qui
                 apparaitraient à l'impression sans ces règles. */
              aside { display: none !important; }
              main { width: 100% !important; max-width: 100% !important; padding: 0 !important; }
              main > button[type="button"] { display: none !important; }
              body > div { display: block !important; }
            }
            body { font-family: system-ui, sans-serif; }
          `,
        }}
      />
      <div className="min-h-screen bg-white p-8 max-w-[800px] mx-auto">
        <div className="no-print mb-6 flex flex-wrap gap-2 items-start">
          <a
            href={`/api/sessions/${id}/convocations/${enrollmentId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border-2 border-cyan-600 bg-cyan-50 text-cyan-900 hover:bg-cyan-100 rounded-md text-sm font-medium inline-flex items-center gap-2"
          >
            📄 Aperçu PDF (avec header, footer et bandeau)
          </a>
          <a
            href={`/sessions/${id}/convocations`}
            className="px-4 py-2 border rounded-md text-sm"
          >
            Retour
          </a>
          <div className="ml-auto text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 max-w-md">
            <strong>Aperçu écran ≠ PDF</strong> : le bandeau commercial, le
            header et le footer ne sont visibles que dans l&apos;Aperçu PDF
            (et dans le PDF envoyé par email). Cet écran est l&apos;aperçu
            du <em>corps</em> uniquement.
          </div>
        </div>

        {/* En-tête logo + date supprimé du corps : géré par le header
            Puppeteer (titre "Convocation — TITRE" + Émis le) — voir
            la route PDF convocation.

            Spacer 20mm en haut de la page 1 pour réserver la place du
            bandeau commercial dessiné en overlay pdf-lib (38mm de haut,
            dont 18mm absorbés par la marginTop Puppeteer + 20mm dans le
            corps). Identique à la convention (R18). */}
        <div style={{ height: "20mm" }} aria-hidden="true" />

        {/* Destinataire — sur une seule ligne pour gagner de la place */}
        <div className="mb-6 text-sm flex flex-wrap items-baseline gap-x-2">
          <span className="text-slate-500 text-xs uppercase tracking-wider font-bold">
            À l&apos;attention de
          </span>
          <span className="font-semibold">
            {[civility, fullName].filter(Boolean).join(" ")}
          </span>
          {company && (
            <span className="text-slate-600">— {company}</span>
          )}
        </div>

        {/* Titre */}
        <h1
          className="text-2xl font-bold mb-2"
          style={{ color: template.color_primary }}
        >
          Convocation à une action de formation
        </h1>
        <p className="text-base font-bold text-slate-800 mb-6">
          {session.formation?.title ?? "—"}
        </p>

        {/* Corps de la convocation — paragraphes personnalisables */}
        <div className="text-sm leading-relaxed text-slate-700 space-y-4 mb-8">
          <p>
            {[civility, fullName !== "—" ? fullName : null]
              .filter(Boolean)
              .join(" ") || "Bonjour"}
            ,
          </p>
          {template.blocks.intro_html && (
            <div
              className="rich-block"
              dangerouslySetInnerHTML={{ __html: template.blocks.intro_html }}
            />
          )}
          <p>
            <span className="text-slate-500">Formation :</span>{" "}
            <strong>« {session.formation?.title ?? "—"} »</strong>
            <br />
            <span className="text-slate-500">Organisée par :</span>{" "}
            <strong>{orgName}</strong>
          </p>
        </div>

        {/* Bloc infos pratiques */}
        <div className="rounded-lg ring-1 ring-slate-200 bg-slate-50 p-5 mb-8 text-sm space-y-2">
          <InfoRow
            label="Dates"
            value={`du ${new Date(session.start_date).toLocaleDateString("fr-FR")} au ${new Date(session.end_date).toLocaleDateString("fr-FR")}`}
          />
          {sortedDays.length > 0 && (
            <InfoRow
              label={`Détail (${sortedDays.length} jour${sortedDays.length > 1 ? "s" : ""})`}
              value={
                <div className="space-y-0.5">
                  {sortedDays.map((d) => {
                    const raw = formatDateLong(d.day_date as string);
                    const dayLabel =
                      raw.charAt(0).toUpperCase() + raw.slice(1);
                    return (
                      <div key={d.day_date as string}>
                        {dayLabel} :{" "}
                        {formatTimeShort(d.morning_start as string | null)}–
                        {formatTimeShort(d.morning_end as string | null)} et{" "}
                        {formatTimeShort(d.afternoon_start as string | null)}–
                        {formatTimeShort(d.afternoon_end as string | null)}
                      </div>
                    );
                  })}
                </div>
              }
            />
          )}
          {session.modality && (
            <InfoRow
              label="Modalité"
              value={MODALITY_LABELS[session.modality]}
            />
          )}
          {locationLabel && <InfoRow label="Lieu" value={locationLabel} />}
          {session.modality === "distanciel" && sessionAny.video_link && (
            <InfoRow
              label="Lien de connexion"
              value={
                <a
                  href={sessionAny.video_link}
                  className="text-blue-700 underline break-all"
                >
                  {sessionAny.video_link}
                </a>
              }
            />
          )}
          {trainerName && (
            <InfoRow label="Formateur" value={trainerName} />
          )}
        </div>

        {/* Consignes visio — style personnalisable (taille / couleurs)
            via le modèle convocation (template.blocks.consignes_style).
            Le CONTENU vient de session.video_instructions et peut être
            du HTML riche (TipTap) ou du texte brut (fallback : on
            l'enrobe alors dans <p> en respectant les sauts de ligne).
            Affiché AVANT le bloc QR pour que l'apprenant lise d'abord
            les consignes pratiques. Texte en gras pour lisibilité. */}
        {session.modality === "distanciel" &&
          sessionAny.video_instructions && (() => {
            const cs = template.blocks.consignes_style;
            const raw = String(sessionAny.video_instructions);
            const isHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
            const html = isHtml
              ? raw
              : raw
                  .split(/\n+/)
                  .filter((line) => line.trim() !== "")
                  .map((line) => `<p>${line}</p>`)
                  .join("");
            // Couleur du label : si text_color est bleu/sombre, on garde
            // le border_color ; sinon on dérive un ton plus prononcé.
            const labelColor = cs.border_color;
            return (
              <div
                className="rounded-lg p-4 mb-8 consignes-block"
                style={{
                  backgroundColor: cs.bg_color,
                  border: `1px solid ${cs.border_color}`,
                  color: cs.text_color,
                  fontSize: `${cs.font_size_pt}pt`,
                  // Le contenu est mis en gras pour améliorer la lisibilité
                  // des informations critiques (lien Zoom, code…).
                  fontWeight: 700,
                }}
              >
                <div
                  className="uppercase tracking-wider font-bold mb-1.5"
                  style={{
                    fontSize: `${Math.max(cs.font_size_pt - 2, 8)}pt`,
                    color: labelColor,
                  }}
                >
                  Consignes de connexion
                </div>
                <div
                  className="leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            );
          })()}

        {/* Bloc portail apprenant : QR code + lien cliquable.
            Force le saut de page AVANT (Gilles 2026-05-22) pour que le
            bloc ne soit jamais coupe entre 2 pages. Il occupe ainsi
            toujours la totalite de la page 2. */}
        <div
          className="rounded-lg ring-1 ring-blue-200 bg-blue-50/60 p-4 mb-8 flex items-center gap-4 avoid-break"
          style={{ pageBreakBefore: "always", breakBefore: "page" }}
        >
          <div className="shrink-0 bg-white p-2 rounded-md border border-blue-200">
            <QRCodeSVG value={portalUrl} size={96} level="M" marginSize={0} />
          </div>
          <div className="flex-1 text-sm">
            <div className="font-bold text-blue-900 text-base mb-1">
              Mon espace apprenant
            </div>
            <p className="text-xs text-slate-700 leading-snug mb-2">
              Scannez ce QR code avec votre téléphone pour accéder à votre
              espace personnel : test de positionnement, feuille d&apos;émargement,
              supports de formation, évaluation à chaud et certificat de
              réalisation.
            </p>
            <p className="text-xs text-slate-700 leading-snug">
              <span className="text-slate-600">Ou depuis cet écran :</span>{" "}
              <a
                href={portalUrl}
                className="text-blue-700 underline font-extrabold text-base"
                style={{ fontSize: "13pt" }}
              >
                👉 Cliquez ICI
              </a>
            </p>
            <p className="text-[10px] text-slate-500 mt-1 break-all">
              {portalUrl}
            </p>
          </div>
        </div>

        {/* Recommandations — texte personnalisable */}
        {template.blocks.recommendations_html && (
          <div
            className="text-sm text-slate-700 leading-relaxed space-y-3 mb-8 rich-block"
            dangerouslySetInnerHTML={{
              __html: template.blocks.recommendations_html,
            }}
          />
        )}

        {/* Signature de l'organisme — texte personnalisable + image
            signature & cachet (Paramètres → Organisation). */}
        <div className="text-sm text-slate-700">
          {template.blocks.closing_html ? (
            <div
              className="rich-block"
              dangerouslySetInnerHTML={{ __html: template.blocks.closing_html }}
            />
          ) : (
            <p>Bien cordialement,</p>
          )}
          <p className="mt-3">
            <strong>{orgName}</strong>
          </p>
          {signatureDataUrl && (
            <div className="mt-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureDataUrl}
                alt="Cachet et signature"
                style={{
                  maxHeight: "26mm",
                  maxWidth: "60mm",
                  objectFit: "contain",
                  display: "block",
                  mixBlendMode: "multiply",
                }}
              />
            </div>
          )}
        </div>

        {/* Bloc "Mentions complémentaires" du template (extra_legal_html)
            désactivé : il faisait doublon visuel avec le footer Puppeteer
            (logo + mentions légales) qui est désormais la SEULE source
            des mentions légales en bas du document. Si tu as besoin
            d'ajouter du texte spécifique à la convocation, modifie plutôt
            le bloc "Recommandations / consignes" ou "Formule de clôture"
            du template (Paramètres → Modèles documents → Convocation). */}

        {/* Les mentions légales (footer toutes pages) sont désormais
            injectées par Puppeteer via footerTemplate (cf. PDF route).
            La page print ne les rend plus dans le corps pour éviter le
            doublon avec le pied de page Puppeteer. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              .rich-block p { margin: 0 0 8px 0; }
              .rich-block strong { color: ${template.color_primary}; }
              .rich-block ul { list-style: disc; padding-left: 18px; margin: 4px 0; }
              .rich-block ol { list-style: decimal; padding-left: 18px; margin: 4px 0; }
              .rich-block h2 { font-size: 14px; font-weight: bold; margin: 8px 0 4px; }
              .rich-block h3 { font-size: 12px; font-weight: 600; margin: 8px 0 4px; }
              .rich-block blockquote { border-left: 3px solid ${template.color_secondary}; padding-left: 10px; margin: 6px 0; font-style: italic; color: #475569; }
              .legal-mentions-footer p { margin: 0 0 4px 0; }
              .legal-mentions-footer h2 { font-size: 11px; font-weight: bold; margin: 4px 0 2px 0; }
              .legal-mentions-footer h3 { font-size: 10px; font-weight: 600; margin: 4px 0 2px 0; }
              .legal-mentions-footer ul { list-style: disc; padding-left: 16px; margin: 2px 0; }
              .legal-mentions-footer ol { list-style: decimal; padding-left: 16px; margin: 2px 0; }
              .legal-mentions-footer a { color: #2563eb; text-decoration: underline; }
            `,
          }}
        />
      </div>
    </>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 items-start">
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 pt-0.5">
        {label}
      </div>
      {/* Valeur en bleu/gras pour faire ressortir les infos clés de
          la formation (date, lieu, lien…). */}
      <div
        className="font-bold"
        style={{ color: "#1e40af" }}
      >
        {value}
      </div>
    </div>
  );
}
