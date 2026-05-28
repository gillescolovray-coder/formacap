import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "../../../emargement/print/_print-button";
import { cn } from "@/lib/utils";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDateLong(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatHHmm(t: string | null | undefined): string {
  if (!t) return "—";
  const [h, m] = t.split(":");
  return m === "00" ? `${parseInt(h, 10)}h` : `${parseInt(h, 10)}h${m}`;
}

export default async function ConventionPrintPage({
  params,
}: {
  params: Promise<{ id: string; conventionId: string }>;
}) {
  const { id, conventionId } = await params;
  if (!UUID_REGEX.test(id) || !UUID_REGEX.test(conventionId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Convention + tout ce qui va avec
  const { data: convention } = await supabase
    .from("session_conventions")
    .select(
      `
      id, status, contact_name, contact_email, signed_at, signed_by_name, signature_data,
      amount_ht_unit, amount_ht_total, vat_rate, financing_mode,
      session:sessions(
        id, start_date, end_date, modality, location, amount_ht, trainer_name, trainer_id,
        presentiel_percent, video_app,
        formation:formations(id, title, duration_hours, general_objective, operational_objectives),
        location_ref:formation_locations!location_id(name, address, postal_code, city)
      ),
      company:companies(id, name, siret, address, postal_code, city)
      `,
    )
    .eq("id", conventionId)
    .maybeSingle();
  if (!convention) notFound();

  const conv = convention as unknown as {
    id: string;
    status: string;
    contact_name: string | null;
    contact_email: string | null;
    signed_at: string | null;
    signed_by_name: string | null;
    signature_data: string | null;
    amount_ht_unit: number | null;
    amount_ht_total: number | null;
    vat_rate: number | null;
    financing_mode: string | null;
    session: {
      id: string;
      start_date: string;
      end_date: string;
      modality: "presentiel" | "distanciel" | "hybride" | null;
      location: string | null;
      amount_ht: number | null;
      trainer_name: string | null;
      trainer_id: string | null;
      presentiel_percent: number | null;
      video_app: string | null;
      formation: {
        id: string;
        title: string;
        duration_hours: number | null;
        general_objective: string | null;
        operational_objectives: string[] | null;
      } | null;
      location_ref: {
        name: string;
        address: string | null;
        postal_code: string | null;
        city: string | null;
      } | null;
    } | null;
    company: {
      id: string;
      name: string;
      siret: string | null;
      address: string | null;
      postal_code: string | null;
      city: string | null;
    } | null;
  };

  // Apprenants de l'entreprise pour cette session
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "learner:learners(first_name, last_name, company_id, job_title)",
    )
    .eq("session_id", id);
  type EnrRow = {
    learner: {
      first_name: string | null;
      last_name: string | null;
      company_id: string | null;
      job_title: string | null;
    } | null;
  };
  const apprenants = ((enrollments ?? []) as unknown as EnrRow[])
    .filter((e) => e.learner?.company_id === conv.company?.id)
    .map((e) => ({
      lastName: (e.learner?.last_name ?? "").toUpperCase(),
      firstName: e.learner?.first_name ?? "",
      jobTitle: e.learner?.job_title ?? "—",
    }));

  // Jours de session : on récupère TOUS les jours pour pouvoir
  // calculer la durée totale réelle (somme matin + après-midi sur
  // chaque jour). Le 1er jour sert juste à l'affichage des horaires
  // type, qui reste identique en pratique de jour en jour.
  const { data: sessionDays } = await supabase
    .from("session_days")
    .select("morning_start, morning_end, afternoon_start, afternoon_end")
    .eq("session_id", id)
    .order("day_date", { ascending: true });
  type DayHours = {
    morning_start: string | null;
    morning_end: string | null;
    afternoon_start: string | null;
    afternoon_end: string | null;
  };
  const allDays = (sessionDays ?? []) as DayHours[];
  const firstDay = allDays[0];
  const horaires = firstDay
    ? `${formatHHmm(firstDay.morning_start)} - ${formatHHmm(firstDay.morning_end)} / ${formatHHmm(firstDay.afternoon_start)} - ${formatHHmm(firstDay.afternoon_end)}`
    : "—";
  // Durée totale de la session calculée à partir du planning réel :
  // pour chaque jour, on somme (matin_end - matin_start) + (aprem_end - aprem_start).
  // Fallback sur formation.duration_hours si aucun jour planifié.
  const parseHHmm = (t: string | null): number | null => {
    if (!t) return null;
    const [h, m] = t.split(":");
    const hh = parseInt(h, 10);
    const mm = parseInt(m, 10);
    return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
  };
  const totalMinutesFromDays = allDays.reduce((acc, d) => {
    const m1 = parseHHmm(d.morning_start);
    const m2 = parseHHmm(d.morning_end);
    const a1 = parseHHmm(d.afternoon_start);
    const a2 = parseHHmm(d.afternoon_end);
    const mat = m1 != null && m2 != null && m2 > m1 ? m2 - m1 : 0;
    const apm = a1 != null && a2 != null && a2 > a1 ? a2 - a1 : 0;
    return acc + mat + apm;
  }, 0);

  // Fix temporaire Gilles 2026-05-28 : on a constate que le contact
  // primaire de l'entreprise (company_contacts.is_primary) etait
  // parfois un APPRENANT (saisie historique incorrecte), ce qui faisait
  // apparaitre un nom d'apprenant comme "representant" et "signataire"
  // de la convention. Convention juridiquement invalide.
  //
  // En attendant la vraie solution (champ companies.representant_*
  // dedie + formulaires), on n'auto-pioche plus dans company_contacts.
  // On utilise uniquement le champ texte libre `conv.contact_name`
  // saisi manuellement sur la convention. Si rien -> zone vide a
  // remplir a la main par le client avant signature.
  const rhFullName = (conv.contact_name ?? "").trim();
  const rhJobTitle = "";

  // Organisme
  const { data: membership } = await supabase
    .from("organization_members")
    .select(
      "organization:organizations(id, name, logo_url, legal_mentions, siret, nda, address, postal_code, city, email, phone, website, commercial_banner_path, signature_stamp_path)",
    )
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const org = membership?.organization as unknown as {
    id: string;
    name: string;
    logo_url: string | null;
    legal_mentions: string | null;
    siret: string | null;
    nda: string | null;
    address: string | null;
    postal_code: string | null;
    city: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    commercial_banner_path: string | null;
    signature_stamp_path: string | null;
  } | null;

  const orgName = org?.name ?? "—";
  const orgSiret = org?.siret ?? "—";
  const orgNda = org?.nda ?? "—";
  const orgCity = org?.city ?? "—";
  // Site web : on affiche tel quel mais le lien <a href> nécessite un URL
  // absolu avec protocole. On l'ajoute si l'utilisateur a juste tapé
  // "www.capnumerique.com" sans http(s)://.
  const orgWebsite = org?.website?.trim() ?? null;
  const orgWebsiteHref = orgWebsite
    ? orgWebsite.startsWith("http://") || orgWebsite.startsWith("https://")
      ? orgWebsite
      : `https://${orgWebsite}`
    : null;

  // Bandeau commercial — image affichée sur la page 1 de la convention
  // pour faire connaître les autres produits/services de l'OF
  // (cross-selling). Sourcée depuis le bucket public organization-banners.
  const bannerUrl = org?.commercial_banner_path
    ? supabase.storage
        .from("organization-banners")
        .getPublicUrl(org.commercial_banner_path).data.publicUrl
    : null;

  // Signature & cachet du dirigeant — image apposée sur le cadre "Pour
  // l'Organisme". Bucket PRIVÉ → on télécharge côté serveur et on
  // embed en data URL base64 (jamais d'URL exposée au navigateur).
  let signatureDataUrl: string | null = null;
  if (org?.signature_stamp_path) {
    const { data: sigBlob } = await supabase.storage
      .from("organization-signatures")
      .download(org.signature_stamp_path);
    if (sigBlob) {
      const buf = Buffer.from(await sigBlob.arrayBuffer());
      const mime = sigBlob.type || "image/png";
      signatureDataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    }
  }

  // Les mentions légales (footer toutes pages) sont désormais injectées
  // par Puppeteer via footerTemplate (cf. actions.ts / pdf/route.ts).
  // La page print ne les rend plus dans le corps.


  // Dirigeant : pour V1 on prend le profil de l'utilisateur connecté
  // (à terme : champ dédié sur la fiche organisation, voir Sprint 5)
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();
  const dirigeantName = profile
    ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
      "Gilles COLOVRAY"
    : "Gilles COLOVRAY";
  const dirigeantTitle = "Gérant";

  const session = conv.session;
  const formation = session?.formation;
  const company = conv.company;
  const today = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Résolution du nom du formateur (cascade de fallbacks robustes) :
  //  1. session.trainer_name (texte libre saisi sur la fiche session)
  //  2. session.trainer_id → lookup dans la table trainers
  //  3. session_days.trainer_id → 1er formateur planifié sur un jour
  //  4. "—" sinon
  let trainerName: string | null =
    session?.trainer_name && session.trainer_name.trim() !== ""
      ? session.trainer_name
      : null;

  if (!trainerName && session?.trainer_id) {
    const { data: t } = await supabase
      .from("trainers")
      .select("first_name, last_name")
      .eq("id", session.trainer_id)
      .maybeSingle<{ first_name: string | null; last_name: string | null }>();
    if (t) {
      trainerName = [t.first_name, t.last_name].filter(Boolean).join(" ") || null;
    }
  }

  if (!trainerName && session?.id) {
    // Fallback : prendre le 1er formateur planifié sur un jour de session
    const { data: dayWithTrainer } = await supabase
      .from("session_days")
      .select("trainer_id")
      .eq("session_id", session.id)
      .not("trainer_id", "is", null)
      .limit(1)
      .maybeSingle<{ trainer_id: string | null }>();
    if (dayWithTrainer?.trainer_id) {
      const { data: t } = await supabase
        .from("trainers")
        .select("first_name, last_name")
        .eq("id", dayWithTrainer.trainer_id)
        .maybeSingle<{ first_name: string | null; last_name: string | null }>();
      if (t) {
        trainerName =
          [t.first_name, t.last_name].filter(Boolean).join(" ") || null;
      }
    }
  }

  if (!trainerName) trainerName = "—";

  // Lieu de la formation
  let lieuFormation = "—";
  if (session?.modality === "distanciel") {
    // Le taux d'enseignement à distance est affiché sur une ligne dédiée
    // sous "Lieu de la formation" (cf. JSX article I).
    // Si une application de visio a été sélectionnée sur la session
    // (Zoom, Teams, Meet…), on l'ajoute en suffixe : "- Lien ZOOM".
    const videoApp = session.video_app?.trim();
    lieuFormation = videoApp
      ? `Distanciel (Classe Virtuelle) - Lien ${videoApp.toUpperCase()}`
      : "Distanciel (Classe Virtuelle)";
  } else if (session?.location_ref) {
    const parts = [
      session.location_ref.address,
      [session.location_ref.postal_code, session.location_ref.city]
        .filter(Boolean)
        .join(" "),
    ]
      .filter(Boolean)
      .join(" ");
    lieuFormation = parts || session.location_ref.name;
  } else if (session?.location) {
    lieuFormation = session.location;
  }

  // Période et durée
  const periodLabel =
    session && session.start_date === session.end_date
      ? `Le ${formatDateLong(session.start_date)}`
      : session
        ? `Du ${formatDateLong(session.start_date)} au ${formatDateLong(session.end_date)}`
        : "—";
  // Durée affichée sur la convention : on PRIVILÉGIE le planning
  // effectif de la session (somme des heures jour par jour). Sans ça,
  // une formation cataloguée à 7h mais planifiée sur 2 jours afficherait
  // toujours 7h alors qu'elle dure 14h en réalité.
  const totalHours =
    totalMinutesFromDays > 0
      ? totalMinutesFromDays % 60 === 0
        ? `${totalMinutesFromDays / 60} h`
        : `${Math.floor(totalMinutesFromDays / 60)} h ${totalMinutesFromDays % 60}`
      : formation?.duration_hours != null
        ? `${formation.duration_hours} h`
        : "—";

  // Prix : on prefere le total stocke sur la convention (fige le CA),
  // a defaut on calcule a la volee unit × nb apprenants.
  // FIX 2026-05-22 (Gilles) : auto-recalcul si le montant figé est 0
  // (cas du bug ou la convention a ete creee avant que les enrollments
  // miroirs n'existent → nbApprenantsCompany = 0 → montant fige a 0).
  let unitPrice = conv.amount_ht_unit ?? session?.amount_ht ?? 0;
  let amountHt =
    conv.amount_ht_total ??
    (unitPrice ? unitPrice * apprenants.length : 0);

  if ((!unitPrice || unitPrice === 0) && conv.session?.id) {
    // Recalcule à la volée via les inscription_requests (plus fiable)
    const sessionId = conv.session.id as string;
    const companyId = (conv.company?.id as string | undefined) ?? null;
    if (companyId) {
      // Lecture des champs pricing R7 + count des inscriptions
      const supa = await createClient();
      const [
        { data: sessRow },
        { count: dCount },
        { count: cReqCount },
        { count: totalReqCount },
      ] = await Promise.all([
        supa
          .from("sessions")
          .select(
            "amount_ht, pricing_mode, price_per_day_ht, price_forfait_ht, price_extra_per_day_ht, pricing_threshold, formation:formations(public_price_excl_tax, price_company)",
          )
          .eq("id", sessionId)
          .maybeSingle(),
        supa
          .from("session_days")
          .select("id", { count: "exact", head: true })
          .eq("session_id", sessionId),
        supa
          .from("inscription_requests")
          .select("id", { count: "exact", head: true })
          .eq("target_session_id", sessionId)
          .eq("company_id", companyId),
        supa
          .from("inscription_requests")
          .select("id", { count: "exact", head: true })
          .eq("target_session_id", sessionId),
      ]);
      const nbJours = dCount ?? 0;
      const nbComp = Math.max(cReqCount ?? 0, apprenants.length);
      const nbTotal = Math.max(totalReqCount ?? 0, nbComp);
      const sr = sessRow as unknown as {
        amount_ht: number | null;
        pricing_mode: "per_learner" | "forfait" | null;
        price_per_day_ht: number | null;
        price_forfait_ht: number | null;
        price_extra_per_day_ht: number | null;
        pricing_threshold: number | null;
        formation: {
          public_price_excl_tax: number | null;
          price_company: number | null;
        } | null;
      } | null;
      if (sr?.pricing_mode && nbJours > 0 && nbComp > 0) {
        const { computeConventionAmount } = await import(
          "@/lib/pricing/compute"
        );
        const r = computeConventionAmount(
          {
            mode: sr.pricing_mode,
            pricePerDayHt: sr.price_per_day_ht,
            priceForfaitHt: sr.price_forfait_ht,
            priceExtraPerDayHt: sr.price_extra_per_day_ht,
            threshold: sr.pricing_threshold,
          },
          nbComp,
          nbTotal,
          nbJours,
        );
        if (r.unitHt > 0) {
          unitPrice = r.unitHt;
          amountHt = r.totalHt;
          // Persiste pour les prochains rendus
          await supa
            .from("session_conventions")
            .update({
              amount_ht_unit: r.unitHt,
              amount_ht_total: r.totalHt,
            })
            .eq("id", conv.id as string);
        }
      } else if (nbComp > 0) {
        // Fallback legacy
        const legacy =
          sr?.amount_ht ??
          sr?.formation?.price_company ??
          sr?.formation?.public_price_excl_tax ??
          0;
        if (legacy > 0) {
          unitPrice = Number(legacy);
          amountHt = unitPrice * nbComp;
          await supa
            .from("session_conventions")
            .update({
              amount_ht_unit: unitPrice,
              amount_ht_total: amountHt,
            })
            .eq("id", conv.id as string);
        }
      }
    }
  }

  const vatRate = conv.vat_rate ?? 20;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            /* ============================================================
               IMPRESSION — R14 — Gilles 2026-05-14
               ============================================================
               Stratégie SIMPLE et qui MARCHE :
                 • Header (titre CONVENTION + Émis le) et footer
                   (mentions légales HTML riche + Page X/Y) sont injectés
                   par Puppeteer via headerTemplate/footerTemplate
                   (cf. actions.ts / pdf/route.ts / templates.ts).
                 • Le bandeau commercial est le premier élément du corps
                   sur la page 1. Il se place après la margin-top de
                   Puppeteer (pas de "collé au bord" possible sans casser
                   les pages 2+, contrainte connue Chromium/Puppeteer).
                 • Aucune règle @page margin box ici : Puppeteer prend la
                   main quand displayHeaderFooter=true.
               ============================================================ */
            @media print {
              body { background: white !important; }
              .no-print { display: none !important; }
              aside { display: none !important; }
              /* Bouton toggle sidebar (PanelLeft) : sticky en haut à gauche
                 de l'app, visible en print par défaut → on le cache. */
              main > button[type="button"] { display: none !important; }
              main { width: 100% !important; max-width: 100% !important; padding: 0 !important; }
              body > div { display: block !important; }

              .keep-together {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              table, thead, tbody, tr {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              h1, h2, h3 {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
                break-after: avoid !important;
                page-break-after: avoid !important;
              }
            }
            body { font-family: "Calibri", "Segoe UI", system-ui, sans-serif; color: #18181b; }
          `,
        }}
      />
      {/* ============================================================
          Conteneur principal (R11) :
          • Pas de maxWidth ni de padding latéral sur le conteneur lui-même.
          • Le BANDEAU commercial (1er enfant) prend toute la largeur du
            conteneur, qui correspond à la largeur du PDF puisque
            @page horizontal margin = 0.
          • Le reste du contenu (titre, articles, etc.) est wrapped dans
            un sous-conteneur `.convention-body` avec padding 18mm latéral
            pour rester confortablement à l'intérieur des bords visibles.
          ============================================================ */}
      <div
        className="bg-white text-[13px] leading-[1.55]"
        style={{
          textAlign: "justify",
          hyphens: "auto",
        }}
      >
        <div className="no-print mb-6 flex gap-2">
          <PrintButton />
          <a
            href={`/sessions/${id}/conventions`}
            className="px-4 py-2 border rounded-md text-sm"
          >
            Retour
          </a>
        </div>

        {/* Bandeau commercial — R18 (pdf-lib post-traitement) :
            le bandeau N'EST PLUS dans le corps HTML. Il est dessiné en
            overlay sur la page 1 par pdf-lib AVANT envoi (cf.
            actions.ts / pdf/route.ts → overlayBannerOnFirstPage).
            Ici on RÉSERVE juste 20mm de blanc en haut du corps de la
            page 1 pour que l'overlay (38mm de haut, dont 18mm dans la
            zone du header Puppeteer + 20mm dans le corps) ne masque
            pas le titre "CONVENTION DE FORMATION..." en dessous. */}
        {bannerUrl && (
          <div style={{ height: "20mm" }} aria-hidden="true" />
        )}

        {/* Wrapper pour tout le contenu textuel — applique le padding
            latéral de 18mm pour que le texte ne touche pas les bords. */}
        <div className="convention-body" style={{ padding: "0 18mm" }}>

        {/* Titre OBLIGATOIRE de la convention (article L.6353-1 du
            Code du travail). Doit toujours apparaître sur la 1ère page. */}
        <h1 className="text-center text-2xl font-bold mt-2 mb-1 uppercase tracking-wide"
          style={{ color: "#1e40af" }}
        >
          Convention de formation professionnelle
        </h1>
        <p className="text-center text-xs text-slate-600 mb-3 italic">
          (Article L. 6353-1 et D. 6353-1 du code du travail)
        </p>

        {/* Séparateur décoratif sous le titre */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <div
            className="h-px w-16"
            style={{
              background:
                "linear-gradient(to right, rgba(30,64,175,0), #1e40af)",
            }}
          />
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "#1e40af" }}
          />
          <div
            className="h-px w-16"
            style={{
              background:
                "linear-gradient(to left, rgba(30,64,175,0), #1e40af)",
            }}
          />
        </div>

        {/* Parties : 2 cadres côte à côte */}
        <p className="text-center font-bold mb-3 text-slate-700">Entre les soussignés</p>
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Entreprise bénéficiaire */}
          <div
            className="relative rounded-lg ring-1 ring-slate-200 bg-white p-3 pl-4 shadow-sm overflow-hidden"
            style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.08)" }}
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5"
              style={{ background: "#1e40af" }}
            />
            <div
              className="inline-block text-[11px] uppercase tracking-wider font-bold text-white px-2 py-0.5 rounded mb-2"
              style={{ background: "#1e40af" }}
            >
              Entreprise bénéficiaire
            </div>
            <p className="font-bold text-[13px] text-slate-900">
              <Highlight>{company?.name ?? "—"}</Highlight>
            </p>
            {(company?.address || company?.postal_code || company?.city) && (
              <p className="text-[12px] text-slate-700 mt-0.5">
                <Highlight>
                  {[
                    company?.address,
                    [company?.postal_code, company?.city]
                      .filter(Boolean)
                      .join(" "),
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </Highlight>
              </p>
            )}
            <p className="text-[12px] mt-1.5">
              <strong>SIRET :</strong>{" "}
              <Highlight>{company?.siret ?? "—"}</Highlight>
            </p>
            {/* Fix Gilles 2026-05-28 : si pas de signataire renseigne
                manuellement sur la convention, on affiche une ligne
                pointillee a remplir a la main par le client (evite
                qu'un nom d'apprenant ne soit ecrit a la place du
                vrai representant legal). */}
            <p className="text-[12px] mt-1">
              <strong>Représentée par :</strong>{" "}
              {rhFullName ? (
                <Highlight>{rhFullName}</Highlight>
              ) : (
                <span className="inline-block min-w-[220px] border-b border-dotted border-slate-500 align-bottom">
                  &nbsp;
                </span>
              )}
            </p>
            <p className="text-[12px]">
              <strong>Fonction :</strong>{" "}
              {rhJobTitle ? (
                <Highlight>{rhJobTitle}</Highlight>
              ) : (
                <span className="inline-block min-w-[180px] border-b border-dotted border-slate-500 align-bottom">
                  &nbsp;
                </span>
              )}
            </p>
            <div className="text-[10px] italic text-slate-500 mt-2">
              ci-après dénommée « le Bénéficiaire »
            </div>
          </div>

          {/* Organisme de formation */}
          <div
            className="relative rounded-lg ring-1 ring-slate-200 bg-white p-3 pl-4 shadow-sm overflow-hidden"
            style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.08)" }}
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5"
              style={{ background: "#0891b2" }}
            />
            <div
              className="inline-block text-[11px] uppercase tracking-wider font-bold text-white px-2 py-0.5 rounded mb-2"
              style={{ background: "#0891b2" }}
            >
              Organisme de formation
            </div>
            <p className="font-bold text-[13px] text-slate-900">{orgName}</p>
            {orgWebsiteHref && (
              <p className="text-[12px] mt-0.5 flex items-center gap-1.5">
                {/* Icône globe inline SVG pour rester sûr du rendu PDF */}
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1e40af"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ flexShrink: 0 }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <a
                  href={orgWebsiteHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  style={{ color: "#1e40af" }}
                >
                  {orgWebsite}
                </a>
              </p>
            )}
            {(org?.address || org?.postal_code || org?.city) && (
              <p className="text-[12px] text-slate-700 mt-0.5">
                {[
                  org?.address,
                  [org?.postal_code, org?.city].filter(Boolean).join(" "),
                ]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </p>
            )}
            <p className="text-[12px] mt-1.5">
              <strong>Siret :</strong> {orgSiret}
            </p>
            <p className="text-[12px] mt-1">
              <strong>Représenté par :</strong> {dirigeantName}
            </p>
            <p className="text-[12px]">
              <strong>Fonction :</strong> {dirigeantTitle}
            </p>
            {org?.email && (
              <p className="text-[12px] mt-1 flex items-center gap-1.5">
                {/* Icône Mail (enveloppe) inline SVG */}
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1e40af"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ flexShrink: 0 }}
                >
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <a
                  href={`mailto:${org.email}`}
                  className="underline"
                  style={{ color: "#1e40af" }}
                >
                  {org.email}
                </a>
              </p>
            )}
            <p className="text-[11px] mt-1">
              <strong>Déclaration d&apos;activité :</strong> n° {orgNda}
            </p>
            <div className="text-[10px] italic text-slate-500 mt-2">
              ci-après dénommé « l&apos;Organisme »
            </div>
          </div>
        </div>

        <p className="text-sm italic text-slate-700 mb-4">
          Il a été convenu ce qui suit :
        </p>

        {/* I */}
        <Article num="I" title="Objet, nature, durée et effectif de la formation">
          <p>
            Le bénéficiaire entend faire participer une partie de son personnel à
            la session de formation professionnelle organisée par
            l&apos;organisme de formation sur le sujet suivant :
          </p>
          <p className="mt-2">
            <strong>Intitulé de l&apos;action de formation :</strong>{" "}
            <Highlight>{formation?.title?.toUpperCase() ?? "—"}</Highlight>
          </p>
          <p className="mt-2">
            <strong>
              Nature de l&apos;action au sens de l&apos;article L.6313-1 du
              Code du travail :
            </strong>{" "}
            <Highlight>action de formation</Highlight>.
          </p>
          <p>
            Cette action vise le développement des compétences professionnelles
            des salariés bénéficiaires.
          </p>
          <p className="mt-2">
            Le programme détaillé de l&apos;action de formation est explicité en
            annexe de la présente convention.
          </p>
          <p className="mt-2">
            <strong>L&apos;effectif formé s&apos;élève à</strong>{" "}
            <Highlight>{apprenants.length}</Highlight>{" "}
            personne{apprenants.length > 1 ? "s" : ""}.
          </p>
          <p>
            <strong>Date de la session :</strong>{" "}
            <Highlight>{periodLabel}</Highlight>
          </p>
          <p>
            <strong>Nombre d&apos;heures par stagiaire :</strong>{" "}
            <Highlight>{totalHours}</Highlight>
            {"  "}
            <strong>Horaires de formation :</strong>{" "}
            <Highlight>{horaires}</Highlight>
          </p>
          <p>
            <strong>Lieu de la formation :</strong>{" "}
            <Highlight>{lieuFormation}</Highlight>
          </p>
          {/* Taux d'enseignement — affiché selon la modalité de la session.
              Pour hybride, le pourcentage exact n'est pas encore stocké en
              base : on affiche "X %" en attendant un éventuel champ dédié. */}
          {session?.modality === "distanciel" && (
            <p>
              <strong>Taux d&apos;enseignement à distance :</strong>{" "}
              <Highlight>100 % en distanciel</Highlight>
            </p>
          )}
          {session?.modality === "presentiel" && (
            <p>
              <strong>Taux d&apos;enseignement en présentiel :</strong>{" "}
              <Highlight>100 % en présentiel</Highlight>
            </p>
          )}
          {session?.modality === "hybride" && (() => {
            const p =
              session.presentiel_percent != null &&
              session.presentiel_percent >= 0 &&
              session.presentiel_percent <= 100
                ? session.presentiel_percent
                : null;
            const dist = p != null ? 100 - p : null;
            return (
              <>
                <p>
                  <strong>
                    Taux d&apos;enseignement en présentiel :
                  </strong>{" "}
                  <Highlight>
                    {p != null ? `${p} % en présentiel` : "— % en présentiel"}
                  </Highlight>
                </p>
                <p>
                  <strong>Taux d&apos;enseignement à distance :</strong>{" "}
                  <Highlight>
                    {dist != null
                      ? `${dist} % en distanciel`
                      : "— % en distanciel"}
                  </Highlight>
                </p>
              </>
            );
          })()}
        </Article>

        {/* II — Objectifs pédagogiques (issus de la fiche programme,
            champ general_objective + operational_objectives). */}
        <Article num="II" title="Objectifs pédagogiques de l'action">
          {formation?.general_objective ? (
            <p>
              <Highlight>{formation.general_objective}</Highlight>
            </p>
          ) : null}
          {formation?.operational_objectives &&
          formation.operational_objectives.length > 0 ? (
            <>
              <p className="mt-2">
                À l&apos;issue de la formation, le stagiaire sera capable de :
              </p>
              <ul className="list-disc ml-5 mt-1 space-y-0.5">
                {formation.operational_objectives.map((obj, i) => (
                  <li key={i}>
                    <Highlight>{obj}</Highlight>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {!formation?.general_objective &&
          (!formation?.operational_objectives ||
            formation.operational_objectives.length === 0) ? (
            <p className="italic text-slate-500">
              Aucun objectif pédagogique renseigné dans le programme de
              formation.
            </p>
          ) : null}
        </Article>

        {/* III — Le tableau a sa propre règle `break-inside: avoid` qui
            le maintient intact. On NE met PAS keep-together sur l'Article
            entier : sinon, quand l'intro + le tableau dépasse l'espace
            restant en bas de page, Chrome doit faire un choix forcé qui
            peut faire DISPARAÎTRE le tableau (bug observé 2026-05-14). */}
        <Article num="III" title="Engagement de participation à l'action">
          <p>
            Le bénéficiaire s&apos;engage à assurer la présence du (des)
            participant(s) aux dates, lieux et heures prévus ci-dessus.
          </p>
          {/* Wrapper keep-together pour le tableau et son intro :
              force Chrome à les garder ensemble sur la même page. Sans
              ce wrapper, Chrome peut placer la phrase "Le(s) participant(s)"
              en bas d'une page et le tableau au-dessus de la suivante. */}
          <div className="keep-together">
          <p className="mt-2">Le(s) participant(s) sera (seront) :</p>
          <table className="w-full text-xs border border-slate-300 mt-2">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-1.5 text-left w-1/2">
                  Identité
                </th>
                <th className="border border-slate-300 px-3 py-1.5 text-left">
                  Fonction
                </th>
              </tr>
            </thead>
            <tbody>
              {apprenants.length > 0 ? (
                apprenants.map((a, i) => (
                  <tr key={i}>
                    <td className="border border-slate-300 px-3 py-1.5">
                      <Highlight>
                        {a.lastName} {a.firstName}
                      </Highlight>
                    </td>
                    <td className="border border-slate-300 px-3 py-1.5">
                      <Highlight>{a.jobTitle}</Highlight>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={2}
                    className="border border-slate-300 px-3 py-2 italic text-slate-500"
                  >
                    Aucun apprenant rattaché à cette entreprise pour cette session.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>{/* /keep-together intro+tableau apprenants */}
        </Article>

        {/* III — bloc Prix : reste solidaire (HT/TVA/TTC + IBAN/BIC),
            jamais coupé entre 2 pages (R9 — Gilles 2026-05-14) */}
        <Article num="IV" title="Prix de la formation" className="keep-together">
          <p>
            Le coût de la formation, objet de la présente convention,
            s&apos;élève à :{" "}
            <Highlight>
              {amountHt.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}{" "}
              € HT
            </Highlight>
            <span className="text-[11px] text-slate-500 italic">
              {" "}· TVA {vatRate} % :{" "}
              {(amountHt * (vatRate / 100)).toLocaleString("fr-FR", {
                minimumFractionDigits: 2,
              })}{" "}
              €
            </span>
            {" "}· TOTAL TTC :{" "}
            <Highlight>
              {(amountHt * (1 + vatRate / 100)).toLocaleString("fr-FR", {
                minimumFractionDigits: 2,
              })}{" "}
              € TTC
            </Highlight>
          </p>
          {conv.financing_mode && (
            <p className="mt-2 text-[12px]">
              <strong>Mode de financement :</strong>{" "}
              <Highlight>{formatFinancingModeLabel(conv.financing_mode)}</Highlight>
            </p>
          )}
          <p className="mt-1">
            Cette somme couvre l&apos;intégralité des frais engagés par
            l&apos;organisme de formation pour cette session.
          </p>
          <p className="mt-2">
            Le règlement s&apos;effectue par virement en rappelant dans votre
            virement la date et l&apos;intitulé de la formation :
          </p>
          <div className="ml-4 mt-1 text-[12px] font-mono font-bold bg-slate-50 px-3 py-2 rounded border border-slate-200">
            IBAN : FR76 3000 4027 0400 0101 5881 234
            <br />
            BIC : BNPAFRPPXXX
          </div>
          <p
            className="mt-3 font-bold"
            style={{
              color: "#ea580c",
              textAlign: "left",
              textIndent: 0,
            }}
          >
            Si vous avez fait une demande de financement auprès de votre OPCO
            avec une SUBROGATION, merci de nous transmettre par email
            l&apos;accord de prise en charge{" "}
            <span
              style={{
                background: "#fef08a",
                padding: "1px 4px",
                borderRadius: "2px",
                color: "#7c2d12",
              }}
            >
              avant le début de la session de formation
            </span>
            .
          </p>
        </Article>

        {/* IV — bloc Moyens péda : reste solidaire (R9 — Gilles 2026-05-14) */}
        <Article
          num="V"
          title="Moyens pédagogiques, techniques et d'encadrement mis en œuvre"
          className="keep-together"
        >
          <p>
            La formation peut être réalisée en présentiel, à distance ou selon
            un format hybride combinant présentiel et classe virtuelle
            synchrone.
          </p>
          <p className="mt-2">
            Les moyens pédagogiques mobilisés comprennent notamment
            l&apos;animation par un formateur qualifié, des apports théoriques,
            des exemples pratiques, des échanges avec les participants, des
            exercices d&apos;application, des études de cas et la remise
            d&apos;un support pédagogique au format papier et/ou électronique.
          </p>
          <p className="mt-2">
            <strong>En présentiel</strong>, la formation se déroule dans une
            salle adaptée à l&apos;accueil des participants et équipée des
            moyens nécessaires au bon déroulement pédagogique de la session.
          </p>
          <p className="mt-2">
            <strong>À distance</strong>, les participants doivent disposer
            d&apos;un ordinateur connecté à Internet, d&apos;un micro, d&apos;une
            caméra et d&apos;un navigateur à jour. Le lien de connexion est
            transmis avant la formation.
          </p>
          <p className="mt-2">
            L&apos;encadrement pédagogique est assuré par le formateur désigné
            par {orgName}.
          </p>
          {/* Mention spécifique : seulement si le formateur identifié de
              la session est Gilles COLOVRAY (le dirigeant de CAP NUMERIQUE
              qui anime lui-même certaines sessions). Comparaison
              insensible à la casse / accents. */}
          {isGillesColovrayTrainer(trainerName) && (
            <p className="mt-1">
              <strong>Formateur :</strong>{" "}
              <Highlight>Mr Gilles COLOVRAY</Highlight>
            </p>
          )}
        </Article>

        {/* VI */}
        <Article num="VI" title="Moyens permettant d'apprécier les résultats de l'action">
          <p>
            Les résultats de l&apos;action sont appréciés au moyen d&apos;un
            positionnement initial, d&apos;échanges avec le formateur,
            d&apos;exercices pratiques, d&apos;études de cas, de questions-
            réponses et/ou d&apos;une évaluation finale des acquis.
          </p>
          <p className="mt-2">
            En fin de formation, une évaluation des acquis peut être
            réalisée afin de mesurer l&apos;atteinte des objectifs
            pédagogiques. Elle peut prendre la forme d&apos;un quiz,
            d&apos;un questionnaire, d&apos;un exercice pratique, d&apos;une
            étude de cas ou de tout autre moyen adapté à la formation.
          </p>
          <p className="mt-2">
            Une évaluation de satisfaction à chaud est réalisée à
            l&apos;issue de la formation.
          </p>
        </Article>

        {/* VI */}
        <Article num="VII" title="Sanction de la formation">
          <p>
            À l&apos;issue de la formation, une attestation individuelle de
            formation est remise au stagiaire et/ou au bénéficiaire. Elle
            précise notamment l&apos;intitulé de l&apos;action, sa durée, ses
            objectifs, les acquis évalués et les dates de réalisation.
          </p>
        </Article>

        {/* VII */}
        <Article num="VIII" title="Moyens permettant de suivre l'exécution de l'action">
          <p>
            Le suivi de l&apos;exécution de l&apos;action est assuré par tout
            moyen permettant d&apos;attester de la participation effective des
            stagiaires.
          </p>
          <p className="mt-2">
            <strong>En présentiel</strong>, la présence est justifiée par une
            feuille d&apos;émargement signée par les stagiaires et le
            formateur, par demi-journée de formation.
          </p>
          <p className="mt-2">
            <strong>À distance</strong>, la participation peut être justifiée
            par un émargement électronique, un relevé de connexion, une
            attestation d&apos;assiduité, les traces de participation à la
            classe virtuelle ou tout autre élément permettant d&apos;attester
            de la réalisation effective de l&apos;action.
          </p>
          <p className="mt-2">
            <strong>En format hybride</strong>, les modalités de suivi sont
            adaptées à la situation de chaque stagiaire selon qu&apos;il
            participe en présentiel ou à distance.
          </p>
        </Article>

        {/* IX — Règlement intérieur */}
        <Article num="IX" title="Règlement intérieur">
          <p>
            Le stagiaire s&apos;engage à respecter le règlement intérieur
            applicable aux actions de formation de {orgName}, communiqué
            avant l&apos;entrée en formation ou accessible sur demande.
          </p>
        </Article>

        {/* X — Clause RGPD / Données personnelles */}
        <Article num="X" title="Clause RGPD / Données personnelles">
          <p>
            Les données collectées dans le cadre de la présente convention
            sont utilisées exclusivement pour la gestion administrative,
            pédagogique et financière de l&apos;action de formation. Elles
            peuvent être transmises aux financeurs, autorités de contrôle ou
            organismes habilités lorsque cela est nécessaire. Les personnes
            concernées disposent d&apos;un droit d&apos;accès, de
            rectification et d&apos;opposition dans les conditions prévues
            par la réglementation applicable.
          </p>
          <p className="mt-2">
            Pour toute demande relative aux données personnelles, les
            personnes concernées peuvent contacter {orgName}
            {org?.email ? (
              <>
                {" "}à l&apos;adresse suivante :{" "}
                <Highlight>{org.email}</Highlight>.
              </>
            ) : (
              "."
            )}
          </p>
        </Article>

        {/* IX */}
        <Article num="XI" title="Accessibilité aux personnes en situation de handicap">
          <p>
            <strong style={{ color: "#1e40af" }}>
              Accessibilité aux personnes en situation de handicap :
            </strong>{" "}
            Le bénéficiaire est invité à signaler, avant l&apos;entrée en
            formation, toute situation de handicap ou tout besoin
            d&apos;adaptation afin que {orgName} puisse étudier les
            aménagements raisonnables possibles ou orienter la personne vers
            un interlocuteur compétent.
          </p>
        </Article>

        {/* X */}
        <Article num="XII" title="Dédommagement, réparation ou dédit">
          <p>
            <strong>
              En cas d&apos;annulation ou de report à l&apos;initiative du
              bénéficiaire
            </strong>
          </p>
          <p className="mt-1">
            Les remplacements de participants sont admis sans frais, sous
            réserve d&apos;en informer {orgName}{" "}par écrit au plus tard 48
            heures ouvrées avant le début de la formation et de transmettre
            l&apos;identité du ou des remplaçants.
          </p>
          <p className="mt-2">
            Le bénéficiaire peut annuler ou reporter son inscription sans
            frais, sous réserve d&apos;en informer {orgName}{" "}par écrit au
            moins <strong>quatorze (14) jours calendaires</strong> avant la
            date de début de la formation.
          </p>
          <p className="mt-2">
            En cas d&apos;annulation ou de report intervenant moins de quatorze
            (14) jours calendaires avant le début de la formation, {orgName}
            {" "}pourra facturer une indemnité de dédit correspondant à 100 %
            du montant de la formation.
          </p>
          <p className="mt-2">
            En cas d&apos;absence totale ou partielle non justifiée du
            stagiaire, ou d&apos;abandon en cours de formation, le prix
            correspondant aux heures effectivement réalisées sera facturé au
            titre de la formation professionnelle. Les sommes correspondant
            aux heures non réalisées pourront faire l&apos;objet d&apos;une
            facturation distincte à titre d&apos;indemnité contractuelle.
          </p>
          <p className="mt-2">
            Les sommes dues au titre d&apos;un dédit, d&apos;une annulation
            tardive, d&apos;un report tardif, d&apos;une absence ou d&apos;un
            abandon ne constituent pas le prix d&apos;une action de formation
            réalisée. Elles ne sont pas imputables sur les fonds de la
            formation professionnelle et ne peuvent pas faire l&apos;objet
            d&apos;une demande de prise en charge auprès d&apos;un OPCO. Elles
            sont, le cas échéant, mentionnées distinctement sur la facture ou
            font l&apos;objet d&apos;une facturation séparée.
          </p>
          <p className="mt-3">
            <strong>
              En cas d&apos;annulation ou de report à l&apos;initiative de
              {" "}{orgName}
            </strong>
          </p>
          <p className="mt-1">
            {orgName}{" "}se réserve la possibilité de reporter ou d&apos;annuler
            la formation en cas de force majeure, d&apos;indisponibilité du
            formateur, d&apos;incident technique ou de circonstances
            empêchant le bon déroulement de l&apos;action. Dans ce cas, une
            nouvelle date sera proposée au bénéficiaire. En cas
            d&apos;impossibilité de report, les sommes éventuellement versées
            au titre de la formation non réalisée seront remboursées.
          </p>
        </Article>

        {/* XI */}
        <Article num="XIII" title="Litiges">
          <p>
            Le présent accord est régi par le droit français. En cas de
            différend, les parties s&apos;efforceront de rechercher une
            solution amiable avant toute action contentieuse. À défaut
            d&apos;accord amiable, le tribunal de commerce d&apos;Avignon
            sera seul compétent.
          </p>
        </Article>

        {/* Signatures - bloc encadré moderne.
            On wrap "Fait à... le..." + les 2 cadres signature dans un même
            conteneur keep-together pour qu'ils restent solidaires sur la
            même page (R9 — Gilles 2026-05-14). */}
        <div className="keep-together">
        <div className="mt-6 mb-4 text-center text-[13px] text-slate-700">
          Fait à <Highlight>{orgCity}</Highlight>, le{" "}
          <Highlight>{today}</Highlight>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-3">
          {/* Cadre signature : Bénéficiaire */}
          <div className="rounded-lg ring-1 ring-slate-200 p-3 bg-white">
            <div
              className="text-[10px] uppercase tracking-wider font-bold pb-1.5 mb-2 border-b"
              style={{ borderColor: "#1e40af", color: "#1e40af" }}
            >
              Pour le Bénéficiaire
            </div>
            <p className="text-[12px]">
              <Highlight>{company?.name ?? "—"}</Highlight>
            </p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Signataire :{" "}
              {rhFullName ? (
                <Highlight>{rhFullName}</Highlight>
              ) : (
                <span className="inline-block min-w-[180px] border-b border-dotted border-slate-500 align-bottom">
                  &nbsp;
                </span>
              )}
            </p>
            <p className="text-[10px] text-slate-500 italic mt-1">
              Cachet et signature
            </p>
            {conv.status === "signed" && conv.signature_data ? (
              <div className="mt-2 p-2 bg-emerald-50 rounded">
                {/* Mention legale "Bon pour accord" obligatoire pour
                    engager l'entreprise (Gilles 2026-05-22). */}
                <p className="text-[11px] font-bold text-emerald-800 text-center mb-1">
                  Bon pour accord
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={conv.signature_data}
                  alt="Signature"
                  className="max-h-16 mx-auto"
                />
                <p className="text-[10px] text-emerald-700 italic mt-1 text-center">
                  ✓ Signé le{" "}
                  {conv.signed_at
                    ? new Date(conv.signed_at).toLocaleDateString("fr-FR")
                    : "—"}
                  {conv.signed_by_name && ` par ${conv.signed_by_name}`}
                </p>
              </div>
            ) : (
              <div className="mt-2 h-20 border border-dashed border-slate-200 rounded"></div>
            )}
          </div>

          {/* Cadre signature : Organisme */}
          <div className="rounded-lg ring-1 ring-slate-200 p-3 bg-white">
            <div
              className="text-[10px] uppercase tracking-wider font-bold pb-1.5 mb-2 border-b"
              style={{ borderColor: "#1e40af", color: "#1e40af" }}
            >
              Pour l&apos;Organisme
            </div>
            <p className="text-[12px]">
              <strong>{orgName}</strong>
            </p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Signataire : {dirigeantName}, {dirigeantTitle}
            </p>
            <p className="text-[10px] text-slate-500 italic mt-1">
              Cachet et signature
            </p>
            {signatureDataUrl ? (
              <div className="mt-2 h-20 flex items-center justify-center rounded">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signatureDataUrl}
                  alt="Cachet et signature"
                  style={{
                    maxHeight: "100%",
                    maxWidth: "100%",
                    objectFit: "contain",
                    mixBlendMode: "multiply",
                  }}
                />
              </div>
            ) : (
              <div className="mt-2 h-20 border border-dashed border-slate-200 rounded"></div>
            )}
          </div>
        </div>
        </div>{/* /keep-together signatures */}

        {/* Pied de page : repete sur CHAQUE page par Puppeteer (template).
            Pas de footer ici pour eviter la duplication. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              .legal-mentions-footer p { margin: 0 0 2px 0; }
              .legal-mentions-footer h2,
              .legal-mentions-footer h3 { font-size: 9px; font-weight: bold; margin: 2px 0; }
              /* Texte autocompleté par l'application : bleu marine + gras,
                 pour distinguer visuellement les variables remplies des
                 textes fixes du modele. */
              .field-auto { color: #1e40af; font-weight: 700; }
            `,
          }}
        />
        </div>{/* /convention-body — padding latéral 18mm */}
      </div>
    </>
  );
}

function Article({
  num,
  title,
  children,
  className,
}: {
  num: string;
  title: string;
  children: React.ReactNode;
  /** Classes additionnelles — typiquement "keep-together" pour empêcher
   *  toute coupure du chapitre sur 2 pages (R9). */
  className?: string;
}) {
  return (
    <section className={cn("mb-4", className)}>
      {/* Le titre de l'article ne se separe jamais de ses 2 premieres lignes,
          mais le corps de l'article peut etre coupe sur 2 pages (evite les
          grands blancs en bas de page). */}
      <h3
        className="flex items-center gap-2.5 text-[14px] font-bold mt-4 mb-2.5 pb-1.5 border-b border-slate-200"
        style={{ breakAfter: "avoid" }}
      >
        <span
          className="inline-flex items-center justify-center min-w-[34px] h-8 px-2 rounded-lg text-white text-[13px] font-bold tracking-wider"
          style={{
            background: "linear-gradient(135deg, #1e40af 0%, #2563eb 100%)",
            boxShadow:
              "0 2px 4px rgba(30,64,175,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
        >
          {num}
        </span>
        <span className="uppercase text-slate-800 tracking-wide">{title}</span>
      </h3>
      <div className="text-[12.5px] leading-relaxed pl-1">{children}</div>
    </section>
  );
}

/**
 * Champ autocomplété par l'application (variables de la session).
 * Affiché en bleu marine et gras pour bien le distinguer du texte fixe
 * du modèle (cohérence avec la charte CAP NUMÉRIQUE).
 */
function Highlight({ children }: { children: React.ReactNode }) {
  return <span className="field-auto">{children}</span>;
}

/**
 * Convertit le code interne du mode de financement en libellé lisible
 * pour le PDF de convention.
 */
/**
 * Détecte si le nom du formateur correspond à Gilles COLOVRAY (le
 * dirigeant de CAP NUMÉRIQUE qui anime lui-même certaines sessions).
 * Comparaison normalisée (sans accents, casse, espaces) pour gérer les
 * variantes : "Gilles COLOVRAY", "gilles colovray", "Gilles Colovray", etc.
 */
function isGillesColovrayTrainer(name: string | null | undefined): boolean {
  if (!name) return false;
  const normalized = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return normalized === "gilles colovray";
}

function formatFinancingModeLabel(code: string): string {
  const map: Record<string, string> = {
    opco: "OPCO (entreprise via son OPCO)",
    plan_developpement: "Plan de développement (entreprise paye direct)",
    cpf: "CPF (Compte Personnel de Formation)",
    autofinancement: "Autofinancement",
    pole_emploi: "Pôle Emploi / France Travail",
    fse: "FSE (Fonds Social Européen)",
    region: "Région",
    autre: "Autre",
  };
  return map[code] ?? code;
}
