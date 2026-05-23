/**
 * Transforme les erreurs Supabase/PostgreSQL techniques en messages
 * clairs et actionnables pour les utilisateurs non-tech.
 *
 * Gilles 2026-05-23 : "ok pour les messages mais alors les mettre en
 * français et expliquer la solution à l'utilisateur".
 */

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

/**
 * Convertit une erreur Supabase en message FR user-friendly.
 * Si l'erreur n'est pas reconnue, retourne le message original.
 */
export function humanizeSupabaseError(err: SupabaseLikeError): string {
  const msg = err.message ?? "";
  const code = err.code ?? "";

  // Unique constraint violation
  if (code === "23505" || /duplicate key value/i.test(msg)) {
    // Détecter quelle contrainte est violée
    if (/formations_organization_id_internal_code_key/i.test(msg)) {
      return (
        "Le code interne saisi est déjà utilisé par une autre formation de votre catalogue. " +
        "Choisissez un autre code dans le champ « Référence interne », ou laissez-le vide " +
        "pour ne pas le contrôler."
      );
    }
    if (/companies_organization_id_siret_key/i.test(msg)) {
      return (
        "Une entreprise avec ce SIRET existe déjà dans votre base. " +
        "Vérifiez si elle est déjà créée avant d'en ajouter une nouvelle."
      );
    }
    if (/learners_organization_id_email_key/i.test(msg)) {
      return (
        "Un apprenant avec cette adresse email existe déjà. " +
        "Vérifiez votre liste avant d'en créer un nouveau."
      );
    }
    if (/trainer_formations.*pkey/i.test(msg)) {
      return (
        "Cette formation est déjà liée à ce formateur. " +
        "Pas besoin de la rajouter."
      );
    }
    // Cas générique
    return (
      "Cette valeur est déjà utilisée. Modifiez le champ concerné " +
      "pour qu'il soit unique dans votre catalogue."
    );
  }

  // FK violation
  if (code === "23503" || /violates foreign key/i.test(msg)) {
    return (
      "Une référence à un élément lié est invalide ou supprimée. " +
      "Rechargez la page et réessayez."
    );
  }

  // NOT NULL violation
  if (code === "23502" || /violates not-null constraint/i.test(msg)) {
    return (
      "Un champ obligatoire est manquant. Vérifiez que tous les " +
      "champs marqués d'une étoile (*) sont remplis."
    );
  }

  // RLS / permission
  if (
    code === "42501" ||
    /permission denied/i.test(msg) ||
    /row.?level security/i.test(msg)
  ) {
    return (
      "Vous n'avez pas les droits nécessaires pour effectuer cette " +
      "action. Contactez un administrateur de votre organisation."
    );
  }

  // Connexion réseau / timeout
  if (
    /fetch failed/i.test(msg) ||
    /network/i.test(msg) ||
    /timeout/i.test(msg)
  ) {
    return (
      "Connexion au serveur impossible. Vérifiez votre connexion " +
      "internet et réessayez dans quelques secondes."
    );
  }

  // Fallback : on garde le message original si pas reconnu
  return msg || "Une erreur inattendue est survenue.";
}
