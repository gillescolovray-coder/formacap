-- =========================================================================
-- 0060 — Rattrapage des session_enrollments manquants pour les
--        inscription_requests confirmées (créées avant la sync 0057
--        ou via un flux qui n'a pas appelé createMirroredEnrollmentForRequest).
--
-- Contexte (cas signalé par Gilles le 2026-05-13 sur la session DUME) :
-- 4 inscriptions au stage "confirmed" avec target_session_id + learner_id
-- mais aucun session_enrollment correspondant. Elles apparaissaient
-- dans le bandeau "Demandes en cours" au lieu d'être listées comme
-- inscrits.
--
-- Cette migration crée les session_enrollments manquants pour TOUTES
-- les inscription_requests qui :
--   1. Ont un target_session_id non null
--   2. Ont un learner_id non null
--   3. Sont rattachées à un stage avec is_won = true (= "confirmed",
--      "won", ou tout stage final positif que l'org aurait défini)
--   4. N'ont PAS déjà de session_enrollment lié (FK inscription_request_id)
--   5. ET il n'existe pas déjà un enrollment pour (session, learner)
--      (sinon on lierait juste le request à l'enrollment existant)
-- =========================================================================

-- Étape 1 : relier les requests confirmées qui ont un enrollment existant
-- mais sans inscription_request_id lié (cas marginal).
update public.session_enrollments e
set inscription_request_id = ir.id
from public.inscription_requests ir
join public.inscription_stages s on s.id = ir.stage_id
where e.session_id = ir.target_session_id
  and e.learner_id = ir.learner_id
  and e.inscription_request_id is null
  and s.is_won = true;

-- Étape 2 : créer les enrollments manquants pour les requests confirmées
-- qui n'ont pas du tout d'enrollment lié.
with confirmed_requests_without_enrollment as (
  select ir.id as request_id,
         ir.target_session_id,
         ir.learner_id
  from public.inscription_requests ir
  join public.inscription_stages s on s.id = ir.stage_id
  where ir.target_session_id is not null
    and ir.learner_id is not null
    and s.is_won = true
    and not exists (
      -- Pas d'enrollment déjà lié à cette request
      select 1 from public.session_enrollments e
      where e.inscription_request_id = ir.id
    )
    and not exists (
      -- ET pas d'enrollment existant pour ce couple (session, learner)
      -- (sinon on traite ce cas via l'étape 1 ci-dessus)
      select 1 from public.session_enrollments e
      where e.session_id = ir.target_session_id
        and e.learner_id = ir.learner_id
    )
)
insert into public.session_enrollments (
  session_id,
  learner_id,
  status,
  inscription_request_id
)
select
  cr.target_session_id,
  cr.learner_id,
  'confirmed'::public.enrollment_status,
  cr.request_id
from confirmed_requests_without_enrollment cr;
