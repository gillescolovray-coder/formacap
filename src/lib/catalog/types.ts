/**
 * Types et helpers du catalogue de vente en ligne.
 *
 * Le catalogue est une "brochure" publiable qui se nourrit en temps réel
 * des fiches formation marquées is_published_online = true.
 *
 * Une seule ligne dans la table `catalog` par organisation.
 * Le contenu éditorial est stocké dans la colonne JSONB `blocks`.
 */

export const FONT_FAMILIES = ["Inter", "Lato", "Georgia"] as const;
export type CatalogFontFamily = (typeof FONT_FAMILIES)[number];

export type CatalogBlocks = {
  presentation: {
    enabled: boolean;
    title: string;
    html: string;
  };
  about: {
    enabled: boolean;
    title: string;
    photo_url: string | null;
    html: string;
  };
  engagements: {
    enabled: boolean;
    title: string;
    intro: string;
    items: Array<{ title: string; description: string }>;
  };
  modalities: {
    enabled: boolean;
    title: string;
    intro: string;
    items: Array<{
      label: string;
      description: string;
    }>;
  };
  testimonials: {
    enabled: boolean;
    title: string;
    intro: string;
    items: Array<{
      author: string;
      role: string;
      quote: string;
    }>;
  };
  cta: {
    enabled: boolean;
    title: string;
    description: string;
    primary_label: string;
    primary_url: string;
    secondary_label: string;
    secondary_url: string;
  };
  legal: {
    enabled: boolean;
    html: string;
  };
};

export type Catalog = {
  id: string;
  organization_id: string;
  slug: string;
  is_published: boolean;
  published_at: string | null;
  cover_image_url: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_year: string | null;
  color_primary: string;
  color_secondary: string;
  color_text: string;
  font_family: string;
  blocks: CatalogBlocks;
  pdf_url: string | null;
  pdf_generated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const FONT_FAMILY_STACKS: Record<CatalogFontFamily, string> = {
  Inter:
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  Lato: 'Lato, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  Georgia: 'Georgia, "Times New Roman", Times, serif',
};

export function fontFamilyStack(font: string): string {
  if ((FONT_FAMILIES as readonly string[]).includes(font)) {
    return FONT_FAMILY_STACKS[font as CatalogFontFamily];
  }
  return FONT_FAMILY_STACKS.Inter;
}
