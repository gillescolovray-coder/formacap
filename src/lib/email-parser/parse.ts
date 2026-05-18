/**
 * Parser d'email pour extraire les informations d'un contact et de son
 * entreprise depuis le contenu textuel d'un email (Gmail/Outlook copié-
 * collé, signature comprise).
 *
 * Approche : règles + heuristiques. Pas d'IA pour le MVP. Si besoin,
 * on pourra brancher Claude API plus tard pour les cas complexes.
 */

export type ParsedEmail = {
  /** Adresse email du contact (le plus probable). */
  email: string | null;
  /** Liste de TOUS les emails trouvés (pour debug / choix manuel). */
  allEmails: string[];
  /** Téléphone fixe (commence par 01-05 ou 09 en France). */
  phone: string | null;
  /** Téléphone mobile (commence par 06 ou 07). */
  mobile: string | null;
  /** Liste de TOUS les téléphones trouvés. */
  allPhones: string[];
  /** Prénom détecté. */
  firstName: string | null;
  /** Nom de famille détecté. */
  lastName: string | null;
  /** Fonction / poste (ex: "Directeur RH", "Assistante commerciale"). */
  jobTitle: string | null;
  /** Nom de l'entreprise. */
  companyName: string | null;
  /** SIRET (14 chiffres). */
  siret: string | null;
  /** Adresse postale brute (ligne 1). */
  address: string | null;
  /** Code postal français (5 chiffres). */
  postalCode: string | null;
  /** Ville. */
  city: string | null;
  /** Site web s'il est mentionné. */
  website: string | null;
};

// =========================================================
// REGEX
// =========================================================

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Numéros français : +33 X XX XX XX XX, 0X XX XX XX XX, avec ou sans
// espaces, points, tirets. On capture pour normaliser ensuite.
const PHONE_REGEX =
  /(?:\+33\s?|0033\s?|0)([1-9])[\s.\-/]?(\d{2})[\s.\-/]?(\d{2})[\s.\-/]?(\d{2})[\s.\-/]?(\d{2})/g;

// SIRET = 14 chiffres (avec espaces tolérés). Refuse les nombres dans
// d'autres contextes (ex: numéros de téléphone) en exigeant SIRET/RCS
// proche dans 50 caractères. Fallback : tout groupe de 14 chiffres.
const SIRET_NEAR_LABEL_REGEX =
  /(?:siret|rcs|n°\s*siret)[\s:]*((?:\d[\s.]*){14})/gi;
const SIRET_FALLBACK_REGEX = /\b(?:\d[\s.]*){14}\b/g;

// Code postal français : 5 chiffres, on prend de préférence ceux suivis
// d'un nom de ville en majuscules.
const POSTAL_CITY_REGEX =
  /\b(\d{5})\s+([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][A-Za-zÀ-ÖØ-öø-ÿ' \-]{1,40})\b/;

// Adresse : lignes commençant par un numéro suivi de "rue", "avenue",
// "boulevard", "impasse", "place", etc.
const STREET_REGEX =
  /\b(\d+(?:\s*(?:bis|ter|quater))?)\s+(?:(?:rue|avenue|av\.|bd|boulevard|allée|allee|impasse|place|chemin|route|cours|quai|voie|chaussée|chaussee|esplanade|square|passage|villa)\s+[^\n,]{2,80})/i;

// Site web : http(s), www.exemple.com, ou domaine "nu" type "exemple.com"
// (on filtre ensuite ceux qui sont en réalité dans des emails).
const URL_REGEX =
  /https?:\/\/[^\s<>]+|\bwww\.[a-z0-9.-]+\.[a-z]{2,}\b|\b[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?\.(?:fr|com|net|org|io|co|eu|biz|info|app|tech|store|shop|online|site|coach|pro|agency|tools|cloud)\b/gi;

// Fonctions / postes courants
const JOB_TITLE_PATTERNS = [
  // Patterns explicites avec mot-clé
  /(?:fonction|poste|position|titre)\s*:\s*([^\n]{2,80})/i,
  // Direction / Responsable / Assistant(e) / Chargé(e) / etc.
  /\b(directeur|directrice|président(?:e)?|gérant(?:e)?|administrateur|administratrice|responsable|chef|cheffe|manager|chargé(?:e)?|assistant(?:e)?|conseiller(?:ère)?|commercial(?:e)?|comptable|technicien(?:ne)?|ingénieur(?:e)?|consultant(?:e)?|coordinateur|coordinatrice|secrétaire|formateur|formatrice|développeur|développeuse|architecte|chef\s+de\s+projet|product\s+owner)\b[^,\n]{0,80}/i,
];

// Domaines à ignorer pour deviner la société depuis l'email
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

// Mots-clés signalant la fin de l'email (formules de politesse) — utile
// pour limiter la zone de recherche du nom dans la signature.
const CLOSING_REGEX =
  /\n\s*(cordialement|bien cordialement|bien à vous|sincèrement|sincèrement vôtre|salutations|bonne (?:journée|réception|continuation|soirée)|cordialement à vous|à très bientôt|à bientôt|bien sincèrement)[\s,.!]*\n?/i;

// =========================================================
// HELPERS
// =========================================================

function normalizePhone(match: RegExpMatchArray): string {
  // match[0] = "+33 1 23 45 67 89" ou "01 23 45 67 89"
  // On normalise au format français lisible : 01 23 45 67 89
  const groups = [match[1], match[2], match[3], match[4], match[5]];
  return `0${groups[0]} ${groups[1]} ${groups[2]} ${groups[3]} ${groups[4]}`;
}

function isMobile(phone: string): boolean {
  // Mobile FR : commence par 06 ou 07
  return /^0\s*[67]/.test(phone);
}

function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_REGEX) ?? [];
  // Dédup en gardant l'ordre, lowercase
  return Array.from(new Set(matches.map((e) => e.toLowerCase())));
}

function extractPhones(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PHONE_REGEX)) {
    out.push(normalizePhone(m));
  }
  return Array.from(new Set(out));
}

function extractSiret(text: string): string | null {
  // 1) Cherche "SIRET : XXX XXX XXX XXX XX"
  for (const m of text.matchAll(SIRET_NEAR_LABEL_REGEX)) {
    const digits = m[1].replace(/\D/g, "");
    if (digits.length === 14) return digits;
  }
  // 2) Fallback : tout groupe de 14 chiffres consécutifs (rare hors SIRET)
  for (const m of text.matchAll(SIRET_FALLBACK_REGEX)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length === 14) return digits;
  }
  return null;
}

function extractPostalCity(
  text: string,
): { postalCode: string; city: string } | null {
  const m = text.match(POSTAL_CITY_REGEX);
  if (!m) return null;
  return {
    postalCode: m[1],
    city: m[2].trim().replace(/\s+/g, " "),
  };
}

function extractStreet(text: string): string | null {
  const m = text.match(STREET_REGEX);
  if (!m) return null;
  // m[0] est la ligne complète "12 rue de la Paix"
  return m[0].trim().replace(/\s+/g, " ");
}

function extractWebsite(text: string, excludeEmails: string[]): string | null {
  // On retire d'abord les emails du texte pour éviter qu'ils soient
  // capturés par la regex domaine "nu".
  let cleaned = text;
  for (const e of excludeEmails) {
    cleaned = cleaned.split(e).join(" ");
  }
  const matches = cleaned.match(URL_REGEX) ?? [];
  for (const url of matches) {
    const lower = url.toLowerCase().trim();
    // Exclure les fragments parasites
    if (lower.length < 4) continue;
    // Privilégier les URLs explicites (http/www) en premier passage
    if (lower.startsWith("http") || lower.startsWith("www.")) {
      return url;
    }
  }
  // Sinon : 1er domaine "nu" trouvé
  for (const url of matches) {
    const lower = url.toLowerCase().trim();
    if (lower.length < 4) continue;
    return url;
  }
  return null;
}

function extractJobTitle(text: string): string | null {
  for (const re of JOB_TITLE_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const result = (m[1] ?? m[0]).trim();
      // Nettoyer : limiter à 80 caractères, retirer les caractères de fin
      return result.replace(/[\s,;.]+$/, "").slice(0, 80);
    }
  }
  return null;
}

/**
 * Devine le nom de l'entreprise en cherchant :
 * 1. Une ligne en MAJUSCULES (SAS XYZ, ENTREPRISE…) dans la signature
 * 2. Le domaine de l'email (si non générique)
 */
function extractCompanyName(text: string, emails: string[]): string | null {
  // 1) Cherche une ligne tout en majuscules dans la moitié basse du texte
  // (= zone signature). Évite les lignes trop courtes (< 3 chars) ou trop
  // longues (> 80 chars).
  const lines = text.split(/\n/);
  const startSignature = Math.floor(lines.length * 0.5);
  for (let i = startSignature; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length < 3 || line.length > 80) continue;
    // Ligne presque tout en majuscules + au moins 1 lettre
    const lettersOnly = line.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
    if (lettersOnly.length < 3) continue;
    const upperRatio =
      lettersOnly.split("").filter((c) => c === c.toUpperCase()).length /
      lettersOnly.length;
    if (upperRatio > 0.85) {
      // Filtrer les formules de politesse en majuscules
      if (/^(?:CORDIALEMENT|BIEN À VOUS|MERCI|BONJOUR|BONSOIR)/i.test(line))
        continue;
      return line;
    }
  }

  // 2) Devine depuis le domaine de l'email
  for (const email of emails) {
    const domain = email.split("@")[1];
    if (!domain) continue;
    if (GENERIC_EMAIL_DOMAINS.has(domain.toLowerCase())) continue;
    // Capitalise et retire le TLD : "capnumerique.com" → "Capnumerique"
    const base = domain.split(".")[0];
    if (!base) continue;
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  return null;
}

/**
 * Devine prénom + nom depuis la signature. Heuristiques :
 * 1. Cherche après une formule de politesse ("Cordialement, Jean DUPONT")
 * 2. Sinon, cherche une ligne "Prénom NOM" ou "M. Prénom NOM"
 */
function extractName(text: string, emails: string[]): {
  firstName: string | null;
  lastName: string | null;
} {
  // 1) Après formule de politesse
  const closingMatch = text.match(CLOSING_REGEX);
  if (closingMatch) {
    const afterClosing = text.slice(
      (closingMatch.index ?? 0) + closingMatch[0].length,
    );
    // Première ligne non vide après
    const lines = afterClosing.split(/\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines.slice(0, 3)) {
      const parsed = parseNameLine(line);
      if (parsed) return parsed;
    }
  }

  // 2) Recherche dans toutes les lignes : "Prénom NOM" (Prénom commence par
  //    1 majuscule, NOM tout en majuscules)
  const lines = text.split(/\n/).map((l) => l.trim());
  for (const line of lines) {
    const parsed = parseNameLine(line);
    if (parsed) return parsed;
  }

  // 3) Fallback : utilise la partie locale de l'email comme prénom.nom
  for (const email of emails) {
    const local = email.split("@")[0];
    const parts = local.split(/[._-]/);
    if (parts.length >= 2) {
      return {
        firstName: capitalize(parts[0]),
        lastName: parts.slice(1).join(" ").toUpperCase(),
      };
    }
  }

  return { firstName: null, lastName: null };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function parseNameLine(
  line: string,
): { firstName: string; lastName: string } | null {
  if (!line) return null;
  // Limiter à 60 caractères pour éviter les faux positifs
  if (line.length > 60) return null;
  // Retirer titre éventuel
  const cleaned = line.replace(/^(?:M\.?|Mme|Mlle|Dr\.?|Pr\.?)\s+/i, "");
  // Pattern "Prénom NOM" ou "Prénom NOM-NOM"
  // Prénom : 1 lettre maj + lettres min/accents
  // NOM : 2+ lettres MAJ ou Maj+min
  const m = cleaned.match(
    /^([A-ZÀ-Ý][a-zà-ÿ]+(?:[\s-][A-ZÀ-Ý][a-zà-ÿ]+)?)\s+([A-ZÀ-Ý][A-ZÀ-Ý'\- ]{1,40}|[A-ZÀ-Ý][a-zà-ÿ]+(?:[\s-][A-ZÀ-Ý][a-zà-ÿ]+)?)$/,
  );
  if (!m) return null;
  return {
    firstName: m[1].trim(),
    lastName: m[2].trim().toUpperCase(),
  };
}

// =========================================================
// API PUBLIQUE
// =========================================================

export function parseEmailContent(text: string): ParsedEmail {
  if (!text || !text.trim()) {
    return {
      email: null,
      allEmails: [],
      phone: null,
      mobile: null,
      allPhones: [],
      firstName: null,
      lastName: null,
      jobTitle: null,
      companyName: null,
      siret: null,
      address: null,
      postalCode: null,
      city: null,
      website: null,
    };
  }

  const allEmails = extractEmails(text);
  const allPhones = extractPhones(text);
  const phone = allPhones.find((p) => !isMobile(p)) ?? null;
  const mobile = allPhones.find(isMobile) ?? null;

  const { firstName, lastName } = extractName(text, allEmails);
  const jobTitle = extractJobTitle(text);
  const companyName = extractCompanyName(text, allEmails);
  const siret = extractSiret(text);
  const address = extractStreet(text);
  const postalCity = extractPostalCity(text);
  const website = extractWebsite(text, allEmails);

  // Choix de l'email principal : le 1er email non générique
  // (en pratique, l'email du contact à enregistrer est rarement gmail/etc.)
  const email = allEmails[0] ?? null;

  return {
    email,
    allEmails,
    phone,
    mobile,
    allPhones,
    firstName,
    lastName,
    jobTitle,
    companyName,
    siret,
    address,
    postalCode: postalCity?.postalCode ?? null,
    city: postalCity?.city ?? null,
    website,
  };
}
