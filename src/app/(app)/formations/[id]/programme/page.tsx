import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "../../../sessions/[id]/emargement/print/_print-button";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Découpe un texte multi-lignes en puces (ignore les lignes vides). */
function bullets(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•\s]+/, "").trim())
    .filter(Boolean);
}

type ProgrammeDay = { morning: string | null; afternoon: string | null };

export default async function FormationProgrammePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: f } = await supabase
    .from("formations")
    .select(
      "id, organization_id, internal_code, title, general_objective, target_audience, prerequisites, evaluation_methods, teaching_methods, pedagogy_approach, duration_hours, duration_days, min_participants, max_participants, programme_days",
    )
    .eq("id", id)
    .maybeSingle();
  if (!f) notFound();

  const { data: membership } = await supabase
    .from("organization_members")
    .select(
      "organization:organizations(name, logo_url, secondary_logo_url, address, postal_code, city, phone, email, website, siret, nda, nda_authority, legal_form, share_capital, rcs_number, vat_number, legal_mentions)",
    )
    .eq("profile_id", user.id)
    .eq("organization_id", f.organization_id as string)
    .maybeSingle();
  const org = (membership?.organization ?? {}) as Record<string, string | null>;
  const orgName = org.name ?? "CAP NUMÉRIQUE";

  const fr = f as {
    internal_code: string | null;
    title: string;
    general_objective: string | null;
    target_audience: string | null;
    prerequisites: string | null;
    evaluation_methods: string | null;
    teaching_methods: string | null;
    pedagogy_approach: string | null;
    duration_hours: number | null;
    duration_days: number | null;
    min_participants: number | null;
    max_participants: number | null;
    programme_days: ProgrammeDay[] | null;
  };

  const days = (fr.programme_days ?? []).filter(
    (d) => (d.morning && d.morning.trim()) || (d.afternoon && d.afternoon.trim()),
  );

  const dureeStr = [
    fr.duration_days ? `${fr.duration_days} jour(s)` : null,
    fr.duration_hours ? `soit ${fr.duration_hours} heures` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const effectifStr =
    fr.min_participants && fr.max_participants
      ? `De ${fr.min_participants} à ${fr.max_participants} personnes`
      : fr.max_participants
        ? `Jusqu'à ${fr.max_participants} personnes`
        : "Nous consulter";

  // Pied de page légal (1 ligne d'identité + 1 ligne légale + NDA).
  const footerAddress = [
    org.address,
    [org.postal_code, org.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" – ");
  const footerContact = [
    org.phone ? `Tél. : ${org.phone}` : null,
    org.email ? `Email : ${org.email}` : null,
    org.website ?? null,
  ]
    .filter(Boolean)
    .join(" – ");
  const footerLegal = [
    org.legal_form,
    org.share_capital ? `au capital de ${org.share_capital}` : null,
    org.rcs_number ? `RCS : ${org.rcs_number}` : null,
    org.vat_number ? `TVA : ${org.vat_number}` : null,
    org.siret && !org.rcs_number ? `SIRET : ${org.siret}` : null,
  ]
    .filter(Boolean)
    .join(" – ");
  const footerNda =
    org.nda &&
    `Déclaration d'activité enregistrée sous le numéro ${org.nda}${
      org.nda_authority ? ` auprès de ${org.nda_authority}` : ""
    }`;

  const Footer = () => (
    <div className="prog-footer">
      <div className="font-semibold">
        {orgName}
        {footerAddress ? ` – ${footerAddress}` : ""}
      </div>
      {footerContact && <div>{footerContact}</div>}
      {footerLegal && <div>{footerLegal}</div>}
      {footerNda && <div>{footerNda}</div>}
    </div>
  );

  return (
    <div className="prog-root bg-white">
      <style>{`
        .prog-root { color:#1f2433; }
        .no-print-bar { padding:16px; }
        @media print {
          /* On masque TOUT (sidebar, menus, header app) et on ne montre que
             le document. Robuste quelle que soit la structure de la page. */
          body * { visibility: hidden !important; }
          .prog-root, .prog-root * { visibility: visible !important; }
          .prog-root { position: absolute; left: 0; top: 0; right: 0; margin: 0; }
          .no-print-bar { display: none !important; }
          .prog-page { page-break-after: always; box-shadow: none; margin: 0; max-width: 100%; }
          /* Forcer l'impression des aplats de couleur (bandeaux bleus). */
          .prog-header, .prog-label, .prog-deroule-label {
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
        }
        @page { margin: 12mm; }
        .prog-page { max-width: 800px; margin: 0 auto 24px; background:#fff; box-shadow:0 0 0 1px #eee; }
        .prog-header { position:relative; background:linear-gradient(135deg,#0b1f4d 0%,#13367f 100%); color:#fff; padding:22px 28px 30px; overflow:hidden; }
        .prog-header::after { content:""; position:absolute; inset:0; background:
          radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,.06), transparent 60%),
          repeating-linear-gradient(115deg, rgba(255,255,255,.04) 0 2px, transparent 2px 26px);
          pointer-events:none; }
        .prog-logos { background:#fff; border-radius:14px; padding:8px 14px; display:flex; align-items:center; gap:14px; }
        .prog-logos img { max-height:46px; width:auto; object-fit:contain; }
        .prog-title { position:relative; text-align:center; font-weight:800; font-size:24px; line-height:1.15; text-transform:uppercase; margin:18px 6px 0; letter-spacing:.5px; }
        .prog-grid { display:grid; grid-template-columns: 180px 1fr; }
        .prog-label { background:linear-gradient(180deg,#13367f,#1f57c4); color:#fff; text-align:right; font-weight:700; padding:16px 14px; font-size:15px; }
        .prog-content { padding:16px 18px; }
        .prog-content ul { margin:0; padding-left:18px; }
        .prog-content li { margin:3px 0; line-height:1.4; }
        .prog-info { display:grid; grid-template-columns: repeat(4,1fr); gap:8px; margin-bottom:10px; }
        .prog-info .k { font-weight:800; color:#0b1f4d; font-size:13px; }
        .prog-info .v { font-size:13px; color:#333; }
        .prog-access { font-size:12px; color:#444; border-top:1px solid #eee; padding-top:8px; }
        .prog-deroule-label { background:linear-gradient(180deg,#0b1f4d,#1f57c4); color:#fff; font-weight:800; font-size:20px; padding:24px 14px; }
        .prog-sec-title { color:#0b1f4d; font-weight:800; font-size:17px; margin:14px 0 4px; }
        .prog-footer { text-align:center; font-size:10.5px; color:#555; padding:14px 24px 18px; border-top:1px solid #e5e7eb; line-height:1.5; }
      `}</style>

      <div className="no-print-bar">
        <PrintButton />
      </div>

      {/* ===== PAGE 1 — Couverture + infos ===== */}
      <section className="prog-page">
        <div className="prog-header">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-widest opacity-80">
                Référence
              </div>
              <div className="text-2xl font-extrabold">
                {fr.internal_code ?? "—"}
              </div>
            </div>
            <div className="prog-logos">
              {org.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={org.logo_url} alt={orgName} />
              )}
              {org.secondary_logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={org.secondary_logo_url} alt="" />
              )}
            </div>
          </div>
          <h1 className="prog-title">{fr.title}</h1>
        </div>

        <div className="prog-grid">
          {/* Informations */}
          <div className="prog-label">Informations</div>
          <div className="prog-content">
            <div className="prog-info">
              <div>
                <div className="k">Durée ⏱</div>
                <div className="v">{dureeStr || "À définir"}</div>
              </div>
              <div>
                <div className="k">Effectif 👥</div>
                <div className="v">{effectifStr}</div>
              </div>
              <div>
                <div className="k">Tarif €</div>
                <div className="v">Sur devis</div>
              </div>
              <div>
                <div className="k">Lieu 📍</div>
                <div className="v">Sur convention</div>
              </div>
            </div>
            <div className="prog-access">
              ♿ Accessibilité : si votre situation nécessite des aménagements
              particuliers, contactez-nous pour envisager les modalités
              d&apos;adaptation.
            </div>
          </div>

          <Section label="Objectif" items={bullets(fr.general_objective)} />
          <Section label="Publics visés" items={bullets(fr.target_audience)} />
          <Section label="Prérequis" items={bullets(fr.prerequisites)} />
          <Section
            label="Modalités d'évaluation"
            items={bullets(fr.evaluation_methods)}
          />
          <Section
            label="Méthodes pédagogiques"
            items={bullets(
              [fr.teaching_methods, fr.pedagogy_approach]
                .filter(Boolean)
                .join("\n"),
            )}
          />
        </div>
        <Footer />
      </section>

      {/* ===== PAGES déroulé — Matin / Après-midi par jour ===== */}
      {days.map((d, i) => (
        <DerouleSection
          key={i}
          dayIndex={i}
          totalDays={days.length}
          morning={d.morning}
          afternoon={d.afternoon}
          Footer={Footer}
        />
      ))}
    </div>
  );
}

function Section({ label, items }: { label: string; items: string[] }) {
  return (
    <>
      <div className="prog-label">{label}</div>
      <div className="prog-content">
        {items.length > 0 ? (
          <ul>
            {items.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        ) : (
          <span className="text-xs text-zinc-400 italic">À compléter</span>
        )}
      </div>
    </>
  );
}

function DerouleSection({
  dayIndex,
  totalDays,
  morning,
  afternoon,
  Footer,
}: {
  dayIndex: number;
  totalDays: number;
  morning: string | null;
  afternoon: string | null;
  Footer: () => React.ReactElement;
}) {
  const suffix = totalDays > 1 ? ` — Jour ${dayIndex + 1}` : "";
  const renderBlocks = (text: string | null) => {
    const lines = (text ?? "").split(/\r?\n/);
    return lines.map((l, i) => {
      const t = l.trim();
      if (!t) return <div key={i} style={{ height: 6 }} />;
      // Une ligne sans puce et courte = titre de section.
      const isBullet = /^[-•]/.test(t);
      if (isBullet) {
        return (
          <ul key={i} style={{ margin: 0, paddingLeft: 18 }}>
            <li>{t.replace(/^[-•\s]+/, "")}</li>
          </ul>
        );
      }
      return (
        <div key={i} className="prog-sec-title">
          {t}
        </div>
      );
    });
  };
  return (
    <>
      {morning && morning.trim() && (
        <section className="prog-page">
          <div className="prog-grid">
            <div className="prog-deroule-label">
              Programme
              <br />
              Matin{suffix}
            </div>
            <div className="prog-content">{renderBlocks(morning)}</div>
          </div>
          <Footer />
        </section>
      )}
      {afternoon && afternoon.trim() && (
        <section className="prog-page">
          <div className="prog-grid">
            <div className="prog-deroule-label">
              Programme
              <br />
              Après-midi{suffix}
            </div>
            <div className="prog-content">{renderBlocks(afternoon)}</div>
          </div>
          <Footer />
        </section>
      )}
    </>
  );
}
