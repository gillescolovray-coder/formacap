import {
  Building2,
  CheckCircle2,
  GraduationCap,
  Layers,
  Tag,
  Video,
} from "lucide-react";
import {
  MODALITY_LABELS,
  type Formation,
  type FormationModality,
} from "@/lib/formations/types";
import type { Catalog } from "@/lib/catalog/types";
import { fontFamilyStack } from "@/lib/catalog/types";

type Organization = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  siret: string | null;
  nda: string | null;
  legal_mentions: string | null;
};

type Category = { id: string; name: string };

type FormationWithCategory = Formation & {
  category: Category | null;
};

const MODALITY_ORDER: FormationModality[] = ["presentiel", "distanciel", "hybride"];
const MODALITY_ICON: Record<FormationModality, typeof Building2> = {
  presentiel: Building2,
  distanciel: Video,
  hybride: Layers,
};

export type CatalogRenderProps = {
  catalog: Catalog;
  organization: Organization;
  formations: FormationWithCategory[];
  categories: Category[];
  lastUpdate: Date;
  /** "web" : page consultable / "print" : version PDF A4 */
  mode: "web" | "print";
};

export function CatalogRender(props: CatalogRenderProps) {
  const { catalog, organization, formations, categories, lastUpdate, mode } =
    props;
  const fontStack = fontFamilyStack(catalog.font_family);

  const cssVars = {
    "--cat-primary": catalog.color_primary,
    "--cat-secondary": catalog.color_secondary,
    "--cat-text": catalog.color_text,
    fontFamily: fontStack,
  } as React.CSSProperties;

  // Regroupement formations : catégorie -> modalité -> liste
  const grouped = groupFormations(formations, categories);

  const formattedDate = lastUpdate.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div
      className={mode === "print" ? "catalog-print" : "catalog-web"}
      style={cssVars}
    >
      <style>{globalCss}</style>

      {/* COUVERTURE */}
      <section className="cat-hero">
        {catalog.cover_image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={catalog.cover_image_url}
            alt=""
            className="cat-hero-cover-image"
          />
        ) : null}
        <div className="cat-hero-overlay" />
        <div className="cat-hero-content">
          {organization.logo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={organization.logo_url}
              alt={organization.name}
              className="cat-hero-logo"
            />
          ) : (
            <div className="cat-hero-logo-fallback">
              {organization.name.charAt(0)}
            </div>
          )}
          <div className="cat-hero-titles">
            <div className="cat-hero-org">{organization.name}</div>
            <h1 className="cat-hero-title">
              {catalog.hero_title ?? "Catalogue de formations"}
            </h1>
            {catalog.hero_subtitle && (
              <div className="cat-hero-subtitle">{catalog.hero_subtitle}</div>
            )}
            {catalog.hero_year && (
              <div className="cat-hero-year">{catalog.hero_year}</div>
            )}
          </div>
          <div className="cat-hero-meta">
            <div>Mis à jour le {formattedDate}</div>
            {organization.phone && <div>{organization.phone}</div>}
            {organization.email && <div>{organization.email}</div>}
          </div>
        </div>
      </section>

      {/* SOMMAIRE (web uniquement) */}
      {mode === "web" && (
        <nav className="cat-toc">
          <div className="cat-toc-title">Sommaire</div>
          <ol className="cat-toc-list">
            {catalog.blocks.presentation.enabled && (
              <li>
                <a href="#presentation">{catalog.blocks.presentation.title}</a>
              </li>
            )}
            {catalog.blocks.about.enabled && (
              <li>
                <a href="#about">{catalog.blocks.about.title}</a>
              </li>
            )}
            {catalog.blocks.engagements.enabled && (
              <li>
                <a href="#engagements">{catalog.blocks.engagements.title}</a>
              </li>
            )}
            {catalog.blocks.modalities.enabled && (
              <li>
                <a href="#modalities">{catalog.blocks.modalities.title}</a>
              </li>
            )}
            <li>
              <a href="#formations">Nos formations</a>
            </li>
            {catalog.blocks.testimonials.enabled &&
              catalog.blocks.testimonials.items.length > 0 && (
                <li>
                  <a href="#testimonials">{catalog.blocks.testimonials.title}</a>
                </li>
              )}
            {catalog.blocks.cta.enabled && (
              <li>
                <a href="#cta">{catalog.blocks.cta.title}</a>
              </li>
            )}
          </ol>
        </nav>
      )}

      {/* PRÉSENTATION */}
      {catalog.blocks.presentation.enabled && (
        <section id="presentation" className="cat-section">
          <h2 className="cat-section-title">{catalog.blocks.presentation.title}</h2>
          <div
            className="cat-rich-text"
            dangerouslySetInnerHTML={{
              __html: catalog.blocks.presentation.html,
            }}
          />
        </section>
      )}

      {/* À PROPOS */}
      {catalog.blocks.about.enabled && (
        <section id="about" className="cat-section cat-about">
          <h2 className="cat-section-title">{catalog.blocks.about.title}</h2>
          <div className="cat-about-grid">
            {catalog.blocks.about.photo_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={catalog.blocks.about.photo_url}
                alt=""
                className="cat-about-photo"
              />
            )}
            <div
              className="cat-rich-text"
              dangerouslySetInnerHTML={{ __html: catalog.blocks.about.html }}
            />
          </div>
        </section>
      )}

      {/* ENGAGEMENTS */}
      {catalog.blocks.engagements.enabled &&
        catalog.blocks.engagements.items.length > 0 && (
          <section id="engagements" className="cat-section">
            <h2 className="cat-section-title">
              {catalog.blocks.engagements.title}
            </h2>
            {catalog.blocks.engagements.intro && (
              <p className="cat-section-intro">
                {catalog.blocks.engagements.intro}
              </p>
            )}
            <div className="cat-grid-cards">
              {catalog.blocks.engagements.items.map((item, idx) => (
                <div key={idx} className="cat-card cat-engagement">
                  <CheckCircle2 className="cat-card-icon" />
                  <h3 className="cat-card-title">{item.title}</h3>
                  <p className="cat-card-text">{item.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}

      {/* MODALITÉS */}
      {catalog.blocks.modalities.enabled &&
        catalog.blocks.modalities.items.length > 0 && (
          <section id="modalities" className="cat-section">
            <h2 className="cat-section-title">
              {catalog.blocks.modalities.title}
            </h2>
            {catalog.blocks.modalities.intro && (
              <p className="cat-section-intro">
                {catalog.blocks.modalities.intro}
              </p>
            )}
            <div className="cat-grid-cards">
              {catalog.blocks.modalities.items.map((item, idx) => (
                <div key={idx} className="cat-card cat-modality">
                  <h3 className="cat-card-title cat-modality-label">
                    {item.label}
                  </h3>
                  <p className="cat-card-text">{item.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}

      {/* FORMATIONS — groupées par thème puis modalité */}
      <section id="formations" className="cat-section">
        <h2 className="cat-section-title">Nos formations</h2>
        <p className="cat-section-intro">
          {formations.length} formation{formations.length > 1 ? "s" : ""}{" "}
          actuellement au catalogue, classée
          {formations.length > 1 ? "s" : ""} par thème et modalité.
        </p>

        {grouped.length === 0 ? (
          <p className="cat-empty">
            Aucune formation publiée pour le moment.
          </p>
        ) : (
          grouped.map((group) => (
            <div key={group.categoryId ?? "uncat"} className="cat-category">
              <div className="cat-category-header">
                <Tag className="cat-category-icon" />
                <h3 className="cat-category-title">
                  {group.categoryName ?? "Autres formations"}
                </h3>
                <span className="cat-category-count">
                  {group.total} formation{group.total > 1 ? "s" : ""}
                </span>
              </div>

              {group.byModality.map((mg) => {
                const Icon = MODALITY_ICON[mg.modality];
                return (
                  <div key={mg.modality} className="cat-modality-group">
                    <div className="cat-modality-header">
                      <Icon className="cat-modality-icon" />
                      <span>{MODALITY_LABELS[mg.modality]}</span>
                    </div>
                    <div className="cat-formations-grid">
                      {mg.items.map((f) => (
                        <FormationCard key={f.id} formation={f} mode={mode} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </section>

      {/* TÉMOIGNAGES */}
      {catalog.blocks.testimonials.enabled &&
        catalog.blocks.testimonials.items.length > 0 && (
          <section id="testimonials" className="cat-section">
            <h2 className="cat-section-title">
              {catalog.blocks.testimonials.title}
            </h2>
            {catalog.blocks.testimonials.intro && (
              <p className="cat-section-intro">
                {catalog.blocks.testimonials.intro}
              </p>
            )}
            <div className="cat-grid-cards">
              {catalog.blocks.testimonials.items.map((item, idx) => (
                <div key={idx} className="cat-card cat-testimonial">
                  <p className="cat-testimonial-quote">
                    &laquo; {item.quote} &raquo;
                  </p>
                  <div className="cat-testimonial-author">
                    <strong>{item.author}</strong>
                    {item.role && <span> — {item.role}</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      {/* CTA */}
      {catalog.blocks.cta.enabled && (
        <section id="cta" className="cat-cta">
          <h2 className="cat-cta-title">{catalog.blocks.cta.title}</h2>
          <p className="cat-cta-description">{catalog.blocks.cta.description}</p>
          <div className="cat-cta-buttons">
            {catalog.blocks.cta.primary_url && (
              <a
                href={catalog.blocks.cta.primary_url}
                className="cat-button cat-button-primary"
              >
                {catalog.blocks.cta.primary_label}
              </a>
            )}
            {catalog.blocks.cta.secondary_url && (
              <a
                href={catalog.blocks.cta.secondary_url}
                className="cat-button cat-button-secondary"
              >
                {catalog.blocks.cta.secondary_label}
              </a>
            )}
          </div>
        </section>
      )}

      {/* PIED DE PAGE */}
      <footer className="cat-footer">
        <div className="cat-footer-grid">
          <div>
            <strong>{organization.name}</strong>
            {organization.address && <div>{organization.address}</div>}
            {(organization.postal_code || organization.city) && (
              <div>
                {organization.postal_code} {organization.city}
              </div>
            )}
          </div>
          <div>
            {organization.phone && <div>Tél : {organization.phone}</div>}
            {organization.email && <div>Email : {organization.email}</div>}
            {organization.website && <div>{organization.website}</div>}
          </div>
          <div>
            {organization.siret && <div>SIRET : {organization.siret}</div>}
            {organization.nda && (
              <div>Déclaration d&apos;activité n° {organization.nda}</div>
            )}
          </div>
        </div>
        {organization.legal_mentions && (
          <div
            className="cat-footer-legal"
            dangerouslySetInnerHTML={{ __html: organization.legal_mentions }}
          />
        )}
        {catalog.blocks.legal.enabled && catalog.blocks.legal.html && (
          <div
            className="cat-footer-extra"
            dangerouslySetInnerHTML={{ __html: catalog.blocks.legal.html }}
          />
        )}
        <div className="cat-footer-update">
          Catalogue mis à jour le {formattedDate}
        </div>
      </footer>
    </div>
  );
}

function FormationCard({
  formation: f,
  mode,
}: {
  formation: FormationWithCategory;
  mode: "web" | "print";
}) {
  const price = f.price_company ?? f.public_price_excl_tax;
  return (
    <article className={`cat-formation ${mode === "print" ? "cat-formation-print" : ""}`}>
      <div className="cat-formation-head">
        {f.internal_code && (
          <span className="cat-formation-code">{f.internal_code}</span>
        )}
        {f.duration_hours && (
          <span className="cat-formation-duration">
            {f.duration_days
              ? `${f.duration_days} j${f.duration_days > 1 ? "s" : ""} • `
              : ""}
            {f.duration_hours} h
          </span>
        )}
        {f.is_cpf_eligible && <span className="cat-formation-cpf">CPF</span>}
      </div>
      <h4 className="cat-formation-title">{f.title}</h4>
      {f.subtitle && <p className="cat-formation-subtitle">{f.subtitle}</p>}
      {f.general_objective && (
        <p className="cat-formation-objective">{f.general_objective}</p>
      )}
      <div className="cat-formation-meta">
        {f.target_audience && (
          <div>
            <strong>Public :</strong> {f.target_audience}
          </div>
        )}
      </div>
      {(price !== null || f.pricing_note) && (
        <div className="cat-formation-price">
          {price !== null ? (
            <>
              <span className="cat-formation-price-amount">
                {Number(price).toLocaleString("fr-FR", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}
                &nbsp;€
              </span>
              <span className="cat-formation-price-suffix"> HT</span>
            </>
          ) : (
            <span className="cat-formation-price-note">{f.pricing_note}</span>
          )}
        </div>
      )}
    </article>
  );
}

function groupFormations(
  formations: FormationWithCategory[],
  categories: Category[],
) {
  const byCat = new Map<
    string | null,
    {
      categoryId: string | null;
      categoryName: string | null;
      total: number;
      byModality: Map<FormationModality, FormationWithCategory[]>;
    }
  >();

  for (const f of formations) {
    const catId = f.category_id ?? null;
    const existing =
      byCat.get(catId) ??
      {
        categoryId: catId,
        categoryName: f.category?.name ?? null,
        total: 0,
        byModality: new Map<FormationModality, FormationWithCategory[]>(),
      };
    const modality: FormationModality = f.modality ?? "presentiel";
    const list = existing.byModality.get(modality) ?? [];
    list.push(f);
    existing.byModality.set(modality, list);
    existing.total += 1;
    byCat.set(catId, existing);
  }

  // Ordre des catégories : par ordre alphabétique des catégories existantes,
  // puis "non catégorisé" en dernier
  const orderedCats = [...categories]
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map((c) => c.id as string | null);
  const sortedKeys: Array<string | null> = [];
  for (const k of orderedCats) {
    if (byCat.has(k)) sortedKeys.push(k);
  }
  if (byCat.has(null)) sortedKeys.push(null);

  return sortedKeys.map((k) => {
    const g = byCat.get(k)!;
    const byModalityArray = MODALITY_ORDER.filter((m) =>
      g.byModality.has(m),
    ).map((m) => ({
      modality: m,
      items: (g.byModality.get(m) ?? []).sort((a, b) =>
        a.title.localeCompare(b.title, "fr"),
      ),
    }));
    return {
      categoryId: g.categoryId,
      categoryName: g.categoryName,
      total: g.total,
      byModality: byModalityArray,
    };
  });
}

/** CSS injecté dans la page : commun web + print, avec règles @media print
 *  pour la pagination A4 du PDF. */
const globalCss = `
.catalog-web, .catalog-print {
  color: var(--cat-text);
  background: white;
  line-height: 1.6;
  max-width: 100%;
}

.catalog-web {
  max-width: 1100px;
  margin: 0 auto;
  padding-bottom: 4rem;
}

/* ============= HERO ============= */
.cat-hero {
  position: relative;
  background: linear-gradient(135deg, var(--cat-primary), var(--cat-secondary));
  color: white;
  padding: 4rem 3rem;
  overflow: hidden;
}
.cat-hero-cover-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.25;
}
.cat-hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--cat-primary), var(--cat-secondary));
  opacity: 0.85;
  mix-blend-mode: multiply;
}
.cat-hero-content {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 2rem;
}
.cat-hero-logo {
  height: 80px;
  max-width: 140px;
  object-fit: contain;
  background: white;
  border-radius: 14px;
  padding: 10px;
}
.cat-hero-logo-fallback {
  height: 80px;
  width: 80px;
  border-radius: 50%;
  background: white;
  color: var(--cat-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 2rem;
}
.cat-hero-titles { min-width: 0; }
.cat-hero-org {
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  opacity: 0.9;
  font-weight: 700;
  margin-bottom: 0.5rem;
}
.cat-hero-title {
  font-size: 2.5rem;
  font-weight: 900;
  line-height: 1.05;
  margin: 0;
  letter-spacing: -0.01em;
}
.cat-hero-subtitle {
  font-size: 1.05rem;
  margin-top: 0.5rem;
  opacity: 0.95;
}
.cat-hero-year {
  font-size: 4.5rem;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -0.02em;
  margin-top: 0.5rem;
  opacity: 0.85;
}
.cat-hero-meta {
  font-size: 0.8rem;
  text-align: right;
  opacity: 0.9;
}
.cat-hero-meta > div { margin-bottom: 0.25rem; }

/* ============= SOMMAIRE ============= */
.cat-toc {
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  padding: 1.5rem 3rem;
}
.cat-toc-title {
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  font-weight: 800;
  color: #64748b;
  margin-bottom: 0.75rem;
}
.cat-toc-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.5rem 1.5rem;
  counter-reset: toc;
}
.cat-toc-list li {
  counter-increment: toc;
}
.cat-toc-list li::before {
  content: counter(toc, decimal-leading-zero);
  display: inline-block;
  font-weight: 800;
  color: var(--cat-primary);
  margin-right: 0.5rem;
  font-feature-settings: "tnum";
}
.cat-toc-list a {
  color: var(--cat-text);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.9rem;
}
.cat-toc-list a:hover { color: var(--cat-primary); }

/* ============= SECTIONS ============= */
.cat-section {
  padding: 3rem;
  border-bottom: 1px solid #f1f5f9;
}
.cat-section-title {
  font-size: 1.75rem;
  font-weight: 900;
  margin: 0 0 0.75rem;
  letter-spacing: -0.01em;
  position: relative;
  padding-bottom: 0.5rem;
}
.cat-section-title::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: 0;
  width: 60px;
  height: 4px;
  background: linear-gradient(90deg, var(--cat-primary), var(--cat-secondary));
  border-radius: 2px;
}
.cat-section-intro {
  font-size: 1rem;
  color: #475569;
  margin: 1rem 0 1.5rem;
  max-width: 60ch;
}
.cat-rich-text { font-size: 0.98rem; }
.cat-rich-text p { margin: 0.5em 0; }
.cat-rich-text strong { color: var(--cat-primary); }
.cat-rich-text h2 { font-size: 1.3rem; font-weight: 800; margin-top: 1.2em; }
.cat-rich-text h3 { font-size: 1.1rem; font-weight: 700; margin-top: 1em; }
.cat-rich-text ul, .cat-rich-text ol { padding-left: 1.5rem; margin: 0.5em 0; }

/* ============= À PROPOS ============= */
.cat-about-grid {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 2rem;
  align-items: start;
}
.cat-about-photo {
  width: 180px;
  height: 180px;
  object-fit: cover;
  border-radius: 50%;
  border: 4px solid var(--cat-primary);
}
@media (max-width: 600px) {
  .cat-about-grid { grid-template-columns: 1fr; justify-items: center; text-align: center; }
}

/* ============= CARTES ============= */
.cat-grid-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}
.cat-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.25rem;
}
.cat-engagement { border-left: 4px solid var(--cat-primary); }
.cat-card-icon {
  width: 24px;
  height: 24px;
  color: var(--cat-primary);
  margin-bottom: 0.5rem;
}
.cat-card-title {
  font-size: 1.05rem;
  font-weight: 800;
  margin: 0 0 0.5rem;
  color: var(--cat-text);
}
.cat-card-text {
  font-size: 0.875rem;
  color: #475569;
  margin: 0;
  line-height: 1.55;
}

.cat-modality {
  background: linear-gradient(135deg, var(--cat-primary), var(--cat-secondary));
  color: white;
  border: none;
}
.cat-modality .cat-card-title { color: white; }
.cat-modality .cat-card-text { color: rgba(255,255,255,0.92); }
.cat-modality-label {
  font-size: 1.15rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ============= FORMATIONS ============= */
.cat-category {
  margin-top: 2.5rem;
}
.cat-category:first-of-type { margin-top: 1rem; }
.cat-category-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  background: linear-gradient(90deg, var(--cat-primary), var(--cat-secondary));
  color: white;
  border-radius: 8px;
  margin-bottom: 1rem;
}
.cat-category-icon { width: 18px; height: 18px; }
.cat-category-title {
  font-size: 1.15rem;
  font-weight: 800;
  margin: 0;
  flex: 1;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.cat-category-count {
  font-size: 0.75rem;
  opacity: 0.9;
  background: rgba(255,255,255,0.2);
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
}

.cat-modality-group {
  margin-bottom: 1.5rem;
}
.cat-modality-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--cat-primary);
  margin-bottom: 0.6rem;
  padding-left: 0.25rem;
}
.cat-modality-icon { width: 14px; height: 14px; }

.cat-formations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 0.75rem;
}
.cat-formation {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1rem;
  background: white;
  display: flex;
  flex-direction: column;
  break-inside: avoid;
}
.cat-formation-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
  font-size: 0.7rem;
}
.cat-formation-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 700;
  background: #f1f5f9;
  color: #475569;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
}
.cat-formation-duration {
  font-weight: 700;
  color: var(--cat-primary);
}
.cat-formation-cpf {
  background: #fae8ff;
  color: #86198f;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  font-weight: 700;
}
.cat-formation-title {
  font-size: 1rem;
  font-weight: 800;
  margin: 0 0 0.25rem;
  line-height: 1.25;
}
.cat-formation-subtitle {
  font-size: 0.82rem;
  color: #64748b;
  margin: 0 0 0.5rem;
  font-style: italic;
}
.cat-formation-objective {
  font-size: 0.82rem;
  color: #475569;
  margin: 0 0 0.5rem;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.cat-formation-meta {
  font-size: 0.78rem;
  color: #64748b;
  margin-top: auto;
  padding-top: 0.5rem;
  border-top: 1px dashed #e2e8f0;
}
.cat-formation-meta strong { color: #334155; }
.cat-formation-price {
  margin-top: 0.5rem;
  text-align: right;
  font-weight: 800;
}
.cat-formation-price-amount {
  font-size: 1.1rem;
  color: var(--cat-primary);
}
.cat-formation-price-suffix {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
}
.cat-formation-price-note {
  font-size: 0.8rem;
  color: #64748b;
  font-style: italic;
}

.cat-empty {
  text-align: center;
  padding: 2rem;
  color: #94a3b8;
  font-style: italic;
}

/* ============= TÉMOIGNAGES ============= */
.cat-testimonial {
  background: linear-gradient(135deg, #f8fafc, #f1f5f9);
  border-left: 4px solid var(--cat-secondary);
}
.cat-testimonial-quote {
  font-style: italic;
  font-size: 0.95rem;
  margin: 0 0 0.75rem;
  color: #1e293b;
}
.cat-testimonial-author {
  font-size: 0.85rem;
  color: #475569;
}

/* ============= CTA ============= */
.cat-cta {
  background: linear-gradient(135deg, var(--cat-primary), var(--cat-secondary));
  color: white;
  padding: 3rem;
  text-align: center;
}
.cat-cta-title {
  font-size: 2rem;
  font-weight: 900;
  margin: 0 0 0.75rem;
}
.cat-cta-description {
  font-size: 1.05rem;
  margin: 0 auto 1.5rem;
  max-width: 50ch;
  opacity: 0.95;
}
.cat-cta-buttons {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  flex-wrap: wrap;
}
.cat-button {
  display: inline-block;
  padding: 0.85rem 1.75rem;
  border-radius: 999px;
  font-weight: 700;
  text-decoration: none;
  transition: transform 0.15s;
}
.cat-button:hover { transform: translateY(-1px); }
.cat-button-primary {
  background: white;
  color: var(--cat-primary);
}
.cat-button-secondary {
  background: rgba(255,255,255,0.15);
  color: white;
  border: 2px solid rgba(255,255,255,0.6);
}

/* ============= FOOTER ============= */
.cat-footer {
  padding: 2rem 3rem;
  background: #0f172a;
  color: #cbd5e1;
  font-size: 0.78rem;
}
.cat-footer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.5rem;
  margin-bottom: 1rem;
}
.cat-footer-grid strong {
  color: white;
  font-size: 0.95rem;
  display: block;
  margin-bottom: 0.4rem;
}
.cat-footer-grid > div > div { margin-top: 0.15rem; }
.cat-footer-legal {
  border-top: 1px solid #1e293b;
  padding-top: 1rem;
  font-size: 0.72rem;
  opacity: 0.8;
}
.cat-footer-extra {
  margin-top: 0.75rem;
  font-size: 0.72rem;
  opacity: 0.8;
}
.cat-footer-update {
  margin-top: 1rem;
  text-align: center;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.6;
}

/* ============= IMPRESSION (PDF) ============= */
@page {
  size: A4;
  margin: 12mm;
}
.catalog-print {
  font-size: 11pt;
}
.catalog-print .cat-hero {
  padding: 1.5cm;
  page-break-after: always;
  min-height: 24cm;
}
.catalog-print .cat-hero-content {
  height: 100%;
  align-content: space-between;
}
.catalog-print .cat-toc { display: none; }
.catalog-print .cat-section,
.catalog-print .cat-cta {
  padding: 0.8cm 1.5cm;
  break-inside: auto;
}
.catalog-print .cat-section-title { font-size: 16pt; }
.catalog-print .cat-section-intro { font-size: 10pt; }
.catalog-print .cat-formation { break-inside: avoid; }
.catalog-print .cat-category { break-inside: avoid; page-break-inside: avoid; }
.catalog-print .cat-category-header { page-break-after: avoid; }
.catalog-print .cat-formation-title { font-size: 11pt; }
.catalog-print .cat-formation-subtitle,
.catalog-print .cat-formation-objective,
.catalog-print .cat-formation-meta {
  font-size: 9pt;
}
.catalog-print .cat-cta { padding: 1cm 1.5cm; }
.catalog-print .cat-cta-title { font-size: 18pt; }
.catalog-print .cat-button { padding: 0.4cm 0.8cm; font-size: 10pt; }
.catalog-print .cat-footer { padding: 0.8cm 1.5cm; }
`;
