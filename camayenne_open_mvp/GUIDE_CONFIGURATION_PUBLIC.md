# Guide Configuration Publique (Camayenne)

Ce document liste exactement les tâches à faire maintenant pour mettre l'application en ligne de façon sécurisée.

---

## 1) Mettre à jour GitHub

Dans le terminal (dans `arcOpole_SolutionPlanDeVille`):

```powershell
git push main master
```

---

## 2) Vérifier la config front

Fichier: `camayenne_open_mvp/config.js`

Vérifie ces valeurs:

```js
useSecureFunctions: true,
allowPoiSubmission: false,
functionsBaseUrl: "https://aeetsakqivgvrzwxvcdr.supabase.co/functions/v1",
functionNames: {
  submitReport: "submit-report",
  route: "route"
},
openRouteServiceApiKey: ""
```

Important:
- `openRouteServiceApiKey` doit rester vide en mode public.
- Si ta clé Supabase commence par `sb_publishable_...`, renseigne aussi `functionsAuthToken` avec la clé anon legacy (`eyJ...`) OU déploie les fonctions avec `--no-verify-jwt`.

---

## 3) Déployer les Edge Functions Supabase

Avant les commandes Supabase CLI, place-toi dans le dossier `camayenne_open_mvp`:

```powershell
cd camayenne_open_mvp
```

### 3.1 Installer et connecter Supabase CLI

`npm install -g supabase` n'est plus supporté.

Option A (recommandé Windows):

```powershell
winget install Supabase.CLI
supabase --version
supabase login
supabase link --project-ref aeetsakqivgvrzwxvcdr
```

Option B (sans installation, via npx):

```powershell
npx supabase@latest login
npx supabase@latest link --project-ref aeetsakqivgvrzwxvcdr
```

### 3.2 Déployer les fonctions

Depuis le dossier racine du repo:

```powershell
supabase functions deploy submit-report
supabase functions deploy route
supabase functions deploy share-location --no-verify-jwt
supabase functions deploy resolve-share --no-verify-jwt
```

Si tu veux autoriser les appels publics sans JWT utilisateur:

```powershell
supabase functions deploy submit-report --no-verify-jwt
supabase functions deploy route --no-verify-jwt
supabase functions deploy share-location --no-verify-jwt
supabase functions deploy resolve-share --no-verify-jwt
```

Si tu utilises `npx`:

```powershell
npx supabase@latest functions deploy submit-report
npx supabase@latest functions deploy route
npx supabase@latest functions deploy share-location --no-verify-jwt
npx supabase@latest functions deploy resolve-share --no-verify-jwt
```

---

## 4) Configurer le secret ORS (serveur uniquement)

Crée/regenère une clé openrouteservice, puis:

```powershell
supabase secrets set ORS_API_KEY=<TA_NOUVELLE_CLE_ORS>
```

Si tu utilises `npx`:

```powershell
npx supabase@latest secrets set ORS_API_KEY=<TA_CLE_ORS>
npx supabase@latest secrets set OPENAI_API_KEY=<TA_CLE_OPENAI>
npx supabase@latest secrets set OPENAI_MODEL=gpt-4.1-mini
```

Pourquoi:
- la clé ORS n'apparaît plus dans le front.
- les appels passent par `supabase/functions/route`.
- le triage IA des signalements reste côté serveur.

---

## 5) Durcir la base de données (RLS)

Dans Supabase > SQL Editor:

1. Exécute `camayenne_open_mvp/supabase/schema.sql`
2. Exécute `camayenne_open_mvp/supabase/hardening_public.sql`
3. Vérifie ensuite:
- `anon` peut `select` sur `poi` et `reports`
- `anon` ne peut plus `insert` directement
- `authenticated` ne peut pas écrire par défaut (sauf policies spécifiques admin/agent ou Edge Function avec service role)

---

## 6) Vérifier que le schéma est à jour

Dans Supabase > SQL Editor, si besoin ré-exécuter:
- `camayenne_open_mvp/supabase/schema.sql`
- `camayenne_open_mvp/supabase/hardening_public.sql`
- `camayenne_open_mvp/supabase/location_shares.sql`

Point important:
- colonne `reports.source_hash` doit exister
- index `idx_reports_source_hash_created_at` doit exister
- contraintes qualité sur coordonnées/statuts/types doivent exister
- table `location_shares` doit exister
- colonnes IA de `reports` (`ai_suggested_type`, `ai_priority`, `ai_summary`, `ai_confidence`) doivent exister

---

## 7) Activer GitHub Pages

Repo: `https://github.com/Keira224/camayenne-map`

1. Settings > Pages
2. Source: `Deploy from a branch`
3. Branch: `master`
4. Folder: `/ (root)`
5. Save

URL attendue:

`https://keira224.github.io/camayenne-map/camayenne_open_mvp/`

---

## 8) Tests de validation (obligatoire)

### Test A - Chargement
1. Ouvre l'URL publique.
2. Vérifie que la carte et les POI se chargent.

### Test B - Itinéraire
1. Clique `Ma position`.
2. Lance un itinéraire vers un POI.
3. Vérifie distance + temps affichés.

### Test C - Signalement
1. Onglet `Signaler`.
2. Envoie un signalement.
3. Vérifie insertion en base.

### Test D - Anti-spam basique
1. Envoie plusieurs signalements rapidement.
2. Vérifie qu'un blocage apparaît après limite.

### Test E - Sécurité
1. Vérifie que l'onglet `Ajouter lieu` n'est pas disponible.
2. Vérifie qu'aucune clé ORS n'est visible dans `config.js` public.

### Test F - Partage position
1. Clique `Partager ma position`.
2. Partage le lien dans WhatsApp/SMS ou copie le lien.
3. Ouvre le lien sur un autre téléphone.
4. Vérifie que la carte se centre sur la position partagée.
5. Vérifie qu'un lien expiré affiche une erreur.

---

## 9) Vérifications smartphone/tablette

Fais les tests sur:
- 360x640
- 390x844
- 768x1024

Checklist:
- boutons cliquables
- formulaires utilisables sans zoom navigateur
- carte fluide
- panneau lisible

---

## 10) Après mise en ligne

1. Régénérer la clé ORS (si ancienne clé exposée auparavant).
2. Ajouter une page `Mentions légales` et `Confidentialité`.
3. Préparer un mini back-office (statut signalements: `NOUVEAU/EN_COURS/RESOLU`).

---

## 11) En cas d'erreur

Si ça bloque, envoie ces 4 éléments:
1. Erreur exacte console navigateur (F12)
2. Capture Supabase Functions (deploy status)
3. Résultat exécution `hardening_public.sql`
4. URL publique GitHub Pages

---

## 12) Activer le back-office admin

1. Exécute le script SQL:
- `camayenne_open_mvp/supabase/admin_backoffice.sql`

2. Crée un utilisateur dans Supabase Auth:
- Dashboard > Authentication > Users > Add user

3. Passe ce compte en admin ou agent (SQL Editor):
- Utilise les blocs commentés en bas de `admin_backoffice.sql`
- Remplace l'email par ton email admin/agent

4. Ouvre:
- `https://keira224.github.io/camayenne-map/camayenne_open_mvp/admin.html`

5. Connecte-toi et vérifie:
- chargement des stats
- changement statut signalement
- ajout/modification/suppression POI
- upload photo POI depuis mobile (`capture="environment"`)

Règles de rôles:
- `admin`: ajout/modification/suppression
- `agent`: ajout/modification (pas de suppression)
- `is_active=false`: accès back-office bloqué

6. Si la colonne photo n'existe pas encore:
- exécute aussi `camayenne_open_mvp/supabase/schema.sql` (ajout `photo_url`, `photo_path`, `photo_taken_at`)

### Gestion rapide des comptes (SQL utilitaire)

Après exécution de `admin_backoffice.sql`, un admin peut gérer les comptes avec:

```sql
select public.set_user_role('agent@camayenne.gn', 'Agent Camayenne', 'agent', true);
select public.set_user_role('ousmanekeira224@gmail.com', 'Admin Camayenne', 'admin', true);
select public.set_user_active('agent@camayenne.gn', false); -- désactiver
select public.set_user_active('agent@camayenne.gn', true);  -- réactiver
select public.remove_user_access('agent@camayenne.gn');      -- retirer l'accès back-office
```
