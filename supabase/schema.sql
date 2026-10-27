-- Xadrez às Cegas: rode este arquivo inteiro no SQL Editor do Supabase.
-- Pode rodar de novo sem problemas (é idempotente).

-- Partidas: tudo aqui é público (leitura), mas só o servidor (service role) escreve.
create table if not exists public.games (
  id            text primary key,
  version       integer not null default 0,
  status        text not null check (status in ('waiting', 'playing', 'finished', 'cancelled')),
  created_at    bigint not null,           -- epoch em ms
  started_at    bigint,
  finished_at   bigint,
  white_name    text,
  white_level   smallint check (white_level between 0 and 5),
  black_name    text,
  black_level   smallint check (black_level between 0 and 5),
  time_control  jsonb,                     -- { "initial": ms, "increment": ms } ou null
  clock_w       bigint,                    -- ms restantes no instante last_move_at
  clock_b       bigint,
  last_move_at  bigint,
  moves         jsonb not null default '[]'::jsonb,
  fen           text not null,
  result        text,
  termination   text,
  draw_offer    text check (draw_offer in ('w', 'b'))
);

create index if not exists games_created_at_idx on public.games (created_at desc);

-- Tokens dos jogadores: nunca podem ser lidos pelo navegador.
create table if not exists public.game_secrets (
  game_id      text primary key references public.games (id) on delete cascade,
  white_token  text,
  black_token  text
);

-- Segurança (RLS)
alter table public.games enable row level security;
alter table public.game_secrets enable row level security;

drop policy if exists "partidas são públicas para leitura" on public.games;
create policy "partidas são públicas para leitura" on public.games
  for select to anon, authenticated using (true);
-- game_secrets não tem nenhuma policy: só a service role (que ignora RLS) acessa.

grant select on public.games to anon, authenticated;
revoke insert, update, delete on public.games from anon, authenticated;
revoke all on public.game_secrets from anon, authenticated;
grant all on public.games, public.game_secrets to service_role;

-- Realtime: envia cada alteração de partida para quem está assistindo.
-- "replica identity full" garante que a linha chegue completa (inclusive a lista de lances).
alter table public.games replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
end $$;
