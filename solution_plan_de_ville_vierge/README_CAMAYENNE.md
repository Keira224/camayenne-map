# Camayenne Map (MVP)

Application web de plan de quartier pour Camayenne (Conakry). Ce dossier est une personnalisation du template ArcOpole Plan de Ville pour un usage mobile et réseau lent.

## Démarrage local
1. Ouvrir un terminal dans `solution_plan_de_ville_vierge`.
2. Lancer un serveur statique.
3. Exemple PowerShell.

```powershell
python -m http.server 8080
```

4. Ouvrir `http://localhost:8080/` dans le navigateur.

## Déploiement
1. GitHub Pages.
2. Pousser le contenu du dossier `solution_plan_de_ville_vierge` dans un repo.
3. Activer GitHub Pages sur la branche principale et le dossier racine.
4. Netlify.
5. Glisser-déposer le dossier `solution_plan_de_ville_vierge` dans Netlify.

## Configuration Camayenne

### URLs des layers (obligatoire)
Remplacer dans `config/defaults.js` les placeholders suivants.

`camayenne.poiLayerUrl = "__TO_REPLACE__"`
`camayenne.reportsLayerUrl = "__TO_REPLACE__"`

### Webmap (optionnel mais recommandé)
Le template attend un `webmap` valide. Garder un webmap de base (fond de plan) ou remplacer la valeur `webmap` dans `config/defaults.js` par un webmap ArcGIS Online qui contient vos couches.

### Centre et zoom par défaut
Dans `config/defaults.js`, renseigner `camayenne.defaultCenter` en `[longitude, latitude]` et `camayenne.defaultZoom`.

### Langue FR/EN
La langue est détectée via le navigateur. Les libellés Camayenne sont dans:
1. `js/nls/resources.js` (anglais par défaut)
2. `js/nls/fr/resources.js` (français)

### Catégories POI
Modifier `camayenne.poiCategories` dans `config/defaults.js` pour adapter les catégories et leurs libellés.

### Icônes
Modifier les associations dans `config/configSymbo.js`.

## Schémas de champs recommandés

### POI (Feature Layer - points)
| Champ | Type | Exemple |
| --- | --- | --- |
| `name` | Texte | Pharmacie Centrale |
| `category` | Texte | PHARMACIE |
| `address` | Texte | Rue X, Camayenne |
| `phone` | Texte | +224 ... |
| `description` | Texte | Ouvert 24/7 |
| `status` | Texte | ACTIF |
| `created_at` | Date | Date/heure |

### Signalements (Feature Layer - points)
| Champ | Type | Exemple |
| --- | --- | --- |
| `title` | Texte | Nid de poule |
| `type` | Texte | VOIRIE |
| `status` | Texte | NOUVEAU |
| `description` | Texte | Trou près du rond-point |
| `created_at` | Date | Date/heure |

## Mode léger
`camayenne.lightMode = true` démarre les couches invisibles et limite les requêtes. Les couches deviennent visibles via les cases à cocher dans le panneau.

## Services Esri requis
1. ArcGIS Online Hosted Feature Layer pour les POI avec édition activée (ajout).
2. ArcGIS Online Hosted Feature Layer pour les signalements avec édition activée (ajout).
3. Optionnel. Survey123 si vous voulez des formulaires riches et validation avancée. La version MVP utilise directement les Feature Layers.

## Où remplacer quoi
1. `config/defaults.js` pour `camayenne.poiLayerUrl` et `camayenne.reportsLayerUrl`.
2. `config/defaults.js` pour `camayenne.defaultCenter` et `camayenne.defaultZoom`.
3. `config/defaults.js` pour `webmap` si vous utilisez votre propre webmap.
4. `config/configSymbo.js` pour les icônes par catégorie/type.
5. `config/searchConfig.js` pour les champs de recherche.

## Checklist mobile
1. Ouverture sur 4G lente en moins de 5 secondes.
2. Géolocalisation active.
3. Recherche par nom et catégorie.
4. Ajout d’un lieu avec point sur la carte.
5. Signalement d’un problème avec point sur la carte.
6. Filtre par type et statut des signalements.
7. Affichage des POI et des signalements via les cases à cocher.
8. Test sur écran 360x640 et 390x844.
