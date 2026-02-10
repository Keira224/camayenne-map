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

## 7) Notes importantes

1. En mode public sécurisé, l'ajout direct depuis `anon` est bloqué via RLS.
2. Les signalements passent par la function `submit-report` avec anti-spam basique.
3. Le calcul d'itinéraire passe par la function `route` (clé ORS cachée côté serveur).
4. Pour gros trafic, n'utilise pas le serveur de tuiles OSM public en direct.

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

## 11) Déploiement sécurisé Supabase Functions

1. Installer Supabase CLI:
```powershell
npm install -g supabase
```
2. Connecter le projet:
```powershell
supabase login
supabase link --project-ref <TON_PROJECT_REF>
```
3. Déployer les functions:
```powershell
supabase functions deploy submit-report
supabase functions deploy route
```
4. Définir les secrets:
```powershell
supabase secrets set ORS_API_KEY=<TA_CLE_ORS>
```
5. Appliquer le durcissement RLS:
- Exécuter `supabase/hardening_public.sql` dans SQL Editor.
