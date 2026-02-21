# Presentation - Partie Publique (Camayenne Map)

## Slide 1 - Titre
**Camayenne Map - Espace Public Citoyen**  
Cartographie locale, orientation et signalement simple.

---

## Slide 2 - Contexte
- Les habitants ont besoin d'un accès rapide aux services du quartier.
- Les visiteurs ont besoin d'orientation simple dans Camayenne.
- La mairie a besoin de signalements fiables venant du terrain.

---

## Slide 3 - Objectif de la partie publique
- Permettre à tout citoyen de:
  - se localiser,
  - trouver des lieux utiles (POI),
  - obtenir un itinéraire,
  - signaler un problème.

---

## Slide 4 - Fonctionnalites principales
- Carte interactive (Leaflet + OpenStreetMap).
- Recherche de lieux par nom/catégorie.
- Itinéraire entre deux points.
- Géolocalisation et guidage.
- Signalement citoyen géolocalisé.
- Partage de position temporaire.
- Assistant IA public.

---

## Slide 5 - Parcours utilisateur (citoyen)
1. Ouvrir la carte publique.
2. Cliquer `Ma position`.
3. Rechercher un service (ex: pharmacie, mairie, police).
4. Lancer un itinéraire.
5. En cas de problème: `Signaler` + point sur la carte + description.

---

## Slide 6 - Signalement public (important)
- Le citoyen **ne choisit plus le statut**.
- Le statut est défini automatiquement à `NOUVEAU`.
- Le citoyen fait seulement:
  - type,
  - titre,
  - description,
  - position sur carte.

Message clé: interface plus simple et plus fiable.

---

## Slide 7 - Données collectées côté public
- Position (latitude/longitude) du signalement.
- Type et description de l'incident.
- Date/heure de soumission.
- Optionnel: informations contextuelles (IA de tri côté serveur).

---

## Slide 8 - Sécurité et protection
- Insertion directe en base publique limitée.
- Passage via Edge Function sécurisée (`submit-report`).
- Anti-spam basique par source et fenêtre de temps.
- RLS (Row Level Security) appliquée.

---

## Slide 9 - Assistant IA public
- Répond aux questions citoyennes:
  - "Où est la pharmacie la plus proche ?"
  - "Comment signaler un problème d'éclairage ?"
- Propose des lieux pertinents.
- Fallback local si API IA indisponible.

---

## Slide 10 - Itinéraire et guidage
- Calcul d'itinéraire via OpenRouteService (côté serveur).
- Distance + temps estimé.
- Guidage progressif (position mise à jour pendant le déplacement).

---

## Slide 11 - Accessibilite mobile
- Interface pensée pour smartphone.
- Actions rapides: rechercher / ajouter / signaler.
- Boutons et formulaires adaptés aux petits écrans.

---

## Slide 12 - Valeur pour les citoyens
- Gain de temps pour trouver un service.
- Meilleure orientation dans le quartier.
- Canal simple pour remonter les incidents.
- Participation citoyenne à l'amélioration locale.

---

## Slide 13 - Demonstration (script 3 min)
1. Ouvrir la carte publique.
2. Rechercher un POI.
3. Lancer un itinéraire.
4. Créer un signalement (statut auto `NOUVEAU`).
5. Poser une question à l'assistant IA public.

---

## Slide 14 - Limites actuelles
- Dépendance réseau (GPS + Internet).
- Quotas API IA possibles en mode gratuit.
- Qualité de précision GPS variable selon appareil.

---

## Slide 15 - Perspectives
- Notifications de suivi citoyen (si souhaité).
- Multi-langues (français, langues locales).
- Amélioration des recommandations IA contextuelles.
- Mode hors-ligne partiel pour zones à faible connectivité.

---

## Slide 16 - Conclusion
La partie publique transforme la cartographie en **service citoyen concret**: utile, simple et orienté action.

---

## Slide 17 - Q/R
Merci pour votre attention.  
Questions ?

