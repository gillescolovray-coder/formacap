-- =========================================================
-- SEEDS : 3 tests de positionnement de Gilles (form-builder)
-- =========================================================
-- À coller dans le SQL Editor de Supabase pour avoir les 3
-- templates personnalisés immédiatement utilisables.
--
-- Prérequis : migration 0106 appliquée (colonne `structure`).
--
-- Hypothèse : une seule organisation dans la BDD. Si tu en as
-- plusieurs, remplace `(select id from public.organizations limit 1)`
-- par l'UUID de ton orga CAP NUMÉRIQUE.
-- =========================================================

-- =========================================================
-- TEST 1 : L'IA au service du conducteur de travaux
-- =========================================================
insert into public.positioning_templates (
  organization_id, title, description, is_default,
  expectation_choices, mastery_criteria, status,
  structure
) values (
  (select id from public.organizations limit 1),
  'L''IA au service du conducteur de travaux',
  'Test de positionnement pour la formation "Les prompts essentiels pour piloter un chantier public".',
  false,
  '[]'::jsonb,
  '[]'::jsonb,
  'published',
  '{
    "intro": {
      "instructions": "Afin d''adapter la formation à votre niveau, à vos outils et à vos besoins, merci de compléter ce questionnaire avant le début de la session. Il ne s''agit pas d''un examen, mais d''un support permettant au formateur d''ajuster les contenus, les exercices, les démonstrations et, si nécessaire, les modalités d''accompagnement.",
      "important_note": "Si vous avez déjà réalisé la conduite d''un chantier il faut être muni le jour de la formation d''une CLE USB contenant les éléments suivants :\n• L''ensemble des pièces du marché signé\n• Les pièces réalisées par le conducteur de travaux pour la réalisation et le suivi des travaux"
    },
    "sections": [
      {
        "title": "Votre expérience",
        "questions": [
          {
            "type": "radio",
            "text": "Intervenez-vous actuellement dans la préparation, le suivi ou la gestion de chantiers ?",
            "required": true,
            "options": ["Oui régulièrement", "Oui occasionnellement", "Non jamais"]
          },
          {
            "type": "radio",
            "text": "Vous avez combien d''années d''expérience dans la conduite de travaux ou le suivi de chantier ?",
            "required": true,
            "options": ["< 1 an", "Compris entre 1 an et 3 ans", "Compris entre 3 ans et 10 ans", "> 10 ans"]
          },
          {
            "type": "radio",
            "text": "Quel est votre niveau de connaissance des marchés publics appliqués au chantier ?",
            "required": true,
            "options": ["Débutant", "Intermédiaire", "Confirmé"]
          },
          {
            "type": "matrix",
            "text": "Avez-vous déjà eu à exploiter ou analyser les documents suivants dans le cadre d''un chantier ?",
            "rows": [
              "Règlement de consultation (RC)",
              "CCAP",
              "CCTP",
              "DPGF / quantitatif",
              "Plans d''exécution / plans marché",
              "Comptes-rendus de chantier",
              "PPSPS",
              "Planning d''exécution"
            ],
            "cols": ["Oui régulièrement", "Oui occasionnellement", "Non"]
          }
        ]
      },
      {
        "title": "Outils métier utilisés",
        "questions": [
          {
            "type": "checkbox",
            "text": "Quels outils utilisez-vous aujourd''hui dans votre activité ?",
            "allow_other": true,
            "options": [
              "Word",
              "Excel",
              "Lecteur PDF",
              "Logiciel de feuille de pointage des heures et tâches réalisées",
              "Logiciel de planning chantier",
              "Outil de suivi interne",
              "Outil de suivi à destination du client",
              "Aucun outil particulier"
            ]
          },
          {
            "type": "checkbox",
            "text": "Aujourd''hui, pour quelles tâches utilisez-vous principalement ces outils ?",
            "allow_other": true,
            "options": [
              "Lecture des pièces marché",
              "Préparation des documents chantier",
              "Analyse de comptes-rendus",
              "Suivi heures prévues / heures réalisées",
              "Consultation fournisseurs",
              "Rédaction de mails ou synthèses",
              "Élaboration de planning"
            ]
          }
        ]
      },
      {
        "title": "Outils IA utilisés",
        "questions": [
          {
            "type": "matrix",
            "text": "Utilisez-vous actuellement un ou plusieurs outils d''intelligence artificielle ?",
            "rows": ["ChatGPT", "Gemini", "Claude", "Mistral", "Autre"],
            "cols": ["Compte gratuit", "Compte payant", "Non concerné"]
          },
          {
            "type": "radio",
            "text": "À quelle fréquence utilisez-vous l''IA ?",
            "required": true,
            "options": ["Jamais", "Occasionnellement", "Régulièrement", "Très souvent"]
          },
          {
            "type": "checkbox",
            "text": "Dans quel cadre utilisez-vous principalement l''IA ?",
            "options": ["Aucun usage à ce jour", "Découverte / tests", "Usage personnel", "Usage professionnel", "Les deux"]
          },
          {
            "type": "yes_no_text",
            "text": "Avez-vous déjà participé à une formation portant sur l''usage de l''intelligence artificielle en milieu professionnel ?",
            "followup_label": "Si OUI, précisez l''organisme concerné, la durée de la formation, la période approximative, et les acquis que vous appliquez encore aujourd''hui."
          }
        ]
      },
      {
        "title": "Prérequis et matériel",
        "questions": [
          {
            "type": "radio",
            "text": "Disposez-vous du matériel nécessaire pour suivre la formation ? (ordinateur, Word, lecteur PDF, navigateur web à jour, accès email)",
            "required": true,
            "options": ["Oui totalement", "Oui partiellement", "Non"]
          },
          {
            "type": "text_long",
            "text": "Précisions éventuelles",
            "rows": 3
          }
        ]
      },
      {
        "title": "Attentes et besoins",
        "questions": [
          {
            "type": "checkbox",
            "text": "Quels sont vos principaux besoins par rapport à cette formation ?",
            "allow_other": true,
            "options": [
              "Mieux comprendre l''usage de l''IA en conduite de travaux",
              "Améliorer l''analyse des pièces d''un marché public",
              "Gagner du temps dans la préparation des documents chantier",
              "Fiabiliser l''analyse des données techniques",
              "Préparer plus facilement une consultation fournisseur",
              "Mieux exploiter les comptes-rendus de chantier",
              "Améliorer le suivi d''avancement",
              "Produire plus rapidement des synthèses et CR de réunion"
            ]
          },
          {
            "type": "text_long",
            "text": "Qu''attendez-vous en priorité de cette formation ?",
            "rows": 4
          }
        ]
      },
      {
        "title": "Situation particulière",
        "questions": [
          {
            "type": "yes_no_text",
            "text": "Souhaitez-vous signaler une situation de handicap ou un besoin d''adaptation particulier ?",
            "followup_label": "Si oui, précisez :"
          }
        ]
      }
    ]
  }'::jsonb
);

-- =========================================================
-- TEST 2 : Mémoires Techniques Nouvelle Génération – IA
-- =========================================================
insert into public.positioning_templates (
  organization_id, title, description, is_default,
  expectation_choices, mastery_criteria, status,
  structure
) values (
  (select id from public.organizations limit 1),
  'Mémoires Techniques Nouvelle Génération – IA',
  'Test de positionnement pour la formation "IA & Stratégie de Réponse pour les mémoires techniques".',
  false,
  '[]'::jsonb,
  '[]'::jsonb,
  'published',
  '{
    "intro": {
      "instructions": "Afin d''adapter la formation à votre niveau, à vos outils et à vos besoins, merci de compléter ce questionnaire avant le début de la session. Il ne s''agit pas d''un examen, mais d''un support permettant au formateur d''ajuster les contenus, les exercices, les démonstrations et, si nécessaire, les modalités d''accompagnement.",
      "important_note": "Si vous avez déjà un mémoire technique, il faut être muni le jour de la formation d''une CLE USB contenant les éléments suivants :\n• Un Règlement de consultation d''une affaire perdue\n• Un mémoire technique au format PDF et dans votre format de travail (Word, Excel, PowerPoint etc.)\n• Facultatif : un courrier de refus"
    },
    "sections": [
      {
        "title": "Votre expérience",
        "questions": [
          {
            "type": "radio",
            "text": "Avez-vous déjà participé à la rédaction d''un mémoire technique ?",
            "required": true,
            "options": ["Oui régulièrement", "Oui occasionnellement", "Non jamais"]
          },
          {
            "type": "radio",
            "text": "Vous avez combien d''années d''expérience dans le domaine ?",
            "required": true,
            "options": ["< 1 an", "Compris entre 1 an et 3 ans", "Compris entre 3 ans et 10 ans", "> 10 ans"]
          },
          {
            "type": "radio",
            "text": "Comment évaluez-vous votre niveau en rédaction de mémoire technique ?",
            "required": true,
            "options": ["Débutant", "Intermédiaire", "Confirmé"]
          },
          {
            "type": "checkbox",
            "text": "Quels outils utilisez-vous aujourd''hui pour préparer vos réponses aux appels d''offres ?",
            "allow_other": true,
            "options": [
              "Logiciel traitement de texte (Word, OpenOffice, etc.)",
              "Tableur (Excel…)",
              "PowerPoint",
              "Canva",
              "Aucun outil particulier"
            ]
          }
        ]
      },
      {
        "title": "Outils IA utilisés",
        "questions": [
          {
            "type": "matrix",
            "text": "Utilisez-vous actuellement un ou plusieurs outils d''intelligence artificielle ?",
            "rows": ["ChatGPT", "Gemini", "Claude", "Mistral", "Autre"],
            "cols": ["Compte gratuit", "Compte payant", "Non concerné"]
          },
          {
            "type": "radio",
            "text": "À quelle fréquence utilisez-vous l''IA ?",
            "required": true,
            "options": ["Jamais", "Occasionnellement", "Régulièrement", "Très souvent"]
          },
          {
            "type": "checkbox",
            "text": "Dans quel cadre utilisez-vous principalement l''IA ?",
            "options": ["Aucun usage à ce jour", "Découverte / tests", "Usage personnel", "Usage professionnel", "Les deux"]
          },
          {
            "type": "yes_no_text",
            "text": "Avez-vous déjà participé à une formation portant sur l''usage de l''intelligence artificielle en milieu professionnel ?",
            "followup_label": "Si OUI, précisez l''organisme concerné, la durée de la formation, la période approximative, et les acquis que vous appliquez encore aujourd''hui."
          }
        ]
      },
      {
        "title": "Prérequis et matériel",
        "questions": [
          {
            "type": "radio",
            "text": "Disposez-vous du matériel nécessaire pour suivre la formation ? (ordinateur, Word, lecteur PDF, navigateur web à jour, accès email)",
            "required": true,
            "options": ["Oui totalement", "Oui partiellement", "Non"]
          },
          {
            "type": "text_long",
            "text": "Précisions éventuelles",
            "rows": 3
          }
        ]
      },
      {
        "title": "Attentes et besoins",
        "questions": [
          {
            "type": "checkbox",
            "text": "Quels sont vos principaux besoins par rapport à cette formation ?",
            "allow_other": true,
            "options": [
              "Mieux analyser un DCE",
              "Comprendre les critères de jugement",
              "Structurer un mémoire technique plus efficace",
              "Améliorer la qualité rédactionnelle",
              "Gagner du temps dans la réalisation du mémoire technique",
              "Utiliser l''IA dans mes réponses",
              "Améliorer la présentation de mes documents"
            ]
          },
          {
            "type": "text_long",
            "text": "Qu''attendez-vous en priorité de cette formation ?",
            "rows": 4
          }
        ]
      },
      {
        "title": "Situation particulière",
        "questions": [
          {
            "type": "yes_no_text",
            "text": "Souhaitez-vous signaler une situation de handicap ou un besoin d''adaptation particulier ?",
            "followup_label": "Si oui, précisez :"
          }
        ]
      }
    ]
  }'::jsonb
);

-- =========================================================
-- TEST 3 : Savoir bien répondre aux appels d'offres avec l'IA
-- =========================================================
insert into public.positioning_templates (
  organization_id, title, description, is_default,
  expectation_choices, mastery_criteria, status,
  structure
) values (
  (select id from public.organizations limit 1),
  'Savoir bien répondre aux appels d''offres avec l''IA',
  'Test de positionnement pour la formation "Réponse aux appels d''offres avec l''assistance de l''IA".',
  false,
  '[]'::jsonb,
  '[]'::jsonb,
  'published',
  '{
    "intro": {
      "instructions": "Afin d''adapter la formation à votre niveau, à vos outils et à vos besoins, merci de compléter ce questionnaire avant le début de la session. Il ne s''agit pas d''un examen, mais d''un support permettant au formateur d''ajuster les contenus, les exercices, les démonstrations et, si nécessaire, les modalités d''accompagnement.",
      "important_note": "Si vous avez déjà réalisé une réponse à un appel d''offres il faut être muni le jour de la formation d''une CLE USB contenant les éléments suivants :\n• Un Règlement de consultation d''une affaire de votre choix\n• Le dossier de candidature (administratif remis)\n• Le dossier Offre remis sans la partie financière (AE, DPGF non souhaité)"
    },
    "sections": [
      {
        "title": "Votre expérience",
        "questions": [
          {
            "type": "radio",
            "text": "Avez-vous déjà participé à la réponse à un appel d''offres public ?",
            "required": true,
            "options": ["Oui régulièrement", "Oui occasionnellement", "Non jamais"]
          },
          {
            "type": "radio",
            "text": "Vous avez combien d''années d''expérience dans le domaine ?",
            "required": true,
            "options": ["< 1 an", "Compris entre 1 an et 3 ans", "Compris entre 3 ans et 10 ans", "> 10 ans"]
          },
          {
            "type": "radio",
            "text": "Comment évaluez-vous votre niveau dans la réponse à un appel d''offres ?",
            "required": true,
            "options": ["Débutant", "Intermédiaire", "Confirmé"]
          },
          {
            "type": "checkbox",
            "text": "Quels outils utilisez-vous aujourd''hui pour préparer vos réponses aux appels d''offres ?",
            "allow_other": true,
            "options": [
              "Logiciel traitement de texte (Word, OpenOffice, etc.)",
              "Tableur (Excel…)",
              "PowerPoint",
              "Canva",
              "Aucun outil particulier"
            ]
          }
        ]
      },
      {
        "title": "Outils IA utilisés",
        "questions": [
          {
            "type": "matrix",
            "text": "Utilisez-vous actuellement un ou plusieurs outils d''intelligence artificielle ?",
            "rows": ["ChatGPT", "Gemini", "Claude", "Mistral", "Autre"],
            "cols": ["Compte gratuit", "Compte payant", "Non concerné"]
          },
          {
            "type": "radio",
            "text": "À quelle fréquence utilisez-vous l''IA ?",
            "required": true,
            "options": ["Jamais", "Occasionnellement", "Régulièrement", "Très souvent"]
          },
          {
            "type": "checkbox",
            "text": "Dans quel cadre utilisez-vous principalement l''IA ?",
            "options": ["Aucun usage à ce jour", "Découverte / tests", "Usage personnel", "Usage professionnel", "Les deux"]
          },
          {
            "type": "yes_no_text",
            "text": "Avez-vous déjà participé à une formation portant sur l''usage de l''intelligence artificielle en milieu professionnel ?",
            "followup_label": "Si OUI, précisez l''organisme concerné, la durée de la formation, la période approximative, et les acquis que vous appliquez encore aujourd''hui."
          }
        ]
      },
      {
        "title": "Prérequis et matériel",
        "questions": [
          {
            "type": "radio",
            "text": "Disposez-vous du matériel nécessaire pour suivre la formation ? (ordinateur, Word, lecteur PDF, navigateur web à jour, accès email)",
            "required": true,
            "options": ["Oui totalement", "Oui partiellement", "Non"]
          },
          {
            "type": "text_long",
            "text": "Précisions éventuelles",
            "rows": 3
          }
        ]
      },
      {
        "title": "Attentes et besoins",
        "questions": [
          {
            "type": "checkbox",
            "text": "Quels sont vos principaux besoins par rapport à cette formation ?",
            "allow_other": true,
            "options": [
              "Savoir détecter des appels d''offres avec des outils gratuits",
              "Savoir analyser efficacement le règlement de consultation (RC)",
              "Connaître les obligations administratives lors de la réponse",
              "Savoir créer et répondre avec un DUME",
              "Savoir créer et mettre en place un espace numérique gratuit",
              "Identifier les critères de jugement de l''offre",
              "Gagner du temps dans la réalisation de la réponse aux appels d''offres",
              "Utiliser l''IA dans mes réponses",
              "Améliorer la présentation de mes documents"
            ]
          },
          {
            "type": "text_long",
            "text": "Qu''attendez-vous en priorité de cette formation ?",
            "rows": 4
          }
        ]
      },
      {
        "title": "Situation particulière",
        "questions": [
          {
            "type": "yes_no_text",
            "text": "Souhaitez-vous signaler une situation de handicap ou un besoin d''adaptation particulier ?",
            "followup_label": "Si oui, précisez :"
          }
        ]
      }
    ]
  }'::jsonb
);
