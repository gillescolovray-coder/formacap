/**
 * Convertit une chaîne ASCII en caractères Unicode "Mathematical Sans-Serif
 * Bold" pour simuler du gras dans un email texte brut (Gmail compose URL
 * qui ne supporte pas le HTML dans le param body). Conserve les accents,
 * espaces et caractères spéciaux tels quels.
 *
 * Gilles 2026-05-22 — utilisé dans les boutons "Prévenir par Gmail" et
 * "Confirmer via Gmail" pour mettre en valeur :
 *   - nom de la formation
 *   - dates de session
 *   - nom du partenaire (OF / prescripteur)
 *   - éléments-clés du message
 */
export function bold(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 65 && code <= 90) {
      // A-Z → 𝗔-𝗭
      out += String.fromCodePoint(0x1d5d4 + (code - 65));
    } else if (code >= 97 && code <= 122) {
      // a-z → 𝗮-𝘇
      out += String.fromCodePoint(0x1d5ee + (code - 97));
    } else if (code >= 48 && code <= 57) {
      // 0-9 → 𝟬-𝟵
      out += String.fromCodePoint(0x1d7ec + (code - 48));
    } else {
      out += ch;
    }
  }
  return out;
}

/** Bloc promo BTPBOX + Suivi Chantier — partagé sur tous les emails Gmail. */
export const PROMO_BLOCK = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 Découvrez aussi nos solutions 100 % BTP — testez gratuitement :

📋 ${bold("BTPBOX")} — Le pointage chantier sans papier
Pointez vos équipes en 30 secondes depuis smartphone, tablette ou PC.
Heures, absences, tâches, chantiers — tout centralisé, export paie instantané.
✅ 2 mois offerts, sans engagement 👉 www.btpbox.fr

🚧 ${bold("SUIVI DE CHANTIER")} — Le planning visuel pour les pros
Reprenez le contrôle de vos plannings : qui fait quoi, où, quand.
Fini les SMS et les tableaux Excel.
✅ Essai gratuit immédiat 👉 www.capnumerique.com/suivi-de-chantier`;

/** Signature CAP NUMÉRIQUE — partagée sur tous les emails Gmail. */
export function signature(trainerPhone?: string | null): string {
  const phoneInline = trainerPhone ? ` — 📞 ${trainerPhone}` : "";
  return `${bold("Gilles Colovray")}${phoneInline} — ✉️ gilles.colovray@capnumerique.com
Dirigeant — ${bold("CAP NUMÉRIQUE")} — Organisme de formation Qualiopi
🌐 www.capnumerique.com
⭐ Découvrez nos avis Google : https://www.google.com/search?q=CAP+NUMERIQUE+avis`;
}
