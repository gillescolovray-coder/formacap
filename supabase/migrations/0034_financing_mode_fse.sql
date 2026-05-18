-- =========================================================================
-- 0034 — Ajout du mode de financement « FSE » (Fonds Social Européen)
--
-- Le FSE+ (Fonds Social Européen +) cofinance des actions de formation et
-- impose l'apposition du logo officiel sur les supports de communication
-- de l'opération, notamment les feuilles d'émargement.
--
-- L'enum `financing_mode` est étendu avec la valeur `fse`. Le rendu côté
-- UI ajoute le label « FSE — Fonds Social Européen » et affiche le logo
-- officiel sur la feuille de présence des sessions financées par ce moyen.
-- =========================================================================

alter type public.financing_mode add value if not exists 'fse';
