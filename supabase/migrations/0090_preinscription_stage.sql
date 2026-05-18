-- =====================================================================
-- 0090_preinscription_stage.sql
-- Pré-inscription publique via lien partenaire
-- =====================================================================
--
-- Ajoute un stage `partner_preinscription` à toutes les organisations.
-- Sert au workflow « diffusion publique » : le prescripteur/OF partage
-- un lien public, ses entreprises clientes pré-inscrivent leurs
-- apprenants (sans voir aucun tarif), et le prescripteur valide ensuite
-- chaque pré-inscription. La validation passe le stage à `confirmed` et
-- déclenche la création de l'enrollment miroir (logique existante).
--
-- Couleur ambre pour bien distinguer dans le tableau « en attente ».
-- Position 5 pour apparaître en tout premier dans la file (avant `new`).

insert into public.inscription_stages
  (organization_id, key, name, color, position, is_initial, is_terminal, is_won, is_lost, description)
select
  o.id,
  'partner_preinscription',
  'À valider par le partenaire',
  '#f59e0b',
  5,
  true,
  false,
  false,
  false,
  'Pré-inscription publique via lien partenaire — en attente de validation par le prescripteur/OF qui a diffusé le lien.'
from public.organizations o
where not exists (
  select 1
  from public.inscription_stages s
  where s.organization_id = o.id
    and s.key = 'partner_preinscription'
);
