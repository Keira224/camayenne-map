# Camayenne Open MVP (Sans ArcGIS)

MVP gratuit pour la cartographie de Camayenne avec:
- Carte interactive (Leaflet)
- Recherche de lieux (POI)
- Ajout de lieux
- Signalement citoyen
- Filtres signalements
- Itinéraire vers un POI (openrouteservice)
- Itinéraire entre deux lieux de Camayenne
- Itinéraire depuis votre position actuelle (même hors Camayenne)
- Guidage en direct (position qui bouge pendant la marche)
- Photo des lieux (prise terrain via back-office)
- Partage de position par lien temporaire
- Assistant IA public (questions citoyennes + suggestions de lieux)

## 1) Préparer Supabase

1. Crée un projet sur https://supabase.com
2. Ouvre `SQL Editor`
3. Exécute le script `supabase/schema.sql`
4. Ouvre `Project Settings` puis `API`
5. Copie:
- `Project URL`
- `anon public key`

## 2) Préparer openrouteservice

1. Crée un compte sur https://openrouteservice.org
2. Crée une clé API
3. Garde cette clé pour le secret Supabase `ORS_API_KEY`

## 3) Configurer le projet

1. Ouvre `config.js`
2. Renseigne:
- `supabaseUrl`
- `supabaseAnonKey`
- `functionsBaseUrl`
3. Optionnel:
- `defaultCenter`
- `defaultZoom`
- catégories et statuts
- `focusBounds` pour cadrer strictement le quartier Camayenne

## 4) Lancer en local

Dans le dossier `camayenne_open_mvp`:

```powershell
python -m http.server 8000
```

Puis ouvre:

`http://localhost:8000`

## 5) Déploiement simple

Tu peux déployer ce dossier directement sur:
- GitHub Pages
- Netlify
- Vercel (mode statique)

## 6) Schéma des tables utilisé

### Table `poi`
- `name`
- `category`
- `address`
- `phone`
- `description`
- `status`
- `latitude`
- `longitude`
- `created_at`

### Table `reports`
- `title`
- `type`
- `status`
- `description`
- `latitude`
- `longitude`
- `created_at`
- `ai_suggested_type`
- `ai_priority`
- `ai_summary`
- `ai_confidence`

## 7) Notes importantes

1. En mode public sécurisé, l'ajout direct depuis `anon` est bloqué via RLS.
2. Les signalements passent par la function `submit-report` avec anti-spam basique + triage IA (si `OPENAI_API_KEY` est configure).
3. Le calcul d'itinéraire passe par la function `route` (clé ORS cachée côté serveur).
4. Pour gros trafic, n'utilise pas le serveur de tuiles OSM public en direct.
5. L'assistant public passe par la function `ai-public-chat` (si `OPENAI_API_KEY` est configuré).

## 8) Focus Camayenne

Le projet inclut un mode focus configurable:
- verrouillage de la carte sur `focusBounds` via `lockToFocusBounds`
- blocage de l'ajout de points hors zone
- filtrage des données hors zone
- bouton `Zone Camayenne` pour recentrer la carte

## 9) Itinéraire avancé

Dans l'onglet `Rechercher`:
- sélectionne `Départ` et `Arrivée`
- choisis le mode `Voiture`, `Vélo` ou `Marche`
- choisis le type `Le plus court`, `Équilibré` ou `Le plus rapide`
- option `Éviter les grands axes` (si possible)
- active `Aller-retour` si tu veux `A -> B -> A`
- utilise `Inverser` pour permuter départ/arrivée
- après calcul: affichage de la distance et du temps estimé

## 10) Précision GPS

Si la position est fausse:
- utilise le bouton `Ma position` à l'extérieur puis attends quelques secondes
- l'app récupère plusieurs lectures et garde la meilleure précision
- la bulle affiche la précision en mètres (`±xx m`)

Paramètres ajustables dans `config.js`:
- `gpsMaxWaitMs`
- `gpsDesiredAccuracyMeters`
- `gpsWarnAboveMeters`
- `gpsMinReadings`
- `gpsStabilityMeters`
- `gpsMaxSampleAccuracyMeters`
- `gpsOutlierDistanceMeters`
- `gpsJumpProtection`
- `gpsJumpRejectDistanceMeters`
- `gpsJumpRejectAccuracyMeters`

## 11) Déploiement sécurisé Supabase Functions

1. Se connecter (sans installation globale):
```powershell
npx supabase@latest login
```
2. Connecter le projet:
```powershell
npx supabase@latest link --project-ref <TON_PROJECT_REF>
```
3. Déployer les functions:
```powershell
npx supabase@latest functions deploy submit-report --no-verify-jwt
npx supabase@latest functions deploy route --no-verify-jwt
npx supabase@latest functions deploy share-location --no-verify-jwt
npx supabase@latest functions deploy resolve-share --no-verify-jwt
npx supabase@latest functions deploy ai-public-chat --no-verify-jwt
npx supabase@latest functions deploy ai-admin-insights --no-verify-jwt
```
4. Définir les secrets:
```powershell
npx supabase@latest secrets set ORS_API_KEY=<TA_CLE_ORS>
npx supabase@latest secrets set OPENAI_API_KEY=<TA_CLE_OPENAI>
npx supabase@latest secrets set OPENAI_MODEL=gpt-4.1-mini
npx supabase@latest secrets set OPENAI_MODEL_PUBLIC=gpt-4.1-mini
npx supabase@latest secrets set GEMINI_API_KEY=<TA_CLE_GEMINI>
npx supabase@latest secrets set GEMINI_MODEL_PUBLIC=gemini-2.5-flash-lite
npx supabase@latest secrets set GEMINI_MODEL_ADMIN=gemini-2.5-flash-lite
```
5. Appliquer le durcissement RLS:
- Exécuter `supabase/hardening_public.sql` dans SQL Editor.
6. Activer le partage de position:
- Exécuter `supabase/location_shares.sql` dans SQL Editor.

## 12) Guidage en direct

1. Calcule d'abord un itinéraire.
2. Clique `Démarrer guidage`.
3. Marche: la position et la distance restante se mettent à jour automatiquement.
4. Si tu sors du trajet, l'app recalcule un meilleur chemin.
5. Une boussole en haut à droite indique la direction à suivre.
6. Clique `Arrêter guidage` pour stopper le suivi.

## 13) Back-office administration

Fichiers:
- `admin.html`
- `admin.css`
- `admin.js`
- `supabase/admin_backoffice.sql`

Activation:
1. Dans Supabase > SQL Editor, exécute `supabase/admin_backoffice.sql`.
2. Crée un utilisateur admin ou agent dans Supabase Auth (email/mot de passe).
3. Promeut cet utilisateur en admin/agent avec les blocs SQL commentés à la fin de `admin_backoffice.sql`.
4. Ouvre `.../camayenne_open_mvp/admin.html`.
5. Connecte-toi avec le compte admin/agent.

Fonctions disponibles:
- Voir les statistiques (POI, signalements, nouveaux signalements)
- Changer le statut des signalements
- Supprimer des signalements (admin)
- Ajouter / modifier des POI (admin + agent)
- Supprimer des POI (admin)
- Ajouter/supprimer une photo par POI (upload Supabase Storage)

## 14) Dashboard mairie

Fichiers:
- `mairie.html`
- `mairie.css`
- `mairie.js`

Objectif:
- pilotage municipal sur les signalements (KPI, filtres, carte operationnelle, export CSV)
- mise a jour rapide du statut (`NOUVEAU`, `EN_COURS`, `RESOLU`)
- acces reserve aux profils `admin` et `agent` actifs
- analyse IA mairie + prevision 7/30 jours via `ai-admin-insights`

Acces:
- ouvre `.../camayenne_open_mvp/mairie.html`
