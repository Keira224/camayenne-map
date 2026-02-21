# Presentation - Dashboard Mairie (Camayenne)

## Slide 1 - Titre
**Dashboard Mairie - Camayenne**  
Pilotage des signalements, affectation des interventions et aide a la decision.

---

## Slide 2 - Probleme metier
- Multiplication des signalements sans priorisation claire.
- Difficultes de coordination entre services municipaux.
- Besoin d'une vision temps reel pour arbitrer rapidement.

---

## Slide 3 - Objectif du dashboard mairie
- Donner une **vue operationnelle centralisee**.
- Prioriser les interventions selon l'urgence et la charge.
- Suivre la performance des traitements.
- Aider le maire a prendre des decisions appuyees sur les donnees.

---

## Slide 4 - Vue d'ensemble de l'interface
- KPI globaux (total, nouveaux, en cours, resolus, priorite haute, POI actifs).
- Carte operationnelle.
- Filtres metier (statut, type, service, agent, periode).
- Tableau de traitement des dossiers.
- Bloc analyse IA + chat IA.

---

## Slide 5 - KPI et interpretation
- **Signalements total**: volume global.
- **Nouveaux**: charge entrante.
- **En cours**: charge en traitement.
- **Resolus**: capacite de cloture.
- **Priorite IA haute**: dossiers critiques.

Message cle: l'evolution de ces KPI guide les arbitrages.

---

## Slide 6 - Affectation et file d'intervention
- Auto-affectation des nouveaux dossiers.
- Affectation manuelle par service/agent.
- Echeance et priorite modifiables.
- Historisation dans `report_assignments`.

---

## Slide 7 - Prevision: comment ca marche
La tendance est calculee sur 2 fenetres:
- `last7`: 7 derniers jours
- `prev7`: 7 jours precedents

Formule:
`trend = (last7 - prev7) / prev7`

Puis:
- `J+7 = last7 * (1 + trend)`
- `J+30 = (J+7 / 7) * 30`

Le `%` affiche = **taux d'evolution** (pas une probabilite).

---

## Slide 8 - Exemple simple de prevision
- `prev7 = 20`, `last7 = 30`
- tendance = `(30-20)/20 = +50%`
- prevision J+7 = `30 * 1.5 = 45`
- prevision J+30 ~ `193`

Interpretation: si rien ne change, la charge va augmenter.

---

## Slide 9 - Analyse IA mairie
- Resume executif automatique.
- Hotspots geographiques.
- Recommandations d'action.
- Top types a risque.

Objectif: transformer la donnee brute en decisions concretement actionnables.

---

## Slide 10 - Chat IA pour le maire
- Questions libres:
  - "Quel service renforcer cette semaine ?"
  - "Quelles urgences traiter en premier ?"
  - "Quelle zone est la plus critique ?"
- Reponses basees sur les donnees du dashboard.
- Mode fallback local si API IA indisponible.

---

## Slide 11 - Securite et gouvernance
- Acces reserve aux roles `admin` et `agent` actifs.
- Fonctions protegees et RLS en base.
- Separation public / administration / mairie.
- Traçabilite des affectations.

---

## Slide 12 - Demonstration (script 4 min)
1. Connexion mairie.
2. Lecture des KPI.
3. Filtrer `NOUVEAU + SECURITE`.
4. Auto-affecter.
5. Modifier une echeance et statut.
6. Lancer analyse IA.
7. Poser une question au chat IA.

---

## Slide 13 - Resultats attendus
- Reduction du delai de traitement.
- Moins de dossiers non assignes.
- Meilleure allocation des equipes.
- Meilleure transparence pour la mairie.

---

## Slide 14 - Roadmap
- Alertes automatiques sur retards critiques.
- Score de performance par service.
- Previsions ameliorees (saisonnalite / historique long).
- Dashboard executif hebdomadaire exportable.

---

## Slide 15 - Conclusion
Le dashboard mairie permet de passer d'une gestion reactive a une **gestion pilotee par la donnee**.

---

## Slide 16 - Q/R
Merci pour votre attention.  
Questions ?

