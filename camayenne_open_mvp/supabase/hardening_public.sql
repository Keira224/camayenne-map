-- Durcissement mode public
-- 1) Les citoyens peuvent lire les POI et signalements
-- 2) Les insertions directes anon sont bloquées
-- 3) Les écritures passent par Edge Functions et/ou policies rôle admin/agent

alter table public.poi enable row level security;
alter table public.reports enable row level security;

alter table public.poi add column if not exists status text default 'ACTIF';
alter table public.poi add column if not exists latitude double precision;
alter table public.poi add column if not exists longitude double precision;

alter table public.reports add column if not exists source_hash text;
alter table public.reports add column if not exists ai_suggested_type text;
alter table public.reports add column if not exists ai_priority text;
alter table public.reports add column if not exists ai_summary text;
alter table public.reports add column if not exists ai_confidence double precision;
alter table public.reports add column if not exists ai_reason text;
alter table public.reports add column if not exists ai_model text;
alter table public.reports add column if not exists ai_processed_at timestamptz;

alter table public.reports drop constraint if exists reports_ai_priority_check;
alter table public.reports
add constraint reports_ai_priority_check
check (ai_priority is null or ai_priority in ('LOW', 'MEDIUM', 'HIGH'));

alter table public.poi drop constraint if exists poi_status_check;
alter table public.poi
add constraint poi_status_check
check (status in ('ACTIF', 'INACTIF'));

alter table public.poi drop constraint if exists poi_latitude_range_check;
alter table public.poi
add constraint poi_latitude_range_check
check (latitude >= -90 and latitude <= 90);

alter table public.poi drop constraint if exists poi_longitude_range_check;
alter table public.poi
add constraint poi_longitude_range_check
check (longitude >= -180 and longitude <= 180);

alter table public.reports drop constraint if exists reports_type_check;
alter table public.reports
add constraint reports_type_check
check (type in ('VOIRIE', 'ECLAIRAGE', 'DECHETS', 'INONDATION', 'SECURITE', 'AUTRE'));

alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports
add constraint reports_status_check
check (status in ('NOUVEAU', 'EN_COURS', 'RESOLU'));

alter table public.reports drop constraint if exists reports_latitude_range_check;
alter table public.reports
add constraint reports_latitude_range_check
check (latitude >= -90 and latitude <= 90);

alter table public.reports drop constraint if exists reports_longitude_range_check;
alter table public.reports
add constraint reports_longitude_range_check
check (longitude >= -180 and longitude <= 180);

create index if not exists idx_reports_source_hash_created_at
on public.reports (source_hash, created_at desc);

create index if not exists idx_poi_category_status_created_at
on public.poi (category, status, created_at desc);

create index if not exists idx_reports_type_status_created_at
on public.reports (type, status, created_at desc);

create index if not exists idx_reports_status_created_at
on public.reports (status, created_at desc);

drop policy if exists "poi_select_public" on public.poi;
drop policy if exists "poi_select_authenticated" on public.poi;
drop policy if exists "reports_select_public" on public.reports;
drop policy if exists "reports_select_authenticated" on public.reports;
drop policy if exists "poi_insert_public" on public.poi;
drop policy if exists "reports_insert_public" on public.reports;
drop policy if exists "poi_insert_authenticated" on public.poi;
drop policy if exists "reports_insert_authenticated" on public.reports;

create policy "poi_select_public" on public.poi
for select
to anon
using (true);

create policy "poi_select_authenticated" on public.poi
for select
to authenticated
using (true);

create policy "reports_select_public" on public.reports
for select
to anon
using (true);

create policy "reports_select_authenticated" on public.reports
for select
to authenticated
using (true);
