"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { searchSirene } from "@/lib/sirene/search";
import type { SireneCompany } from "@/lib/sirene/types";

// =========================================================
// Domaines emails "perso" à exclure du lookup SIRENE auto.
// =========================================================
const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.fr",
  "hotmail.com",
  "hotmail.fr",
  "live.fr",
  "live.com",
  "outlook.com",
  "outlook.fr",
  "free.fr",
  "wanadoo.fr",
  "orange.fr",
  "laposte.net",
  "sfr.fr",
  "neuf.fr",
  "bbox.fr",
  "icloud.com",
  "me.com",
  "protonmail.com",
  "aol.com",
]);

// =========================================================
// Lookup SIRENE par domaine email (option C de la roadmap).
// =========================================================
/**
 * À partir d'un email type "marie@dupont-btp.fr", extrait la base
 * "dupont-btp" et cherche dans SIRENE. Retourne le 1er résultat
 * pertinent (= entreprise active) ou null.
 *
 * Sert à pré-remplir l'entreprise quand la signature email contient
 * uniquement un logo image (sans texte exploitable par regex).
 */
export async function findSireneByEmailDomain(
  email: string,
): Promise<SireneCompany | null> {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) return null;
  // "dupont-btp.fr" → "dupont-btp" → "dupont btp" (espace pour SIRENE)
  const base = domain
    .replace(/\.[a-z]{2,}$/, "")
    .replace(/[-_.]+/g, " ")
    .trim();
  if (base.length < 3) return null;
  try {
    const results = await searchSirene(base);
    if (results.length === 0) return null;
    // Privilégier les entreprises actives
    const active = results.find((r) => r.legal_status === "A");
    return active ?? results[0];
  } catch {
    return null;
  }
}

// =========================================================
// Recherche de doublons en BDD (déduplication).
// =========================================================
export type CompanyDuplicate = {
  id: string;
  name: string;
  siret: string | null;
  postal_code: string | null;
  city: string | null;
  type: string | null;
  /** Niveau de confiance du match (siret > nom_cp > nom > domaine). */
  matchType: "siret" | "name_postal" | "name" | "domain";
  /** Compteurs pour aide à la décision. */
  contactsCount: number;
  enrollmentsCount: number;
};

/**
 * Recherche les entreprises similaires dans la BDD à partir des
 * informations extraites. Utilisée AVANT la création pour éviter
 * les doublons.
 */
export async function findPotentialDuplicates(input: {
  siret: string | null;
  name: string;
  postalCode: string | null;
  email: string | null;
}): Promise<CompanyDuplicate[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.organization_id as string | undefined;
  if (!orgId) return [];

  const siret = input.siret?.replace(/\D/g, "") ?? "";
  const name = input.name.trim();
  const postalCode = input.postalCode?.trim() ?? "";

  // Constitue une map id → row + matchType (priorité au type le plus
  // fiable rencontré en premier).
  const map = new Map<string, CompanyDuplicate>();

  type Row = {
    id: string;
    name: string;
    siret: string | null;
    postal_code: string | null;
    city: string | null;
    type: string | null;
  };

  function add(rows: Row[], type: CompanyDuplicate["matchType"]) {
    for (const r of rows) {
      if (map.has(r.id)) continue;
      map.set(r.id, {
        id: r.id,
        name: r.name,
        siret: r.siret,
        postal_code: r.postal_code,
        city: r.city,
        type: r.type,
        matchType: type,
        contactsCount: 0,
        enrollmentsCount: 0,
      });
    }
  }

  // 1) SIRET strict (le plus fiable)
  if (siret.length === 14) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, siret, postal_code, city, type")
      .eq("organization_id", orgId)
      .eq("siret", siret)
      .limit(5);
    add((data ?? []) as unknown as Row[], "siret");
  }

  // 2) Nom + CP
  if (name.length >= 3 && postalCode) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, siret, postal_code, city, type")
      .eq("organization_id", orgId)
      .ilike("name", `%${name}%`)
      .eq("postal_code", postalCode)
      .limit(5);
    add((data ?? []) as unknown as Row[], "name_postal");
  }

  // 3) Nom seul (insensible à la casse)
  if (name.length >= 4) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, siret, postal_code, city, type")
      .eq("organization_id", orgId)
      .ilike("name", `%${name}%`)
      .limit(5);
    add((data ?? []) as unknown as Row[], "name");
  }

  // 4) Domaine email — on cherche dans `website` ou `email` ou parmi les
  //    contacts dont l'email contient le domaine.
  if (input.email) {
    const at = input.email.indexOf("@");
    if (at >= 0) {
      const domain = input.email.slice(at + 1).toLowerCase();
      if (domain && !GENERIC_EMAIL_DOMAINS.has(domain)) {
        // Sociétés ayant un site web ou un email contenant le domaine
        const { data } = await supabase
          .from("companies")
          .select("id, name, siret, postal_code, city, type")
          .eq("organization_id", orgId)
          .or(`website.ilike.%${domain}%,email.ilike.%${domain}%`)
          .limit(5);
        add((data ?? []) as unknown as Row[], "domain");
        // Sociétés dont au moins un contact a un email avec ce domaine
        const { data: viaContacts } = await supabase
          .from("company_contacts")
          .select(
            "company:companies(id, name, siret, postal_code, city, type, organization_id)",
          )
          .ilike("email", `%@${domain}`)
          .limit(5);
        const fromContacts: Row[] = [];
        for (const row of viaContacts ?? []) {
          const c = row.company as unknown as {
            id: string;
            name: string;
            siret: string | null;
            postal_code: string | null;
            city: string | null;
            type: string | null;
            organization_id: string;
          } | null;
          if (c && c.organization_id === orgId) {
            fromContacts.push({
              id: c.id,
              name: c.name,
              siret: c.siret,
              postal_code: c.postal_code,
              city: c.city,
              type: c.type,
            });
          }
        }
        add(fromContacts, "domain");
      }
    }
  }

  const list = Array.from(map.values());
  if (list.length === 0) return [];

  // Ajout des compteurs (contacts + enrollments) en parallèle.
  const ids = list.map((l) => l.id);
  const [contactsAgg, enrollmentsAgg] = await Promise.all([
    supabase
      .from("company_contacts")
      .select("company_id")
      .in("company_id", ids),
    supabase
      .from("learners")
      .select("company_id")
      .in("company_id", ids),
  ]);
  const cMap = new Map<string, number>();
  for (const r of contactsAgg.data ?? []) {
    const id = r.company_id as string;
    cMap.set(id, (cMap.get(id) ?? 0) + 1);
  }
  const eMap = new Map<string, number>();
  for (const r of enrollmentsAgg.data ?? []) {
    const id = r.company_id as string;
    eMap.set(id, (eMap.get(id) ?? 0) + 1);
  }
  for (const item of list) {
    item.contactsCount = cMap.get(item.id) ?? 0;
    item.enrollmentsCount = eMap.get(item.id) ?? 0;
  }
  // Tri par fiabilité du match
  const order: Record<CompanyDuplicate["matchType"], number> = {
    siret: 0,
    name_postal: 1,
    domain: 2,
    name: 3,
  };
  list.sort((a, b) => order[a.matchType] - order[b.matchType]);
  return list;
}

type CreateInput = {
  /** ID d'une entreprise existante choisie par l'utilisateur (si
   *  doublon détecté). Si fourni, on N'EN crée PAS de nouvelle —
   *  on rattache simplement le contact à celle-là. */
  existingCompanyId?: string | null;
  // Société (ignorés si existingCompanyId est fourni)
  companyName: string;
  siret: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  website: string | null;
  // Contact
  firstName: string | null;
  lastName: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
};

function clean(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Force la mise en MAJUSCULES (avec accents préservés) — règle métier
 * appliquée aux noms d'entreprise et noms de contact dans toute l'app.
 */
function upper(v: string | null | undefined): string | null {
  const c = clean(v);
  return c ? c.toLocaleUpperCase("fr-FR") : null;
}

async function getOrgIdAndUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Aucune organisation rattachée à ce compte");
  return {
    organizationId: data.organization_id as string,
    userId: user.id,
  };
}

/**
 * Crée une entreprise + un contact à partir des données extraites d'un
 * email. Si une entreprise avec le même SIRET ou le même nom (insensible
 * à la casse) existe déjà, on lui rattache le contact au lieu de créer
 * un doublon.
 */
export async function createCompanyAndContactFromEmail(input: CreateInput) {
  const { organizationId, userId } = await getOrgIdAndUserId();
  const supabase = await createClient();

  // Règle métier : noms de contact toujours en MAJUSCULES
  const lastName = upper(input.lastName);
  if (!lastName) {
    throw new Error("Le nom du contact est obligatoire.");
  }

  // ----------------------------------------------------------
  // Cas 1 : utilisateur a choisi une entreprise EXISTANTE
  //         (= il a cliqué sur un doublon détecté)
  // ----------------------------------------------------------
  let companyId: string | null = null;
  if (input.existingCompanyId) {
    // On vérifie que l'entreprise existe bien et appartient à l'org
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("id", input.existingCompanyId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!existing) {
      throw new Error("Entreprise sélectionnée introuvable.");
    }
    companyId = existing.id as string;
  } else {
    // ----------------------------------------------------------
    // Cas 2 : création d'une nouvelle entreprise
    // ----------------------------------------------------------
    // Règle métier : noms d'entreprise toujours en MAJUSCULES
    const companyName = upper(input.companyName);
    if (!companyName) {
      throw new Error("Le nom de l'entreprise est obligatoire.");
    }
    // Filet de sécurité : on cherche quand même un doublon SIRET ou nom
    // (au cas où l'utilisateur aurait sauté l'étape de détection).
    const siretClean = clean(input.siret)?.replace(/\D/g, "") ?? null;
    if (siretClean && siretClean.length === 14) {
      const { data: bySiret } = await supabase
        .from("companies")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("siret", siretClean)
        .maybeSingle();
      if (bySiret) companyId = bySiret.id as string;
    }
    if (!companyId) {
      const { data: byName } = await supabase
        .from("companies")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("name", companyName)
        .limit(1)
        .maybeSingle();
      if (byName) companyId = byName.id as string;
    }

    if (!companyId) {
      const { data: created, error: insertCompanyError } = await supabase
        .from("companies")
        .insert({
          organization_id: organizationId,
          name: companyName,
          siret: siretClean,
          address: clean(input.address),
          postal_code: clean(input.postalCode),
          city: clean(input.city),
          website: clean(input.website),
          is_active: true,
          created_by: userId,
          type: "prospect",
        })
        .select("id")
        .single();
      if (insertCompanyError) {
        throw new Error(
          `Création entreprise impossible : ${insertCompanyError.message}`,
        );
      }
      companyId = created.id as string;
    }
  }

  // 3) Crée OU met à jour le contact :
  //    - Si un contact avec le même email existe déjà dans la société →
  //      on COMPLÈTE ses coordonnées (sans écraser ce qui est rempli)
  //    - Sinon → nouveau contact (marqué "principal" si c'est le 1er)
  const emailClean = clean(input.email);
  let existingContactId: string | null = null;
  if (emailClean) {
    const { data: existingContact } = await supabase
      .from("company_contacts")
      .select("id, first_name, last_name, job_title, phone, mobile")
      .eq("company_id", companyId)
      .ilike("email", emailClean)
      .maybeSingle();
    if (existingContact) {
      existingContactId = existingContact.id as string;
      // On complète UNIQUEMENT les champs vides
      const patch: Record<string, string | null> = {};
      if (!existingContact.first_name && input.firstName)
        patch.first_name = clean(input.firstName);
      if (!existingContact.job_title && input.jobTitle)
        patch.job_title = clean(input.jobTitle);
      if (!existingContact.phone && input.phone)
        patch.phone = clean(input.phone);
      if (!existingContact.mobile && input.mobile)
        patch.mobile = clean(input.mobile);
      if (Object.keys(patch).length > 0) {
        await supabase
          .from("company_contacts")
          .update(patch)
          .eq("id", existingContactId);
      }
    }
  }

  if (!existingContactId) {
    const { count: existingContactsCount } = await supabase
      .from("company_contacts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    const isPrimary = (existingContactsCount ?? 0) === 0;

    const { error: insertContactError } = await supabase
      .from("company_contacts")
      .insert({
        company_id: companyId,
        first_name: clean(input.firstName),
        last_name: lastName,
        job_title: clean(input.jobTitle),
        email: emailClean,
        phone: clean(input.phone),
        mobile: clean(input.mobile),
        is_primary: isPrimary,
      });
    if (insertContactError) {
      throw new Error(
        `Création contact impossible : ${insertContactError.message}`,
      );
    }
  }

  revalidatePath("/entreprises");
  revalidatePath(`/entreprises/${companyId}`);
  redirect(`/entreprises/${companyId}?contactAdded=1&fromEmail=1`);
}
