-- Cadre commercial + lieu par défaut au niveau du PARCOURS (Gilles 2026-06-25).
-- Objectif : un parcours porte UN cadre commercial (direct CAP / prescripteur /
-- sous-traitance pour un autre OF) et un lieu, hérités par les sessions créées
-- dedans. Permet aussi de dupliquer un parcours (même cadre, autre lieu/dates).
alter table public.parcours
  add column if not exists is_subcontracted boolean not null default false,
  add column if not exists subcontractor_name text,
  add column if not exists subcontracting_company_id uuid
    references public.companies(id) on delete set null,
  add column if not exists prescriber_company_id uuid
    references public.companies(id) on delete set null,
  add column if not exists default_location_id uuid
    references public.formation_locations(id) on delete set null,
  add column if not exists default_location text;
