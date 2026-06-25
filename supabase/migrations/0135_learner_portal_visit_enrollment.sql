-- Suivi des visites portail apprenant PAR SESSION (Gilles 2026-06-25).
-- Le lien du portail est par inscription (= 1 session), mais on n'enregistrait
-- que (apprenant, date). On ajoute l'inscription visitée pour savoir SUR QUELLE
-- SESSION l'apprenant a cliqué + quand.

alter table public.learner_portal_visits
  add column if not exists enrollment_id uuid
    references public.session_enrollments(id) on delete cascade;

create index if not exists idx_lpv_enrollment
  on public.learner_portal_visits(enrollment_id, visited_at);
