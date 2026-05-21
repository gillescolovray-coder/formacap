/**
 * Référentiel des OPCO (Opérateurs de Compétences).
 *
 * Permet à l'utilisateur de gérer la liste des OPCO français — les 11
 * nationaux sont seedés à la migration 0094 ; il peut en ajouter,
 * modifier ou supprimer.
 *
 * Utilisé dans le formulaire d'inscription quand le mode de financement
 * est "opco" : un dropdown trié alphabétiquement avec lien direct vers
 * le portail web de chaque OPCO (pour aller chercher la PEC).
 */
export type Opco = {
  id: string;
  organization_id: string;
  name: string;
  sectors: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  /** URL du portail web où l'OF se connecte pour récupérer la prise
   *  en charge (PEC). */
  portal_url: string | null;
  is_active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};
