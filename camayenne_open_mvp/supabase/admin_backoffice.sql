-- Back-office Camayenne
-- A exécuter dans Supabase SQL Editor
-- Objectif:
-- 1) ajouter la table profiles pour les rôles
-- 2) créer le rôle admin
-- 3) donner les droits admin sur poi/reports

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'agent' check (role in ('admin', 'agent')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_self" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;

create policy "profiles_select_self" on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "profiles_update_self" on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(user_id, role)
  values (new.id, 'agent')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_handle_new_user_profile on auth.users;
create trigger trg_handle_new_user_profile
after insert on auth.users
for each row execute procedure public.handle_new_user_profile();

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- Permissions de lecture pour les comptes connectés (nécessaire pour le back-office)
drop policy if exists "poi_select_authenticated" on public.poi;
drop policy if exists "reports_select_authenticated" on public.reports;

create policy "poi_select_authenticated" on public.poi
for select
to authenticated
using (true);

create policy "reports_select_authenticated" on public.reports
for select
to authenticated
using (true);

-- On remplace les insertions "authenticated génériques" par admin seulement
drop policy if exists "poi_insert_authenticated" on public.poi;
drop policy if exists "reports_insert_authenticated" on public.reports;

drop policy if exists "poi_insert_admin" on public.poi;
drop policy if exists "poi_update_admin" on public.poi;
drop policy if exists "poi_delete_admin" on public.poi;
drop policy if exists "reports_insert_admin" on public.reports;
drop policy if exists "reports_update_admin" on public.reports;
drop policy if exists "reports_delete_admin" on public.reports;

create policy "poi_insert_admin" on public.poi
for insert
to authenticated
with check (public.is_admin());

create policy "poi_update_admin" on public.poi
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "poi_delete_admin" on public.poi
for delete
to authenticated
using (public.is_admin());

create policy "reports_insert_admin" on public.reports
for insert
to authenticated
with check (public.is_admin());

create policy "reports_update_admin" on public.reports
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "reports_delete_admin" on public.reports
for delete
to authenticated
using (public.is_admin());

-- Utilitaire: promotion d'un utilisateur en admin
-- Remplace admin@camayenne.gn puis exécute ce bloc
insert into public.profiles(user_id, full_name, role)
select id, 'Admin Camayenne', 'admin'
from auth.users
where email = 'admin@camayenne.gn'
on conflict (user_id)
do update set role = excluded.role, full_name = excluded.full_name;
