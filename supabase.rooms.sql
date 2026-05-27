create table if not exists public.rooms (
  id text primary key check (id ~ '^[0-9]{4}$'),
  players jsonb not null,
  players_data jsonb not null,
  game_status text not null check (game_status in ('waiting', 'playing', 'finished')),
  winner text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

drop policy if exists "rooms are readable by room code" on public.rooms;
create policy "rooms are readable by room code"
on public.rooms for select
using (true);

drop policy if exists "rooms can be created by anon players" on public.rooms;
create policy "rooms can be created by anon players"
on public.rooms for insert
with check (true);

drop policy if exists "rooms can be updated by anon players" on public.rooms;
create policy "rooms can be updated by anon players"
on public.rooms for update
using (true)
with check (true);

alter publication supabase_realtime add table public.rooms;
