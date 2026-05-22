import type { Metadata } from "next";
import Link from "next/link";
import {
  Award,
  Brain,
  Calendar as CalendarIcon,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  FileText,
  Folder,
  Lock,
  MapPin,
  PenTool,
  Phone,
  Target,
  Video,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCertificateEligibility } from "@/lib/portal/realization-certificate";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mon parcours de formation — CAP NUMERIQUE",
  robots: "noindex, nofollow",
};

type Params = { token: string };

// ============================================================
// Logique métier : disponibilité de chaque module
// ============================================================

type CardStatus =
  | { kind: "available"; href: string; doneLabel?: never }
  | { kind: "done"; href: string; doneLabel: string }
  | { kind: "locked"; reason: string }
  | { kind: "todo"; reason: string };

function formatDateTime(d: Date): string {
  return d.toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================
// Page
// ============================================================

export default async function ParcoursApprenantPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  // 1. Token portail → enrollment
  const { data: tokenRow } = await supabase
    .from("enrollment_portal_tokens")
    .select("enrollment_id")
    .eq("token", token)
    .maybeSingle<{ enrollment_id: string }>();

  if (!tokenRow) {
    return <NotFoundCard reason="Lien invalide ou inconnu." />;
  }

  // 2. Enrollment + apprenant + session + formation + organisme
  // (enrichi 2026-05-22 Gilles : durée, horaires, lieu, contact OF)
  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select(
      "id, session_id, learner:learners(id, civility, first_name, last_name), session:sessions(id, start_date, end_date, modality, location, video_link, video_app, quiz_template_id, default_morning_start, default_morning_end, default_afternoon_start, default_afternoon_end, trainer:trainers!trainer_id(first_name, last_name, phone, mobile, email), location_ref:formation_locations!location_id(name, address, postal_code, city), formation:formations(title, duration_hours, duration_days, quiz_template_id), organization:organizations(name, logo_url, phone, email, realization_certificate_threshold_percent))",
    )
    .eq("id", tokenRow.enrollment_id)
    .maybeSingle<{
      id: string;
      session_id: string;
      learner: {
        id: string;
        civility: string | null;
        first_name: string | null;
        last_name: string | null;
      } | null;
      session: {
        id: string;
        start_date: string;
        end_date: string;
        modality: string | null;
        location: string | null;
        video_link: string | null;
        video_app: string | null;
        quiz_template_id: string | null;
        default_morning_start: string | null;
        default_morning_end: string | null;
        default_afternoon_start: string | null;
        default_afternoon_end: string | null;
        trainer: {
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          mobile: string | null;
          email: string | null;
        } | null;
        location_ref: {
          name: string | null;
          address: string | null;
          postal_code: string | null;
          city: string | null;
        } | null;
        formation: {
          title: string;
          duration_hours: number | null;
          duration_days: number | null;
          quiz_template_id: string | null;
        } | null;
        organization: {
          name: string;
          logo_url: string | null;
          phone: string | null;
          email: string | null;
          realization_certificate_threshold_percent: number | null;
        } | null;
      } | null;
    }>();

  if (!enrollment || !enrollment.session || !enrollment.learner) {
    return <NotFoundCard reason="Inscription introuvable." />;
  }

  const session = enrollment.session;
  const learner = enrollment.learner;
  const fullName = [learner.first_name, learner.last_name]
    .filter(Boolean)
    .join(" ");
  const orgName = session.organization?.name ?? "";
  const orgLogo = session.organization?.logo_url ?? null;
  const formationTitle = session.formation?.title ?? "Formation";

  // 3. Charger les jours de session (pour la règle d'émargement)
  const { data: days } = await supabase
    .from("session_days")
    .select(
      "day_date, morning_start, morning_end, afternoon_start, afternoon_end",
    )
    .eq("session_id", session.id)
    .order("day_date", { ascending: true });

  // 4. Signature déjà posées par l'apprenant (compteur)
  const { data: signatures } = await supabase
    .from("attendance_signatures")
    .select("period_date, moment, signed_at")
    .eq("enrollment_id", enrollment.id)
    .eq("signer_role", "learner");

  // 5. Évaluation déjà remplie ?
  const { data: hotEval } = await supabase
    .from("evaluation_responses")
    .select("submitted_at")
    .eq("enrollment_id", enrollment.id)
    .eq("evaluation_type", "hot")
    .maybeSingle<{ submitted_at: string }>();

  // 6. Documents partagés disponibles pour la session
  const { count: sharedDocsCount } = await supabase
    .from("session_documents")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id)
    .eq("visibility", "shared_with_learners");

  // 7. Test de positionnement déjà rempli ?
  const { data: positioningRow } = await supabase
    .from("positioning_responses")
    .select("learner_submitted_at")
    .eq("enrollment_id", enrollment.id)
    .maybeSingle<{ learner_submitted_at: string }>();

  // 8. Quiz d'évaluation : résolution du quiz effectif + tentatives
  const quizTemplateId =
    session.quiz_template_id ?? session.formation?.quiz_template_id ?? null;
  let preDone = false;
  let postDone = false;
  if (quizTemplateId) {
    const { data: quizAttempts } = await supabase
      .from("quiz_attempts")
      .select("phase")
      .eq("enrollment_id", enrollment.id)
      .eq("quiz_template_id", quizTemplateId);
    for (const a of (quizAttempts ?? []) as Array<{ phase: string }>) {
      if (a.phase === "pre") preDone = true;
      if (a.phase === "post") postDone = true;
    }
  }

  // Détection : l'enrollment a-t-il été créé via un OF partenaire ?
  // Si oui, l'OF gère lui-même la convocation/convention/attestation
  // → côté apprenant, on n'affiche QUE le quiz pré + post.
  // Aussi : on récupère la source d'inscription (channel) pour
  // afficher CAP NUMERIQUE / Prescripteur / OF dans le header
  // (Gilles 2026-05-22).
  let isViaPartnerOf = false;
  let inscriptionChannel: "direct" | "prescripteur" | "of" = "direct";
  let referrerCompanyName: string | null = null;
  {
    const { data: enrollmentMeta } = await supabase
      .from("session_enrollments")
      .select("inscription_request_id")
      .eq("id", enrollment.id)
      .maybeSingle<{ inscription_request_id: string | null }>();
    if (enrollmentMeta?.inscription_request_id) {
      const { data: req } = await supabase
        .from("inscription_requests")
        .select(
          "inscription_channel, referrer_company_id, referrer:companies!referrer_company_id(name, type)",
        )
        .eq("id", enrollmentMeta.inscription_request_id)
        .maybeSingle<{
          inscription_channel: "direct" | "prescripteur" | "of" | null;
          referrer_company_id: string | null;
          referrer:
            | { name: string; type: string }
            | Array<{ name: string; type: string }>
            | null;
        }>();
      if (req) {
        inscriptionChannel = req.inscription_channel ?? "direct";
        const ref = Array.isArray(req.referrer) ? req.referrer[0] : req.referrer;
        if (req.referrer_company_id && ref?.type === "of") {
          isViaPartnerOf = true;
        }
        if (ref?.name) referrerCompanyName = ref.name;
      }
    }
  }

  // (Note : la logique end_date est désormais centralisée dans
  // checkCertificateEligibility, donc plus besoin de variables locales.)

  // ============================================================
  // Calcul du statut de chaque carte
  // ============================================================

  // 🎯 Test de positionnement : dispo dès maintenant, ou ✅ si déjà
  // rempli (carte 1 du parcours apprenant).
  const positioningStatus: CardStatus = positioningRow
    ? {
        kind: "done",
        href: `/mon-parcours/${token}/positionnement`,
        doneLabel: `Rempli le ${new Date(positioningRow.learner_submitted_at).toLocaleDateString("fr-FR")}`,
      }
    : {
        kind: "available",
        href: `/mon-parcours/${token}/positionnement`,
      };

  // ✍️ Émargement → ACTIF si on est dans une fenêtre [30 min avant
  // morning_start, fin afternoon_end + 7j] pour l'un des jours.
  // Sinon : à venir (premier créneau dans le futur) OU terminé (tous
  // les créneaux dans le passé).
  const emargementStatus = computeEmargementStatus(
    days ?? [],
    signatures ?? [],
    token,
  );

  // 📁 Documents partagés : actif si au moins 1 document a été
  // marqué "Partagé avec les apprenants" par le formateur.
  const documentsStatus: CardStatus =
    (sharedDocsCount ?? 0) > 0
      ? {
          kind: "available",
          href: `/mon-parcours/${token}/documents`,
        }
      : {
          kind: "locked",
          reason:
            "Aucun document partagé pour le moment. Votre formateur déposera les supports pendant la session.",
        };

  // ⭐ Évaluation à chaud → ACTIVE à partir du dernier jour 12h00
  // OU si la session a déjà commencé et qu'on est à >= la moitié.
  // V1 simple : à partir de la date de fin de session (J fin matin
  // serait l'idéal mais on reste simple).
  const evaluationStatus = computeEvaluationStatus(
    session,
    hotEval?.submitted_at ?? null,
    token,
  );

  // 🎓 Certificat de réalisation : actif si session terminée
  // ET ratio de présence >= seuil organisation (défaut 80%).
  const threshold =
    session.organization?.realization_certificate_threshold_percent ?? 80;
  const eligibility = await checkCertificateEligibility(
    supabase,
    enrollment.id,
    session.id,
    session.end_date,
    threshold,
  );
  const certificateStatus: CardStatus =
    eligibility.kind === "eligible"
      ? { kind: "available", href: `/mon-parcours/${token}/certificat` }
      : eligibility.kind === "below_threshold"
        ? {
            kind: "locked",
            reason: `Présence insuffisante : ${eligibility.ratio.percent}% (seuil requis : ${eligibility.thresholdPercent}%). Contactez votre formateur en cas d'erreur.`,
          }
        : {
            kind: "locked",
            reason: `Disponible à la fin de la formation (${new Date(eligibility.endDate).toLocaleDateString("fr-FR")})`,
          };

  // 🧠 Quiz d'évaluation : actif si un quiz est rattaché et phase à jouer.
  const quizStatus: CardStatus = !quizTemplateId
    ? {
        kind: "locked",
        reason: "Aucun quiz d'évaluation n'est rattaché à cette session.",
      }
    : preDone && postDone
      ? {
          kind: "done",
          href: `/mon-parcours/${token}/quiz`,
          doneLabel: "Avant et après complétés",
        }
      : preDone
        ? {
            kind: "available",
            href: `/mon-parcours/${token}/quiz`,
          }
        : {
            kind: "available",
            href: `/mon-parcours/${token}/quiz`,
          };

  // ============================================================
  // Render
  // ============================================================

  // === Détails session enrichis (Gilles 2026-05-22) ===
  const durationHours = session.formation?.duration_hours ?? null;
  const durationDays = session.formation?.duration_days ?? null;
  const durationText =
    durationDays && durationHours
      ? `${durationDays} jour${durationDays > 1 ? "s" : ""} soit ${durationHours} heures`
      : durationHours
        ? `${durationHours} heures`
        : durationDays
          ? `${durationDays} jour${durationDays > 1 ? "s" : ""}`
          : null;

  const horaires = [
    session.default_morning_start && session.default_morning_end
      ? `${session.default_morning_start.slice(0, 5)} - ${session.default_morning_end.slice(0, 5)}`
      : null,
    session.default_afternoon_start && session.default_afternoon_end
      ? `${session.default_afternoon_start.slice(0, 5)} - ${session.default_afternoon_end.slice(0, 5)}`
      : null,
  ].filter(Boolean);

  const isDistanciel = session.modality === "distanciel";
  const isHybride = session.modality === "hybride";

  const adresseComplete = [
    session.location_ref?.name,
    session.location_ref?.address,
    [session.location_ref?.postal_code, session.location_ref?.city]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  const orgPhone = session.organization?.phone ?? null;
  const trainer = session.trainer;
  const trainerName = trainer
    ? [trainer.first_name, trainer.last_name].filter(Boolean).join(" ")
    : null;
  const trainerPhone = trainer?.mobile ?? trainer?.phone ?? null;

  // === URLs d'ajout au calendrier (Gilles 2026-05-22) ===
  // 3 voies au choix : Google Calendar, Outlook, .ics (universel).
  function pad(n: number) {
    return n.toString().padStart(2, "0");
  }
  function buildDateTime(dateIso: string, time: string | null): Date {
    const d = new Date(dateIso);
    const [hh, mm] = (time ?? "09:00").split(":").map((x) => Number(x));
    d.setHours(hh || 9, mm || 0, 0, 0);
    return d;
  }
  const calStart = buildDateTime(
    session.start_date,
    session.default_morning_start ?? "09:00",
  );
  const calEnd = buildDateTime(
    session.end_date,
    session.default_afternoon_end ?? "17:00",
  );
  // Format Google : YYYYMMDDTHHMMSSZ (UTC)
  const googleDate = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  // Format Outlook : ISO 8601 (locale browser)
  const outlookDate = (d: Date) => d.toISOString();

  const calLocation =
    isDistanciel || isHybride
      ? (session.video_link ?? "Distanciel")
      : adresseComplete || "";
  // Lien vers l'espace apprenant — affiché dans la description du
  // calendrier pour que l'apprenant retrouve toutes ses ressources
  // (Gilles 2026-05-22). On retire le lien visio car il est déjà
  // dans le champ Lieu.
  const portalUrl =
    (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com") +
    `/mon-parcours/${token}`;
  const calDescription = [
    `Formation organisée par ${orgName}`,
    orgPhone ? `Contact : ${orgPhone}` : null,
    session.organization?.email
      ? `Email : ${session.organization.email}`
      : null,
    `Mon espace apprenant (test de positionnement, émargement, supports, convocation, certificat) : ${portalUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const googleCalUrl =
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(formationTitle)}` +
    `&dates=${googleDate(calStart)}/${googleDate(calEnd)}` +
    `&details=${encodeURIComponent(calDescription)}` +
    `&location=${encodeURIComponent(calLocation)}`;
  const outlookCalUrl =
    `https://outlook.office.com/calendar/0/deeplink/compose` +
    `?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent` +
    `&subject=${encodeURIComponent(formationTitle)}` +
    `&body=${encodeURIComponent(calDescription)}` +
    `&location=${encodeURIComponent(calLocation)}` +
    `&startdt=${encodeURIComponent(outlookDate(calStart))}` +
    `&enddt=${encodeURIComponent(outlookDate(calEnd))}`;

  // === Label « Source d'inscription » (Gilles 2026-05-22) ===
  const sourceLabel =
    inscriptionChannel === "prescripteur"
      ? `Inscription via prescripteur${referrerCompanyName ? ` · ${referrerCompanyName}` : ""}`
      : inscriptionChannel === "of"
        ? `Inscription via OF partenaire${referrerCompanyName ? ` · ${referrerCompanyName}` : ""}`
        : `Inscription via ${orgName}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-4">
        {/* Header : nom apprenant + date mise en valeur + source.
            (Gilles 2026-05-22 : on a sorti le titre formation pour le
            mettre dans la carte Détails ci-dessous, et la date est
            désormais affichée en plus gros.) */}
        <header className="text-center space-y-2 mb-2">
          {orgLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={orgLogo}
              alt={orgName}
              className="h-14 mx-auto mb-3 object-contain"
            />
          )}
          <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
            Espace apprenant
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900">
            {fullName}
          </h1>
          <p className="text-sm md:text-base font-semibold text-cyan-700">
            {formatDateRange(session.start_date, session.end_date)}
          </p>
          <p className="text-xs text-zinc-500">{sourceLabel}</p>
        </header>

        {/* Carte « Détails de la session » : titre formation + durée +
            horaires + lieu + contact + boutons agenda et convocation.
            Gilles 2026-05-22. */}
        <div className="rounded-xl bg-white border-2 border-cyan-200 p-4 space-y-3 shadow-sm">
          {/* Titre formation EN GROS et EN GRAS — déplacé du header
              ici pour qu'il soit visible dans le bloc des détails
              (Gilles 2026-05-22). */}
          <div className="text-center pb-2 border-b border-zinc-100">
            <p className="text-[10px] uppercase tracking-widest font-bold text-cyan-700 mb-1">
              Formation
            </p>
            <p className="text-base md:text-lg font-extrabold text-zinc-900 leading-tight">
              {formationTitle}
            </p>
          </div>
          <div className="grid gap-2 text-sm">
            {durationText && (
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-cyan-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold text-zinc-900">Durée :</span>{" "}
                  <span className="text-zinc-700">{durationText}</span>
                </div>
              </div>
            )}
            {horaires.length > 0 && (
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-cyan-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold text-zinc-900">Horaires :</span>{" "}
                  <span className="text-zinc-700">{horaires.join(" · ")}</span>
                </div>
              </div>
            )}
            {/* Lieu : adresse pour présentiel, lien visio pour distanciel */}
            {isDistanciel || isHybride ? (
              <div className="flex items-start gap-2">
                <Video className="h-4 w-4 text-cyan-600 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div>
                    <span className="font-bold text-zinc-900">
                      {isHybride ? "Hybride" : "Distanciel"} :
                    </span>{" "}
                    {session.video_app && (
                      <span className="text-zinc-700">{session.video_app}</span>
                    )}
                  </div>
                  {session.video_link && (
                    <a
                      href={session.video_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-cyan-700 hover:text-cyan-900 hover:underline text-xs break-all mt-1"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      {session.video_link}
                    </a>
                  )}
                  {isHybride && adresseComplete && (
                    <p className="text-xs text-zinc-600 mt-1">
                      <strong>Lieu présentiel :</strong> {adresseComplete}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              adresseComplete && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-cyan-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-bold text-zinc-900">Lieu :</span>{" "}
                    <span className="text-zinc-700">{adresseComplete}</span>
                  </div>
                </div>
              )
            )}
            {/* Contact en cas de problème */}
            {(orgPhone || trainerPhone) && (
              <div className="flex items-start gap-2 pt-1 border-t border-zinc-100">
                <Phone className="h-4 w-4 text-cyan-600 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <span className="font-bold text-zinc-900">
                    En cas de problème :
                  </span>
                  {orgPhone && (
                    <div className="text-zinc-700 mt-0.5">
                      {orgName} —{" "}
                      <a
                        href={`tel:${orgPhone.replace(/\s/g, "")}`}
                        className="font-mono font-semibold text-cyan-700 hover:underline"
                      >
                        {orgPhone}
                      </a>
                    </div>
                  )}
                  {trainerPhone && trainerName && (
                    <div className="text-zinc-700 mt-0.5">
                      Formateur {trainerName} —{" "}
                      <a
                        href={`tel:${trainerPhone.replace(/\s/g, "")}`}
                        className="font-mono font-semibold text-cyan-700 hover:underline"
                      >
                        {trainerPhone}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Boutons d'action : ajout calendrier (3 voies) + convocation.
              Gilles 2026-05-22 — 3 boutons distincts pour Google, Outlook
              et .ics universel selon ce qu'utilise l'apprenant. */}
          <div className="pt-2 border-t border-zinc-100 space-y-2">
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 inline-flex items-center gap-1.5">
                <CalendarIcon className="h-3 w-3" />
                Ajouter à mon agenda
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={googleCalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border-2 border-zinc-300 text-zinc-800 text-xs font-bold hover:bg-zinc-50 hover:border-blue-400 transition-colors"
                  title="Ouvre Google Calendar dans un nouvel onglet avec l'événement pré-rempli"
                >
                  <span className="text-base leading-none">📅</span>
                  Google Calendar
                </a>
                <a
                  href={outlookCalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border-2 border-zinc-300 text-zinc-800 text-xs font-bold hover:bg-zinc-50 hover:border-blue-400 transition-colors"
                  title="Ouvre Outlook (Office 365) avec l'événement pré-rempli"
                >
                  <span className="text-base leading-none">📨</span>
                  Outlook
                </a>
                <a
                  href={`/api/public/parcours/${token}/calendar.ics`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border-2 border-zinc-300 text-zinc-800 text-xs font-bold hover:bg-zinc-50 hover:border-blue-400 transition-colors"
                  title="Télécharge un fichier .ics universel (Apple Calendar, Outlook desktop, Thunderbird…)"
                >
                  <span className="text-base leading-none">💾</span>
                  Fichier .ics
                </a>
              </div>
            </div>
            <div>
              <a
                href={`/api/public/convocations/${token}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-700 transition-colors"
                title="Télécharger ma convocation en PDF"
              >
                <FileText className="h-3.5 w-3.5" />
                Voir ma convocation
              </a>
            </div>
          </div>
        </div>

        {/* Bandeau d'introduction spécifique aux apprenants d'un OF partenaire :
            CAP NUMÉRIQUE ne fournit QUE les quiz, le reste (convocation,
            attestation, etc.) est géré par leur organisme de formation. */}
        {isViaPartnerOf && (
          <div className="rounded-xl bg-cyan-50 border border-cyan-200 p-4 text-sm text-cyan-900">
            <p className="font-bold mb-1">
              Évaluation des connaissances — quiz uniquement
            </p>
            <p className="text-xs leading-relaxed">
              Votre organisme de formation utilise les quiz de{" "}
              <strong>{orgName}</strong> pour mesurer votre progression. Vos
              autres documents (convocation, attestation, etc.) vous sont
              transmis directement par votre organisme de formation.
            </p>
          </div>
        )}

        {/* Cartes */}
        {!isViaPartnerOf && (
          <Card
            icon={<Target className="h-6 w-6" />}
            color="amber"
            number={1}
            title="Test de positionnement"
            description="Évaluez votre niveau initial avant le début de la formation."
            status={positioningStatus}
          />
        )}

        {!isViaPartnerOf && (
          <Card
            icon={<PenTool className="h-6 w-6" />}
            color="cyan"
            number={2}
            title="Émargement"
            description="Signez votre présence chaque demi-journée pour la traçabilité Qualiopi."
            status={emargementStatus}
          />
        )}

        {!isViaPartnerOf && (
          <Card
            icon={<Folder className="h-6 w-6" />}
            color="indigo"
            number={3}
            title="Documents partagés"
            description={
              (sharedDocsCount ?? 0) > 0
                ? `${sharedDocsCount} document${(sharedDocsCount ?? 0) > 1 ? "s" : ""} disponible${(sharedDocsCount ?? 0) > 1 ? "s" : ""} au téléchargement.`
                : "Téléchargez les supports remis par le formateur pendant la session."
            }
            status={documentsStatus}
          />
        )}

        {!isViaPartnerOf && (
          <Card
            icon={<ClipboardList className="h-6 w-6" />}
            color="violet"
            number={4}
            title="Évaluation à chaud"
            description="Donnez votre avis sur la formation pour nous aider à l'améliorer."
            status={evaluationStatus}
          />
        )}

        {!isViaPartnerOf && (
          <Card
            icon={<Award className="h-6 w-6" />}
            color="emerald"
            number={5}
            title="Certificat de réalisation"
            description="Téléchargez votre certificat officiel de fin de formation."
            status={certificateStatus}
          />
        )}

        <Card
          icon={<Brain className="h-6 w-6" />}
          color="violet"
          number={isViaPartnerOf ? 1 : 6}
          title="Quiz d'évaluation"
          description={
            !quizTemplateId
              ? "Aucun quiz rattaché à cette session."
              : preDone && postDone
                ? "Vous avez joué le quiz avant et après la formation."
                : preDone
                  ? "Première passation effectuée. Jouez la 2ème en fin de session pour mesurer votre progression."
                  : "Quiz pré-session puis post-session, pour mesurer ce que vous avez appris."
          }
          status={quizStatus}
        />

        <footer className="text-center text-[11px] text-zinc-400 mt-8">
          Vos données restent confidentielles côté organisme de formation.
          <br />
          Conservez ce lien : il vous donne accès à votre espace pendant
          toute la durée de la formation.
        </footer>
      </div>
    </div>
  );
}

// ============================================================
// Logique métier
// ============================================================

type SessionDay = {
  day_date: string;
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
};

type SignatureRow = {
  period_date: string;
  moment: string;
  signed_at: string;
};

function combineDateAndTime(dateIso: string, timeHm: string | null): Date | null {
  if (!timeHm) return null;
  const [hh, mm] = timeHm.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const d = new Date(dateIso);
  d.setHours(hh, mm, 0, 0);
  return d;
}

function computeEmargementStatus(
  days: SessionDay[],
  signatures: SignatureRow[],
  token: string,
): CardStatus {
  const now = new Date();
  const buffer = 30 * 60 * 1000; // 30 min avant
  const tolerance = 7 * 24 * 60 * 60 * 1000; // 7 jours après

  // Combien de demi-journées au total
  let totalSlots = 0;
  for (const d of days) {
    if (d.morning_start && d.morning_end) totalSlots++;
    if (d.afternoon_start && d.afternoon_end) totalSlots++;
  }
  const signedCount = signatures.length;

  // Tout signé ?
  if (totalSlots > 0 && signedCount >= totalSlots) {
    return {
      kind: "done",
      href: `/mon-parcours/${token}/emargement`,
      doneLabel: `Toutes mes signatures sont enregistrées (${signedCount}/${totalSlots})`,
    };
  }

  // Y a-t-il un créneau actif ou récemment terminé ?
  let nextSlot: Date | null = null;
  for (const d of days) {
    const morningStart = combineDateAndTime(d.day_date, d.morning_start);
    const afternoonEnd = combineDateAndTime(d.day_date, d.afternoon_end);
    if (!morningStart || !afternoonEnd) continue;
    const windowOpen = morningStart.getTime() - buffer;
    const windowClose = afternoonEnd.getTime() + tolerance;
    if (now.getTime() >= windowOpen && now.getTime() <= windowClose) {
      return {
        kind: "available",
        href: `/mon-parcours/${token}/emargement`,
      };
    }
    if (now.getTime() < windowOpen && !nextSlot) {
      nextSlot = new Date(windowOpen);
    }
  }

  if (nextSlot) {
    return {
      kind: "locked",
      reason: `Disponible à partir du ${formatDateTime(nextSlot)} (30 min avant le début)`,
    };
  }

  if (signedCount > 0) {
    return {
      kind: "done",
      href: `/mon-parcours/${token}/emargement`,
      doneLabel: `${signedCount}/${totalSlots} signature${signedCount > 1 ? "s" : ""} enregistrée${signedCount > 1 ? "s" : ""}`,
    };
  }

  return {
    kind: "locked",
    reason: "Période d'émargement terminée.",
  };
}

function computeEvaluationStatus(
  session: { start_date: string; end_date: string },
  submittedAt: string | null,
  token: string,
): CardStatus {
  if (submittedAt) {
    return {
      kind: "done",
      href: `/mon-parcours/${token}/evaluation`,
      doneLabel: `Évaluation remplie le ${new Date(submittedAt).toLocaleDateString("fr-FR")}`,
    };
  }
  // Active : on est >= dernier jour à midi
  const lastDay = new Date(session.end_date);
  lastDay.setHours(12, 0, 0, 0);
  const now = new Date();
  if (now.getTime() >= lastDay.getTime()) {
    return {
      kind: "available",
      href: `/mon-parcours/${token}/evaluation`,
    };
  }
  return {
    kind: "locked",
    reason: `Disponible à partir du ${formatDateTime(lastDay)}`,
  };
}

function formatDateRange(start: string, end: string): string {
  if (start === end) {
    return new Date(start).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  return `du ${new Date(start).toLocaleDateString("fr-FR")} au ${new Date(end).toLocaleDateString("fr-FR")}`;
}

// ============================================================
// Composants UI
// ============================================================

type CardColor = "amber" | "cyan" | "indigo" | "violet" | "emerald";

const COLOR_STYLES: Record<CardColor, { bg: string; text: string; ring: string; btn: string }> = {
  amber: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
    btn: "bg-amber-600 hover:bg-amber-700",
  },
  cyan: {
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    ring: "ring-cyan-200",
    btn: "bg-cyan-600 hover:bg-cyan-700",
  },
  indigo: {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    ring: "ring-indigo-200",
    btn: "bg-indigo-600 hover:bg-indigo-700",
  },
  violet: {
    bg: "bg-violet-50",
    text: "text-violet-700",
    ring: "ring-violet-200",
    btn: "bg-violet-600 hover:bg-violet-700",
  },
  emerald: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
    btn: "bg-emerald-600 hover:bg-emerald-700",
  },
};

function Card({
  icon,
  color,
  number,
  title,
  description,
  status,
}: {
  icon: React.ReactNode;
  color: CardColor;
  number: number;
  title: string;
  description: string;
  status: CardStatus;
}) {
  const styles = COLOR_STYLES[color];
  const isActive = status.kind === "available" || status.kind === "done";

  return (
    <div
      className={
        isActive
          ? `rounded-xl bg-white shadow-sm border border-zinc-200 p-4 ring-1 ${styles.ring}`
          : "rounded-xl bg-zinc-50 border border-zinc-200 p-4 opacity-90"
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={
            isActive
              ? `shrink-0 h-12 w-12 rounded-xl ${styles.bg} ${styles.text} flex items-center justify-center`
              : "shrink-0 h-12 w-12 rounded-xl bg-zinc-200 text-zinc-400 flex items-center justify-center"
          }
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={
                isActive
                  ? `text-[10px] font-bold ${styles.text} bg-white border ${styles.ring} px-1.5 py-0.5 rounded-full`
                  : "text-[10px] font-bold text-zinc-400 bg-white border border-zinc-200 px-1.5 py-0.5 rounded-full"
              }
            >
              ÉTAPE {number}
            </span>
            {status.kind === "done" && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                <CheckCircle2 className="h-2.5 w-2.5" />
                FAIT
              </span>
            )}
          </div>
          <h3 className="font-bold text-zinc-900">{title}</h3>
          <p className="text-xs text-zinc-600 mt-0.5">{description}</p>
          <div className="mt-3">
            {status.kind === "available" && (
              <Link
                href={status.href}
                className={`inline-flex items-center justify-center px-4 py-2 rounded-lg text-white font-semibold text-sm ${styles.btn}`}
              >
                Accéder
              </Link>
            )}
            {status.kind === "done" && (
              <div className="flex flex-col gap-1.5">
                <div className="text-xs text-emerald-700">
                  ✓ {status.doneLabel}
                </div>
                <Link
                  href={status.href}
                  className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-700 self-start"
                >
                  Voir
                </Link>
              </div>
            )}
            {(status.kind === "locked" || status.kind === "todo") && (
              <div className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                {status.kind === "locked" ? (
                  <Clock className="h-3.5 w-3.5" />
                ) : (
                  <Lock className="h-3.5 w-3.5" />
                )}
                <span>{status.reason}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NotFoundCard({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md bg-white rounded-xl shadow-md border border-zinc-200 p-6 text-center space-y-3">
        <FileText className="h-12 w-12 text-zinc-400 mx-auto" />
        <h1 className="text-lg font-bold">Espace apprenant indisponible</h1>
        <p className="text-sm text-zinc-600">{reason}</p>
      </div>
    </div>
  );
}
