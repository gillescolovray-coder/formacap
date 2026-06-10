import { PrintButton } from "@/app/(app)/sessions/[id]/emargement/print/_print-button";

/** Données normalisées d'un programme (depuis une formation OU un brouillon). */
export type ProgrammeCharteData = {
  internalCode: string | null;
  title: string;
  generalObjective: string | null;
  targetAudience: string | null;
  prerequisites: string | null;
  evaluationMethods: string | null;
  methods: string | null;
  durationHours: number | null;
  durationDays: number | null;
  minParticipants: number | null;
  maxParticipants: number | null;
  days: { morning: string | null; afternoon: string | null }[];
};

export type ProgrammeCharteOrg = {
  name: string | null;
  logo_url: string | null;
  secondary_logo_url: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  siret: string | null;
  nda: string | null;
  nda_authority: string | null;
  legal_form: string | null;
  share_capital: string | null;
  rcs_number: string | null;
  vat_number: string | null;
};

function bullets(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•\s]+/, "").trim())
    .filter(Boolean);
}

/** Détecte un contenu HTML riche (issu de l'éditeur). */
function isHtml(s: string | null | undefined): boolean {
  return !!s && /<[a-z][\s\S]*>/i.test(s);
}
function hasContent(s: string | null | undefined): boolean {
  if (!s) return false;
  return s.replace(/<[^>]*>/g, "").trim().length > 0;
}

export function ProgrammeCharte({
  data,
  org,
}: {
  data: ProgrammeCharteData;
  org: ProgrammeCharteOrg;
}) {
  const orgName = org.name ?? "CAP NUMÉRIQUE";
  const dureeStr = [
    data.durationDays ? `${data.durationDays} jour(s)` : null,
    data.durationHours ? `soit ${data.durationHours} heures` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const effectifStr =
    data.minParticipants && data.maxParticipants
      ? `De ${data.minParticipants} à ${data.maxParticipants} personnes`
      : data.maxParticipants
        ? `Jusqu'à ${data.maxParticipants} personnes`
        : "Nous consulter";

  const days = data.days.filter(
    (d) => (d.morning && d.morning.trim()) || (d.afternoon && d.afternoon.trim()),
  );

  // Pages du déroulé (1 par demi-journée renseignée) + total pour la
  // numérotation « Page i/N » (Gilles 2026-06-09).
  const derPages: { label: React.ReactNode; html: string | null }[] = [];
  days.forEach((d, i) => {
    const suffix = days.length > 1 ? ` — Jour ${i + 1}` : "";
    if (d.morning && d.morning.trim())
      derPages.push({
        label: (
          <>
            Programme
            <br />
            Matin{suffix}
          </>
        ),
        html: d.morning,
      });
    if (d.afternoon && d.afternoon.trim())
      derPages.push({
        label: (
          <>
            Programme
            <br />
            Après-midi{suffix}
          </>
        ),
        html: d.afternoon,
      });
  });
  const totalPages = 1 + derPages.length;

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
  // Mentions légales (forme, capital, RCS, TVA, SIRET) — SIRET toujours affiché.
  const footerLegal = [
    org.legal_form,
    org.share_capital ? `au capital de ${org.share_capital}` : null,
    org.rcs_number ? `RCS : ${org.rcs_number}` : null,
    org.vat_number ? `TVA : ${org.vat_number}` : null,
    org.siret ? `SIRET : ${org.siret}` : null,
  ]
    .filter(Boolean)
    .join(" – ");

  const Footer = () => (
    <div className="prog-footer">
      {/* Nom de la société plus gros */}
      <div>
        <span style={{ fontWeight: 800, fontSize: "13px" }}>{orgName}</span>
        {footerAddress ? ` – ${footerAddress}` : ""}
      </div>
      {footerContact && <div>{footerContact}</div>}
      {/* SIRET + déclaration d'activité sur la même ligne (n° NDA en gras) */}
      {(footerLegal || org.nda) && (
        <div>
          {footerLegal}
          {org.nda && (
            <>
              {footerLegal ? " – " : ""}
              Déclaration d&apos;activité enregistrée sous le numéro{" "}
              <strong style={{ fontSize: "12.5px" }}>{org.nda}</strong>
              {org.nda_authority ? ` ${org.nda_authority}` : ""}
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="prog-root bg-white">
      <style>{`
        .prog-root { color:#1f2433; }
        @media print {
          body * { visibility: hidden !important; }
          .prog-root, .prog-root * { visibility: visible !important; }
          .prog-root { position:absolute; left:0; top:0; right:0; margin:0; }
          .no-print-bar { display:none !important; }
          .prog-page { page-break-after: always; box-shadow:none; margin:0; max-width:100%; }
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
        .prog-footer { text-align:center; font-size:10.5px; color:#555; padding:14px 24px 6px; border-top:1px solid #e5e7eb; line-height:1.5; }
        .prog-pagenum { text-align:right; font-size:9px; color:#999; padding:0 24px 12px; }
      `}</style>

      <div className="no-print-bar" style={{ padding: 16 }}>
        <PrintButton />
      </div>

      {/* PAGE 1 */}
      <section className="prog-page">
        <div className="prog-header">
          <div className="flex items-start justify-between gap-4">
            {/* Logo(s) à gauche */}
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
            {/* Référence à droite, en petit */}
            <div className="text-right shrink-0">
              <div className="text-[9px] uppercase tracking-widest opacity-70">
                Réf.
              </div>
              <div className="text-xs font-bold">{data.internalCode ?? "—"}</div>
            </div>
          </div>
          <h1 className="prog-title">{data.title}</h1>
        </div>

        <div className="prog-grid">
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

          <Section label="Objectif" value={data.generalObjective} />
          <Section label="Publics visés" value={data.targetAudience} />
          <Section label="Prérequis" value={data.prerequisites} />
          <Section label="Modalités d'évaluation" value={data.evaluationMethods} />
          <Section label="Méthodes pédagogiques" value={data.methods} />
        </div>
        <Footer />
        <div className="prog-pagenum">Page 1/{totalPages}</div>
      </section>

      {/* DÉROULÉ — une page par demi-journée, avec numéro de page */}
      {derPages.map((p, i) => (
        <section className="prog-page" key={i}>
          <div className="prog-grid">
            <div className="prog-deroule-label">{p.label}</div>
            <div className="prog-content">{renderDerouleBlocks(p.html)}</div>
          </div>
          <Footer />
          <div className="prog-pagenum">
            Page {i + 2}/{totalPages}
          </div>
        </section>
      ))}
    </div>
  );
}

function Section({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  const items = isHtml(value) ? [] : bullets(value);
  return (
    <>
      <div className="prog-label">{label}</div>
      <div className="prog-content">
        {isHtml(value) && hasContent(value) ? (
          <div dangerouslySetInnerHTML={{ __html: value as string }} />
        ) : items.length > 0 ? (
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

/** Rendu d'une demi-journée de déroulé (HTML riche ou texte simple). */
function renderDerouleBlocks(text: string | null) {
  if (isHtml(text)) {
    return (
      <div
        className="prog-rich"
        dangerouslySetInnerHTML={{ __html: text as string }}
      />
    );
  }
  return (text ?? "").split(/\r?\n/).map((l, i) => {
    const t = l.trim();
    if (!t) return <div key={i} style={{ height: 6 }} />;
    if (/^[-•]/.test(t)) {
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
}
