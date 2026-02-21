# Presentation - Back-office Administrateur (Camayenne Map)

## Slide 1 - Titre
**Back-office Administrateur - Camayenne Map**  
Gestion centralisee des POI, signalements et comptes operateurs.

---

## Slide 2 - Contexte
- Le quartier de Camayenne avait besoin d'un outil numerique de cartographie locale.
- Les citoyens doivent pouvoir signaler facilement les problemes.
- L'administration doit traiter rapidement, suivre et prioriser.

---

## Slide 3 - Objectif du Back-office
- Administrer les **points d'interet (POI)**.
- Superviser les **signalements citoyens**.
- Gerer les **comptes et roles** (admin / agent).
- Assurer la **qualite des donnees** et la **securite des acces**.

---

## Slide 4 - Fonctionnalites principales
- Connexion securisee (Supabase Auth).
- Tableau de suivi des signalements.
- Changement de statut des dossiers.
- Ajout / modification / suppression de POI.
- Upload photo terrain des POI (bucket storage).
- Gestion des utilisateurs operateurs.

---

## Slide 5 - Roles et permissions
- `admin`
  - droits complets
  - gestion des comptes
  - suppression POI/signalements
- `agent`
  - consultation
  - ajout / modification operationnelle
- `public`
  - aucun acces back-office

Message cle: le citoyen ne peut pas modifier les statuts admin.

---

## Slide 6 - Securite technique
- RLS (Row Level Security) activee sur les tables.
- Politiques SQL par role.
- Fonctions RPC controlees (`is_admin`, `is_operator`).
- Insertion publique directe limitee (passage par Edge Functions).
- Traçabilite des actions.

---

## Slide 7 - Workflow signalement (vue admin)
1. Le citoyen envoie un signalement (statut auto `NOUVEAU`).
2. Le back-office affiche le dossier.
3. L'admin/agent affecte service + priorite + echeance.
4. Statut evolue: `NOUVEAU` -> `EN_COURS` -> `RESOLU`.
5. Historique conserve pour suivi.

---

## Slide 8 - Workflow POI (vue admin)
1. Ajout POI (nom, categorie, adresse, coordonnees).
2. Upload photo terrain.
3. Verification qualite.
4. Publication sur la carte publique.
5. Mise a jour en continu.

---

## Slide 9 - Valeur apportee
- Gain de temps pour les equipes.
- Vision claire des incidents en cours.
- Meilleure coordination admin/terrain.
- Donnees fiables pour decision locale.

---

## Slide 10 - Demonstration (script 3 min)
1. Connexion admin.
2. Ouvrir liste signalements.
3. Modifier un statut et sauvegarder.
4. Ajouter un POI avec photo.
5. Montrer l'impact sur la carte publique.

---

## Slide 11 - Difficultes rencontrees
- Donnees de coordonnees heterogenes au depart.
- Gestion des permissions fine (RLS).
- Fiabilite geolocalisation mobile.
- Gestion des quotas IA.

---

## Slide 12 - Perspectives
- Journal d'audit avance.
- Notifications email/WhatsApp aux equipes.
- SLA par type de signalement.
- Dashboard analytique plus detaille.

---

## Slide 13 - Conclusion
Le back-office administrateur transforme une carte statique en **outil de gestion municipale**: securise, operationnel et evolutif.

---

## Slide 14 - Q/R
Merci pour votre attention.  
Questions ?

