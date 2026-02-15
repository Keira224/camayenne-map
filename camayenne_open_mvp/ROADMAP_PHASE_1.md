# Roadmap Phase 1 - Fondations Securite et Donnees

Objectif:
- securiser la base (RLS)
- fiabiliser les donnees (contraintes)
- garder un mode public strict (lecture publique, ecriture controlee)

## Ordre d'integration

1. Ouvrir Supabase > SQL Editor
2. Executer `supabase/schema.sql`
3. Executer `supabase/hardening_public.sql`
4. Executer `supabase/location_shares.sql`
5. Si back-office actif: executer `supabase/admin_backoffice.sql`

## Pourquoi cet ordre

- `schema.sql` cree les tables + colonnes + contraintes + policies de lecture.
- `hardening_public.sql` applique le mode public strict (pas d'ecriture par defaut).
- `location_shares.sql` active le partage de position par token.
- `admin_backoffice.sql` re-ouvre l'ecriture uniquement pour `admin` et `agent`.

## Verification rapide (SQL)

### 1) Policies actives sur `poi`
```sql
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'poi'
order by policyname;
```

Attendu apres Phase 1 + back-office:
- lecture: `anon` + `authenticated`
- ecriture: seulement policies `*_operator` / `*_admin`
- pas de policy `poi_insert_authenticated` large

### 2) Policies actives sur `reports`
```sql
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'reports'
order by policyname;
```

Attendu:
- lecture publique
- ecriture controlee via role operator/admin ou Edge Functions

### 3) Contraintes qualite
```sql
select conname
from pg_constraint
where conrelid in ('public.poi'::regclass, 'public.reports'::regclass)
order by conname;
```

Attendu (minimum):
- `poi_status_check`
- `poi_latitude_range_check`
- `poi_longitude_range_check`
- `reports_type_check`
- `reports_status_check`
- `reports_latitude_range_check`
- `reports_longitude_range_check`
- `reports_ai_priority_check`

## Test fonctionnel minimum

1. Carte publique:
- POI et signalements lisibles
- ajout POI public indisponible
- signalement via function `submit-report` fonctionne

2. Back-office:
- connexion admin/agent OK
- ajout/modification POI OK
- suppression reservee admin

3. Itineraire:
- calcul via function `route` OK
- aucun token ORS dans le front
