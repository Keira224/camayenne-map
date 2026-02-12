-- Durcissement mode public
-- 1) Les citoyens peuvent lire les POI et signalements
-- 2) Les insertions directes anon sont bloquées
-- 3) Les signalements passent par une Edge Function sécurisée

alter table public.poi enable row level security;
alter table public.reports enable row level security;
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

create index if not exists idx_reports_source_hash_created_at
on public.reports (source_hash, created_at desc);

drop policy if exists "poi_insert_public" on public.poi;
drop policy if exists "reports_insert_public" on public.reports;

drop policy if exists "poi_insert_authenticated" on public.poi;
drop policy if exists "reports_insert_authenticated" on public.reports;

create policy "poi_insert_authenticated" on public.poi
for insert
to authenticated
with check (true);

create policy "reports_insert_authenticated" on public.reports
for insert
to authenticated
with check (true);
