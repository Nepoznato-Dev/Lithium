-- user_profiles: per-user display preferences and syncable browser settings.
-- Links 1:1 with auth.users via foreign key.

create table public.user_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  settings     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Row Level Security ──────────────────────────────────────────────

alter table public.user_profiles enable row level security;

create policy "users can view own profile"
  on public.user_profiles for select
  to authenticated
  using ( (select auth.uid()) = id );

create policy "users can insert own profile"
  on public.user_profiles for insert
  to authenticated
  with check ( (select auth.uid()) = id );

create policy "users can update own profile"
  on public.user_profiles for update
  to authenticated
  using ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

create policy "users can delete own profile"
  on public.user_profiles for delete
  to authenticated
  using ( (select auth.uid()) = id );

-- ── Auto-create profile on signup ───────────────────────────────────

create function public.handle_new_user()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Updated-at trigger ──────────────────────────────────────────────

create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- ── Grant table access to authenticated role ────────────────────────

grant select, insert, update, delete on public.user_profiles to authenticated;
