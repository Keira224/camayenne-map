create table if not exists public.location_shares (
  token text primary key,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  source_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_location_shares_expires_at
on public.location_shares (expires_at);

create index if not exists idx_location_shares_source_hash_created_at
on public.location_shares (source_hash, created_at desc);

alter table public.location_shares enable row level security;

revoke all on public.location_shares from anon;
revoke all on public.location_shares from authenticated;
grant all on public.location_shares to service_role;


